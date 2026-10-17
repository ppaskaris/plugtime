import { expect, test } from '@playwright/test';

test('starts, relaunches, edits and stops entirely offline after shell caching', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/preview-light.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '.local/preview-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload(); // The newly installed worker controls this document.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Charging in progress' })).toBeVisible();
  await page.close();
  const reopened = await context.newPage(); await reopened.goto('/');
  await expect(reopened.getByRole('heading', { name: 'Charging in progress' })).toBeVisible();
  await reopened.getByRole('button', { name: 'Stop Charging', exact: true }).click();
  await expect(reopened.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await reopened.getByRole('button', { name: 'History', exact: true }).click();
  await reopened.getByRole('button', { name: /kWh/ }).click();
  await reopened.getByLabel('Start', { exact: true }).fill('2026-01-01T23:30');
  await reopened.getByLabel('End', { exact: true }).fill('2026-01-02T01:30');
  await reopened.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(reopened.getByText('19.20 kWh', { exact: true })).toBeVisible();
  await reopened.reload();
  await reopened.getByRole('button', { name: 'Statistics / Settings', exact: true }).click();
  await expect(reopened.getByLabel('All-time totals')).toContainText('$3.90');
  const download = reopened.waitForEvent('download');
  await reopened.getByRole('button', { name: 'Export JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('plugtime-backup.json');
});

test('rejects nonexistent and ambiguous Toronto local times', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a session manually' }).click();
  await page.getByLabel('Start', { exact: true }).fill('2026-03-08T02:30');
  await page.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('does not exist');
  await page.getByLabel('Start', { exact: true }).fill('2026-11-01T01:30');
  await page.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('occurs twice');
});
