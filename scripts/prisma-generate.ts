import path from 'path';
import { execSync } from 'child_process';
import { loadApplicationEnvironment, readProjectEnv } from '../lib/env-loader';
import { resolvePrismaSchemaPath } from '../lib/prisma-schema';

const ROOT = path.join(__dirname, '..');

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envValues = readProjectEnv({
    cwd: ROOT,
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });
  if (envValues.DATABASE_URL) return envValues.DATABASE_URL;
  return 'file:./prisma/dev.db';
};

loadApplicationEnvironment({ cwd: ROOT, forceMode: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
const databaseUrl = resolveDatabaseUrl();
const schemaPath = resolvePrismaSchemaPath(ROOT, databaseUrl);

process.env.DATABASE_URL = databaseUrl;
execSync(`npx prisma generate --schema=${schemaPath}`, { cwd: ROOT, stdio: 'inherit', env: process.env });
