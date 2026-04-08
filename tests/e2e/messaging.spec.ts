import { test, expect } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const response = await request.get('/api/health/live');
  expect(response.ok()).toBeTruthy();
});
