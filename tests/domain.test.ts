import { describe, expect, it } from 'vitest';
import { calculate, costCad, defaults, parseLocal, summarize, validateSession, type Session } from '../src/domain';
const session = (startAt = '2026-01-01T23:00:00.000Z', endAt: string | null = '2026-01-02T01:00:00.000Z'): Session => ({
  ...defaults, id: 'synthetic', startAt, endAt, state: endAt ? 'completed' : 'incomplete',
  createdAt: startAt, updatedAt: startAt, revision: 1, serverRevision: 0,
});

describe('charging estimates', () => {
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
