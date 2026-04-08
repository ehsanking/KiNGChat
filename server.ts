import { createServer } from 'http';
import { parse } from 'node:url';
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

// Graceful shutdown state
let isShuttingDown = false;
const GRACEFUL_SHUTDOWN_TIMEOUT = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS) || 30000;

app.prepare().then(async () => {
  logger.info('Preparing application server bootstrap.');

  await runAdminBootstrapOrExit();

  const server = createServer((req, res) => {
    // Reject new requests during shutdown
    if (isShuttingDown) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server is shutting down' }));
      return;
    }
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

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    logger.info('Graceful shutdown initiated', { signal });
    isShuttingDown = true;

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);

    try {
      // Stop accepting new connections
      logger.info('Closing HTTP server');
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server', { error: err.message });
            reject(err);
          } else {
            logger.info('HTTP server closed');
            resolve();
          }
        });
      });

      // Close all socket connections
      logger.info('Closing Socket.IO server');
      await new Promise<void>((resolve) => {
        io.close(() => {
          logger.info('Socket.IO server closed');
          resolve();
        });
      });

      // Wait for any pending background jobs
      logger.info('Waiting for background jobs to complete');
      // Add any additional cleanup here (database connections, Redis, etc.)

      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught errors gracefully
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    gracefulShutdown('unhandledRejection');
  });
}).catch((error) => {
  logger.error('Failed to prepare application', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
