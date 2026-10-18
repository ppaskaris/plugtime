import { describe, expect, it } from 'vitest';
import { calculate, costCad, defaults, groupSessionsByStart, historyDate, periodGroups, recentCharge, parseLocal, summarize, validateSession, type Session } from '../src/domain';
const session = (startAt = '2026-01-01T23:00:00.000Z', endAt: string | null = '2026-01-02T01:00:00.000Z'): Session => ({
  ...defaults, id: 'synthetic', startAt, endAt, state: endAt ? 'completed' : 'incomplete',
  createdAt: startAt, updatedAt: startAt, revision: 1, serverRevision: 0,
});

describe('charging estimates', () => {
  it('groups by local start month across month/year boundaries and keeps details consistent with totals', () => {
    const december = { ...session(new Date(2025, 11, 31, 23).toISOString(), new Date(2026, 0, 1, 2).toISOString()), id: 'december' };
    const january = { ...session(new Date(2026, 0, 31, 23).toISOString(), new Date(2026, 1, 1, 3).toISOString()), id: 'january' };
    const unfinished = { ...session(new Date(2026, 0, 20, 12).toISOString(), null), id: 'unfinished' };
    const deleted = { ...january, id: 'deleted', state: 'deleted' as const };
    const rows = [december, unfinished, january, deleted];
    expect(groupSessionsByStart(rows).map(group => [group.period, group.sessions.map(row => row.id)]))
      .toEqual([['2026-01', ['january', 'unfinished']], ['2025-12', ['december']]]);
    const years = periodGroups(rows, true);
    expect(years.map(group => [group.period, group.count, group.durationMs]))
      .toEqual([['2026', 1, 4 * 3600000], ['2025', 1, 3 * 3600000]]);
    expect(periodGroups(years[1].sessions)[0]).toMatchObject({ period: '2025-12', sessions: [december], count: 1 });
    expect(periodGroups(rows).map(group => group.period)).toEqual(['2026-01', '2025-12']);
  });
  it('skips empty months and sorts yearly totals descending', () => {
    const rows = [session('2025-12-01T12:00:00', '2025-12-01T13:00:00'), session('2024-01-01T12:00:00', '2024-01-01T13:00:00')];
    expect(periodGroups(rows).map(group => group.period)).toEqual(['2025-12', '2024-01']);
    expect(periodGroups(rows, true).map(group => group.period)).toEqual(['2025', '2024']);
  });
  it('labels local calendar days, preserving years for older records', () => {
    const now = new Date(2026, 0, 1, 1).getTime();
    expect(historyDate(new Date(2026, 0, 1, 0).toISOString(), now)).toMatch(/^Today,/);
    expect(historyDate(new Date(2025, 11, 31, 23).toISOString(), now)).toMatch(/^Yesterday,/);
    expect(historyDate(new Date(2024, 2, 1, 23).toISOString(), now)).toContain('2024');
  });
  it('uses completion time for the recent card, excludes future/expired charges and hides it while active', () => {
    const now = Date.parse('2026-01-03T12:00:00Z');
    const long = session('2026-01-01T12:00:00Z', '2026-01-03T11:00:00Z');
    const short = session('2026-01-03T08:00:00Z', '2026-01-03T09:00:00Z');
    expect(recentCharge([short, long], now)).toBe(long);
    expect(recentCharge([long], Date.parse(long.endAt!) + 12 * 3600000)).toBeUndefined();
    expect(recentCharge([long], Date.parse(long.endAt!) - 1)).toBeUndefined();
    expect(recentCharge([long, { ...short, state: 'active', endAt: null }], now)).toBeUndefined();
  });
  it('handles midnight and keeps full precision until display', () => {
    const result = calculate(session());
    expect(result.durationMs).toBe(7_200_000);
    expect(result.energyKwh).toBe(19.2);
    expect(costCad(result.costNumerator)).toBe(3.90);
  });
  it('sums exact costs before rounding to cents', () => {
    const tiny = { ...session(), powerWatts: 1000, rateMicrosPerKwh: 4000, endAt: '2026-01-02T00:00:00.000Z' };
    expect(costCad(calculate(tiny).costNumerator)).toBe(0);
    expect(costCad(summarize([tiny, tiny, tiny]).costNumerator)).toBe(0.01);
  });
  it('excludes incomplete and deleted history from totals', () => {
    expect(summarize([session(), session('2026-01-01T23:00:00Z', null), { ...session(), state: 'deleted' }]).count).toBe(1);
    expect(calculate(session('2026-01-01T23:00:00Z', null)).durationMs).toBe(0);
  });
  it('calculates real elapsed time across Toronto DST changes', () => {
    expect(calculate(session('2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00')).durationMs).toBe(3_600_000);
    expect(calculate(session('2026-11-01T00:30:00-04:00', '2026-11-01T02:30:00-05:00')).durationMs).toBe(10_800_000);
  });
  it('rejects reversed, invalid or missing completion times', () => {
    expect(() => validateSession(session('bad'))).toThrow();
    expect(() => validateSession(session('2026-01-03T00:00:00Z'))).toThrow();
    expect(() => validateSession({ ...session(), endAt: null })).toThrow();
  });
  it('uses an absolute start timestamp to recover elapsed time', () => {
    expect(calculate(session('2026-01-01T23:00:00Z', null), Date.parse('2026-01-02T01:00:00Z')).durationMs).toBe(7_200_000);
  });
  it('round-trips valid local input', () => {
    const value = '2026-01-02T12:13:14';
    expect(new Date(parseLocal(value)).getHours()).toBe(12);
    expect(() => parseLocal('2026-02-30T12:00:00')).toThrow();
  });
});
