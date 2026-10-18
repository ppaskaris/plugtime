import { db, type PlugTimeDatabase } from './db';
import { makeBackup, type Backup } from './exports';
import { validateAssumptions, type Mutation, type Session, type SyncConflict } from './domain';
import { isRecord, parseSession, parseUpload, uuidPattern } from './protocol';
import { newId } from './ids';

const integer = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw new Error('Duplicate identifiers in backup.');
}
export function parseBackup(text: string): Backup {
  const v: unknown = JSON.parse(text);
  if (!isRecord(v) || v.app !== 'PlugTime' || v.schemaVersion !== 2 || typeof v.exportedAt !== 'string' ||
      !Number.isFinite(Date.parse(v.exportedAt)) || !isRecord(v.settings) || v.settings.id !== 'defaults' ||
      !Array.isArray(v.sessions) || !Array.isArray(v.outbox) || !Array.isArray(v.conflicts))
    throw new Error('Choose a complete PlugTime JSON backup (schema version 2).');
  const settings = { id: 'defaults' as const, powerWatts: v.settings.powerWatts as number, rateMicrosPerKwh: v.settings.rateMicrosPerKwh as number };
  validateAssumptions(settings);
  const sessions = v.sessions.map(parseSession);
  unique(sessions.map(s => s.id));
  if (sessions.filter(s => s.state === 'active').length > 1) throw new Error('Backup contains multiple active charges.');
  const byId = new Map(sessions.map(s => [s.id, s]));
  const outbox: Mutation[] = v.outbox.map(m => {
    if (!isRecord(m) || typeof m.id !== 'string' || !uuidPattern.test(m.id) || typeof m.sessionId !== 'string' ||
        !integer(m.localRevision) || m.localRevision < 1 || !integer(m.baseServerRevision)) throw new Error('Invalid pending change.');
    const snapshot = parseSession(m.snapshot), current = byId.get(m.sessionId);
    if (!current || snapshot.id !== current.id || snapshot.revision !== m.localRevision || snapshot.revision > current.revision)
      throw new Error('Pending change does not match a backed-up session.');
    const upload = m.upload === undefined ? undefined : parseUpload(m.upload);
    if (upload && (upload.id !== m.id || JSON.stringify(upload.snapshot) !== JSON.stringify(snapshot)))
      throw new Error('Pending upload does not match its saved envelope.');
    return { id: m.id, sessionId: m.sessionId, localRevision: m.localRevision, baseServerRevision: m.baseServerRevision, snapshot, ...(upload ? { upload } : {}) };
  });
  unique(outbox.map(m => m.id));
  unique(outbox.map(m => `${m.sessionId}:${m.localRevision}`));
  for (const s of sessions) {
    const pending = outbox.filter(m => m.sessionId === s.id).sort((a, b) => b.localRevision - a.localRevision);
    if (pending.length && (pending[0].localRevision !== s.revision || !sameContent(pending[0].snapshot, s))) throw new Error('Latest pending change differs from the session.');
  }
  const conflicts: SyncConflict[] = v.conflicts.map(c => {
    if (!isRecord(c) || typeof c.sessionId !== 'string' || !byId.has(c.sessionId) || typeof c.reason !== 'string') throw new Error('Invalid saved conflict.');
    const remote = c.remote === null ? null : parseSession(c.remote);
    const active = c.active === null ? null : parseSession(c.active);
    if (remote && remote.id !== c.sessionId || active && active.state !== 'active') throw new Error('Invalid conflict snapshot.');
    return { sessionId: c.sessionId, remote, active, reason: c.reason };
  });
  unique(conflicts.map(c => c.sessionId));
  return { app: 'PlugTime', schemaVersion: 2, exportedAt: v.exportedAt, settings, sessions, outbox, conflicts };
}
// Revisions and bookkeeping can differ after a successful acknowledgement.
export function sameContent(a: Session, b: Session) {
  return ['id', 'startAt', 'endAt', 'state', 'powerWatts', 'rateMicrosPerKwh', 'createdAt', 'updatedAt'].every(k => a[k as keyof Session] === b[k as keyof Session]);
}
export interface ImportRow { id: string; startAt: string; action: 'add' | 'skip' | 'blocked'; reason: string; deletionPreserved?: boolean }
export interface ImportReview { backup: Backup; fingerprint: string; rows: ImportRow[]; restoreSettings: boolean }
function fingerprint(backup: Backup) { return JSON.stringify({ ...backup, exportedAt: '' }); }
function plan(backup: Backup, current: Backup): ImportReview {
  const existing = new Map(current.sessions.map(s => [s.id, s]));
  let active = current.sessions.some(s => s.state === 'active');
  const rows: ImportRow[] = backup.sessions.map(s => {
    const local = existing.get(s.id);
    let action: ImportRow['action'] = 'add', reason = 'Missing record; queue for cloud revision check.';
    if (local) {
      action = sameContent(local, s) ? 'skip' : 'blocked';
      reason = local.state === 'deleted'
        ? s.state === 'deleted' ? 'Already deleted on this device and in the backup. Nothing to restore.' : 'This session is deleted on this device. Importing this backup will not restore it.'
        : s.state === 'deleted' ? 'The backup marks this session deleted, but it exists on this device. Current record kept.'
        : action === 'skip' ? 'Same session already on this device. Nothing to add.' : 'This session has different values on this device. Current record kept.';
    } else if (s.state === 'active' && active) {
      action = 'blocked'; reason = 'Another charge is active. Complete it before reviewing again.';
    } else if ([...existing.values()].some(local => local.id !== s.id && local.startAt === s.startAt)) {
      action = 'blocked'; reason = 'Matching start time under another ID (including deletions); review manually.';
    } else if (backup.outbox.some(m => m.sessionId === s.id && current.outbox.some(n => n.id === m.id))) {
      action = 'blocked'; reason = 'Pending mutation identifier already exists.';
    }
    if (action === 'add') { existing.set(s.id, s); if (s.state === 'active') active = true; }
    return { id: s.id, startAt: s.startAt, action, reason, ...(local?.state === 'deleted' ? { deletionPreserved: true } : {}) };
  });
  return { backup, fingerprint: fingerprint(current), rows, restoreSettings: current.sessions.length === 0 && current.outbox.length === 0 };
}
export async function reviewImport(text: string, database = db) {
  return plan(parseBackup(text), await makeBackup(database));
}
export async function applyImport(review: ImportReview, database: PlugTimeDatabase = db) {
  // Reparse the review payload and replan inside the write transaction. Never trust stale UI state.
  const backup = parseBackup(JSON.stringify(review.backup));
  return database.transaction('rw', database.sessions, database.outbox, database.conflicts, database.settings, database.cloud, async () => {
    if ((await database.cloud.get('cloud'))?.leaseUntil! > Date.now()) throw new Error('Wait for synchronization to finish, then review again.');
    const current = await makeBackup(database);
    if (fingerprint(current) !== review.fingerprint) throw new Error('Local data changed. Select the backup again to refresh the review.');
    const latest = plan(backup, current);
    for (const row of latest.rows.filter(r => r.action === 'add')) {
      const session = backup.sessions.find(s => s.id === row.id)!;
      await database.sessions.add({ ...session, ...(session.state === 'active' ? { activeKey: 'active' as const } : {}) });
      const pending = backup.outbox.filter(m => m.sessionId === row.id);
      // Preserve uncertain upload IDs/envelopes for idempotent receipt replay.
      if (pending.length) await database.outbox.bulkAdd(pending);
      else await database.outbox.add({ id: newId(), sessionId: session.id, localRevision: session.revision,
        baseServerRevision: session.serverRevision, snapshot: session });
      const conflict = backup.conflicts.find(c => c.sessionId === row.id);
      if (conflict) await database.conflicts.add(conflict);
    }
    if (latest.restoreSettings && !await database.settings.get('defaults')) await database.settings.put(backup.settings);
    return latest.rows;
  });
}
