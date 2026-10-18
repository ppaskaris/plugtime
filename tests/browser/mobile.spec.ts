import { expect, test, type Page } from '@playwright/test';

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const sheet = (page: Page) => page.locator('ion-modal.session-sheet');
const toast = (page: Page) => page.locator('ion-toast');
async function closeNotices(page: Page) {
  // Dismiss may return false during Ionic's enter/leave animation. Retry until
  // queued notices have also completed their presentations and dismissals.
  await expect.poll(async () => {
    if (await toast(page).count()) await toast(page).evaluate(element => (element as HTMLIonToastElement).dismiss());
    return toast(page).count();
  }).toBe(0);
}
async function manual(page: Page, start: string, end = '') {
  await page.getByRole('button', { name: 'Add a session manually' }).click();
  await sheet(page).getByLabel('Start', { exact: true }).fill(start);
  if (end) await sheet(page).getByLabel('End', { exact: true }).fill(end);
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test('session assumptions are disclosed, validated and saved independently of defaults; sheet titles are centered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a session manually' }).click();
  const centered = async () => {
    await expect(sheet(page).getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    const geometry = await sheet(page).locator('ion-title').evaluate(element => {
      const text = element;
      const range = document.createRange(); range.selectNodeContents(text);
      const box = range.getBoundingClientRect(), toolbar = element.closest('ion-toolbar')!.getBoundingClientRect();
      return { actual: box.x + box.width / 2, expected: toolbar.x + toolbar.width / 2 };
    });
    expect(Math.abs(geometry.actual - geometry.expected)).toBeLessThan(2);
  };
  await centered();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]').getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await sheet(page).getByLabel('Start', { exact: true }).fill('2026-01-01T12:00');
  await sheet(page).getByLabel('End', { exact: true }).fill('2026-01-01T13:00');
  await sheet(page).locator('.session-assumptions ion-item[slot=header]').click();
  const power = sheet(page).getByLabel('Session power (kW)', { exact: true });
  const rate = sheet(page).getByLabel('Session electricity rate (CAD/kWh)', { exact: true });
  await power.fill('7.2'); await rate.fill('0.15');
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page)).toHaveCount(0); await closeNotices(page);
  await page.reload();
  await tab(page, 'History').click(); await page.locator('.history-list .session-row').first().click();
  await centered();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]')).toContainText('7.2 kW · CAD $0.15/kWh');
  await sheet(page).locator('.session-assumptions ion-item[slot=header]').click();
  await power.fill('11'); await rate.fill('0.1234567');
  await sheet(page).locator('.session-assumptions ion-item[slot=header]').click();
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]').getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(rate).toBeFocused();
  await rate.fill('0');
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page)).toHaveCount(0); await closeNotices(page);
  await tab(page, 'History').click(); await page.locator('.history-list .session-row').first().click();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]')).toContainText('11 kW · CAD $0/kWh');
  await page.setViewportSize({ width: 320, height: 844 }); await centered();
  await sheet(page).locator('.session-assumptions ion-item[slot=header]').click();
  await power.fill('22');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(sheet(page).locator('ion-item').first()).toHaveCSS('--background', '#1b2c24');
  await expect(sheet(page).locator('ion-item').first()).toHaveCSS('--color', '#e7efe7');
  await expect(sheet(page).locator('ion-item').first().locator('.item-native')).toHaveCSS('background-color', 'rgb(27, 44, 36)');
  await expect(power).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: '.local/session-assumptions-dark-320.png' });
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.history-list .session-row').first().click();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]')).toContainText('11 kW · CAD $0/kWh');
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
  await tab(page, 'Charging').click(); await page.getByRole('button', { name: 'Add a session manually' }).click();
  await expect(sheet(page).locator('.session-assumptions ion-item[slot=header]')).toContainText('9.6 kW · CAD $0.203/kWh');
  await centered();
});

