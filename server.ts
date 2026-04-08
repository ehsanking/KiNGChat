import { logger } from './lib/logger';
import { bootstrapEnvironment } from './lib/runtime/env-bootstrap';
import { runAdminBootstrapOrExit } from './lib/runtime/admin-bootstrap';
import { createHttpServer } from './lib/server/http-server';
import { createSocketServer } from './lib/server/socket-server';
import { startWorkerServer, stopWorkerServer } from './lib/server/worker-server';

bootstrapEnvironment();

let isShuttingDown = false;
const GRACEFUL_SHUTDOWN_TIMEOUT = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS) || 30000;

const start = async () => {
  await runAdminBootstrapOrExit();

  const runtimeMode = (process.env.RUNTIME_MODE || 'all').toLowerCase();
  const runApi = runtimeMode === 'all' || runtimeMode === 'api';
  const runWorker = runtimeMode === 'all' || runtimeMode === 'worker';

  const http = runApi ? await createHttpServer(() => isShuttingDown) : null;
  const io = http ? await createSocketServer(http.server, http.runtime) : null;

  if (runWorker) {
    await startWorkerServer();
  }

  if (http) {
    http.server.listen(http.runtime.port, http.runtime.hostname, () => {
      logger.info(`> Ready on http://${http.runtime.hostname}:${http.runtime.port}`);
    });
  }

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const forceExitTimer = setTimeout(() => process.exit(1), GRACEFUL_SHUTDOWN_TIMEOUT);

    try {
      if (http) {
        await new Promise<void>((resolve, reject) => {
          http.server.close((err) => (err ? reject(err) : resolve()));
        });
      }
      if (io) {
        await new Promise<void>((resolve) => io.close(() => resolve()));
      }
      if (runWorker) {
        await stopWorkerServer();
      }
      clearTimeout(forceExitTimer);
      logger.info('Graceful shutdown complete', { signal });
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Graceful shutdown failed', { signal, error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
};

start().catch((error) => {
  logger.error('Failed to start server', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
