import { useState } from 'react';
import { IonIcon, IonSegment, IonSegmentButton, IonLabel } from '@ionic/react';
import { flashOutline, trashOutline } from 'ionicons/icons';
import { useAppModel } from './App';
import { startSession, stopSession } from './db';
import { calculate, cad, costCad, durationLabel, groupSessionsByStart, historyDate, MIN_SESSION_MS, periodGroups, recentCharge, sessionDateParts, summarize, type Session } from './domain';
import { AccountPanel } from './CloudPanel';
import { SettingsPanel } from './SettingsPanel';

function SessionRow({ session, grouped = false }: { session: Session; grouped?: boolean }) {
  const app = useAppModel();
  const result = session.endAt ? calculate(session) : null;
  const date = sessionDateParts(session.startAt, app.now, grouped);
  return <button className="session-row" onClick={() => app.edit(session)}>
    <strong className="session-date">{date.day}</strong><span className="session-time">{date.time}</span>
    <span className="session-duration muted">{result ? <>{durationLabel(result.durationMs)}{result.durationMs >= 86_400_000 && <> · to {historyDate(session.endAt!, app.now)}</>}</> : session.state === 'active' ? 'Charging now' : 'Unfinished · add an end time'}</span>
    <span className="session-estimate">{result ? <><strong>{result.energyKwh.toFixed(2)} kWh</strong><span>{cad(costCad(result.costNumerator))}</span></> : <strong>{session.state === 'active' ? 'Active' : 'Unfinished'}</strong>}</span>
  </button>;
}

function SessionList({ sessions }: { sessions: Session[] }) {
  return <div className="history-list">{sessions.map(session => <SessionRow key={session.id} session={session} grouped />)}</div>;
}
const monthLabel = (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

function PeriodList({ periods, yearly = false }: { periods: ReturnType<typeof periodGroups>; yearly?: boolean }) {
  return <>{periods.map(period => <details className="period-block" key={period.period}>
    <summary className="period-row"><strong>{yearly ? period.period : monthLabel(period.period)}</strong>
      <span className="period-summary"><strong>{period.energyKwh.toFixed(2)} kWh · {cad(costCad(period.costNumerator))}</strong><span className="muted">{period.count} {period.count === 1 ? 'charge' : 'charges'} · {durationLabel(period.durationMs)}</span></span>
    </summary>
    <div className="period-content">{yearly ? <PeriodList periods={periodGroups(period.sessions)} /> : period.sessions.length ? <SessionList sessions={period.sessions} /> : <p className="muted">No completed sessions in this month.</p>}</div>
  </details>)}</>;
}

export function Charging() {
  const app = useAppModel();
  const active = app.sessions.find(session => session.state === 'active');
  const last = recentCharge(app.sessions, app.now);
  const estimate = active ? calculate(active, app.now) : null;
  return <>
    <section className={`card charging-tile ${active ? 'is-active' : ''}`} aria-label="Current charging session">
      <div className="charge-symbol"><IonIcon icon={flashOutline} aria-hidden="true" /></div>
      <h1>{active ? 'Charging in progress' : 'Ready to charge'}</h1>
      <div className={`timer ${active ? '' : 'muted'}`}>{estimate ? durationLabel(estimate.durationMs) : '0h 00m'}</div>
      <p className="charge-estimate">{estimate ? `${estimate.energyKwh.toFixed(2)} kWh · ${cad(costCad(estimate.costNumerator))} CAD estimated` : `${app.settings.powerWatts / 1000} kW · CAD $${app.settings.rateMicrosPerKwh / 1_000_000}/kWh`}</p>
      <p className="charge-start muted">{active ? `Started ${historyDate(active.startAt, app.now)}` : app.updates.offlineReady || app.controlled ? 'Saved on this device · Works offline' : 'Saved on this device · Offline setup pending'}</p>
      <button className={`primary charge-control ${active ? 'stop' : ''}`} disabled={app.busy} onClick={() => {
        if (!active) void app.act(() => startSession(), '');
        else void app.act(async () => {
          const stopped = await stopSession(active);
          if (stopped.state === 'deleted') app.undo(active, stopped, 'Charge discarded: under one minute.');
          return stopped;
        }, stopped => stopped.state === 'deleted' ? '' : 'Charging stopped and saved.');
      }}>{active ? 'Stop Charging' : 'Start Charging'}</button>
      <div className="charge-secondary">{active ? <>
        <button className="danger" disabled={app.busy} onClick={() => {
          if (Date.now() - Date.parse(active.startAt) >= MIN_SESSION_MS && !window.confirm('Cancel this charge? It will not count in your history or statistics.')) return;
          void app.remove(active);
        }}>Cancel charge</button>
        <button onClick={() => app.edit(active)}>Correct timestamps</button>
      </> : <p className="muted">Charges under one minute are discarded on Stop.</p>}</div>
    </section>
    <button className="manual-button" onClick={() => app.edit(null)}>Add a session manually</button>
    {last && <section className="card recent"><div className="section-heading"><h2>Last charge</h2><button className="icon-button danger" aria-label="Delete last charge" disabled={app.busy} onClick={() => void app.remove(last)}><IonIcon icon={trashOutline} /></button></div><SessionRow session={last} /><p className="muted">Energy and cost estimated · CAD</p></section>}
  </>;
}

export function History() {
  const { sessions } = useAppModel();
  return <><p className="list-caption">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} recorded · Estimates in kWh / CAD</p>
    {sessions.length ? groupSessionsByStart(sessions).map(group => <section className="history-month" key={group.period} aria-label={monthLabel(group.period)}>
      <h2>{monthLabel(group.period)}</h2><SessionList sessions={group.sessions} />
    </section>) : <div className="history-list empty-state"><h2>No sessions yet</h2><p>Start a charge or use + to add a session.</p></div>}
  </>;
}

