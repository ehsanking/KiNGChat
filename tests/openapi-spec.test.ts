import { describe, it, expect } from 'vitest';
import { openApiSpec } from '@/lib/openapi/spec';

describe('openapi spec', () => {
  it('builds 3.1 spec and includes health route', () => {
    expect(openApiSpec.openapi).toBe('3.1.0');
    expect(openApiSpec.paths['/api/health']).toBeDefined();
  });
});
