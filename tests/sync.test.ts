import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlugTimeDatabase, deleteSession, restoreSession, saveSession, startSession, stopSession } from '../src/db';
import { defaults, type Session } from '../src/domain';
import { AUTO_SYNC_INTERVAL_MS, resolveConflict, SyncError, synchronize, type SyncTransport } from '../src/sync';
import type { Upload } from '../src/protocol';
let database: PlugTimeDatabase;
let remote: Map<string, Session>;
let receipts: Map<string, Session>;
let api: SyncTransport;
beforeEach(() => {
  database = new PlugTimeDatabase(`sync-test-${crypto.randomUUID()}`); remote = new Map(); receipts = new Map();
  api = {
    identity: async () => ({ email: 'owner@example.com' }),
    configured: async () => true,
    snapshot: async () => [...remote.values()],
    upload: async (value: Upload) => {
      const prior = receipts.get(value.id); if (prior) return {status: 200, session: prior};
      const current = remote.get(value.snapshot.id);
      if ((current?.serverRevision ?? 0) !== value.baseServerRevision) return {status: 409, remote: current, error: 'revision_conflict'};
      const blocker = [...remote.values()].find(session => session.state === 'active' && session.id !== value.snapshot.id);
      if (value.snapshot.state === 'active' && blocker) return { status: 409, remote: current ?? null, active: blocker, error: 'active_conflict' };
      const revision = value.baseServerRevision + 1;
      const saved = { ...value.snapshot, revision, serverRevision: revision };
      receipts.set(value.id, saved); remote.set(saved.id, saved);
      return {status: 200, session: saved};
    },
  };
});
afterEach(async () => { await database.delete(); vi.useRealTimers(); });
const complete = () => saveSession({ ...defaults, startAt: '2026-01-01T12:00:00.000Z', endAt: '2026-01-01T13:00:00.000Z' }, undefined, database);

it('syncs repeated accidental starts/stops without uploading obsolete active states or creating conflicts', async () => {
  for (let index = 0; index < 12; index++) await stopSession(await startSession(database), database);
  const active = await startSession(database);
  const upload = vi.fn(api.upload); api.upload = upload;
  await synchronize(database, api);
  expect(await database.conflicts.count()).toBe(0); expect(await database.outbox.count()).toBe(0);
  expect(upload.mock.calls.filter(([value]) => value.snapshot.state === 'active').map(([value]) => value.snapshot.id)).toEqual([active.id]);
  expect([...remote.values()].filter(session => session.state === 'active').map(session => session.id)).toEqual([active.id]);
});

it('releases a previously uploaded active charge before later starts and repairs already-persisted queue-order conflicts', async () => {
  const first = await startSession(database); await synchronize(database, api);
  await deleteSession((await database.sessions.get(first.id))!, database);
  const cancelled = await startSession(database);
  const startMutation = (await database.outbox.where('sessionId').equals(cancelled.id).first())!;
  const envelope = { id: startMutation.id, baseServerRevision: 0, snapshot: startMutation.snapshot };
  await database.outbox.update(startMutation.id, { upload: envelope });
  await database.conflicts.put({ sessionId: cancelled.id, remote: null, active: remote.get(first.id)!, reason: 'active_conflict' });
  await deleteSession(cancelled, database);
  const active = await startSession(database);
  const activeMutation = (await database.outbox.where('sessionId').equals(active.id).first())!;
  await database.outbox.update(activeMutation.id, { upload: { id: activeMutation.id, baseServerRevision: 0, snapshot: activeMutation.snapshot } });
  await database.conflicts.put({ sessionId: active.id, remote: null, active: remote.get(first.id)!, reason: 'active_conflict' });
  await synchronize(database, api);
  expect(await database.outbox.count()).toBe(0); expect(await database.conflicts.count()).toBe(0);
  expect(remote.get(first.id)?.state).toBe('deleted'); expect(remote.get(cancelled.id)?.state).toBe('deleted'); expect(remote.get(active.id)?.state).toBe('active');
  expect(receipts.has(envelope.id)).toBe(false); // Rejected obsolete start was not resurrected.
});