test('stable charging controls, short-stop Undo and another-active recovery', async ({ page }) => {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start Charging', exact: true });
  const before = await start.boundingBox();
  await start.click();
  const stop = page.getByRole('button', { name: 'Stop Charging', exact: true });
  await expect(stop).toBeVisible();
  expect((await stop.boundingBox())!.y).toBe(before!.y);
  await expect(toast(page)).toHaveCount(0);
  await stop.click();
  await expect(toast(page).getByRole('status')).toContainText('under one minute');
  await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(stop).toBeVisible();
  await closeNotices(page);
  await page.getByRole('button', { name: 'Cancel charge', exact: true }).click();
  await expect(toast(page).getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await start.click();
  await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await tab(page, 'History').click();
  await expect(page.locator('.ion-page:not(.ion-page-hidden) .session-row')).toHaveCount(2);
  await expect(page.getByText('Unfinished · add an end time')).toBeVisible();
});

test('sheet focus, default quick-save, changed draft dismissal, deliberate picker bounds and completed deletion Undo', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add a session manually' });
  await add.click();
  await expect(sheet(page).getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await expect(sheet(page).getByRole('button', { name: 'Delete session' })).toHaveCount(0);
  for (const label of ['Start', 'End']) {
    const box = (await sheet(page).getByLabel(label, { exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(374);
  }
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page)).toHaveCount(0); await expect(add).toBeFocused();
  await add.click();
  await sheet(page).getByLabel('Start', { exact: true }).fill('2026-01-01T12:00');
  await page.keyboard.press('Escape'); await expect(sheet(page)).toHaveCount(0);
  await add.click(); await expect(sheet(page).getByLabel('Start', { exact: true })).not.toHaveValue('2026-01-01T12:00');
  await expect(sheet(page).getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.mouse.click(12, 100); await expect(sheet(page)).toHaveCount(0);
  const end = new Date(); end.setMinutes(end.getMinutes() - 2);
  const begin = new Date(end.getTime() - 3600000);
  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  await manual(page, local(begin), local(end));
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toBeVisible();
  await closeNotices(page);
  await page.getByRole('button', { name: 'Delete last charge' }).click();
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Last charge', exact: true })).toBeVisible();
});

test('account sheet preserves current tab, refresh always completes, yearly rollups omit empty periods offline', async ({ page, context }) => {
  let syncs = 0;
  await page.route('**/api/config', route => { syncs++; return route.fulfill({ json: { enabled: true } }); });
  await page.route('**/api/identity', route => route.fulfill({ json: { email: 'owner@example.com' } }));
  await page.route('**/api/snapshot', route => route.fulfill({ json: { sessions: [] } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Account & sync: Synced' })).toBeVisible();
  await tab(page, 'History').click();
  await page.locator('ion-router-outlet > .ion-page').filter({ has: page.locator('.history-list') }).getByRole('button', { name: 'Account & sync: Synced' }).click();
  await expect(page.getByText('owner@example.com', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/history$/);
  await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Close', exact: true }).click();
  const before = syncs;
  // Drive Ionic's refresh event through the same public handler; touch gesture
  // physics differ on Safari and remain part of the user's device feel check.
  await page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden) ion-refresher').evaluate(el => el.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => el.setAttribute('data-completed', 'yes') } })));
  await expect.poll(() => syncs).toBeGreaterThan(before);
  await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden) ion-refresher')).toHaveAttribute('data-completed','yes');
  await expect(page.locator('.offline-status')).toHaveCount(0);
  await context.setOffline(true);
  await tab(page, 'Statistics').click();
  // Ionic delegates segment gestures to the host; its inner accessible button
  // deliberately has pointer-events:none.
  await expect(page.locator('ion-segment-button')).toHaveCount(2);
  await page.locator('ion-segment-button').filter({ hasText: 'By year' }).click();
  await expect(page.getByText('No completed sessions yet.')).toBeVisible();
  await expect(page.locator('.period-row')).toHaveCount(0);
  await tab(page, 'Settings').click();
  await expect(page.getByRole('heading', { name: 'Charging defaults', exact: true })).toBeVisible();
  await expect(page.getByText('owner@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('authentication cannot currently be verified', { exact: false })).toBeVisible();
});

test('compact history keeps overnight start labels and displays both dates at 24 hours; dark, enlarged and desktop layouts fit', async ({ page }) => {
  await page.goto('/');
  await manual(page, '2026-01-01T23:30', '2026-01-02T01:30');
  await manual(page, '2026-01-03T10:00', '2026-01-04T10:00');
  await tab(page, 'History').click();
  const rows = page.locator('.history-list .session-row');
  await expect(rows.first()).toContainText('to Jan 4');
  await expect(rows.last()).not.toContainText('Jan 2');
  await expect(rows.last()).toContainText('19.20 kWh');
  await closeNotices(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addStyleTag({ content: 'html { font-size: 24px; }' });
  await expect(page.locator('html')).toHaveCSS('font-size', '24px');
  await expect(rows.first().locator('strong').first()).toHaveCSS('color', 'rgb(231, 239, 231)');
  await expect(page.locator('ion-tab-button[tab="history"] ion-icon')).toHaveCSS('color', 'rgb(184, 231, 155)');
  await expect(rows.first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: '.local/mobile-history-large-dark.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.screenshot({ path: '.local/desktop-history.png' });
});

test('History groups local start months and Statistics expands years into months and editable sessions', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T16:00:00Z'));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'No sessions yet' })).toBeVisible();
  await page.evaluate(async () => {
    const rows = [
      ['today', '2026-10-17T10:00:00-04:00', '2026-10-17T11:00:00-04:00'],
      ['yesterday', '2026-10-16T08:00:00-04:00', '2026-10-16T10:00:00-04:00'],
      ['month-boundary', '2026-09-30T23:30:00-04:00', '2026-10-01T00:30:00-04:00'],
      ['january', '2026-01-01T12:00:00-05:00', '2026-01-01T13:00:00-05:00'],
      ['year-boundary', '2025-12-31T23:00:00-05:00', '2026-01-01T02:00:00-05:00'],
      ['unfinished', '2026-10-02T10:00:00-04:00', null],
    ];
    const request = indexedDB.open('plugtime');
    const database = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const transaction = database.transaction('sessions', 'readwrite');
    for (const [id, start, end] of rows) {
      const startAt = new Date(start!).toISOString(), endAt = end ? new Date(end).toISOString() : null;
      transaction.objectStore('sessions').put({ id, startAt, endAt, state: endAt ? 'completed' : 'incomplete', powerWatts: 9600, rateMicrosPerKwh: 203000, createdAt: startAt, updatedAt: startAt, revision: 1, serverRevision: 0 });
    }
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve(); }); database.close();
  });
  await page.reload(); await context.setOffline(true);
  const history = page.locator('.ion-page:not(.ion-page-hidden)');
  await expect(history.locator('.history-month > h2')).toHaveText(['October 2026', 'September 2026', 'January 2026', 'December 2025']);
  const october = history.getByRole('region', { name: 'October 2026' });
  await expect(october.locator('.session-row')).toHaveCount(3);
  await expect(october.locator('.session-date')).toHaveText(['Today', 'Yesterday', 'Oct 2']);
  const times = await october.locator('.session-time').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
  expect(new Set(times).size).toBe(1);
  await expect(history.getByRole('region', { name: 'December 2025' }).locator('.session-date')).toHaveText('Dec 31');
  await page.screenshot({ path: '.local/history-month-groups.png' });
  await tab(page, 'Statistics').click();
  await page.locator('ion-segment-button').filter({ hasText: 'By year' }).click();
  const stats = page.locator('.ion-page:not(.ion-page-hidden) .period-list');
  const year = stats.locator('ion-accordion[data-period="2025"]');
  await expect(year.locator(':scope > ion-item').getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await year.locator(':scope > ion-item').getByRole('button').focus(); await page.keyboard.press('Enter');
  const december = year.locator('.period-block');
  await expect(december.locator(':scope > ion-item')).toContainText('December 2025');
  await expect(december.locator(':scope > ion-item')).toContainText('28.80 kWh');
  await december.locator(':scope > ion-item').click();
  await expect(december.locator('.session-row')).toHaveCount(1);
  await december.locator('.session-row').click();
  await expect(sheet(page).getByLabel('Start', { exact: true })).toHaveValue('2025-12-31T23:00');
  await sheet(page).locator('.session-assumptions ion-item[slot=header]').click();
  await sheet(page).getByLabel('Session power (kW)', { exact: true }).fill('5');
  await sheet(page).getByRole('button', { name: 'Save session' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(december.locator(':scope > ion-item')).toContainText('15.00 kWh');
  await expect(year.locator(':scope > ion-item')).toContainText('15.00 kWh');
  await expect(december.locator('.session-row').getByRole('button')).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addStyleTag({ content: 'html { font-size: 24px; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  // Wait for Ionic's background transition after changing the media theme.
  await expect(year.locator(':scope > ion-item').locator('.item-native')).toHaveCSS('background-color', 'rgb(27, 44, 36)');
  await expect(december.locator('.session-row').locator('.item-native')).toHaveCSS('background-color', 'rgb(27, 44, 36)');
  await page.screenshot({ path: '.local/statistics-nested-dark-320.png' });
  const currentYear = stats.locator('ion-accordion[data-period="2026"]');
  await currentYear.locator(':scope > ion-item').click();
  const september = currentYear.locator('.period-block').filter({ hasText: 'September 2026' });
  await september.locator(':scope > ion-item').click();
  await expect(september.locator('.session-row')).toHaveCount(1);
  await expect(september.locator(':scope > ion-item')).toContainText('9.60 kWh');
  await expect(stats.locator('ion-item[slot=header]').filter({ hasText: 'August 2026' })).toHaveCount(0);
  await expect(currentYear.locator('.period-block')).toHaveCount(3);
  const octoberPeriod = currentYear.locator('ion-accordion[data-period="2026-10"]');
  await octoberPeriod.locator(':scope > ion-item').click();
  const expandedHeader = (period: import('@playwright/test').Locator) => period.locator(':scope > ion-item').getByRole('button');
  for (const period of [year, december, currentYear, september, octoberPeriod]) await expect(expandedHeader(period)).toHaveAttribute('aria-expanded', 'true');
  await tab(page, 'History').click(); await tab(page, 'Statistics').click();
  await page.locator('ion-segment-button').filter({ hasText: 'Overview' }).click();
  await page.locator('ion-segment-button').filter({ hasText: 'By year' }).click();
  for (const period of [year, december, currentYear, september, octoberPeriod]) await expect(expandedHeader(period)).toHaveAttribute('aria-expanded', 'true');

});

test('Undo expiry pauses for hover and keyboard focus and notices stay above navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await closeNotices(page);
  await page.getByRole('button', { name: 'Cancel charge', exact: true }).click();
  const undo = toast(page).getByRole('button', { name: 'Undo', exact: true });
  await undo.hover();
  const noticeBox = (await toast(page).locator('[part="container"]').boundingBox())!;
  const tabsBox = (await page.locator('#main-tabs').boundingBox())!;
  expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
  await page.clock.install();
  await page.clock.runFor(9000);
  await expect(undo).toBeVisible();
  await undo.focus(); await page.mouse.move(0, 0);
  await page.clock.runFor(9000);
  await expect(undo).toBeVisible();
  await page.getByRole('heading', { name: 'Ready to charge', exact: true }).click();
  await page.clock.runFor(8500);
  await expect(toast(page)).toHaveCount(0);
});

test('mobile sheet follows a downward touch swipe to dismiss', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a session manually' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  const handle = (await sheet(page).locator('[part="handle"]').boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let delta = 30; delta <= 510; delta += 30) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + delta }] });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(sheet(page)).toHaveCount(0);
});

test('retained tabs preserve long History scroll and Settings drafts with one sync owner', async ({ page }) => {
  let syncs = 0;
  await page.route('**/api/config', route => { syncs++; return route.fulfill({ json: { enabled: false } }); });
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'No sessions yet' })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('plugtime');
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const transaction = database.transaction('sessions', 'readwrite');
    for (let index = 0; index < 80; index++) {
      const startAt = new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString();
      transaction.objectStore('sessions').put({ id: crypto.randomUUID(), startAt, endAt: new Date(Date.parse(startAt) + 3600000).toISOString(), state: 'completed', powerWatts: 9600, rateMicrosPerKwh: 203000, createdAt: startAt, updatedAt: startAt, revision: 1, serverRevision: 0 });
    }
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
  });
  await page.reload();
  await expect(page.locator('.history-list .session-row')).toHaveCount(80);
  await expect(page.getByRole('button', { name: 'Account & sync: Local only' })).toBeVisible();
  // Settle launch/pageshow synchronization before measuring tab-only changes.
  await page.waitForLoadState('networkidle');
  const syncCount = syncs;
  const historyContent = page.locator('ion-router-outlet > .ion-page').filter({ has: page.locator('.history-list') }).locator('ion-content');
  await historyContent.evaluate(async element => { const scroll = await (element as HTMLIonContentElement).getScrollElement(); scroll.scrollTop = 600; });
  await tab(page, 'Settings').click();
  await page.getByLabel('Charging power (kW)').fill('7.2');
  await tab(page, 'History').click();
  await expect.poll(() => historyContent.evaluate(async element => (await (element as HTMLIonContentElement).getScrollElement()).scrollTop)).toBe(600);
  await historyContent.locator('..').getByRole('button', { name: 'Account & sync: Local only' }).click();
  await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => historyContent.evaluate(async element => (await (element as HTMLIonContentElement).getScrollElement()).scrollTop)).toBe(600);
  await tab(page, 'Settings').click();
  await expect(page.getByLabel('Charging power (kW)')).toHaveValue('7.2');
  expect(syncs).toBe(syncCount);
});

test('automatic sync stays quiet across local edits, resume, reload and another tab; explicit refresh bypasses the limit', async ({ page, context }) => {
  let syncs = 0;
  await context.route('**/api/config', route => { syncs++; return route.fulfill({ json: { enabled: false } }); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Account & sync: Local only' })).toBeVisible();
  await page.waitForLoadState('networkidle'); expect(syncs).toBe(1);
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Charging in progress' })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Charging in progress' })).toBeVisible();
  await page.waitForLoadState('networkidle'); expect(syncs).toBe(1);
  const other = await context.newPage(); await other.goto('/'); await other.waitForLoadState('networkidle');
  expect(syncs).toBe(1); await other.close();
  await page.getByRole('button', { name: 'Account & sync: Local only' }).click();
  await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => syncs).toBe(2);
  await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Close', exact: true }).click();
  const refresher = page.locator('ion-refresher');
  await refresher.evaluate(element => element.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => element.setAttribute('data-completed', 'yes') } })));
  await expect(refresher).toHaveAttribute('data-completed', 'yes'); await expect.poll(() => syncs).toBe(3);
});

