import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { setupSecrets } from './lib/setup-secrets';
import { initializeAdmin } from './lib/auth-utils';
import { logger } from './lib/logger';
import { setupSocket } from './lib/socket';
import { registerBackgroundJob, startBackgroundJobWorker } from './lib/task-queue';
import { sendPushNotification } from './lib/push';

setupSecrets();

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
// Default to port 3000 unless explicitly overridden by the environment.  A single
// canonical port eliminates confusion across docker compose files, healthchecks
// and runtime scripts.  See PHASEA_PRODUCTION_HARDENING.md for more details.
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigins = allowedOrigins.length
  ? allowedOrigins
  : dev
    ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
    : true;

const socketRateLimitWindowMs = Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS) || 10_000;
const socketRateLimitMax = Number(process.env.SOCKET_RATE_LIMIT_MAX) || 30;

const initializeRedisAdapter = async (io: Server) => {
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
};

registerBackgroundJob('push_notification', async (payload) => {
  const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : '';
  if (!recipientId) return;

  await sendPushNotification(recipientId, {
    title: typeof payload.title === 'string' ? payload.title : 'New Message',
    body: typeof payload.body === 'string' ? payload.body : 'You have received a new encrypted message.',
    url: typeof payload.url === 'string' ? payload.url : '/chat',
  });
});

app.prepare().then(async () => {
  await initializeAdmin();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  await initializeRedisAdapter(io);
  await startBackgroundJobWorker();

  setupSocket(io, {
    socketRateLimitWindowMs,
    socketRateLimitMax,
  });

  server.listen(port, hostname, () => {
    logger.info(`> Ready on http://${hostname}:${port}`);
  });
}).catch((error) => {
  logger.error('Failed to prepare application', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
