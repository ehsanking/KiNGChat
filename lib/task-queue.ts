import { logger } from '@/lib/logger';
import { setGauge, incrementMetric } from '@/lib/observability';
import { enqueueBullJob, getQueueDashboardSnapshot } from '@/lib/queue/queues';
import { getDeadLetterSnapshot, registerQueueJobHandler, startQueueWorkers, stopQueueWorkers } from '@/lib/queue/workers';
import { isRedisConfigured } from '@/lib/queue/connection';

type QueueEvent = 'add' | 'next' | 'completed' | 'error';

class SimpleQueue {
  private concurrency: number;
  private running = 0;
  private queue: Array<{ task: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];
  private listeners: Record<QueueEvent, Array<() => void>> = { add: [], next: [], completed: [], error: [] };

  public size = 0;
  public pending = 0;

  constructor({ concurrency }: { concurrency: number }) {
    this.concurrency = concurrency;
  }

  on(event: QueueEvent, listener: () => void): void {
    this.listeners[event].push(listener);
  }

  private emit(event: QueueEvent): void {
    for (const listener of this.listeners[event]) {
      try { listener(); } catch {
        // ignore listener failures
      }
    }
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    this.emit('add');
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
      this.size = this.queue.length;
      this.pending = this.running;
      this.process();
    });
  }

  private process(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.size = this.queue.length;
      this.running += 1;
      this.pending = this.running;
      this.emit('next');

      void (async () => {
        try {
          const result = await next.task();
          next.resolve(result);
          this.emit('completed');
        } catch (error) {
          next.reject(error);
          this.emit('error');
        } finally {
          this.running -= 1;
          this.pending = this.running;
          this.process();
        }
      })();
    }
  }
}

const getQueueConcurrency = () => {
  const value = Number(process.env.QUEUE_CONCURRENCY);
  return Number.isFinite(value) && value > 0 ? value : 5;
};

const localQueue = new SimpleQueue({ concurrency: getQueueConcurrency() });
const registry = new Map<string, (payload: Record<string, unknown>) => Promise<void>>();
let workerStarted = false;

const updateQueueMetrics = () => {
  setGauge('background_jobs_pending', localQueue.size);
  setGauge('background_jobs_active', localQueue.pending);
};

(['add', 'next', 'completed', 'error'] as const).forEach((eventName) => localQueue.on(eventName, updateQueueMetrics));

export type BackgroundJob = {
  name: string;
  payload: Record<string, unknown>;
  attempt?: number;
  maxAttempts?: number;
  runAfter?: number | null;
};

export const enqueueTask = async <T>(task: () => Promise<T>): Promise<T> => {
  incrementMetric('background_jobs_inline_enqueued');
  return localQueue.add(task) as Promise<T>;
};

export const registerBackgroundJob = (name: string, handler: (payload: Record<string, unknown>) => Promise<void>) => {
  registry.set(name, handler);
  registerQueueJobHandler(name, handler);
};

const localRun = async (job: BackgroundJob) => {
  const handler = registry.get(job.name);
  if (!handler) {
    logger.warn('No background job handler registered', { jobName: job.name });
    return;
  }

  await handler(job.payload);
};

const mapJobToQueue = (jobName: string) => {
  if (jobName === 'push_notification') return 'push-notifications' as const;
  if (jobName === 'retention_cleanup' || jobName === 'scheduled_backup') return 'cleanup' as const;
  return 'email' as const;
};

const shouldUseBullQueue = () => isRedisConfigured() && process.env.NODE_ENV !== 'test';

export const enqueueBackgroundJob = async (job: BackgroundJob) => {
  incrementMetric('background_jobs_enqueued', 1, { job: job.name });

  if (shouldUseBullQueue()) {
    const queued = await enqueueBullJob(mapJobToQueue(job.name), job.name, job.payload as never, {
      delayMs: job.runAfter && job.runAfter > Date.now() ? job.runAfter - Date.now() : undefined,
      attempts: job.maxAttempts,
    }).catch(() => null);

    if (queued) {
      return { queued: true as const, mode: 'bullmq' as const };
    }
  }

  await enqueueTask(() => localRun(job));
  return { queued: true as const, mode: 'memory' as const };
};

export const startBackgroundJobWorker = async () => {
  if (workerStarted) return;
  workerStarted = true;
  await startQueueWorkers();
  logger.info('Background job worker started', { mode: shouldUseBullQueue() ? 'bullmq' : 'memory' });
};

export const stopBackgroundJobWorker = async () => {
  await stopQueueWorkers();
  workerStarted = false;
};

export const getBackgroundQueueSnapshot = async () => {
  const bull = shouldUseBullQueue() ? await getQueueDashboardSnapshot() : {};
  return {
    mode: shouldUseBullQueue() ? 'bullmq' : 'local',
    concurrency: getQueueConcurrency(),
    inMemoryPending: localQueue.size,
    inMemoryActive: localQueue.pending,
    bull,
    deadLetter: getDeadLetterSnapshot(),
  };
};