test('Ionic Settings controls preserve validation and defaults and separate the update button from its explanation', async ({ page }) => {
  await page.goto('/settings');
  const power = page.getByLabel('Charging power (kW)'), rate = page.getByLabel('Electricity rate (CAD/kWh)');
  await power.fill('7.2'); await rate.fill('0.25');
  await page.getByRole('button', { name: 'Save defaults', exact: true }).click();
  await expect(toast(page).getByRole('status')).toContainText('Defaults saved');
  await closeNotices(page);
  await power.fill('1.2345'); await page.getByRole('button', { name: 'Save defaults', exact: true }).click();
  await expect(power).toBeFocused();
  await page.reload(); await expect(power).toHaveValue('7.2'); await expect(rate).toHaveValue('0.25');
  for (const field of await page.locator('ion-input').all()) {
    const dimensions = await field.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      labelSize: parseFloat(getComputedStyle(element.querySelector('.label-text-wrapper')!).fontSize),
      labelRight: element.querySelector('.label-text-wrapper')!.getBoundingClientRect().right,
      inputLeft: element.querySelector('input')!.getBoundingClientRect().left,
    }));
    expect(dimensions.height).toBeLessThanOrEqual(64); expect(dimensions.labelSize).toBeGreaterThanOrEqual(16);
    expect(dimensions.inputLeft - dimensions.labelRight).toBeGreaterThanOrEqual(8);
  }
  const update = page.getByRole('button', { name: 'Check for app updates', exact: true });
  await update.scrollIntoViewIfNeeded();
  const buttonBox = (await update.boundingBox())!;
  const paragraph = page.getByText('PlugTime checks for updates when opened, resumed or reconnected. Pull to refresh to check anytime.');
  const paragraphBox = (await paragraph.boundingBox())!;
  expect(buttonBox.y - paragraphBox.y - paragraphBox.height).toBeGreaterThanOrEqual(15);
  await update.click();
  const message = page.locator('.update-message'); await expect(message).not.toBeEmpty();
  const messageBox = (await message.boundingBox())!, afterBox = (await update.boundingBox())!;
  expect(messageBox.y - afterBox.y - afterBox.height).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: '.local/settings-ionic.png' });
});

