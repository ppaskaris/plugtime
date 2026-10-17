import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PlugTimeDatabase, deleteSession, saveSession, startSession } from '../src/db';
import { defaults, type Session } from '../src/domain';
import { resolveConflict, SyncError, synchronize, type SyncTransport } from '../src/sync';
import type { Upload } from '../src/protocol';
let database: PlugTimeDatabase;
let remote: Map<string, Session>;
let receipts: Map<string, Session>;
let api: SyncTransport;
beforeEach(() => {
  database = new PlugTimeDatabase(`sync-test-${crypto.randomUUID()}`); remote = new Map(); receipts = new Map();
  api = {
    configured: async () => true,
    snapshot: async () => [...remote.values()],
    upload: async (value: Upload) => {
      const prior = receipts.get(value.id); if (prior) return {status: 200, session: prior};
      const current = remote.get(value.snapshot.id);
      if ((current?.serverRevision ?? 0) !== value.baseServerRevision) return {status: 409, remote: current, error: 'revision_conflict'};
      const revision = value.baseServerRevision + 1;
      const saved = { ...value.snapshot, revision, serverRevision: revision };
      receipts.set(value.id, saved); remote.set(saved.id, saved);
      return {status: 200, session: saved};
    },
  };
});
afterEach(async () => { await database.delete(); });
const complete = () => saveSession({ ...defaults, startAt: '2026-01-01T12:00:00.000Z', endAt: '2026-01-01T13:00:00.000Z' }, undefined, database);

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
