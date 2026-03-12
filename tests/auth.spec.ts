import { test, expect } from '@playwright/test';

test('landing page loads and has title', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await expect(page).toHaveTitle(/OmniCoach OS/);
});

test('coach login page loads', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
});