export function Statistics() {
  const { sessions } = useAppModel();
  const [segment, setSegment] = useState('overview');
  const total = summarize(sessions);
  const periods = periodGroups(sessions, true);
  return <>
    <IonSegment value={segment} onIonChange={event => setSegment(String(event.detail.value))} aria-label="Statistics period">
      <IonSegmentButton value="overview"><IonLabel>Overview</IonLabel></IonSegmentButton>
      <IonSegmentButton value="years"><IonLabel>By year</IonLabel></IonSegmentButton>
    </IonSegment>
    <p className="list-caption">Completed sessions · Energy and cost estimated</p>
    {segment === 'overview' ? <>
      <section className="card metrics" aria-label="All-time totals">
        <div><span>Sessions</span><strong>{total.count}</strong></div><div><span>Charging time</span><strong>{durationLabel(total.durationMs)}</strong></div>
        <div><span>Estimated energy</span><strong>{total.energyKwh.toFixed(2)} <small>kWh</small></strong></div><div><span>Estimated cost</span><strong>{cad(costCad(total.costNumerator))} <small>CAD</small></strong></div>
      </section>
      <section className="card metrics averages" aria-label="Per-session averages"><div><span>Average duration</span><strong>{durationLabel(total.count ? total.durationMs / total.count : 0)}</strong></div><div><span>Average energy</span><strong>{(total.count ? total.energyKwh / total.count : 0).toFixed(2)} <small>kWh</small></strong></div></section>
    </> : <div className="card period-list" aria-label="Yearly totals"><PeriodList key={segment} periods={periods} yearly />{!periods.length && <p>No completed sessions yet.</p>}</div>}
    <p className="muted">Grouped by start date in your device’s timezone. Costs in CAD.</p>
  </>;
}

export function SettingsScreen() {
  const app = useAppModel();
  return <><AccountPanel service={app.cloud} /><SettingsPanel settings={app.settings} act={app.act} updates={app.updates} offlineReady={app.updates.offlineReady || app.controlled} updateBlocked={app.sessions.some(session => session.state === 'active') || app.editor !== undefined || app.busy} /></>;
}
