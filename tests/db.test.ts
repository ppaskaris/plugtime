import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlugTimeDatabase, deleteSession, saveSession, saveSettings, startSession, stopSession } from '../src/db';
import { defaults } from '../src/domain';
import { historyCsv, makeBackup } from '../src/exports';
let database: PlugTimeDatabase;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-01T12:00:00Z')); database = new PlugTimeDatabase(`plugtime-test-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); vi.useRealTimers(); });

describe('local persistence', () => {
  it('accepts only timestamps and assumptions from manual input, preserving generated identity', async () => {
    const saved = await saveSession({ ...defaults, startAt: '2024-01-01T12:00:00.000Z', endAt: '2024-01-01T13:00:00.000Z' }, undefined, database);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/); expect(saved.id).not.toBe('defaults');
  });
  it('serializes concurrent starts and atomically queues one mutation', async () => {
    const results = await Promise.allSettled([startSession(database), startSession(database)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await database.sessions.count()).toBe(1);
    expect(await database.outbox.count()).toBe(1);
  });
  it('recovers an active session after closing and reopening IndexedDB', async () => {
    const active = await startSession(database);
    database.close(); await database.open();
    expect(await database.sessions.get(active.id)).toEqual(active);
    vi.setSystemTime(Date.now() + 60_000);
    const stopped = await stopSession(active, database);
    expect(stopped.state).toBe('completed');
    expect(stopped.endAt).not.toBeNull();
    expect(await database.outbox.count()).toBe(2);
    await expect(stopSession(active, database)).rejects.toThrow('changed');
  });
  it('preserves assumptions and detects concurrent edits', async () => {
    const first = await startSession(database);
    await saveSettings({ powerWatts: 7000, rateMicrosPerKwh: 300000 }, database);
    const edited = await saveSession({ ...first, endAt: new Date(Date.now() + 60_000).toISOString() }, first, database);
    expect(edited.powerWatts).toBe(9600);
    expect(edited.rateMicrosPerKwh).toBe(203000);
    await expect(saveSession(edited, first, database)).rejects.toThrow('changed');
    expect((await startSession(database)).powerWatts).toBe(7000);
  });
  it('keeps historical incomplete records separate from a live session', async () => {
    const incomplete = await saveSession({ ...defaults, startAt: '2020-01-01T00:00:00Z', endAt: null }, undefined, database);
    expect(incomplete.state).toBe('incomplete');
    expect((await startSession(database)).state).toBe('active');
    expect((await saveSession({ ...incomplete, endAt: '2020-01-01T01:00:00Z' }, incomplete, database)).state).toBe('completed');
  });
  it.each([0, 59_999])('discards an accidental stop at %i ms and releases the active lock', async elapsed => {
    const active = await startSession(database);
    vi.setSystemTime(Date.now() + elapsed);
    const stopped = await stopSession(active, database);
    expect(stopped.state).toBe('deleted');
    expect(stopped.activeKey).toBeUndefined();
    expect((await makeBackup(database)).outbox.find(mutation => mutation.localRevision === 2)?.snapshot.state).toBe('deleted');
    expect(historyCsv(await database.sessions.toArray()).split('\r\n')).toHaveLength(1);
    expect((await startSession(database)).state).toBe('active');
  });
  it('does not discard a charge if the device clock moves before its start', async () => {
    const active = await startSession(database);
    vi.setSystemTime(Date.now() - 1000);
    await expect(stopSession(active, database)).rejects.toThrow('before the start');
    expect((await database.sessions.get(active.id))?.state).toBe('active');
  });
  it('rejects completed manual records and corrections shorter than a minute', async () => {
    const input = { ...defaults, startAt: '2026-01-01T12:00:00Z', endAt: '2026-01-01T12:00:59Z' };
    await expect(saveSession(input, undefined, database)).rejects.toThrow('at least one minute');
    expect(await database.sessions.count()).toBe(0);
    const saved = await saveSession({ ...input, endAt: '2026-01-01T12:01:00Z' }, undefined, database);
    await expect(saveSession(input, saved, database)).rejects.toThrow('at least one minute');
    expect((await database.sessions.get(saved.id))?.state).toBe('completed');
  });
  it('retains a deletion tombstone and clears the active lock', async () => {
    const active = await startSession(database);
    const deleted = await deleteSession(active, database);
    expect(deleted.state).toBe('deleted'); expect(deleted.activeKey).toBeUndefined();
    expect(await database.outbox.count()).toBe(2);
    expect((await startSession(database)).state).toBe('active');
  });
  it('rolls back the session when queuing its mutation fails', async () => {
    database.outbox.hook('creating', () => { throw new Error('simulated full storage'); });
    await expect(startSession(database)).rejects.toThrow('full storage');
    expect(await database.sessions.count()).toBe(0);
  });
  it('exports all local data and assumptions, including pending changes and tombstones', async () => {
    const active = await startSession(database); await deleteSession(active, database);
    const backup = await makeBackup(database);
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
    expect(backup.outbox).toHaveLength(2); expect(backup.sessions[0].state).toBe('deleted');
    expect(backup.settings).toEqual(defaults);
    expect(historyCsv(backup.sessions).split('\r\n')).toHaveLength(1);
  });
});
