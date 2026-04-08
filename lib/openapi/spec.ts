import fs from 'fs';
import path from 'path';
import { OpenApiSchemas } from './schemas';

const apiRoot = path.join(process.cwd(), 'app/api');

const toPath = (filePath: string) => {
  const rel = path.relative(apiRoot, filePath).replaceAll('\\', '/').replace(/\/route\.ts$/, '');
  return `/api/${rel.replace(/\[(.+?)\]/g, '{$1}')}`;
};

const detectTag = (p: string) => {
  if (p.includes('/auth') || p.includes('/login') || p.includes('/register') || p.includes('/password-recovery') || p.includes('/2fa')) return 'Auth';
  if (p.includes('/e2ee')) return 'E2EE';
  if (p.includes('/messages') || p.includes('/drafts')) return 'Messaging';
  if (p.includes('/upload')) return 'Upload';
  if (p.includes('/health') || p.includes('/metrics') || p.includes('/settings')) return 'Admin';
  if (p.includes('/push')) return 'Push';
  return 'Misc';
};

const discoverPaths = () => {
  const out: Record<string, Record<string, unknown>> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name === 'route.ts') {
        const routePath = toPath(full);
        out[routePath] = {
          get: { tags: [detectTag(routePath)], responses: { '200': { description: 'OK' } } },
          post: { tags: [detectTag(routePath)], responses: { '200': { description: 'OK' } } },
        };
      }
    }
  };

  walk(apiRoot);
  return out;
};

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Elahe Messenger API',
    version: '1.0.0',
    description: 'Self-hosted encrypted messenger API endpoints.',
  },
  tags: [
    { name: 'Auth' },
    { name: 'E2EE' },
    { name: 'Messaging' },
    { name: 'Upload' },
    { name: 'Admin' },
    { name: 'Push' },
    { name: 'Misc' },
  ],
  components: {
    schemas: OpenApiSchemas,
  },
  paths: discoverPaths(),
};
