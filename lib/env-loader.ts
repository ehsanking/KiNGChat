import fs from 'fs';
import path from 'path';

const stripQuotes = (value: string) => value.trim().replace(/^['"]|['"]$/g, '');

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!fs.existsSync(filePath)) return {};

  const result: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1));
    if (!key) continue;

    result[key] = value;
  }

  return result;
};

export function loadApplicationEnvironment(options?: {
  cwd?: string;
  forceMode?: 'development' | 'production';
  preserveExisting?: boolean;
}) {
  const cwd = options?.cwd ?? process.cwd();
  const mode = options?.forceMode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const files = mode === 'production' ? ['.env'] : ['.env', '.env.local'];
  const preserveExisting = options?.preserveExisting ?? !options?.forceMode;

  const preexisting = new Set(Object.keys(process.env));

  for (const file of files) {
    const values = parseEnvFile(path.join(cwd, file));
    for (const [key, value] of Object.entries(values)) {
      if (preserveExisting && preexisting.has(key)) continue;
      process.env[key] = value;
    }
  }

  return { mode, filesLoaded: files };
}

export function readProjectEnv(options?: { cwd?: string; mode?: 'development' | 'production' }) {
  const cwd = options?.cwd ?? process.cwd();
  const mode = options?.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const files = mode === 'production' ? ['.env'] : ['.env', '.env.local'];
  return files.reduce<Record<string, string>>((acc, file) => Object.assign(acc, parseEnvFile(path.join(cwd, file))), {});
}
