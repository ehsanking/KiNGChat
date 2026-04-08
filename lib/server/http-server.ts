import { createServer } from 'http';
import { parse } from 'node:url';
import next from 'next';
import { getRuntimeConfig } from '@/lib/runtime/env-bootstrap';
import { withRequestContext } from '@/lib/request-context';
import { createRequestId } from '@/lib/observability';

export const createHttpServer = async (isShuttingDown: () => boolean) => {
  const runtime = getRuntimeConfig();
  const app = next({ dev: runtime.dev, hostname: runtime.hostname, port: runtime.port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    if (isShuttingDown()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server is shutting down' }));
      return;
    }
    const parsedUrl = parse(req.url!, true);
    const requestId = Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : req.headers['x-request-id'];
    withRequestContext({ requestId: requestId || createRequestId() }, () => {
      handle(req, res, parsedUrl);
    });
  });

  return { app, server, runtime };
};
