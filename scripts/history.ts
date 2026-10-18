import { createHash } from 'node:crypto';

export interface Cell { value: unknown; type?: string; formula?: string; sharedFormula?: unknown }
export interface Row { row: number; cells: Record<string, Cell> }
export interface Source { sha256: string; date1904: boolean; sheets: Record<string, Row[]> }
export interface Correction { date: string; start: string; end: string | null; evidence: string; add?: boolean }
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function torontoInstant(wall: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(wall)) throw new Error('Malformed wall-clock time.');
  const nominal = Date.parse(wall + 'Z');
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== wall) throw new Error('Invalid date/time.');
  // Toronto's modern offsets; enumerate both to reject gaps and repeated clock times.
  const matches = [4, 5].map(h => nominal + h * 3_600_000).filter(t => formatter.format(new Date(t)).replace(' ', 'T') === wall);
  if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous Toronto DST time.' : 'Nonexistent Toronto DST time.');
  return new Date(matches[0]).toISOString();
}
function dateFromSerial(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 61 || value > 100000) throw new Error('Invalid Excel date serial.');
  return new Date(Date.UTC(1899, 11, 30) + value * DAY).toISOString().slice(0, 10);
}
function timeFromSerial(value: unknown) {
  if (typeof value !== 'number' || value < 0 || value >= 1) throw new Error('Invalid Excel time serial.');
  const seconds = Math.round(value * 86400);
  if (seconds >= 86400) throw new Error('Time rounds into the next date.');
  return new Date(seconds * 1000).toISOString().slice(11, 19);
}
export function stableHistoryId(startAt: string) {
  const b = createHash('sha256').update(`PlugTime historical session v1|America/Toronto|${startAt}`).digest().subarray(0, 16);
  // UUID v4 shape is required by the existing protocol; bytes are deterministic import identifiers.
  b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
  const s = b.toString('hex'); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export function convertHistory(source: Source, corrections: Correction[] = []) {
  if (source.date1904) throw new Error('1904 date system is unsupported; no output produced.');
  const rows = source.sheets.Charging;
  if (!rows) throw new Error('Charging worksheet is missing.');
  const value = (r: number, c: string) => rows.find(row => row.row === r)?.cells[`${c}${r}`]?.value;
  const rate = value(2, 'J'), power = value(3, 'J');
  if (typeof rate !== 'number' || typeof power !== 'number') throw new Error('Missing workbook assumptions.');
  const settings = { id: 'defaults' as const, powerWatts: Math.round(power * 1000), rateMicrosPerKwh: Math.round(rate * 1e6) };
  if (!Number.isSafeInteger(settings.powerWatts) || !Number.isSafeInteger(settings.rateMicrosPerKwh) || settings.powerWatts <= 0 || settings.powerWatts > 1e6 || settings.rateMicrosPerKwh < 0 || settings.rateMicrosPerKwh > 1e8 ||
      Math.abs(settings.powerWatts / 1000 - power) > 1e-9 || Math.abs(settings.rateMicrosPerKwh / 1e6 - rate) > 1e-9) throw new Error('Unsupported assumption precision/range.');
  const sessions: { id: string; startAt: string; endAt: string | null; state: 'completed' | 'incomplete'; powerWatts: number; rateMicrosPerKwh: number; createdAt: string; updatedAt: string; revision: number; serverRevision: number }[] = [];
  const report: { source: string; status: string; [key: string]: unknown }[] = [];
  const used = new Set<Correction>();
  let sourceCompleted = 0, cachedHours = 0, cachedEnergy = 0, cachedCost = 0, matchedHours = 0;
  const add = (date: string, start: string, end: string | null, label: string, evidence?: string) => {
    const startAt = torontoInstant(`${date}T${start}`);
    let endDate = date;
    if (end !== null && end < start) endDate = new Date(Date.parse(date + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
    const endAt = end === null ? null : torontoInstant(`${endDate}T${end}`);
    if (endAt && Date.parse(endAt) - Date.parse(startAt) < 60000) throw new Error('Completed record is shorter than one minute.');
    const id = stableHistoryId(startAt);
    if (sessions.some(s => s.id === id)) throw new Error('Duplicate historical start; review source.');
    const session = { ...settings, id, startAt, endAt, state: endAt ? 'completed' as const : 'incomplete' as const, createdAt: startAt, updatedAt: endAt ?? startAt, revision: 1, serverRevision: 0 };
    sessions.push(session);
    const hours = endAt ? (Date.parse(endAt) - Date.parse(startAt)) / 3600000 : 0;
    report.push({ source: label, status: 'accepted', id, date, start, end, endDate, hours, energyKwh: hours * power, costCad: hours * power * rate, ...(evidence ? { evidence } : {}) });
    return hours;
  };
  for (const row of rows.filter(r => r.row > 1)) {
    const cell = (c: string) => row.cells[`${c}${row.row}`]?.value;
    // Formula-only template rows are never sessions. Partial input rows are rejected, not ignored.
    if (['A', 'B', 'C', 'G'].every(c => cell(c) === undefined || cell(c) === '')) continue;
    const label = `Charging row ${row.row}`;
    try {
      const date = dateFromSerial(cell('A')), start = timeFromSerial(cell('B'));
      const originalEnd = cell('C') === undefined || cell('C') === '' ? null : timeFromSerial(cell('C'));
      const correction = corrections.find(c => !c.add && c.date === date && c.start === start);
      if (correction) used.add(correction);
      const hours = add(date, start, correction ? correction.end : originalEnd, label, correction?.evidence);
      const item = report[report.length - 1]; item.original = row.cells;
      if (originalEnd !== null) {
        sourceCompleted++;
        const cached = ['D', 'E', 'F'].map(cell);
        if (cached.every(v => typeof v === 'number' && Number.isFinite(v))) {
          cachedHours += cached[0] as number; cachedEnergy += cached[1] as number; cachedCost += cached[2] as number;
          matchedHours += hours;
          const deltas = [hours - (cached[0] as number), hours * power - (cached[1] as number), hours * power * rate - (cached[2] as number)];
          item.cachedComparison = { deltas, matches: deltas.every(d => Math.abs(d) < 1e-7) };
        } else item.cachedComparison = { matches: false, error: 'Missing/non-numeric cached formula value.' };
      } else item.cachedComparison = { excluded: 'Originally incomplete; cached values do not represent a completed charge.' };
    } catch (error) { report.push({ source: label, status: 'rejected', error: (error as Error).message, original: row.cells }); }
  }
  for (const c of corrections.filter(c => c.add)) {
    try { add(c.date, c.start, c.end, 'Approved supplemental record', c.evidence); used.add(c); }
    catch (error) { report.push({ source: 'Approved supplemental record', status: 'rejected', error: (error as Error).message }); }
  }
  for (const c of corrections.filter(c => !used.has(c))) report.push({ source: 'Correction', status: 'rejected', error: 'Correction did not match an accepted source record.', correction: c });
  const hours = sessions.reduce((n, s) => n + (s.endAt ? (Date.parse(s.endAt) - Date.parse(s.startAt)) / 3600000 : 0), 0);
  return { backup: { app: 'PlugTime', schemaVersion: 2, exportedAt: new Date().toISOString(), settings, sessions, outbox: [], conflicts: [] },
    report: { sourceSha256: source.sha256, timezone: 'America/Toronto', assumptions: settings, sourceCompleted, accepted: sessions.length, completed: sessions.filter(s => s.endAt).length,
      rejected: report.filter(r => r.status === 'rejected').length, cachedSource: { hours: cachedHours, energyKwh: cachedEnergy, costCad: cachedCost, recalculatedComparableHours: matchedHours },
      migrated: { hours, energyKwh: hours * power, costCad: hours * power * rate }, rows: report } };
}
