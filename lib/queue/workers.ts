import { QueueEvents, Worker } from 'bullmq';
import { logger } from '@/lib/logger';
import { incrementMetric } from '@/lib/observability';
import { getQueueRedisConnection, isRedisConfigured } from './connection';
import { getQueueNames } from './queues';
import type { QueueName } from './types';

type GenericPayload = Record<string, unknown>;
type BackgroundHandler = (payload: GenericPayload) => Promise<void>;

const handlers = new Map<string, BackgroundHandler>();
const workers = new Map<QueueName, Worker>();
const queueEvents = new Map<QueueName, QueueEvents>();
const deadLetterMemory: Array<{ queue: QueueName; jobName: string; reason: string; payload: GenericPayload }> = [];
let workersStarted = false;

export const registerQueueJobHandler = (name: string, handler: BackgroundHandler) => {
  handlers.set(name, handler);
};

const processWithHandler = async (queueName: QueueName, jobName: string, payload: GenericPayload) => {
  const handler = handlers.get(jobName);
  if (!handler) {
    incrementMetric('background_jobs_unhandled', 1, { queue: queueName, job: jobName });
    logger.warn('No handler registered for queue job', { queueName, jobName });
    return;
  }

  await handler(payload);
};

export const startQueueWorkers = async () => {
  if (workersStarted) return;
  workersStarted = true;

  if (!isRedisConfigured()) {
    logger.info('BullMQ workers not started: REDIS_URL not configured.');
    return;
  }

  const connection = getQueueRedisConnection();
  if (!connection) return;

  const queueNames = getQueueNames();

  for (const queueName of queueNames) {
    const worker = new Worker(
      queueName,
      async (job) => {
        try {
          await processWithHandler(queueName, job.name, (job.data || {}) as GenericPayload);
          incrementMetric('background_jobs_succeeded', 1, { queue: queueName, job: job.name });
        } catch (error) {
          incrementMetric('background_jobs_failed', 1, { queue: queueName, job: job.name });
          throw error;
        }
      },
      {
        connection,
        concurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
      },
    );

    worker.on('failed', async (job, error) => {
      const jobName = job?.name || 'unknown';
      const payload = (job?.data || {}) as GenericPayload;
      deadLetterMemory.push({
        queue: queueName,
        jobName,
        reason: error?.message || 'unknown_error',
        payload,
      });
      incrementMetric('background_jobs_dead_lettered', 1, { queue: queueName, job: jobName });
    });

    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();

    workers.set(queueName, worker);
    queueEvents.set(queueName, events);
  }

  logger.info('BullMQ workers started', { queues: queueNames });
};

export const stopQueueWorkers = async () => {
  await Promise.all(Array.from(workers.values()).map((worker) => worker.close()));
  await Promise.all(Array.from(queueEvents.values()).map((events) => events.close()));
  workers.clear();
  queueEvents.clear();
  workersStarted = false;
};

export const getDeadLetterSnapshot = () => deadLetterMemory.slice(-100);
