import { Server } from 'socket.io';
import { setupSocket } from '../socket';
import { logger } from '../logger';

export async function initializeRedisAdapter(io: Server) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const { createClient } = await import('redis');

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Redis adapter enabled for Socket.IO', { redisUrl });
  } catch (error) {
    logger.error('Failed to initialize Redis adapter', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function attachSocketHandlers(io: Server, options: { socketRateLimitWindowMs: number; socketRateLimitMax: number }) {
  setupSocket(io, options);
  logger.info('Socket handlers attached.');
}
