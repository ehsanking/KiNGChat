import { test, expect } from '@playwright/test';

test('admin endpoint requires auth', async ({ request }) => {
  const response = await request.post('/api/admin/backup');
  expect([401, 403]).toContain(response.status());
});
