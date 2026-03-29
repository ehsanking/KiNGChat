import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { logger } from './lib/logger';
import { bootstrapEnvironment, getRuntimeConfig } from './lib/runtime/env-bootstrap';
import { runAdminBootstrapOrExit } from './lib/runtime/admin-bootstrap';
import { registerRuntimeJobs, startRuntimeWorker } from './lib/runtime/background-bootstrap';
import { attachSocketHandlers, initializeRedisAdapter } from './lib/runtime/socket-bootstrap';

bootstrapEnvironment();
const runtime = getRuntimeConfig();

const app = next({ dev: runtime.dev, hostname: runtime.hostname, port: runtime.port });
const handle = app.getRequestHandler();

registerRuntimeJobs();

app.prepare().then(async () => {
  logger.info('Preparing application server bootstrap.');

  await runAdminBootstrapOrExit();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: runtime.corsOrigins,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  await initializeRedisAdapter(io);
  logger.info('Socket server initialized.', {
    corsMode: runtime.corsOrigins === true ? 'allow-all' : 'allow-list',
    rateLimitWindowMs: runtime.socketRateLimitWindowMs,
    rateLimitMax: runtime.socketRateLimitMax,
  });

  await startRuntimeWorker();

  attachSocketHandlers(io, {
    socketRateLimitWindowMs: runtime.socketRateLimitWindowMs,
    socketRateLimitMax: runtime.socketRateLimitMax,
  });

  server.listen(runtime.port, runtime.hostname, () => {
    logger.info(`> Ready on http://${runtime.hostname}:${runtime.port}`);
  });
}).catch((error) => {
  logger.error('Failed to prepare application', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