test('standalone headers retain a measured safe area through warm reload/resume and adapt to landscape', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    Object.defineProperty(screen.orientation, 'type', { value: 'portrait-primary', configurable: true });
  });
  await page.goto('/');
  const toolbar = page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden) > .main-header > ion-toolbar');
  await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-top', '59px'); window.dispatchEvent(new Event('pageshow')); });
  await expect(toolbar).toHaveCSS('padding-top', '59px');
  await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-top', '0px'); document.documentElement.style.setProperty('--ion-safe-area-top', '0px'); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(toolbar).toHaveCSS('padding-top', '59px');
  await tab(page, 'Settings').click(); await expect(toolbar).toHaveCSS('padding-top', '59px');
  await page.reload(); await expect(toolbar).toHaveCSS('padding-top', '59px');
  await page.locator('ion-button.account-badge:visible').click();
  await expect.poll(() => page.locator('ion-modal.account-sheet ion-toolbar').evaluate(element => parseFloat(getComputedStyle(element).paddingTop))).toBeLessThan(20);
  await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(screen.orientation, 'type', { value: 'landscape-primary', configurable: true }); window.dispatchEvent(new Event('orientationchange')); });
  await expect(toolbar).toHaveCSS('padding-top', '0px');
});

test('avatar overlays show pending count, sync progress, and offline state with accessible status', async ({ page, context }) => {
  const remote: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/config', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/identity', route => route.fulfill({ json: { email: 'owner@example.com' } }));
  await page.route('**/api/snapshot', route => route.fulfill({ json: { sessions: remote } }));
  await page.route('**/api/mutations', async route => {
    await gate; const value = route.request().postDataJSON();
    const session = { ...value.snapshot, revision: value.baseServerRevision + 1, serverRevision: value.baseServerRevision + 1 };
    remote.push(session); await route.fulfill({ json: { session } });
  });
  try {
    await page.goto('/'); await expect(page.getByRole('button', { name: 'Account & sync: Synced' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop Charging', exact: true })).toBeVisible();
    await expect(page.locator('.account-badge ion-badge')).toHaveText('1');
    await page.getByRole('button', { name: 'Account & sync: 1 pending' }).click();
    await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Sync now' }).click();
    await page.locator('ion-modal.account-sheet').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.account-badge ion-spinner')).toBeVisible();
    release(); await expect(page.getByRole('button', { name: 'Account & sync: Synced' })).toBeVisible();
    await context.setOffline(true); await expect(page.getByRole('button', { name: 'Account & sync: Offline' })).toBeVisible();
    await expect(page.locator('.account-badge ion-avatar')).toBeVisible();
  } finally { release(); }
});


test('Ionic cancellation alerts guard repeated requests, dismissal and confirmation in Charging and the editor', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T16:00:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Charging', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Charging', exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-10-17T16:01:00Z'));
  const cancel = page.getByRole('button', { name: 'Cancel charge', exact: true });
  // Two activations in the same task exercise the ref guard before React disables it.
  await page.locator('.charge-secondary ion-button').first().evaluate(element => { (element as HTMLElement).click(); (element as HTMLElement).click(); });
  const alert = page.locator('ion-alert:visible');
  await expect(alert).toHaveCount(1);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await alert.getByRole('button', { name: 'Keep charging', exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Charging', exact: true })).toBeVisible();
  await expect(cancel).toBeFocused();
  await cancel.click(); await page.keyboard.press('Escape');
  await expect(alert).toHaveCount(0);
  await expect(toast(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Correct timestamps', exact: true }).click();
  await sheet(page).getByLabel('End', { exact: true }).fill('2026-10-17T12:02');
  await sheet(page).getByRole('button', { name: 'Delete session', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await alert.getByRole('button', { name: 'Keep charging', exact: true }).click();
  await expect(sheet(page).getByLabel('End', { exact: true })).toHaveValue('2026-10-17T12:02');
  await expect(sheet(page).getByRole('button', { name: 'Delete session', exact: true })).toBeFocused();
  await sheet(page).getByRole('button', { name: 'Delete session', exact: true }).click();
  await alert.getByRole('button', { name: 'Cancel charge', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Charging', exact: true })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Charging', exact: true })).toBeVisible();
  await closeNotices(page);
  await cancel.click(); await alert.getByRole('button', { name: 'Cancel charge', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Charging', exact: true })).toBeVisible();
  await expect(toast(page).getByRole('status')).toContainText('Charge cancelled');
});

test('Charging has bounded lower space and stable primary controls at phone, enlarged and desktop sizes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T16:00:00Z'));
  await page.goto('/');
  for (const [width, text] of [[390, 16], [320, 24], [1100, 16]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: `html { font-size: ${text}px; }` });
    const start = page.getByRole('button', { name: 'Start Charging', exact: true });
    await expect(start).toBeVisible();
    const primary = (await page.locator('.charge-control').boundingBox())!;
    const tile = (await page.locator('.charging-tile').boundingBox())!;
    const manual = (await page.locator('.manual-button').boundingBox())!;
    if (text === 16) {
      expect(tile.y + tile.height - primary.y - primary.height).toBeLessThanOrEqual(65);
      expect(manual.y - tile.y - tile.height).toBeLessThanOrEqual(16);
    }
    await start.click();
    await expect(page.getByRole('button', { name: 'Stop Charging', exact: true })).toBeVisible();
    expect(Math.abs((await page.locator('.charge-control').boundingBox())!.y - primary.y)).toBeLessThan(1);
    await page.clock.setFixedTime(new Date('2026-10-21T20:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(page.locator('.timer')).toHaveText('100h 00m');
    expect(Math.abs((await page.locator('.charge-control').boundingBox())!.y - primary.y)).toBeLessThan(1);
    for (const action of await page.locator('.charging-tile ion-button').all()) {
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(tile.x);
      expect(box.x + box.width).toBeLessThanOrEqual(tile.x + tile.width);
    }
    await page.getByRole('button', { name: 'Cancel charge', exact: true }).click();
    await page.locator('ion-alert').getByRole('button', { name: 'Cancel charge', exact: true }).click();
    await expect(start).toBeVisible(); await closeNotices(page);
    await page.clock.setFixedTime(new Date('2026-10-17T16:00:00Z'));
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const start = page.getByRole('button', { name: 'Start Charging', exact: true });
  await start.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(start).toBeFocused();
  await expect(start).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: '.local/ionic-charging-forced-colors.png' });
});


test('long account identities and conflict comparisons fit page and plain sheet presentations', async ({ page, context }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Charging defaults', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(async () => {
    const request = indexedDB.open('plugtime');
    const database = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const transaction = database.transaction(['cloud', 'conflicts', 'sessions'], 'readwrite');
    const stamp = '2026-01-01T12:00:00.000Z';
    const session = { id: 'conflicted', startAt: stamp, endAt: '2026-01-01T13:00:00.000Z', state: 'completed', powerWatts: 9600, rateMicrosPerKwh: 203000, createdAt: stamp, updatedAt: stamp, revision: 2, serverRevision: 1 };
    transaction.objectStore('sessions').put(session);
    transaction.objectStore('conflicts').put({ sessionId: session.id, remote: { ...session, powerWatts: 7200 }, active: null, reason: 'different revision' });
    transaction.objectStore('cloud').put({ id: 'cloud', status: 'conflict', enabled: true, lastAttemptAt: Date.now(), identity: { email: `${'long.owner.'.repeat(12)}@example.com`, verifiedAt: stamp }, message: 'Review both saved versions before choosing.' });
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve(); }); database.close();
  });
  await page.reload();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: 'html { font-size: 24px; }' });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const account = page.getByRole('region', { name: 'Cloud synchronization', exact: true });
  await expect(account.getByRole('heading', { name: 'Review conflicting charge' })).toBeVisible();
  for (const button of await account.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.locator('ion-button.account-badge:visible').click();
  const modal = page.locator('ion-modal.account-sheet');
  await expect(modal.getByRole('region', { name: 'Cloud synchronization', exact: true })).toBeVisible();
  await expect(modal.locator('ion-card')).toHaveCount(0);
  await expect(modal.getByRole('heading', { name: 'Account & sync', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Use cloud version', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/ionic-account-conflict-dark-320.png' });
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/settings$/);
});
