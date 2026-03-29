import { loadApplicationEnvironment } from '../env-loader';
import { validateProductionEnvironment } from '../env-security';
import { logger } from '../logger';

export function bootstrapEnvironment() {
  loadApplicationEnvironment();
  validateProductionEnvironment();
  logger.info('Runtime environment loaded and validated.', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    appEnv: process.env.APP_ENV ?? null,
  });
}

export function getRuntimeConfig() {
  const dev = process.env.NODE_ENV !== 'production';
  const hostname = '0.0.0.0';
  const port = Number.parseInt(process.env.PORT || '3000', 10);

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

  return {
    dev,
    hostname,
    port,
    corsOrigins,
    socketRateLimitWindowMs,
    socketRateLimitMax,
  };
}
