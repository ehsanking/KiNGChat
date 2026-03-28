import { spawn } from 'node:child_process';

const isProduction = process.argv.includes('--production');
const env = {
  ...process.env,
  PORT: process.env.PORT || '3000',
};

if (isProduction) {
  env.NODE_ENV = 'production';
}

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'server.ts'], {
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
