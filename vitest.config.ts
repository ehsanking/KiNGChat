import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'tests/e2e/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'tests/deployment-topology-regressions.test.ts',
            'tests/install-compose-security.test.ts',
            'tests/install-script-guardrails.test.ts',
            'tests/installer-env-compatibility.test.ts',
          ],
        },
      },
    ],
  },
});
