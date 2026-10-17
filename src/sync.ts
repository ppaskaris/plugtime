import { db, type PlugTimeDatabase } from './db';
import { newId } from './ids';
import { isRecord, parseSession, type Upload } from './protocol';
import type { CloudState, Session, SyncConflict } from './domain';

export class SyncError extends Error {
  constructor(public kind: 'auth' | 'offline' | 'error', message: string) { super(message); }
}
export interface UploadResult { status: number; session?: Session; remote?: Session | null; active?: Session | null; error?: string }
export interface SyncTransport { configured(): Promise<boolean>; snapshot(): Promise<Session[]>; upload(value: Upload): Promise<UploadResult> }
async function request(path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(15_000), headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new SyncError('offline', 'Could not reach cloud backup. Your local changes are safe.'); }
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400))
    throw new SyncError('auth', 'Sign in to resume cloud synchronization.');
  return response;
}
export const transport: SyncTransport = {
  async configured() {
    const response = await request('/api/config');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const value: unknown = await response.json(); return isRecord(value) && value.enabled === true;
  },
  async snapshot() {
    const response = await request('/api/snapshot');
    if (!response.ok) throw new SyncError('error', 'Cloud download failed. Retry synchronization.');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new SyncError('auth', 'Sign in to resume cloud synchronization.');
    const value: unknown = await response.json();
    if (!isRecord(value) || !Array.isArray(value.sessions)) throw new SyncError('error', 'Invalid cloud snapshot.');
    return value.sessions.map(parseSession);
  },
  async upload(value) {
    const response = await request('/api/mutations', value);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new SyncError('auth', 'Sign in to resume cloud synchronization.');
    const result: unknown = await response.json();
    if (!isRecord(result)) throw new SyncError('error', 'Invalid cloud acknowledgement.');
    if (response.status === 409) return { status: 409, remote: result.remote ? parseSession(result.remote) : null,
      active: result.active ? parseSession(result.active) : null, error: String(result.error) };
    if (!response.ok) throw new SyncError('error', 'Cloud upload failed. Your changes remain queued.');
    return { status: 200, session: parseSession(result.session) };
  },
};

function localRecord(remote: Session, previous?: Session): Session {
  const record = { ...remote, revision: Math.max(remote.revision, (previous?.revision ?? 0) + 1) };
  if (record.state === 'active') record.activeKey = 'active'; else delete record.activeKey;
  return record;
}
export async function mergeSnapshot(remote: Session[], database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.conflicts, async () => {
    // Release obsolete active locks before introducing a downloaded active session.
    for (const value of [...remote].sort((a, b) => Number(a.state === 'active') - Number(b.state === 'active'))) {
      const current = await database.sessions.get(value.id);
      const pending = await database.outbox.where('sessionId').equals(value.id).count();
      if (pending) {
        if (current && value.serverRevision > current.serverRevision)
          await database.conflicts.put({ sessionId: value.id, remote: value, active: null, reason: 'revision_conflict' });
        continue;
      }
      const active = value.state === 'active' ? await database.sessions.where('activeKey').equals('active').first() : undefined;
      if (active && active.id !== value.id) {
        await database.conflicts.put({ sessionId: active.id, remote: null, active: value, reason: 'active_conflict' });
        continue;
      }
      if (!current || value.serverRevision > current.serverRevision) await database.sessions.put(localRecord(value, current));
    }
  });
}