it('replays an uncertain active upload exactly before cancelling it and starting another charge', async () => {
  const first = await startSession(database);
  const send = api.upload; let lost = true; const payloads: Upload[] = [];
  api.upload = async value => { payloads.push(structuredClone(value)); const result = await send(value); if (lost) { lost = false; throw new SyncError('offline', 'Lost acknowledgement'); } return result; };
  await synchronize(database, api);
  await stopSession(first, database); const active = await startSession(database);
  await synchronize(database, api);
  expect(payloads[1]).toEqual(payloads[0]); expect(remote.get(first.id)?.state).toBe('deleted'); expect(remote.get(active.id)?.state).toBe('active');
  expect(await database.conflicts.count()).toBe(0); expect(await database.outbox.count()).toBe(0);
});

it('does not auto-resolve a genuine active charge on another device', async () => {
  const local = await startSession(database);
  const other = { ...local, id: crypto.randomUUID(), serverRevision: 1 };
  remote.set(other.id, other);
  await synchronize(database, api); await synchronize(database, api);
  expect((await database.conflicts.get(local.id))?.active?.id).toBe(other.id);
  expect((await database.sessions.get(local.id))?.state).toBe('active');
});

it('bounds automatic conflict repair if the cloud still rejects an apparently released active slot', async () => {
  const old = await startSession(database); await synchronize(database, api);
  const localOld = await database.sessions.get(old.id);
  await deleteSession(localOld!, database);
  // Simulate inconsistent/stale recovery metadata: the remote is still active.
  await database.outbox.where('sessionId').equals(old.id).delete();
  const active = await startSession(database);
  await database.conflicts.put({ sessionId: active.id, remote: null, active: remote.get(old.id)!, reason: 'active_conflict' });
  const send = vi.fn(api.upload); api.upload = send;
  await synchronize(database, api);
  expect(send).toHaveBeenCalledTimes(1);
  expect((await database.conflicts.get(active.id))?.reason).toBe('active_conflict');
});

it('limits automatic attempts across reloads and tabs, preserving local changes until the hourly boundary', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  const configured = vi.fn(api.configured); api.configured = configured;
  await Promise.all([synchronize(database, api, { automatic: true }), synchronize(database, api, { automatic: true })]);
  expect(configured).toHaveBeenCalledTimes(1);
  await complete();
  database.close(); await database.open();
  const secondTab = new PlugTimeDatabase(database.name);
  try {
    vi.setSystemTime(Date.now() + AUTO_SYNC_INTERVAL_MS - 1);
    await synchronize(secondTab, api, { automatic: true });
    expect(configured).toHaveBeenCalledTimes(1); expect(await database.outbox.count()).toBe(1);
    vi.setSystemTime(Date.now() + 1);
    await synchronize(secondTab, api, { automatic: true });
    expect(configured).toHaveBeenCalledTimes(2); expect(await database.outbox.count()).toBe(0);
  } finally { secondTab.close(); }
});

it.each(['auth', 'offline', 'error'] as const)('counts failed %s attempts toward the hourly limit but permits manual retry', async kind => {
  const configured = vi.fn(async () => { throw new SyncError(kind, 'Synthetic failure'); }); api.configured = configured;
  await synchronize(database, api, { automatic: true });
  await synchronize(database, api, { automatic: true });
  expect(configured).toHaveBeenCalledTimes(1);
  await synchronize(database, api);
  expect(configured).toHaveBeenCalledTimes(2);
  await synchronize(database, api, { automatic: true });
  expect(configured).toHaveBeenCalledTimes(2);
});

