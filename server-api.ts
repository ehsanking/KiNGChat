// API-only entry point. The RUNTIME_MODE env var is set by the parent process
// (scripts/start-server.mjs) before this file is evaluated; we only need to
// ensure the Next.js node-environment baseline is installed before ./server
// loads Next.js.
import './lib/runtime/node-environment-baseline';
import './server';

export {};
