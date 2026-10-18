export interface Assumptions {
  powerWatts: number;
  rateMicrosPerKwh: number;
}
export interface Settings extends Assumptions { id: 'defaults' }
export type SessionState = 'active' | 'incomplete' | 'completed' | 'deleted';
export interface Session extends Assumptions {
  id: string;
  startAt: string;
  endAt: string | null;
  state: SessionState;
  activeKey?: 'active';
  createdAt: string;
  updatedAt: string;
  revision: number;
  serverRevision: number;
}
export interface Mutation {
  id: string;
  sessionId: string;
  localRevision: number;
  baseServerRevision: number;
  snapshot: Session;
  upload?: { id: string; baseServerRevision: number; snapshot: Session };
}
export interface SyncConflict { sessionId: string; remote: Session | null; active: Session | null; reason: string }
export interface CloudState { id: 'cloud'; enabled?: boolean; status?: 'idle' | 'syncing' | 'offline' | 'auth' | 'error' | 'conflict'; lastSuccessAt?: string; lastAttemptAt?: number; message?: string; leaseOwner?: string; leaseUntil?: number; identity?: { email: string; verifiedAt: string } }
export const defaults: Settings = { id: 'defaults', powerWatts: 9600, rateMicrosPerKwh: 203000 };
export const MIN_SESSION_MS = 60_000;

export function validateAssumptions(value: Assumptions) {
  if (!Number.isSafeInteger(value.powerWatts) || value.powerWatts <= 0 || value.powerWatts > 1_000_000)
    throw new Error('Charging power must be greater than 0 and at most 1,000 kW (up to 3 decimal places).');
  if (!Number.isSafeInteger(value.rateMicrosPerKwh) || value.rateMicrosPerKwh < 0 || value.rateMicrosPerKwh > 100_000_000)
    throw new Error('Electricity rate must be between $0 and $100/kWh (up to 6 decimal places).');
}

export function validateSession(session: Session) {
  validateAssumptions(session);
  const start = Date.parse(session.startAt);
  const end = session.endAt === null ? null : Date.parse(session.endAt);
  if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end <= start)))
    throw new Error('Enter valid timestamps, with the end after the start. Check the end date for overnight charging.');
  if (session.state === 'completed' && end === null) throw new Error('A completed session needs an end time.');
  if ((session.state === 'active' || session.state === 'incomplete') && end !== null)
    throw new Error('An unfinished session cannot have an end time.');
}

export function calculate(session: Assumptions & { startAt: string; endAt: string | null }, now?: number) {
  const end = session.endAt === null ? now : Date.parse(session.endAt);
  const durationMs = end === undefined ? 0 : Math.max(0, end - Date.parse(session.startAt));
  const energyKwh = durationMs * session.powerWatts / 3_600_000_000;
  // Exact numerator in CAD: milliseconds × watts × millionths CAD/kWh.
  const costNumerator = BigInt(Math.round(durationMs)) * BigInt(session.powerWatts) * BigInt(session.rateMicrosPerKwh);
  return { durationMs, energyKwh, costNumerator };
}

export function costCad(numerator: bigint) {
  const denominator = 36_000_000_000_000n; // CAD cents denominator.
  return Number((numerator + denominator / 2n) / denominator) / 100;
}
export const cad = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
export function durationLabel(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
export function localInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function parseLocal(value: string, original?: string) {
  if (original && localInput(original) === value) return original;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime()) || localInput(date.toISOString()) !== normalized)
    throw new Error('That local time does not exist. Check the date and daylight saving transition.');
  // Detect a repeated clock time when the timezone offset changes near the input.
  const offsets = new Set([-24, -3, 0, 3, 24].map(h => new Date(date.getTime() + h * 3_600_000).getTimezoneOffset()));
  for (const offset of offsets) {
    const other = new Date(date.getTime() + (offset - date.getTimezoneOffset()) * 60_000);
    if (other.getTime() !== date.getTime() && localInput(other.toISOString()) === normalized)
      throw new Error('That local time occurs twice during daylight saving. Record a different unambiguous time or preserve the existing timestamp.');
  }
  return date.toISOString();
}
export function summarize(sessions: Session[]) {
  return sessions.filter(s => s.state === 'completed').reduce((total, session) => {
    const result = calculate(session);
    return { count: total.count + 1, durationMs: total.durationMs + result.durationMs,
      energyKwh: total.energyKwh + result.energyKwh, costNumerator: total.costNumerator + result.costNumerator };
  }, { count: 0, durationMs: 0, energyKwh: 0, costNumerator: 0n });
}
export function groupSessionsByStart(sessions: Session[], yearly = false) {
  const groups = new Map<string, Session[]>();
  for (const session of sessions.filter(s => s.state !== 'deleted')) {
    const key = localInput(session.startAt).slice(0, yearly ? 4 : 7);
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([period, rows]) => ({ period,
    sessions: rows.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)) }));
}
export function periodGroups(sessions: Session[], yearly = false) {
  return groupSessionsByStart(sessions.filter(s => s.state === 'completed'), yearly)
    .map(group => ({ ...group, ...summarize(group.sessions) }));
}

export function recentCharge(sessions: Session[], now = Date.now()) {
  if (sessions.some(session => session.state === 'active')) return undefined;
  return sessions.filter(session => session.state === 'completed' && session.endAt &&
    now >= Date.parse(session.endAt) && now - Date.parse(session.endAt) < 12 * 3_600_000)
    .sort((a, b) => Date.parse(b.endAt!) - Date.parse(a.endAt!))[0];
}

export function historyDate(iso: string, now = Date.now()) {
  const { day, time } = sessionDateParts(iso, now);
  return `${day}, ${time}`;
}
export function sessionDateParts(iso: string, now = Date.now(), grouped = false) {
  const date = new Date(iso), today = new Date(now), yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === yesterday.toDateString() ? 'Yesterday' :
    date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(!grouped && date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  return { day, time: date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) };
}