export async function synchronize(database: PlugTimeDatabase = db, api: SyncTransport = transport) {
  const owner = newId();
  const acquired = await database.transaction('rw', database.cloud, async () => {
    const current = await database.cloud.get('cloud');
    if (current?.leaseUntil && current.leaseUntil > Date.now()) return false;
    await database.cloud.put({ ...current, id: 'cloud', status: 'syncing', leaseOwner: owner, leaseUntil: Date.now() + 120_000 });
    return true;
  });
  if (!acquired) return;
  async function status(patch: Partial<CloudState>) { await database.cloud.update('cloud', patch); }
  try {
    if (!await api.configured()) { await status({ enabled: false, status: 'idle', message: '' }); return; }
    await status({ enabled: true });
    // Retry uncertain uploads before pulling: a lost acknowledgement must be replayed,
    // not mistaken for a conflicting remote edit in the snapshot.
    // Bound a foreground run; later events/manual retry continue any remaining queue.
    for (let count = 0; count < 500; count++) {
      await status({ leaseUntil: Date.now() + 120_000 });
      const queued = (await database.outbox.toArray()).sort((a, b) => a.localRevision - b.localRevision || a.id.localeCompare(b.id));
      const blocked = new Set((await database.conflicts.toArray()).map(c => c.sessionId));
      const next = queued.find(mutation => !blocked.has(mutation.sessionId)); if (!next) break;
      const sent = await database.transaction('rw', database.outbox, database.sessions, async () => {
        const item = await database.outbox.get(next.id); if (!item) return null;
        if (!item.upload) {
          const current = await database.sessions.get(item.sessionId);
          item.upload = { id: item.id, baseServerRevision: current?.serverRevision ?? item.baseServerRevision, snapshot: item.snapshot };
          await database.outbox.put(item);
        }
        return item;
      });
      if (!sent?.upload) continue;
      const response = await api.upload(sent.upload);
      if (response.status === 409) {
        await database.conflicts.put({ sessionId: sent.sessionId, remote: response.remote ?? null, active: response.active ?? null, reason: response.error ?? 'revision_conflict' });
        continue;
      }
      const acknowledged = response.session;
      if (!acknowledged || acknowledged.id !== sent.sessionId || acknowledged.serverRevision !== sent.upload.baseServerRevision + 1)
        throw new SyncError('error', 'Invalid cloud acknowledgement. Your change remains queued.');
      await database.transaction('rw', database.sessions, database.outbox, async () => {
        const current = await database.sessions.get(sent.sessionId);
        if (current) await database.sessions.update(current.id, { serverRevision: acknowledged.serverRevision });
        await database.outbox.delete(sent.id); // Acknowledge exactly what was sent, never later edits.
      });
    }
    await mergeSnapshot(await api.snapshot(), database);
    const conflicts = await database.conflicts.count();
    await status({ status: conflicts ? 'conflict' : 'idle', lastSuccessAt: new Date().toISOString(), message: '' });
  } catch (error) {
    const kind = error instanceof SyncError ? error.kind : 'error';
    await status({ status: kind, ...(kind === 'auth' ? { enabled: true } : {}), message: error instanceof Error ? error.message : 'Sync failed. Your local changes remain queued.' });
  } finally {
    await database.transaction('rw', database.cloud, async () => {
      const current = await database.cloud.get('cloud');
      if (current?.leaseOwner === owner) await database.cloud.update('cloud', { leaseOwner: undefined, leaseUntil: undefined });
    });
  }
}

export async function resolveConflict(conflict: SyncConflict, choice: 'local' | 'cloud', database = db) {
  await database.transaction('rw', database.sessions, database.outbox, database.conflicts, database.cloud, async () => {
    const cloud = await database.cloud.get('cloud');
    if (cloud?.leaseUntil && cloud.leaseUntil > Date.now()) throw new Error('Wait for synchronization to finish before resolving this conflict.');
    const current = await database.sessions.get(conflict.sessionId);
    const latest = await database.conflicts.get(conflict.sessionId);
    if (!current || !latest) throw new Error('This conflict changed. Reopen the review.');
    await database.outbox.where('sessionId').equals(current.id).delete();
    if (choice === 'cloud' && latest.remote) {
      await database.sessions.put(localRecord(latest.remote, current));
    } else {
      const updated: Session = { ...current, revision: current.revision + 1, updatedAt: new Date().toISOString(),
        serverRevision: latest.remote?.serverRevision ?? 0 };
      if (choice === 'cloud') updated.state = 'deleted';
      else if (latest.active && latest.active.id !== current.id && updated.state === 'active') updated.state = 'incomplete';
      if (updated.state !== 'active') delete updated.activeKey;
      await database.sessions.put(updated);
      await database.outbox.add({ id: newId(), sessionId: updated.id, localRevision: updated.revision,
        baseServerRevision: updated.serverRevision, snapshot: updated });
    }
    if (latest.active && latest.active.id !== current.id) {
      if (await database.outbox.where('sessionId').equals(latest.active.id).count()) throw new Error('The other active charge also has local edits. Resolve it on the other device first.');
      const other = await database.sessions.get(latest.active.id);
      await database.sessions.put(localRecord(latest.active, other));
    }
    await database.conflicts.delete(current.id);
  });
}
