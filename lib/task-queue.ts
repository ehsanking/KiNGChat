/*
 * A minimal in‑memory task queue with concurrency control.  We avoid
 * pulling in the full `p-queue` dependency to reduce the bundle size and
 * simplify error handling.  The SimpleQueue class exposes the same
 * interface methods used in this module: `add`, `on`, `size` and
 * `pending`.  Event names correspond to those emitted by p-queue:
 *   - 'add': fired whenever a task is enqueued
 *   - 'next': fired when a task is about to start
 *   - 'completed': fired when a task completes successfully
 *   - 'error': fired when a task rejects
 */

type QueueEvent = 'add' | 'next' | 'completed' | 'error';

class SimpleQueue {
  private concurrency: number;
  private running: number;
  private queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>;
  private listeners: Record<QueueEvent, Array<() => void>>;

  public size: number;
  public pending: number;

  constructor({ concurrency }: { concurrency: number }) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
    this.listeners = { add: [], next: [], completed: [], error: [] } as Record<QueueEvent, Array<() => void>>;
    this.size = 0;
    this.pending = 0;
  }

  /** Register an event listener. */
  on(event: QueueEvent, listener: () => void): void {
    this.listeners[event].push(listener);
  }

  /** Emit an event to all registered listeners. */
  private emit(event: QueueEvent): void {
    for (const listener of this.listeners[event]) {
      try {
        listener();
      } catch {
        // Ignore listener errors.
      }
    }
  }

  /** Enqueue a new task and return a promise for its result. */
  add<T>(task: () => Promise<T>): Promise<T> {
    this.emit('add');
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as any, reject });
      this.size = this.queue.length;
      this.pending = this.running;
      this.process();
    });
  }

  /** Attempt to run tasks while we have available concurrency. */
  private process(): void {
    while (this.running < this.concurrency && this.queue.length) {
      const { task, resolve, reject } = this.queue.shift()!;
      this.size = this.queue.length;
      this.emit('next');
      this.running++;
      this.pending = this.running;
      (async () => {
        try {
          const result = await task();
          resolve(result);
          this.emit('completed');
        } catch (error) {
          reject(error);
          this.emit('error');
        } finally {
          this.running--;
          this.pending = this.running;
          this.process();
        }
      })();
    }
  }
}
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis-client';
import { incrementMetric, setGauge } from '@/lib/observability';

const getQueueConcurrency = () => {
  const value = Number(process.env.QUEUE_CONCURRENCY);
  return Number.isFinite(value) && value > 0 ? value : 5;
};

const queue = new SimpleQueue({ concurrency: getQueueConcurrency() });
const redisQueueName = process.env.BACKGROUND_JOB_QUEUE_NAME || 'kingchat:jobs';
const redisDelayedQueueName = `${redisQueueName}:delayed`;
const redisDeadLetterQueueName = `${redisQueueName}:dead`;

const registry = new Map<string, (payload: Record<string, unknown>) => Promise<void>>();
let workerStarted = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let delayedPromoter: NodeJS.Timeout | null = null;

export type BackgroundJob = {
  name: string;
  payload: Record<string, unknown>;
  attempt?: number;
  maxAttempts?: number;
  runAfter?: number | null;
};

const getRetryBackoffMs = (attempt: number) => Math.min(60_000, 1_000 * Math.max(1, attempt) ** 2);

const updateQueueMetrics = async () => {
  setGauge('background_jobs_pending', queue.size);
  setGauge('background_jobs_active', queue.pending);
  if (process.env.REDIS_URL) {
    try {
      const client = await getRedisClient();
      const [pending, delayed, dead] = await Promise.all([
        client.lLen(redisQueueName),
        client.zCard(redisDelayedQueueName),
        client.lLen(redisDeadLetterQueueName),
      ]);
      setGauge('background_jobs_distributed_pending', Number(pending));
      setGauge('background_jobs_delayed_pending', Number(delayed));
      setGauge('background_jobs_dead_letter', Number(dead));
    } catch {
      // ignore metric collection failures
    }
  }
};

['add', 'next', 'completed', 'error'].forEach((eventName) => queue.on(eventName as any, () => { void updateQueueMetrics(); }));

export const enqueueTask = async <T>(task: () => Promise<T>): Promise<T> => {
  incrementMetric('background_jobs_inline_enqueued');
  const result = await queue.add(task);
  await updateQueueMetrics();
  return result as T;
};

export const registerBackgroundJob = (name: string, handler: (payload: Record<string, unknown>) => Promise<void>) => {
  registry.set(name, handler);
};

const normalizeJob = (job: BackgroundJob): BackgroundJob => ({ ...job, attempt: Number(job.attempt || 0), maxAttempts: Number(job.maxAttempts || 3), runAfter: job.runAfter ?? null });

