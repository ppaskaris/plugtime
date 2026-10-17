import { expect, test } from '@playwright/test';

test('starts, relaunches, edits and stops entirely offline after shell caching', async ({ page, context }) => {
  // Reproduce Safari's LAN HTTP restriction throughout the recording workflow.
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  });
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
  await reopened.clock.setFixedTime(new Date(Date.now() + 60_000));
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

test('quick cancel and sub-minute stops leave no counted charge, even after relaunch', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
  await page.reload(); await context.setOffline(true);
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel charge', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Charge cancelled');
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await page.getByRole('button', { name: 'Stop Charging', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('under one minute');
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('0 sessions recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Statistics / Settings', exact: true }).click();
  await expect(page.getByLabel('All-time totals')).toContainText('0.00');
});

test('deletes the last completed charge directly, with confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a session manually' }).click();
  await page.getByLabel('Start', { exact: true }).fill('2026-01-01T12:00');
  await page.getByLabel('End', { exact: true }).fill('2026-01-01T12:01');
  await page.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete last charge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete last charge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('0 sessions recorded', { exact: true })).toBeVisible();
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

test('expired cloud authentication does not block recording or clear pending changes', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({json:{enabled:true}}));
  await page.route('**/api/snapshot', route => route.fulfill({status:401,json:{error:'authentication_required'}}));
  await page.route('**/api/mutations', route => route.fulfill({status:401,json:{error:'authentication_required'}}));
  await page.goto('/');
  await expect(page.getByRole('link', {name:'Sign in with Cloudflare'})).toBeVisible();
  await page.getByRole('button',{name:'Start Charging',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Charging in progress'})).toBeVisible();
  await expect(page.getByRole('link', {name:'Sign in with Cloudflare'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Charging in progress'})).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Statistics / Settings',exact:true}).click();
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('plugtime-backup.json');
});
