import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PlugTimeDatabase, deleteSession, saveSession, saveSettings, startSession } from '../src/db';
import { defaults, type Session } from '../src/domain';
import { makeBackup } from '../src/exports';
import { applyImport, parseBackup, reviewImport } from '../src/imports';
import { resolveConflict, SyncError, synchronize, type SyncTransport } from '../src/sync';
import type { Upload } from '../src/protocol';

let source: PlugTimeDatabase, target: PlugTimeDatabase;
beforeEach(() => { source = new PlugTimeDatabase(crypto.randomUUID()); target = new PlugTimeDatabase(crypto.randomUUID()); });
afterEach(async () => { await source.delete(); await target.delete(); });
const complete = (db = source) => saveSession({ ...defaults, startAt: '2024-02-01T12:00:00.000Z', endAt: '2024-02-01T13:00:00.000Z' }, undefined, db);
const text = async (db = source) => JSON.stringify(await makeBackup(db));
function cloud() {
  const rows = new Map<string, Session>(), receipts = new Map<string, Session>();
  const api: SyncTransport = { configured: async () => true, snapshot: async () => [...rows.values()], upload: async (m: Upload) => {
    const prior = receipts.get(m.id); if (prior) return { status: 200, session: prior };
    const current = rows.get(m.snapshot.id);
    if ((current?.serverRevision ?? 0) !== m.baseServerRevision) return { status: 409, remote: current ?? null, error: 'revision_conflict' };
    const revision = m.baseServerRevision + 1, saved = { ...m.snapshot, revision, serverRevision: revision };
    receipts.set(m.id, saved); rows.set(saved.id, saved); return { status: 200, session: saved };
  } };
  return { rows, receipts, api };
}
it('round trips settings, unfinished charge, tombstone, pending mutations and conflict snapshots', async () => {
  const s = await complete(); await deleteSession(s, source); await startSession(source);
  await saveSettings({ powerWatts: 4200, rateMicrosPerKwh: 150000 }, source);
  await source.conflicts.add({ sessionId: s.id, remote: { ...s, serverRevision: 3 }, active: null, reason: 'revision_conflict' });
  const before = await makeBackup(source);
  await applyImport(await reviewImport(JSON.stringify(before), target), target);
  const after = await makeBackup(target);
  expect(after.sessions.map(s => { const { activeKey, ...rest } = s; return rest; })).toEqual(before.sessions.map(s => { const { activeKey, ...rest } = s; return rest; }));
  expect(after.outbox).toEqual(before.outbox.map(m => ({ ...m, snapshot: parseBackup(JSON.stringify(before)).outbox.find(n => n.id === m.id)!.snapshot })));
  expect(after.settings).toEqual(before.settings); expect(after.conflicts).toEqual(before.conflicts);
});
it('repeat import skips acknowledged records and preserves existing pending changes and defaults', async () => {
  await complete(); const backup = await text();
  await saveSettings({ powerWatts: 3000, rateMicrosPerKwh: 0 }, target);
  await applyImport(await reviewImport(backup, target), target);
  const c = cloud(); await synchronize(target, c.api);
  const review = await reviewImport(backup, target);
  expect(review.rows[0].action).toBe('skip'); await applyImport(review, target);
  expect(await target.outbox.count()).toBe(0); expect((await makeBackup(target)).settings.powerWatts).toBe(3000);
  expect(c.rows.size).toBe(1);
});
it('blocks old backup copies over local edits/deletions and timestamp duplicates with different IDs', async () => {
  const s = await complete(); await applyImport(await reviewImport(await text(), target), target);
  await deleteSession((await target.sessions.get(s.id))!, target);
  const before = await text(target);
  const protectedRow = (await reviewImport(await text(), target)).rows[0];
  expect(protectedRow.action).toBe('blocked');
  expect(protectedRow.deletionPreserved).toBe(true);
  expect(protectedRow.reason).toContain('will not restore it');
  const deletedBackup = await reviewImport(before, target);
  expect(deletedBackup.rows[0]).toMatchObject({ action: 'skip', deletionPreserved: true });
  expect(deletedBackup.rows[0].reason).toContain('Already deleted');
  const b = await makeBackup(source); b.sessions[0].id = crypto.randomUUID(); b.outbox = [];
  expect((await reviewImport(JSON.stringify(b), target)).rows[0].action).toBe('blocked');
  expect({ ...JSON.parse(await text(target)), exportedAt: '' }).toEqual({ ...JSON.parse(before), exportedAt: '' });
});
it('does not replace an active charge or apply a stale review, and rolls back failed writes', async () => {
  await startSession(source); await startSession(target);
  expect((await reviewImport(await text(), target)).rows[0].action).toBe('blocked');
  await target.delete(); target = new PlugTimeDatabase(crypto.randomUUID());
  const review = await reviewImport(await text(), target); await saveSettings({ ...defaults, powerWatts: 5000 }, target);
  await expect(applyImport(review, target)).rejects.toThrow('changed');
  const fresh = await reviewImport(await text(), target);
  target.outbox.hook('creating', () => { throw new Error('full storage'); });
  await expect(applyImport(fresh, target)).rejects.toThrow('full storage'); expect(await target.sessions.count()).toBe(0);
});
it('replays an uncertain upload receipt after export/restore then synchronizes later edits', async () => {
  const s = await complete(), c = cloud(); const send = c.api.upload;
  c.api.upload = async m => { await send(m); throw new SyncError('offline', 'lost acknowledgement'); };
  await synchronize(source, c.api);
  await saveSession({ ...s, endAt: '2024-02-01T14:00:00.000Z' }, s, source);
  const backup = await makeBackup(source);
  await applyImport(await reviewImport(JSON.stringify(backup), target), target);
  expect((await target.outbox.get(backup.outbox.find(m => m.upload)!.id))?.upload).toEqual(backup.outbox.find(m => m.upload)!.upload);
  c.api.upload = send; await synchronize(target, c.api);
  expect(await target.outbox.count()).toBe(0); expect(c.rows.get(s.id)?.endAt).toBe('2024-02-01T14:00:00.000Z');
  expect(c.receipts.size).toBe(2);
});
it('keeps a newer cloud deletion during restored synced-record reconciliation', async () => {
  const s = await complete(), c = cloud(); await synchronize(source, c.api);
  const old = await text(); const acknowledged = (await source.sessions.get(s.id))!;
  await deleteSession(acknowledged, source); await synchronize(source, c.api);
  await applyImport(await reviewImport(old, target), target); await synchronize(target, c.api);
  expect(c.rows.get(s.id)?.state).toBe('deleted'); expect(await target.conflicts.count()).toBe(1);
  await resolveConflict((await target.conflicts.get(s.id))!, 'cloud', target);
  expect((await target.sessions.get(s.id))?.state).toBe('deleted'); expect(await target.outbox.count()).toBe(0);
});
it('queues synced tombstones for recovery without restoring a cloud lease', async () => {
  const s = await complete(), c = cloud(); await deleteSession(s, source); await synchronize(source, c.api);
  await applyImport(await reviewImport(await text(), target), target);
  expect(await target.outbox.count()).toBe(1); expect(await target.cloud.get('cloud')).toBeUndefined();
  await synchronize(target, c.api); expect(await target.outbox.count()).toBe(0); expect(c.rows.get(s.id)?.state).toBe('deleted');
});
it('recovers onto an empty replacement backend after explicit local conflict resolution', async () => {
  const s = await complete(), old = cloud(); await synchronize(source, old.api);
  await applyImport(await reviewImport(await text(), target), target);
  const replacement = cloud(); await synchronize(target, replacement.api);
  expect(await target.conflicts.count()).toBe(1); expect(replacement.rows.size).toBe(0);
  await resolveConflict((await target.conflicts.get(s.id))!, 'local', target); await synchronize(target, replacement.api);
  expect(replacement.rows.get(s.id)?.state).toBe('completed'); expect(await target.outbox.count()).toBe(0);
});
it('rejects malformed/unsupported backups and inconsistent pending envelopes before writing', async () => {
  await complete(); const b = await makeBackup(source);
  for (const changed of [{ ...b, schemaVersion: 1 }, { ...b, sessions: [...b.sessions, ...b.sessions] },
    { ...b, settings: { ...defaults, powerWatts: '9600' } }, { ...b, outbox: [{ ...b.outbox[0], sessionId: crypto.randomUUID() }] },
    { ...b, sessions: [{ ...b.sessions[0], endAt: 'garbage' }] }]) {
    await expect(reviewImport(JSON.stringify(changed), target)).rejects.toThrow();
  }
  const review = await reviewImport(await text(), target);
  await target.cloud.put({ id: 'cloud', leaseUntil: Date.now() + 60000 });
  await expect(applyImport(review, target)).rejects.toThrow('synchronization');
  expect(await target.sessions.count()).toBe(0);
});
it('flags duplicate starts under different IDs within the same backup', async () => {
  await complete(); const backup = await makeBackup(source); backup.outbox = [];
  backup.sessions.push({ ...backup.sessions[0], id: crypto.randomUUID(), endAt: '2024-02-01T15:00:00.000Z' });
  const review = await reviewImport(JSON.stringify(backup), target);
  expect(review.rows.map(r => r.action)).toEqual(['add', 'blocked']);
  await applyImport(review, target); expect(await target.sessions.count()).toBe(1);
});
