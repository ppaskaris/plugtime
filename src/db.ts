import Dexie, { type EntityTable } from 'dexie';
import { newId } from './ids';
import { defaults, MIN_SESSION_MS, validateAssumptions, validateSession, type Assumptions, type Mutation, type Session, type Settings, type CloudState, type SyncConflict } from './domain';

export class PlugTimeDatabase extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  outbox!: EntityTable<Mutation, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  cloud!: EntityTable<CloudState, 'id'>;
  conflicts!: EntityTable<SyncConflict, 'sessionId'>;
  constructor(name = 'plugtime') {
    super(name);
    this.version(1).stores({ sessions: 'id, startAt, state, &activeKey', outbox: 'id, sessionId', settings: 'id' });
    this.version(2).stores({ cloud: 'id', conflicts: 'sessionId' });
  }
}
export const db = new PlugTimeDatabase();
export async function getSettings(database = db): Promise<Settings> {
  return (await database.settings.get('defaults')) ?? { ...defaults };
}
export async function saveSettings(assumptions: Assumptions, database = db) {
  validateAssumptions(assumptions);
  await database.settings.put({ ...assumptions, id: 'defaults' });
}
async function writeSession(session: Session, database: PlugTimeDatabase, discardUnsent = false) {
  validateSession(session);
  const record = { ...session };
  if (record.state === 'active') record.activeKey = 'active';
  else delete record.activeKey;
  await database.sessions.put(record);
  // Keep the local tombstone for Undo/import protection, but a never-sent charge
  // needs no cloud deletion. A frozen envelope may already have reached cloud.
  if (discardUnsent && record.serverRevision === 0 && !await database.conflicts.get(record.id)) {
    const pending = await database.outbox.where('sessionId').equals(record.id).toArray();
    if (!pending.some(item => item.upload)) {
      await database.outbox.where('sessionId').equals(record.id).delete();
      return record;
    }
  }
  await database.outbox.add({ id: newId(), sessionId: record.id, localRevision: record.revision,
    baseServerRevision: record.serverRevision, snapshot: record });
  return record;
}
export async function startSession(database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.settings, async () => {
    if (await database.sessions.where('activeKey').equals('active').first()) throw new Error('A charging session is already active.');
    const assumptions = await getSettings(database);
    const now = new Date().toISOString();
    return writeSession({ ...assumptions, id: newId(), startAt: now, endAt: null, state: 'active',
      createdAt: now, updatedAt: now, revision: 1, serverRevision: 0 }, database);
  });
}
export type SessionInput = Pick<Session, 'startAt' | 'endAt' | 'powerWatts' | 'rateMicrosPerKwh'>;
export async function saveSession(input: SessionInput, existing?: Pick<Session, 'id' | 'revision'>, database = db) {
  if (input.endAt && Date.parse(input.endAt) - Date.parse(input.startAt) < MIN_SESSION_MS)
    throw new Error('A saved charge must be at least one minute. Correct the timestamps or cancel/delete this charge.');
  return database.transaction('rw', database.sessions, database.outbox, async () => {
    const current = existing ? await database.sessions.get(existing.id) : undefined;
    if (existing && (!current || current.revision !== existing.revision || current.state === 'deleted'))
      throw new Error('This session changed in another view. Close and reopen it before editing.');
    const now = new Date().toISOString();
    const state = input.endAt ? 'completed' : current?.state === 'active' ? 'active' : 'incomplete';
    return writeSession({ id: current?.id ?? newId(), createdAt: current?.createdAt ?? now,
      serverRevision: current?.serverRevision ?? 0, startAt: input.startAt, endAt: input.endAt,
      powerWatts: input.powerWatts, rateMicrosPerKwh: input.rateMicrosPerKwh, state, updatedAt: now,
      revision: (current?.revision ?? 0) + 1 }, database);
  });
}
export async function stopSession(session: Session, database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.conflicts, async () => {
    const current = await database.sessions.get(session.id);
    if (!current || current.revision !== session.revision || current.state !== 'active')
      throw new Error('This session changed. Close and reopen it before stopping.');
    const now = new Date().toISOString();
    const elapsed = Date.parse(now) - Date.parse(current.startAt);
    if (elapsed < 0) throw new Error('The current time is before the start. Correct the start time before stopping.');
    // Keep a tombstone so an accidental charge cannot reappear after future sync.
    const discarded = elapsed < MIN_SESSION_MS;
    return writeSession({ ...current, state: discarded ? 'deleted' : 'completed', endAt: discarded ? null : now,
      updatedAt: now, revision: current.revision + 1 }, database, discarded);
  });
}
export async function deleteSession(session: Session, database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.conflicts, async () => {
    const current = await database.sessions.get(session.id);
    if (!current || current.revision !== session.revision || current.state === 'deleted')
      throw new Error('This session changed. Close and reopen it before deleting.');
    return writeSession({ ...current, state: 'deleted', updatedAt: new Date().toISOString(), revision: current.revision + 1 }, database, current.state === 'active');
  });
}

// Acknowledgements change only serverRevision: uploaded and in-flight deletions
// remain recoverable, but a newer content revision or conflict blocks Undo.
export async function restoreSession(original: Session, deletionRevision: number, database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.conflicts, async () => {
    const current = await database.sessions.get(original.id);
    if (!current || current.state !== 'deleted' || current.revision !== deletionRevision || await database.conflicts.get(original.id))
      throw new Error('Undo could not restore this charge because it changed. Review Account & sync and History.');
    const active = original.state === 'active' ? await database.sessions.where('activeKey').equals('active').first() : undefined;
    return writeSession({ ...original, state: active ? 'incomplete' : original.state,
      revision: current.revision + 1, serverRevision: current.serverRevision, updatedAt: new Date().toISOString() }, database);
  });
}
