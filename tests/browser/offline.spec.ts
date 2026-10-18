import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('finds a real waiting service worker on resume, defers installation, reloads safely and keeps offline data', async ({ page, context }) => {
  let revision = 0;
  const root = resolve('dist');
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (path.startsWith('/api/')) { response.setHeader('Content-Type', 'application/json'); response.end('{"enabled":false}'); return; }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    try {
      const data = await readFile(file);
      const ext = file.split('.').pop()!;
      response.setHeader('Content-Type', ({js:'application/javascript',html:'text/html',css:'text/css',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'} as Record<string,string>)[ext] ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.end(path === '/sw.js' ? Buffer.concat([data, Buffer.from(`\n// synthetic deployment ${revision}\n`)]) : data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address() as {port:number};
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.getByText('Ready for offline use', {exact:true})).toBeVisible();
    await page.reload();
    await page.getByRole('button', {name:'Start Charging',exact:true}).click();
    revision++;
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    const prompt = page.getByRole('region', {name:'App update'});
    await expect(prompt).toBeVisible();
    const install = prompt.getByRole('button', {name:'Install update'});
    await expect(install).toBeDisabled();
    await page.getByRole('button', {name:'Cancel charge',exact:true}).click();
    await expect(install).toBeEnabled();
    await page.getByRole('button', {name:'Add a session manually'}).click();
    await expect(install).toBeDisabled();
    await page.getByLabel('Start',{exact:true}).fill('2024-01-01T12:00');
    await page.getByLabel('End',{exact:true}).fill('2024-01-01T13:00');
    await page.getByRole('button',{name:'Save session',exact:true}).click();
    await expect(install).toBeEnabled();
    // Another window can activate the worker, but must not reload this editor.
    await page.getByRole('button', {name:'Add a session manually'}).click();
    const other = await context.newPage();
    await other.goto(`http://127.0.0.1:${address.port}/`);
    const otherInstall = other.getByRole('button',{name:'Install update',exact:true});
    await expect(otherInstall).toBeEnabled();
    const otherLoaded = other.waitForEvent('load'); await otherInstall.click(); await otherLoaded;
    await expect(other.getByRole('region',{name:'App update'})).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible(); await expect(install).toBeDisabled();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    const loaded = page.waitForEvent('load'); await install.click(); await loaded;
    await other.close();
    await expect(prompt).toHaveCount(0);
    await page.getByRole('button',{name:'History',exact:true}).click();
    await expect(page.getByText('1 session recorded',{exact:true})).toBeVisible();
    await context.setOffline(true); await page.reload();
    await page.getByRole('button',{name:'History',exact:true}).click();
    await expect(page.getByText('1 session recorded',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Statistics / Settings',exact:true}).click();
    await page.getByRole('button',{name:'Check for app updates',exact:true}).click();
    await expect(page.getByText('Go online to check for app updates.')).toBeVisible();
  } finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
});

test('reviews and imports a backup offline, exports it, and skips a repeat import after relaunch', async ({ page, context }) => {
  await page.route('**/api/config', route => route.fulfill({status:401,json:{error:'authentication_required'}}));
  await page.goto('/');
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible();
  // Let the initial sync finish before terminating this view; a live lease
  // deliberately blocks imports after an interrupted synchronization.
  await expect(page.getByRole('link', { name: 'Sign in with Cloudflare' })).toBeVisible();
  await page.reload(); await context.setOffline(true);
  await page.getByRole('button', { name: 'Statistics / Settings', exact: true }).click();
  const backup = { app: 'PlugTime', schemaVersion: 2, exportedAt: '2024-01-01T00:00:00.000Z', settings: { id: 'defaults', powerWatts: 9600, rateMicrosPerKwh: 203000 }, sessions: [{
    id: '12345678-1234-4123-8123-123456789012', startAt: '2024-01-01T12:00:00.000Z', endAt: '2024-01-01T14:00:00.000Z', state: 'completed', powerWatts: 9600, rateMicrosPerKwh: 203000,
    createdAt: '2024-01-01T12:00:00.000Z', updatedAt: '2024-01-01T14:00:00.000Z', revision: 1, serverRevision: 0,
  }], outbox: [], conflicts: [] };
  const file = { name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
  await page.getByLabel('Choose PlugTime JSON').setInputFiles(file);
  await expect(page.getByText('1 to add, 0 already present, 0 blocked.')).toBeVisible();
  await expect(page.getByLabel('All-time totals')).toContainText('0.00');
  const beforeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add missing records' }).click();
  expect((await beforeDownload).suggestedFilename()).toBe('plugtime-before-import.json');
  await expect(page.getByLabel('All-time totals')).toContainText('19.20');
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const stream = await (await exported).createReadStream(); const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const recovered = JSON.parse(Buffer.concat(chunks).toString());
  expect(recovered.sessions[0].id).toBe(backup.sessions[0].id); expect(recovered.outbox).toHaveLength(1);
  await page.reload(); await page.getByRole('button', { name: 'Statistics / Settings', exact: true }).click();
  await page.getByLabel('Choose PlugTime JSON').setInputFiles(file);
  await expect(page.getByText('0 to add, 1 already present, 0 blocked.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add missing records' })).toBeDisabled();
});

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
