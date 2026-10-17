import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { resolveConflict, synchronize } from './sync';
import type { Session } from './domain';

function describe(session: Session | null | undefined) {
  if (!session) return 'No cloud record for this session.';
  return `${new Date(session.startAt).toLocaleString()} → ${session.endAt ? new Date(session.endAt).toLocaleString() : 'no end time'} (${session.state}, ${session.powerWatts / 1000} kW, CAD $${session.rateMicrosPerKwh / 1_000_000}/kWh)`;
}
export function CloudPanel() {
  const data = useLiveQuery(async () => ({ cloud: await db.cloud.get('cloud'), pending: await db.outbox.count(),
    conflicts: await db.conflicts.toArray(), sessions: await db.sessions.toArray() }), []);
  const [error, setError] = useState('');
  const running = useRef(false);
  const rerun = useRef(false);
  async function sync() {
    if (running.current) { rerun.current = true; return; }
    running.current = true;
    try {
      do { rerun.current = false; await synchronize(); } while (rerun.current);
    } catch { setError('Could not open the synchronization queue. Local recording is still available.'); }
    finally { running.current = false; }
  }
  useEffect(() => {
    const foreground = () => { if (document.visibilityState === 'visible') void sync(); };
    const online = () => { void sync(); };
    void sync();
    window.addEventListener('online', online); window.addEventListener('pageshow', foreground); document.addEventListener('visibilitychange', foreground);
    return () => { window.removeEventListener('online', online); window.removeEventListener('pageshow', foreground); document.removeEventListener('visibilitychange', foreground); };
  }, []);
  const pending = data?.pending ?? 0;
  useEffect(() => { if (pending > 0) void sync(); }, [pending]);
  const cloud = data?.cloud;
  useEffect(() => {
    if (!cloud?.leaseOwner || !cloud.leaseUntil) return;
    // A terminated tab cannot release its lease. Retry when it expires on relaunch.
    const retry = window.setTimeout(() => void sync(), Math.max(0, cloud.leaseUntil - Date.now()) + 50);
    return () => clearTimeout(retry);
  }, [cloud?.leaseOwner, cloud?.leaseUntil]);
  const syncing = cloud?.status === 'syncing' && (cloud.leaseUntil ?? 0) > Date.now();
  let label = cloud?.enabled ? (pending ? `${pending} local changes waiting for cloud backup` : 'Changes acknowledged by cloud') : 'Cloud backup not configured';
  if (cloud?.status === 'syncing') label = 'Synchronizing with cloud…';
  else if (cloud?.status === 'auth') label = 'Sign in to sync · local recording is available';
  else if (cloud?.status === 'offline') label = 'Cloud unreachable · changes saved on this device';
  else if (cloud?.status === 'error') label = 'Cloud synchronization failed · local changes retained';
  else if (cloud?.status === 'conflict') label = 'Conflicting changes need review · both versions retained';
  return <section className="card cloud-panel" aria-label="Cloud synchronization">
    <h2>Cloud backup</h2><p aria-live="polite">{label}</p>
    {cloud?.lastSuccessAt && <p className="muted">Last completed sync: {new Date(cloud.lastSuccessAt).toLocaleString()}</p>}
    {!cloud?.enabled && <p className="muted">Local changes stay on this device until the Cloudflare API is configured and you sign in.</p>}
    <div className="actions"><button disabled={syncing} onClick={() => void sync()}>Sync now</button>
      {cloud?.status === 'auth' && <a className="signin" href="/api/login">Sign in with Cloudflare</a>}</div>
    {(error || cloud?.message) && <p className="muted">{error || cloud?.message}</p>}
    {data?.conflicts.map(conflict => <div className="divider conflict" key={conflict.sessionId}>
      <h3>Review conflicting charge</h3>
      <p><strong>This device:</strong> {describe(data.sessions.find(s => s.id === conflict.sessionId))}</p>
      <p><strong>Cloud:</strong> {describe(conflict.remote)}</p>
      {conflict.active && conflict.active.id !== conflict.sessionId && <p>Another device has an active charge: {describe(conflict.active)}. Keeping both marks this device’s charge unfinished and restores the cloud charge as active.</p>}
      <div className="actions">{(['local', 'cloud'] as const).map(choice => <button key={choice} disabled={syncing} onClick={async () => {
        setError('');
        try { await resolveConflict(conflict, choice); await sync(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve conflict.'); }
      }}>{choice === 'local' ? conflict.active && conflict.active.id !== conflict.sessionId ? 'Keep both; mark mine unfinished' : 'Keep this device’s version' : 'Use cloud version'}</button>)}</div>
    </div>)}
  </section>;
}
