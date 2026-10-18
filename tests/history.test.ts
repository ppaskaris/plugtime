import { expect, it } from 'vitest';
import { convertHistory, stableHistoryId, torontoInstant, type Source } from '../scripts/history';
import { parseBackup } from '../src/imports';
const serial = (date: string) => (Date.parse(date + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000;
function fixture(): Source { return { sha256: 'synthetic', date1904: false, sheets: { Charging: [
  { row: 2, cells: { A2: { value: serial('2024-01-01') }, B2: { value: 23 / 24 }, C2: { value: 1 / 24 }, D2: { value: 2 }, E2: { value: 19.2 }, F2: { value: 3.8976 }, J2: { value: .203 } } },
  { row: 3, cells: { A3: { value: serial('2024-07-01') }, B3: { value: .5 }, J3: { value: 9.6 } } },
  { row: 4, cells: { D4: { value: 0, formula: 'shared formula' } } },
] } }; }
it('converts overnight and incomplete rows, compares cached formulas and emits protocol-compatible IDs', () => {
  const result = convertHistory(fixture()); const parsed = parseBackup(JSON.stringify(result.backup));
  expect(parsed.sessions).toHaveLength(2); expect(parsed.sessions[1].state).toBe('incomplete');
  expect(result.report.migrated.hours).toBe(2); expect(result.report.rows[0].cachedComparison).toEqual({ deltas: [0, 0, 0], matches: true });
  expect(parsed.sessions[0].startAt).toBe('2024-01-02T04:00:00.000Z'); expect(result.report.rejected).toBe(0);
  expect(convertHistory(fixture()).backup.sessions.map(s => s.id)).toEqual(parsed.sessions.map(s => s.id));
});
it('uses explicit Toronto DST rules independent of device timezone and rejects ambiguous/gap times', () => {
  expect(torontoInstant('2024-01-01T12:00:00')).toBe('2024-01-01T17:00:00.000Z');
  expect(torontoInstant('2024-07-01T12:00:00')).toBe('2024-07-01T16:00:00.000Z');
  expect(() => torontoInstant('2024-03-10T02:30:00')).toThrow('Nonexistent');
  expect(() => torontoInstant('2024-11-03T01:30:00')).toThrow('Ambiguous');
  expect(() => torontoInstant('2024-02-30T12:00:00')).toThrow('Invalid');
  const f = fixture();
  f.sheets.Charging[0].cells = { ...f.sheets.Charging[0].cells, A2: { value: serial('2024-03-09') }, B2: { value: 23 / 24 }, C2: { value: 3 / 24 }, D2: { value: 4 } };
  const result = convertHistory(f);
  expect(result.report.migrated.hours).toBe(3);
  expect(result.report.rows[0].cachedComparison).toMatchObject({ matches: false });
});
it('applies explicit corrections with evidence and retains original incomplete cells', () => {
  const result = convertHistory(fixture(), [{ date: '2024-07-01', start: '12:00:00', end: '13:00:00', evidence: 'synthetic approval' },
    { date: '2024-07-02', start: '10:00:00', end: '11:00:00', add: true, evidence: 'synthetic addition' }]);
  expect(result.backup.sessions).toHaveLength(3); expect(result.report.completed).toBe(3);
  expect(result.report.rows[1].evidence).toBe('synthetic approval'); expect(result.report.rows[1].original).toBeDefined();
  expect(result.backup.sessions[1].id).toBe(convertHistory(fixture()).backup.sessions[1].id);
});
it('reports malformed/partial rows, duplicate starts, unmatched corrections and formula discrepancies', () => {
  const f = fixture(); f.sheets.Charging[0].cells.D2.value = 5;
  f.sheets.Charging.push({ row: 5, cells: { B5: { value: .4 } } });
  f.sheets.Charging.push({ row: 6, cells: { A6: { value: serial('2024-07-01') }, B6: { value: .5 } } });
  const result = convertHistory(f, [{ date: '2024-12-01', start: '10:00:00', end: null, evidence: 'unmatched' }]);
  expect(result.report.rejected).toBe(3); expect(result.report.rows[0].cachedComparison).toMatchObject({ matches: false });
  expect(stableHistoryId('2024-01-01T12:00:00.000Z')).not.toBe(stableHistoryId('2024-01-02T12:00:00.000Z'));
  expect(() => convertHistory({ ...f, date1904: true })).toThrow('1904');
});