it('uses a recent successful sync as the initial cooldown when upgrading an existing store', async () => {
  await database.cloud.put({ id: 'cloud', lastSuccessAt: new Date().toISOString(), status: 'idle' });
  const configured = vi.fn(api.configured); api.configured = configured;
  await synchronize(database, api, { automatic: true });
  expect(configured).not.toHaveBeenCalled();
  await synchronize(database, api);
  expect(configured).toHaveBeenCalledTimes(1);
});

it.each(['before', 'during', 'after'])('restores the same record %s deletion upload without rewinding the queue', async timing => {
  const original = await complete(); await synchronize(database, api);
  const deleted = await deleteSession((await database.sessions.get(original.id))!, database);
  if (timing === 'before') await restoreSession(original, deleted.revision, database);
  if (timing === 'during') {
    const upload = api.upload;
    let restored = false;
    api.upload = async value => {
      if (!restored && value.snapshot.state === 'deleted') {
        restored = true;
        const inFlight = await database.outbox.get(value.id);
        await restoreSession(original, deleted.revision, database);
        expect(await database.outbox.get(value.id)).toEqual(inFlight);
      }
      return upload(value);
    };
  }
  await synchronize(database, api);
  if (timing === 'after') { await restoreSession(original, deleted.revision, database); await synchronize(database, api); }
  expect(remote.get(original.id)).toMatchObject({ startAt: original.startAt, endAt: original.endAt, state: 'completed', powerWatts: original.powerWatts, rateMicrosPerKwh: original.rateMicrosPerKwh, createdAt: original.createdAt, serverRevision: 3 });
  expect(await database.outbox.count()).toBe(0); expect(await database.conflicts.count()).toBe(0);
});

it('retains last verified identity when authentication expires', async () => {
  await synchronize(database, api);
  expect((await database.cloud.get('cloud'))?.identity?.email).toBe('owner@example.com');
  api.identity = async () => { throw new SyncError('auth', 'Sign in again.'); };
  await synchronize(database, api);
  expect(await database.cloud.get('cloud')).toMatchObject({ status: 'auth', identity: { email: 'owner@example.com' } });
});

it('uploads queued edits in revision order and downloads a complete snapshot on a fresh device', async () => {
  const first = await complete();
  await saveSession({...first, endAt: '2026-01-01T14:00:00.000Z'}, first, database);
  await synchronize(database, api);
  expect(await database.outbox.count()).toBe(0);
  expect(remote.get(first.id)?.endAt).toBe('2026-01-01T14:00:00.000Z');
  const fresh = new PlugTimeDatabase(`fresh-${crypto.randomUUID()}`);
  try { await synchronize(fresh, api); expect((await fresh.sessions.get(first.id))?.serverRevision).toBe(2); }
  finally { await fresh.delete(); }
});

it('retries a lost acknowledgement with the exact same ID and payload before pulling', async () => {
  const first = await complete();
  const original = api.upload; let loseAcknowledgement = true; const payloads: Upload[] = [];
  api.upload = async value => { payloads.push(structuredClone(value)); const response = await original(value);
    if (loseAcknowledgement) { loseAcknowledgement = false; throw new SyncError('offline', 'interrupted'); } return response; };
  await synchronize(database, api);
  expect(await database.outbox.count()).toBe(1);
  await synchronize(database, api);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(remote.get(first.id)?.serverRevision).toBe(1);
  expect(await database.conflicts.count()).toBe(0);
  expect(await database.outbox.count()).toBe(0);
});

it('protects an edit made during an in-flight upload', async () => {
  const first = await complete(); const original = api.upload; let edited = false;
  api.upload = async value => {
    if (!edited) { edited = true; await saveSession({...first, endAt:'2026-01-01T15:00:00.000Z'}, first, database); }
    return original(value);
  };
  await synchronize(database, api);
  expect(remote.get(first.id)?.endAt).toBe('2026-01-01T15:00:00.000Z');
  expect(await database.outbox.count()).toBe(0);
});

