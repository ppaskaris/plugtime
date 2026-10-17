import Dexie, { type EntityTable } from 'dexie';
import { defaults, validateAssumptions, validateSession, type Assumptions, type Mutation, type Session, type Settings } from './domain';

export class PlugTimeDatabase extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  outbox!: EntityTable<Mutation, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  constructor(name = 'plugtime') {
    super(name);
    this.version(1).stores({ sessions: 'id, startAt, state, &activeKey', outbox: 'id, sessionId', settings: 'id' });
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
async function writeSession(session: Session, database: PlugTimeDatabase) {
  validateSession(session);
  const record = { ...session };
  if (record.state === 'active') record.activeKey = 'active';
  else delete record.activeKey;
  await database.sessions.put(record);
  await database.outbox.add({ id: crypto.randomUUID(), sessionId: record.id, localRevision: record.revision,
    baseServerRevision: record.serverRevision, snapshot: record });
  return record;
}
export async function startSession(database = db) {
  return database.transaction('rw', database.sessions, database.outbox, database.settings, async () => {
    if (await database.sessions.where('activeKey').equals('active').first()) throw new Error('A charging session is already active.');
    const assumptions = await getSettings(database);
    const now = new Date().toISOString();
    return writeSession({ ...assumptions, id: crypto.randomUUID(), startAt: now, endAt: null, state: 'active',
      createdAt: now, updatedAt: now, revision: 1, serverRevision: 0 }, database);
  });
}
export type SessionInput = Pick<Session, 'startAt' | 'endAt' | 'powerWatts' | 'rateMicrosPerKwh'>;
export async function saveSession(input: SessionInput, existing?: Pick<Session, 'id' | 'revision'>, database = db) {
  return database.transaction('rw', database.sessions, database.outbox, async () => {
    const current = existing ? await database.sessions.get(existing.id) : undefined;
    if (existing && (!current || current.revision !== existing.revision || current.state === 'deleted'))
      throw new Error('This session changed in another view. Close and reopen it before editing.');
    const now = new Date().toISOString();
    const state = input.endAt ? 'completed' : current?.state === 'active' ? 'active' : 'incomplete';
    return writeSession({ id: current?.id ?? crypto.randomUUID(), createdAt: current?.createdAt ?? now,
      serverRevision: current?.serverRevision ?? 0, ...input, state, updatedAt: now,
      revision: (current?.revision ?? 0) + 1 }, database);
  });
}
export async function stopSession(session: Session, database = db) {
  if (session.state !== 'active') throw new Error('This session is not active.');
  return saveSession({ ...session, endAt: new Date().toISOString() }, session, database);
}
export async function deleteSession(session: Session, database = db) {
  return database.transaction('rw', database.sessions, database.outbox, async () => {
    const current = await database.sessions.get(session.id);
    if (!current || current.revision !== session.revision || current.state === 'deleted')
      throw new Error('This session changed. Close and reopen it before deleting.');
    return writeSession({ ...current, state: 'deleted', updatedAt: new Date().toISOString(), revision: current.revision + 1 }, database);
  });
}
