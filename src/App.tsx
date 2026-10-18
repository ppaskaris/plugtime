import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppUpdates } from './useAppUpdates';
import { db, deleteSession, getSettings, saveSession, saveSettings, startSession, stopSession } from './db';
import { cad, calculate, costCad, defaults, durationLabel, localInput, MIN_SESSION_MS, parseLocal, periodGroups, summarize, type Session, type Settings } from './domain';
import { download, historyCsv, makeBackup } from './exports';
import { CloudPanel } from './CloudPanel';
import { ImportPanel } from './ImportPanel';

const dateLabel = (iso: string) => new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Please try again.';

function SessionEditor({ session, settings, close, notify }: { session: Session | null; settings: Settings; close: () => void; notify: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(localInput(session?.startAt ?? new Date().toISOString()));
  const [end, setEnd] = useState(session?.endAt ? localInput(session.endAt) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await saveSession({ startAt: parseLocal(start, session?.startAt), endAt: end ? parseLocal(end, session?.endAt ?? undefined) : null,
        powerWatts: session?.powerWatts ?? settings.powerWatts, rateMicrosPerKwh: session?.rateMicrosPerKwh ?? settings.rateMicrosPerKwh }, session ?? undefined);
      notify('Session saved on this device.'); close();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!session || !window.confirm('Delete this charging session? It will be removed from your history.')) return;
    setBusy(true);
    try { await deleteSession(session); notify('Session deleted on this device.'); close(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else close(); }} aria-labelledby="editor-title">
    <form onSubmit={save}>
      <h2 id="editor-title">{session ? 'Edit session' : 'Add a session'}</h2>
      <p>Times use your device’s timezone. Include the next date for overnight charging.</p>
      <label>Start<input autoFocus type="datetime-local" step="1" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>End<input type="datetime-local" step="1" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <p className="muted">Leave the end blank to save an unfinished record. Estimates use {(session ?? settings).powerWatts / 1000} kW at CAD ${(session ?? settings).rateMicrosPerKwh / 1_000_000}/kWh.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions"><button className="primary" disabled={busy}>Save session</button><button type="button" disabled={busy} onClick={close}>Cancel</button></div>
      {session && <button type="button" className="danger" disabled={busy} onClick={remove}>Delete session</button>}
    </form>
  </dialog>;
}

function SettingsPanel({ settings, act, updates }: { settings: Settings; act: (job: () => Promise<unknown>, message: string) => Promise<void>; updates: ReturnType<typeof useAppUpdates> }) {
  const [power, setPower] = useState(String(settings.powerWatts / 1000));
  const [rate, setRate] = useState(String(settings.rateMicrosPerKwh / 1_000_000));
  const [storage, setStorage] = useState('Checking storage…');
  useEffect(() => {
    setPower(String(settings.powerWatts / 1000)); setRate(String(settings.rateMicrosPerKwh / 1_000_000));
  }, [settings.powerWatts, settings.rateMicrosPerKwh]);
  useEffect(() => {
    if (!navigator.storage?.persisted) { setStorage('Persistent storage is unavailable in this browser.'); return; }
    navigator.storage.persisted().then(value => setStorage(value ? 'Persistent storage granted.' : 'Storage is currently best effort.')).catch(() => setStorage('Storage status unavailable.'));
  }, []);
  return <section className="card stack">
    <h2>Settings</h2>
    <form onSubmit={e => {
      e.preventDefault();
      void act(() => saveSettings({ powerWatts: Math.round(Number(power) * 1000), rateMicrosPerKwh: Math.round(Number(rate) * 1_000_000) }), 'Defaults saved. Existing sessions keep their assumptions.');
    }}>
      <label>Charging power (kW)<input required type="number" min="0.001" max="1000" step="0.001" value={power} onChange={e => setPower(e.target.value)} /></label>
      <label>Electricity rate (CAD/kWh)<input required type="number" min="0" max="100" step="0.000001" value={rate} onChange={e => setRate(e.target.value)} /></label>
      <p className="muted">These defaults apply to new sessions. Consumption and cost assume continuous charging and are estimates.</p>
      <button>Save defaults</button>
    </form>
    <div className="divider"><h3>Your data</h3><p>Saved on this device. Check Cloud backup below for synchronization status. Export JSON regularly to keep a complete copy.</p>
      <div className="actions">
        <button onClick={() => void act(async () => { const backup = await makeBackup(); download('plugtime-backup.json', JSON.stringify(backup, null, 2), 'application/json'); }, 'JSON export prepared. Save it somewhere safe.')}>Export JSON</button>
        <button onClick={() => void act(async () => { const backup = await makeBackup(); download('plugtime-history.csv', historyCsv(backup.sessions), 'text/csv;charset=utf-8'); }, 'CSV export prepared.')}>Export CSV</button>
      </div>
    </div>
    <ImportPanel />
    <div className="divider"><h3>App updates</h3><p>PlugTime checks for updates when opened, resumed or reconnected. Install available updates using the prompt at the top.</p>
      <button disabled={updates.checking} onClick={() => void updates.check(true)}>{updates.checking ? 'Checking for updates…' : 'Check for app updates'}</button>
      {updates.message && <p role="status">{updates.message}</p>}
    </div>
    <div className="divider"><p>{storage}</p><button onClick={() => void act(async () => {
      const granted = await navigator.storage?.persist?.();
      setStorage(granted ? 'Persistent storage granted.' : 'Persistent storage was not granted. Keep exporting backups.');
    }, 'Storage request completed.')}>Request persistent storage</button></div>
    <p className="muted">On iPhone, use Safari’s Share menu → Add to Home Screen. Open PlugTime online once and wait for “Ready for offline use” before entering the garage.</p>
  </section>;
}

export function App() {
  const [tab, setTab] = useState<'charging' | 'history' | 'summary'>('charging');
  const [editor, setEditor] = useState<Session | null | undefined>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [controlled, setControlled] = useState(!!navigator.serviceWorker?.controller);
  const updates = useAppUpdates();
  const { offlineReady, needRefresh } = updates;
  const data = useLiveQuery(async () => {
    try {
      return { sessions: await db.sessions.orderBy('startAt').reverse().toArray(), settings: await getSettings(), pending: await db.outbox.count() };
    } catch (e) { return { sessions: [], settings: defaults, pending: 0, error: errorMessage(e) }; }
  }, []);
  useEffect(() => {
    const update = () => { setNow(Date.now()); setOnline(navigator.onLine); };
    const workerUpdate = () => setControlled(!!navigator.serviceWorker?.controller);
    navigator.serviceWorker?.addEventListener('controllerchange', workerUpdate);
    const timer = window.setInterval(update, 1000);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    window.addEventListener('pageshow', update); document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update);
      window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update);
      navigator.serviceWorker?.removeEventListener('controllerchange', workerUpdate);
    };
  }, []);
  async function act<T>(job: () => Promise<T>, message: string | ((result: T) => string)) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { const result = await job(); setNotice(typeof message === 'function' ? message(result) : message); } catch (e) { setError(errorMessage(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const sessions = data?.sessions.filter(s => s.state !== 'deleted') ?? [];
  const active = sessions.find(s => s.state === 'active');
  const lastCharge = sessions.find(s => s.state === 'completed');
  const settings = data?.settings ?? defaults;
  const total = summarize(sessions);
  const estimate = active ? calculate(active, now) : undefined;
  return <div className="app-shell">
    <header><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('charging'); }}><img src="/icon.svg" alt="" />PlugTime</a><span className="connection"><i className={online ? 'online' : ''} />{online ? 'Online' : 'Offline'}</span></header>
    <main>
      <div className="save-status"><span>On this device</span><span>{offlineReady || controlled ? 'Ready for offline use' : 'Offline setup pending'}</span></div>
      {needRefresh && <section className="card update" aria-label="App update"><p>A PlugTime update is ready.{active || editor !== undefined ? ' It can be installed after you finish charging and close the editor.' : ''}</p><button disabled={!!active || editor !== undefined || busy} onClick={() => updates.install()}>Install update</button></section>}
      <p role="status" className="feedback">{notice}</p>
      {(error || data?.error) && <p role="alert" className="error">{error || data?.error}</p>}
      {!data ? <p>Opening your charging log…</p> : data.error ? <p>Your log could not be opened. Reopen the app and check available device storage. No changes have been saved.</p> : <>
        {tab === 'charging' && <>
          <div className="page-heading"><p className="eyebrow">YOUR CHARGING LOG</p><h1>{active ? 'Charging in progress' : 'Ready when you are.'}</h1><p>One tap to record. Even without a connection.</p></div>
          <section className="card charging-card" aria-label="Current charging session">
            <div className={`plug-mark ${active ? 'is-active' : ''}`} aria-hidden="true">↯</div>
            {active && estimate ? <>
              <p>Started {dateLabel(active.startAt)}</p><div className="timer">{durationLabel(estimate.durationMs)}</div>
              <p>{estimate.energyKwh.toFixed(2)} kWh · {cad(costCad(estimate.costNumerator))} CAD estimated</p>
              <button className="primary large stop" disabled={busy} onClick={() => void act(() => stopSession(active), stopped => stopped.state === 'deleted' ? 'Charge discarded: under one minute. It won’t count in your history or statistics.' : 'Charging stopped and saved on this device.')}>Stop Charging</button>
              <p className="muted">Charges under one minute are automatically discarded when stopped.</p>
              <button className="text-button danger" disabled={busy} onClick={() => {
                if (Date.now() - Date.parse(active.startAt) >= MIN_SESSION_MS && !window.confirm('Cancel this charge? It will not count in your history or statistics.')) return;
                void act(() => deleteSession(active), 'Charge cancelled. It won’t count in your history or statistics.');
              }}>Cancel charge</button>
              <button className="text-button" onClick={() => setEditor(active)}>Correct timestamps</button>
            </> : <>
              <h2>Plug in. Tap. You’re set.</h2><p>Your start time is saved as soon as you tap.</p>
              <button className="primary large" disabled={busy} onClick={() => void act(() => startSession(), 'Charging started and saved on this device.')}>Start Charging</button>
              <p className="muted">{settings.powerWatts / 1000} kW · CAD ${settings.rateMicrosPerKwh / 1_000_000}/kWh</p>
            </>}
          </section>
          <button className="text-button manual-button" onClick={() => setEditor(null)}>Add a session manually</button>
          {lastCharge && <section className="card recent"><h2>Last charge</h2>{renderSession(lastCharge)}<button className="text-button danger" disabled={busy} onClick={() => {
            if (!window.confirm('Delete the last charge? It will be removed from your history and statistics.')) return;
            void act(() => deleteSession(lastCharge), 'Last charge deleted on this device.');
          }}>Delete last charge</button></section>}
        </>}
        {tab === 'history' && <>
          <div className="page-heading"><p className="eyebrow">ALL ON THIS DEVICE</p><h1>Charging history</h1><p>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} recorded</p></div>
          <button className="primary" onClick={() => setEditor(null)}>Add a session</button>
          <div className="history-list">{sessions.length ? sessions.map(s => <div key={s.id} className="card">{renderSession(s)}</div>) : <div className="card"><h2>Your log starts here.</h2><p>Start a charge or add an earlier session manually.</p></div>}</div>
        </>}
        {tab === 'summary' && <>
          <div className="page-heading"><p className="eyebrow">YOUR CHARGING AT A GLANCE</p><h1>Statistics & settings</h1><p>Completed sessions only. All figures calculated on this device.</p></div>
          <section className="card metrics" aria-label="All-time totals">
            <div><span>Sessions</span><strong>{total.count}</strong></div><div><span>Charging time</span><strong>{durationLabel(total.durationMs)}</strong></div>
            <div><span>Estimated energy</span><strong>{total.energyKwh.toFixed(2)} <small>kWh</small></strong></div><div><span>Estimated cost</span><strong>{cad(costCad(total.costNumerator))} <small>CAD</small></strong></div>
            <div><span>Average duration</span><strong>{durationLabel(total.count ? total.durationMs / total.count : 0)}</strong></div><div><span>Average energy</span><strong>{(total.count ? total.energyKwh / total.count : 0).toFixed(2)} <small>kWh</small></strong></div>
          </section>
          {[false, true].map(yearly => <section className="card" key={String(yearly)}><h2>{yearly ? 'By year' : 'By month'}</h2><p className="muted">Grouped by session start date in your device’s timezone.</p><div className="period-list">{periodGroups(sessions, yearly).map(p => <div className="period-row" key={p.period}><strong>{p.period}</strong><span>{p.count} charges · {durationLabel(p.durationMs)}<br />{p.energyKwh.toFixed(2)} kWh · {cad(costCad(p.costNumerator))} CAD est.</span></div>)}{!total.count && <p>No completed sessions yet.</p>}</div></section>)}
          <SettingsPanel settings={settings} act={act} updates={updates} />
        </>}
        <CloudPanel />
      </>}
    </main>
    <nav aria-label="Main navigation">{(['charging', 'history', 'summary'] as const).map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t === 'charging' ? 'Charging' : t === 'history' ? 'History' : 'Statistics / Settings'}</button>)}</nav>
    {editor !== undefined && <SessionEditor session={editor} settings={settings} close={() => setEditor(undefined)} notify={setNotice} />}
  </div>;

  function renderSession(session: Session) {
    const result = session.endAt ? calculate(session) : null;
    return <button className="session-row" onClick={() => setEditor(session)}>
      <span><strong>{dateLabel(session.startAt)}</strong><span className="muted">{session.endAt ? `to ${dateLabel(session.endAt)}` : session.state === 'active' ? 'Charging now' : 'Unfinished · add an end time'}</span></span>
      <span className="session-estimate">{result ? <><strong>{result.energyKwh.toFixed(2)} kWh</strong><span>{durationLabel(result.durationMs)} · {cad(costCad(result.costNumerator))} CAD est.</span></> : <strong className="unfinished">{session.state === 'active' ? 'Active' : 'Incomplete'}</strong>}</span>
    </button>;
  }
}
