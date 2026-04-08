import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { RuntimeConfig } from '@/lib/runtime/env-bootstrap';
import { attachSocketHandlers, initializeRedisAdapter } from '@/lib/runtime/socket-bootstrap';

export const createSocketServer = async (server: HttpServer, runtime: RuntimeConfig) => {
  const io = new Server(server, {
    cors: { origin: runtime.corsOrigins, methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  await initializeRedisAdapter(io);
  attachSocketHandlers(io, {
    socketRateLimitWindowMs: runtime.socketRateLimitWindowMs,
    socketRateLimitMax: runtime.socketRateLimitMax,
  });

  return io;
};
