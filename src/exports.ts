import { db, getSettings, type PlugTimeDatabase } from './db';
import { calculate, costCad, localInput, type Mutation, type Session, type Settings } from './domain';

export interface Backup { app: 'PlugTime'; schemaVersion: 1; exportedAt: string; settings: Settings; sessions: Session[]; outbox: Mutation[] }
export function makeBackup(database: PlugTimeDatabase = db): Promise<Backup> {
  return database.transaction('r', database.sessions, database.settings, database.outbox, async () => ({
    app: 'PlugTime', schemaVersion: 1, exportedAt: new Date().toISOString(), settings: await getSettings(database),
    sessions: await database.sessions.toArray(), outbox: await database.outbox.toArray(),
  }));
}
const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function historyCsv(sessions: Session[]) {
  const header = ['id', 'start_utc', 'end_utc', 'start_local', 'end_local', 'state', 'duration_hours', 'estimated_kwh', 'estimated_cost_cad', 'power_kw', 'rate_cad_per_kwh'];
  const rows = sessions.filter(s => s.state !== 'deleted').sort((a, b) => a.startAt.localeCompare(b.startAt)).map(s => {
    const c = s.endAt ? calculate(s) : undefined;
    return [s.id, s.startAt, s.endAt, localInput(s.startAt), s.endAt ? localInput(s.endAt) : '', s.state,
      c ? c.durationMs / 3_600_000 : '', c?.energyKwh ?? '', c ? costCad(c.costNumerator) : '', s.powerWatts / 1000, s.rateMicrosPerKwh / 1_000_000];
  });
  return '\uFEFF' + [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}
export function download(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
