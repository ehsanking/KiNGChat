import { Server, type Socket } from 'socket.io';
import { setupSocket } from '../socket';
import { logger } from '../logger';
import { getSessionFromCookieHeader, type SessionData } from '../session';
import { prisma } from '../prisma';

const SESSION_REVALIDATION_INTERVAL_MS = 5 * 60 * 1000;

type SocketWithSession = Socket & { data: Socket['data'] & { session?: SessionData; userId?: string } };

async function verifySocketSession(socket: SocketWithSession): Promise<SessionData | null> {
  const session = getSessionFromCookieHeader(socket.handshake?.headers?.cookie, {
    userAgent: socket.handshake?.headers?.['user-agent'] as string | undefined,
    ip: socket.handshake.address,
  });

  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true, isApproved: true, isBanned: true, role: true },
  });

  if (!user || user.isBanned || !user.isApproved || user.role !== session.role) {
    return null;
  }

  if (user.sessionVersion !== session.sessionVersion) {
    return null;
  }

  return session;
}

function attachSocketAuthentication(io: Server) {
  io.use(async (socket: Socket, next) => {
    try {
      const verifiedSession = await verifySocketSession(socket as SocketWithSession);
      if (!verifiedSession) {
        return next(new Error('Authentication required'));
      }

      (socket as SocketWithSession).data.session = verifiedSession;
      (socket as SocketWithSession).data.userId = verifiedSession.userId;
      return next();
    } catch (error) {
      logger.warn('Socket authentication middleware failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return next(new Error('Authentication required'));
    }
  });

  const timer = setInterval(async () => {
    const sockets = await io.fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const typedSocket = socket as unknown as SocketWithSession;
        const session = typedSocket.data.session;
        if (!session) return;

        const refreshed = await verifySocketSession(typedSocket);
        if (!refreshed) {
          socket.emit('session:expired', { reason: 'stale_session' });
          socket.disconnect(true);
          return;
        }

        typedSocket.data.session = refreshed;
        typedSocket.data.userId = refreshed.userId;
      }),
    );
  }, SESSION_REVALIDATION_INTERVAL_MS);

  timer.unref?.();
}

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
  attachSocketAuthentication(io);
  setupSocket(io, options);
  logger.info('Socket handlers attached.');
}
