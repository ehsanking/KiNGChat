import { Queue } from 'bullmq';
import { getQueueRedisConnection, isRedisConfigured } from './connection';
import type { QueueName, QueuePayloadMap } from './types';

const queuePrefix = process.env.BULLMQ_PREFIX || 'elahe';

const queueNames: QueueName[] = ['push-notifications', 'message-delivery', 'cleanup', 'email'];

const bullQueues = new Map<QueueName, Queue>();

export const getQueueNames = () => [...queueNames];

export const getBullQueue = <TName extends QueueName>(name: TName) => {
  if (!isRedisConfigured()) return null;

  const existing = bullQueues.get(name);
  if (existing) return existing;

  const connection = getQueueRedisConnection();
  if (!connection) return null;

  const created = new Queue(name, {
    connection,
    prefix: queuePrefix,
    defaultJobOptions: {
      attempts: 3,
      removeOnComplete: 250,
      removeOnFail: false,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  bullQueues.set(name, created);
  return created;
};

export const enqueueBullJob = async <TName extends QueueName>(
  queueName: TName,
  jobName: string,
  payload: QueuePayloadMap[TName],
  opts?: { delayMs?: number; attempts?: number },
) => {
  const queue = getBullQueue(queueName);
  if (!queue) return null;

  await queue.add(jobName, payload, {
    delay: opts?.delayMs,
    attempts: opts?.attempts,
  });
  return { queued: true as const, mode: 'bullmq' as const };
};

export const getQueueDashboardSnapshot = async () => {
  const snapshot: Record<string, unknown> = {};

  for (const name of queueNames) {
    const queue = getBullQueue(name);
    if (!queue) {
      snapshot[name] = { enabled: false };
      continue;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    snapshot[name] = { enabled: true, waiting, active, completed, failed, delayed };
  }

  return snapshot;
};

export const closeBullQueues = async () => {
  await Promise.all(Array.from(bullQueues.values()).map((queue) => queue.close()));
  bullQueues.clear();
};