const scheduleJobRetry = async (job: BackgroundJob, error: unknown) => {
  const nextAttempt = Number(job.attempt || 0) + 1;
  if (nextAttempt > Number(job.maxAttempts || 3)) {
    if (process.env.REDIS_URL) {
      const client = await getRedisClient();
      await client.rPush(redisDeadLetterQueueName, JSON.stringify({ ...job, attempt: nextAttempt, lastError: error instanceof Error ? error.message : String(error) }));
    }
    incrementMetric('background_jobs_dead_lettered', 1, { job: job.name });
    return;
  }

  const retryJob: BackgroundJob = { ...job, attempt: nextAttempt, runAfter: Date.now() + getRetryBackoffMs(nextAttempt) };
  incrementMetric('background_jobs_retried', 1, { job: job.name, attempt: nextAttempt });
  if (process.env.REDIS_URL) {
    const client = await getRedisClient();
    await client.zAdd(redisDelayedQueueName, [{ score: Number(retryJob.runAfter), value: JSON.stringify(retryJob) }]);
    return;
  }
  setTimeout(() => { void enqueueTask(() => processBackgroundJob(retryJob)); }, getRetryBackoffMs(nextAttempt));
};

const processBackgroundJob = async (incomingJob: BackgroundJob) => {
  const job = normalizeJob(incomingJob);
  const handler = registry.get(job.name);
  if (!handler) {
    logger.warn('No background job handler registered', { jobName: job.name });
    incrementMetric('background_jobs_unhandled', 1, { job: job.name });
    return;
  }

  try {
    await handler(job.payload);
    incrementMetric('background_jobs_succeeded', 1, { job: job.name, attempt: job.attempt || 0 });
  } catch (error) {
    incrementMetric('background_jobs_failed', 1, { job: job.name, attempt: job.attempt || 0 });
    logger.error('Background job failed', { jobName: job.name, error: error instanceof Error ? error.message : String(error) });
    await scheduleJobRetry(job, error);
  }
};

export const enqueueBackgroundJob = async (job: BackgroundJob) => {
  const normalized = normalizeJob(job);
  incrementMetric('background_jobs_enqueued', 1, { job: normalized.name });

  if (process.env.REDIS_URL) {
    try {
      const client = await getRedisClient();
      if (normalized.runAfter && normalized.runAfter > Date.now()) {
        await client.zAdd(redisDelayedQueueName, [{ score: normalized.runAfter, value: JSON.stringify(normalized) }]);
      } else {
        await client.rPush(redisQueueName, JSON.stringify(normalized));
      }
      await updateQueueMetrics();
      return { queued: true as const, mode: 'redis' as const };
    } catch (error) {
      logger.error('Failed to enqueue Redis background job, falling back to local queue', { jobName: normalized.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await enqueueTask(() => processBackgroundJob(normalized));
  return { queued: true as const, mode: 'memory' as const };
};

const promoteDueRedisDelayedJobs = async () => {
  if (!process.env.REDIS_URL) return;
  const client = await getRedisClient();
  const now = Date.now();
  const due = await client.zRangeByScore(redisDelayedQueueName, 0, now);
  if (!due.length) return;
  for (const raw of due) {
    await client.multi().zRem(redisDelayedQueueName, raw).rPush(redisQueueName, raw).exec();
  }
};

const startRedisWorker = async () => {
  const client = await getRedisClient();
  const blockingClient = client.duplicate();
  await blockingClient.connect();
  delayedPromoter = setInterval(() => { void promoteDueRedisDelayedJobs(); }, 1000);

  while (true) {
    const result = await blockingClient.blPop(redisQueueName, 0);
    const raw = Array.isArray(result) ? result[1] : result?.element;
    if (!raw) continue;
    try {
      const job = JSON.parse(raw) as BackgroundJob;
      await enqueueTask(() => processBackgroundJob(job));
    } catch (error) {
      logger.error('Failed to decode background job payload', { error: error instanceof Error ? error.message : String(error) });
    }
  }
};

export const startBackgroundJobWorker = async () => {
  if (workerStarted) return;
  workerStarted = true;

  if (!process.env.REDIS_URL) {
    logger.info('Background job worker started in local-only mode');
    await updateQueueMetrics();
    return;
  }

  try {
    void startRedisWorker();
    logger.info('Distributed background job worker started', { queueName: redisQueueName });
    await updateQueueMetrics();
  } catch (error) {
    workerStarted = false;
    logger.error('Failed to start distributed background job worker', { error: error instanceof Error ? error.message : String(error) });
  }
};

export const getBackgroundQueueSnapshot = async () => {
  let distributedPending = 0;
  let delayedPending = 0;
  let deadLetterPending = 0;
  if (process.env.REDIS_URL) {
    try {
      const client = await getRedisClient();
      distributedPending = Number(await client.lLen(redisQueueName));
      delayedPending = Number(await client.zCard(redisDelayedQueueName));
      deadLetterPending = Number(await client.lLen(redisDeadLetterQueueName));
    } catch {
      distributedPending = -1;
      delayedPending = -1;
      deadLetterPending = -1;
    }
  }

  return {
    mode: process.env.REDIS_URL ? 'distributed' : 'local',
    concurrency: getQueueConcurrency(),
    inMemoryPending: queue.size,
    inMemoryActive: queue.pending,
    distributedPending,
    delayedPending,
    deadLetterPending,
  };
};
