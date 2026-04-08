import { test, expect } from '@playwright/test';

test('auth page loads', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page).toHaveTitle(/Elahe/i);
});
