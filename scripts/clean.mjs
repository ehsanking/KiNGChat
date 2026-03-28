import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const targets = ['.next', 'coverage', 'dist', '.turbo'];

await Promise.all(
  targets.map(async (entry) => {
    const target = path.join(ROOT, entry);
    await fs.rm(target, { recursive: true, force: true });
  }),
);

console.log('Cleaned build artifacts:', targets.join(', '));
