import IORedis from 'ioredis';

let sharedConnection: IORedis | null = null;

export const isRedisConfigured = () => Boolean(process.env.REDIS_URL);

export const getQueueRedisConnection = () => {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!sharedConnection) {
    sharedConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  return sharedConnection;
};

export const closeQueueRedisConnection = async () => {
  if (!sharedConnection) return;
  await sharedConnection.quit().catch(() => undefined);
  sharedConnection = null;
};
