import { MIN_SESSION_MS, validateSession, type Session } from './domain';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function parseSession(value: unknown): Session {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuidPattern.test(value.id) ||
      !timestamp(value.startAt) || !(value.endAt === null || timestamp(value.endAt)) ||
      !timestamp(value.createdAt) || !timestamp(value.updatedAt) ||
      !['active', 'incomplete', 'completed', 'deleted'].includes(String(value.state)) ||
      typeof value.powerWatts !== 'number' || typeof value.rateMicrosPerKwh !== 'number' ||
      typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      typeof value.serverRevision !== 'number' || !Number.isSafeInteger(value.serverRevision) || value.serverRevision < 0)
    throw new Error('Invalid session data.');
  const session: Session = { id: value.id, startAt: value.startAt, endAt: value.endAt,
    state: value.state as Session['state'], powerWatts: value.powerWatts, rateMicrosPerKwh: value.rateMicrosPerKwh,
    createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.revision, serverRevision: value.serverRevision };
  validateSession(session);
  if (session.state === 'completed' && Date.parse(session.endAt!) - Date.parse(session.startAt) < MIN_SESSION_MS)
    throw new Error('Completed charges must last at least one minute.');
  return session;
}
export interface Upload { id: string; baseServerRevision: number; snapshot: Session }
export function parseUpload(value: unknown): Upload {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuidPattern.test(value.id) ||
      typeof value.baseServerRevision !== 'number' || !Number.isSafeInteger(value.baseServerRevision) || value.baseServerRevision < 0)
    throw new Error('Invalid mutation data.');
  return { id: value.id, baseServerRevision: value.baseServerRevision, snapshot: parseSession(value.snapshot) };
}
