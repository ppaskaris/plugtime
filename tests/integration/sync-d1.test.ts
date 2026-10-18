// This test joins browser IndexedDB and Worker/D1 realms under Vitest.
// Production browser and Worker code are typechecked separately by their configs.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { applyMutation, snapshot } from '../../worker/store';
import { PlugTimeDatabase, startSession, stopSession } from '../../src/db';
import { synchronize } from '../../src/sync';
let mf: Miniflare;
let database: D1Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch() {return new Response("test");}}', d1Databases: ['DB'] }));
  database = await mf.getD1Database('DB');
  const sql = await readFile('migrations/0001_sync.sql', 'utf8');
  await database.exec(sql.replaceAll(/--[^\n]*/g, '').replaceAll(/\r?\n/g, ' '));
});
afterAll(async () => { await mf?.dispose(); });

it('syncs a burst of locally cancelled starts against real D1 without active-charge conflicts', async () => {
  const local = new PlugTimeDatabase(`rapid-starts-${crypto.randomUUID()}`);
  try {
    for (let index = 0; index < 10; index++) await stopSession(await startSession(local), local);
    const active = await startSession(local);
    await synchronize(local, {
      configured: async () => true, identity: async () => ({ email: 'owner@example.com' }),
      snapshot: () => snapshot(database), upload: value => applyMutation(database, value),
    });
    expect(await local.conflicts.count()).toBe(0); expect(await local.outbox.count()).toBe(0);
    expect((await snapshot(database)).filter(record => record.state === 'active').map(record => record.id)).toEqual([active.id]);
  } finally { await local.delete(); }
});

