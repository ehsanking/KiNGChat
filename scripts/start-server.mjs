import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const isProduction = process.argv.includes('--production');
const env = {
  ...process.env,
  PORT: process.env.PORT || '3000',
};

if (isProduction) {
  env.NODE_ENV = 'production';
}

const tsxBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
if (!existsSync(tsxBin)) {
  console.error('[start-server] Missing local tsx binary. Run `npm install` first.');
  process.exit(1);
}

// Use the pinned local tsx binary for deterministic startup.
const runtimeMode = (env.RUNTIME_MODE || 'all').toLowerCase();
const entry = runtimeMode === 'api' ? 'server-api.ts' : runtimeMode === 'worker' ? 'server-worker.ts' : 'server.ts';

// Propagate the normalized runtime mode to the child so the wrapper entries
// (server-api.ts / server-worker.ts) don't have to rely on top-level env
// assignments, which are brittle under ESM hoisting.
env.RUNTIME_MODE = runtimeMode;

const child = spawn(tsxBin, [entry], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
