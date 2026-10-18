import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { resolveConflict, synchronize } from './sync';
import type { Session } from './domain';
import { IonButton } from '@ionic/react';
import { AUTO_SYNC_INTERVAL_MS } from './sync';
import { Surface } from './UI';

function describe(session: Session | null | undefined) {
  if (!session) return 'No cloud record for this session.';
  return `${new Date(session.startAt).toLocaleString()} → ${session.endAt ? new Date(session.endAt).toLocaleString() : 'no end time'} (${session.state}, ${session.powerWatts / 1000} kW, CAD $${session.rateMicrosPerKwh / 1_000_000}/kWh)`;
}
export function useCloudSync() {
  const data = useLiveQuery(async () => ({ cloud: await db.cloud.get('cloud'), pending: await db.outbox.count(),
    conflicts: await db.conflicts.toArray(), sessions: await db.sessions.toArray() }), []);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const running = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const run = useCallback((automatic: boolean) => {
    if (running.current) { if (!automatic) rerun.current = true; return running.current; }
    setError('');
    running.current = (async () => {
      try {
        let automaticRun = automatic;
        do {
          rerun.current = false;
          await synchronize(db, undefined, { automatic: automaticRun });
          automaticRun = false; // Only an explicit manual request queues a rerun.
        } while (rerun.current);
      }
      catch { setError('Could not open the synchronization queue. Local recording is still available.'); }
      finally { running.current = null; }
    })();
    return running.current;
  }, []);
  const sync = useCallback(() => run(false), [run]);
  const autoSync = useCallback(() => {
    if (navigator.onLine && !document.hidden) return run(true);
    return Promise.resolve();
  }, [run]);
  useEffect(() => {
    const foreground = () => { void autoSync(); };
    const connectivity = () => { setOnline(navigator.onLine); void autoSync(); };
    void autoSync();
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity); window.addEventListener('pageshow', foreground); document.addEventListener('visibilitychange', foreground);
    return () => { window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('pageshow', foreground); document.removeEventListener('visibilitychange', foreground); };
  }, [autoSync]);
  const pending = data?.pending ?? 0;
  useEffect(() => { if (pending > 0) void autoSync(); }, [pending, autoSync]);
  const cloud = data?.cloud;
  useEffect(() => {
    const lastAttempt = cloud?.lastAttemptAt ?? (cloud?.lastSuccessAt ? Date.parse(cloud.lastSuccessAt) : undefined);
    if (lastAttempt === undefined) return;
    const timer = window.setTimeout(() => void autoSync(), Math.max(0, lastAttempt + AUTO_SYNC_INTERVAL_MS - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [cloud?.lastAttemptAt, cloud?.lastSuccessAt, autoSync]);
  useEffect(() => {
    if (!cloud?.leaseOwner || !cloud.leaseUntil) return;
    // A terminated tab cannot release its lease. Retry when it expires on relaunch.
    const retry = window.setTimeout(() => void autoSync(), Math.max(0, cloud.leaseUntil - Date.now()) + 50);
    return () => clearTimeout(retry);
  }, [cloud?.leaseOwner, cloud?.leaseUntil, autoSync]);
  const syncing = cloud?.status === 'syncing' && (cloud.leaseUntil ?? 0) > Date.now();
  const label = syncLabel(cloud, pending, data?.conflicts.length ?? 0, online);
  return { data, error, setError, sync, syncing, online, label };
}

export function syncLabel(cloud: import('./domain').CloudState | undefined, pending: number, conflicts: number, online: boolean) {
  if (conflicts || cloud?.status === 'conflict') return 'Review conflicts';
  if (cloud?.status === 'auth') return 'Sign in to sync';
  if (cloud?.status === 'error') return 'Sync needs attention';
  if (!online) return pending ? `Offline · ${pending} pending` : 'Offline';
  if (cloud?.status === 'syncing') return (cloud.leaseUntil ?? 0) > Date.now() ? 'Syncing…' : 'Sync interrupted';
  if (cloud?.status === 'offline') return 'Cloud unreachable';
  if (!cloud?.enabled) return 'Local only';
  if (pending) return `${pending} pending`;
  return cloud.lastSuccessAt ? 'Synced' : 'Sync not verified';
}

export type CloudSync = ReturnType<typeof useCloudSync>;
export function AccountPanel({ service, presentation = 'page' }: { service: CloudSync; presentation?: 'page' | 'sheet' }) {
  const { data, error, setError, sync, syncing, online, label } = service;
  const cloud = data?.cloud;
  const content = <div className="cloud-panel flow">
    <h2>Account &amp; sync</h2>
    <p className="identity">{cloud?.identity?.email ?? 'Identity not verified'}</p>
    {cloud?.identity && <p className="muted">Last verified {new Date(cloud.identity.verifiedAt).toLocaleString()}{!online || cloud.status === 'auth' || cloud.status === 'offline' ? ' · authentication cannot currently be verified' : ''}</p>}
    <p aria-live="polite">{label}</p><p className="muted">{online ? 'Network available' : 'No network connection'} · {data?.pending ?? 0} pending changes</p>
    <p className="muted">Automatic sync runs at most once per hour. Pull to refresh or use Sync now anytime.</p>
    {cloud?.lastSuccessAt && <p className="muted">Last completed sync: {new Date(cloud.lastSuccessAt).toLocaleString()}</p>}
    {!cloud?.enabled && <p className="muted">Local changes stay on this device until the Cloudflare API is configured and you sign in.</p>}
    <div className="actions"><IonButton fill="outline" disabled={syncing} onClick={() => void sync()}>Sync now</IonButton>
      {cloud?.status === 'auth' && <IonButton fill="outline" href="/api/login">Sign in with Cloudflare</IonButton>}</div>
    {(error || cloud?.message) && <p className="muted">{error || cloud?.message}</p>}
    {data?.conflicts.map(conflict => <div className="divider conflict" key={conflict.sessionId}>
      <h3>Review conflicting charge</h3>
      <p><strong>This device:</strong> {describe(data.sessions.find(s => s.id === conflict.sessionId))}</p>
      <p><strong>Cloud:</strong> {describe(conflict.remote)}</p>
      {conflict.active && conflict.active.id !== conflict.sessionId && <p>Another device has an active charge: {describe(conflict.active)}. Keeping both marks this device’s charge unfinished and restores the cloud charge as active.</p>}
      <div className="actions">{(['local', 'cloud'] as const).map(choice => <IonButton fill="outline" key={choice} disabled={syncing} onClick={async () => {
        setError('');
        try { await resolveConflict(conflict, choice); await sync(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve conflict.'); }
      }}>{choice === 'local' ? conflict.active && conflict.active.id !== conflict.sessionId ? 'Keep both; mark mine unfinished' : 'Keep this device’s version' : 'Use cloud version'}</IonButton>)}</div>
    </div>)}
  </div>;
  return presentation === 'sheet' ? <section aria-label="Cloud synchronization">{content}</section> : <Surface label="Cloud synchronization">{content}</Surface>;
}