it('keeps local edits during a revision conflict, then explicitly resolves using the local version', async () => {
  const first = await complete(); await synchronize(database, api);
  const local = (await database.sessions.get(first.id))!;
  await saveSession({...local, endAt:'2026-01-01T15:00:00.000Z'}, local, database);
  remote.set(first.id, {...remote.get(first.id)!, endAt:'2026-01-01T16:00:00.000Z', revision:2, serverRevision:2});
  await synchronize(database, api);
  expect((await database.sessions.get(first.id))?.endAt).toBe('2026-01-01T15:00:00.000Z');
  expect(await database.outbox.count()).toBe(1);
  const conflict = (await database.conflicts.get(first.id))!;
  expect(conflict.remote?.endAt).toBe('2026-01-01T16:00:00.000Z');
  await resolveConflict(conflict, 'local', database); await synchronize(database, api);
  expect(remote.get(first.id)?.serverRevision).toBe(3);
  expect(remote.get(first.id)?.endAt).toBe('2026-01-01T15:00:00.000Z');
});

it('can resolve a conflict with the cloud deletion without resurrecting it', async () => {
  const first = await complete(); await synchronize(database, api);
  const local = (await database.sessions.get(first.id))!;
  await saveSession({...local, endAt:'2026-01-01T15:00:00.000Z'}, local, database);
  remote.set(first.id,{...remote.get(first.id)!,state:'deleted',revision:2,serverRevision:2});
  await synchronize(database, api);
  await resolveConflict((await database.conflicts.get(first.id))!, 'cloud', database);
  expect((await database.sessions.get(first.id))?.state).toBe('deleted');
  expect(await database.outbox.count()).toBe(0);
});

it('synchronizes deletion tombstones and retains the queue on authentication expiry', async () => {
  const first = await complete(); await deleteSession(first, database);
  const upload = api.upload;
  api.upload = async () => { throw new SyncError('auth', 'sign in'); };
  await synchronize(database, api);
  expect(await database.outbox.count()).toBe(2);
  expect((await database.cloud.get('cloud'))?.status).toBe('auth');
  api.upload = upload; await synchronize(database, api);
  expect(remote.get(first.id)?.state).toBe('deleted');
});

it('serializes simultaneous sync runs and preserves recording when the backend is unconfigured', async () => {
  await complete(); let uploads = 0; const upload = api.upload;
  api.upload = async value => { uploads++; return upload(value); };
  await Promise.all([synchronize(database, api), synchronize(database, api)]);
  expect(uploads).toBe(1);
  api.configured = async () => false;
  await startSession(database); await synchronize(database, api);
  expect(await database.outbox.count()).toBe(1);
  expect((await database.cloud.get('cloud'))?.enabled).toBe(false);
});

it('keeps both conflicting active charges without violating the local single-active invariant', async () => {
  const local = await startSession(database);
  const other: Session = {...local,id:crypto.randomUUID(),serverRevision:1};
  remote.set(other.id, other);
  api.upload = async () => ({status:409,remote:null,active:other,error:'active_conflict'});
  await synchronize(database, api);
  await resolveConflict((await database.conflicts.get(local.id))!, 'local', database);
  expect((await database.sessions.get(local.id))?.state).toBe('incomplete');
  expect((await database.sessions.where('activeKey').equals('active').first())?.id).toBe(other.id);
  expect(await database.outbox.count()).toBe(1);
});

it('recovers from an expired lease left by a terminated tab', async () => {
  const first = await complete();
  await database.cloud.put({id:'cloud',status:'syncing',leaseOwner:'terminated-tab',leaseUntil:Date.now()-1});
  await synchronize(database,api);
  expect(remote.get(first.id)?.serverRevision).toBe(1);
  expect((await database.cloud.get('cloud'))?.leaseOwner).toBeUndefined();
  expect(await database.outbox.count()).toBe(0);
});
