import { useRef, useState, type FormEvent } from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonList, IonItem, IonInput } from '@ionic/react';
import { checkmarkOutline, trashOutline } from 'ionicons/icons';
import { deleteSession, restoreSession, saveSession } from './db';
import { localInput, parseLocal, MIN_SESSION_MS, type Session, type Settings } from './domain';
import type { Notify } from './Notifications';

export function SessionEditor({ session, settings, close, notify, opener }: { session: Session | null; settings: Settings; close: () => void; notify: Notify; opener: HTMLElement | null }) {
  const modal = useRef<HTMLIonModalElement>(null), closeButton = useRef<HTMLIonButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const assumptions = useRef<HTMLDetailsElement>(null);
  const powerInput = useRef<HTMLIonInputElement>(null), rateInput = useRef<HTMLIonInputElement>(null);
  const writing = useRef(false);
  const [start, setStart] = useState(localInput(session?.startAt ?? new Date().toISOString()));
  const [end, setEnd] = useState(session?.endAt ? localInput(session.endAt) : '');
  const [power, setPower] = useState(String((session ?? settings).powerWatts / 1000));
  const [rate, setRate] = useState(String((session ?? settings).rateMicrosPerKwh / 1_000_000));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function finish(job: () => Promise<void>) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try { await job(); writing.current = false; await modal.current?.dismiss(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
    finally { writing.current = false; setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const fields = [...(form.current?.querySelectorAll('input[type="datetime-local"]') ?? []),
      await powerInput.current?.getInputElement(), await rateInput.current?.getInputElement()];
    for (const field of fields) {
      const native = field as HTMLInputElement | undefined;
      if (native && !native.checkValidity()) {
        if (assumptions.current?.contains(native)) assumptions.current.open = true;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        native.reportValidity();
        return;
      }
    }
    void finish(async () => {
      await saveSession({ startAt: parseLocal(start, session?.startAt), endAt: end ? parseLocal(end, session?.endAt ?? undefined) : null,
        powerWatts: Math.round(Number(power) * 1000), rateMicrosPerKwh: Math.round(Number(rate) * 1_000_000) }, session ?? undefined);
      notify('Session saved.');
    });
  }
  function remove() {
    if (!session) return;
    if (session.state === 'active' && Date.now() - Date.parse(session.startAt) >= MIN_SESSION_MS && !window.confirm('Cancel this charge? It will not count in your history or statistics.')) return;
    void finish(async () => {
      const deleted = await deleteSession(session);
      notify(session.state === 'active' ? 'Charge cancelled.' : 'Session deleted.', async () => {
        const restored = await restoreSession(session, deleted.revision);
        notify(restored.state === 'incomplete' && session.state === 'active' ? 'Restored as unfinished; another charge is active.' : 'Charge restored.');
      });
    });
  }
  return <IonModal ref={modal} isOpen className="session-sheet" aria-label={session ? 'Edit session' : 'Add a session'}
    initialBreakpoint={1} breakpoints={[0, 1]} handle backdropDismiss canDismiss={async () => !writing.current}
    onDidPresent={() => closeButton.current?.shadowRoot?.querySelector('button')?.focus()}
    onDidDismiss={() => { close(); if (opener?.isConnected) opener.focus(); }}>
    <IonHeader><IonToolbar>
      <IonButtons slot="start"><IonButton ref={closeButton} disabled={busy} onClick={() => void modal.current?.dismiss()}>Close</IonButton></IonButtons>
      <IonTitle id="editor-title">{session ? 'Edit session' : 'Add a session'}</IonTitle>
      <IonButtons slot="end">
        {session && <IonButton aria-label="Delete session" color="danger" disabled={busy} onClick={remove}><IonIcon slot="icon-only" icon={trashOutline} /></IonButton>}
        <IonButton aria-label="Save session" disabled={busy} onClick={() => form.current?.requestSubmit()}><IonIcon slot="icon-only" icon={checkmarkOutline} /></IonButton>
      </IonButtons>
    </IonToolbar></IonHeader>
    <IonContent><form ref={form} className="sheet-body" noValidate onSubmit={save}>
      <label className="native-field">Start<input type="datetime-local" step="1" required value={start} onChange={event => setStart(event.target.value)} disabled={busy} /></label>
      <label className="native-field">End<input type="datetime-local" step="1" value={end} onChange={event => setEnd(event.target.value)} disabled={busy} /></label>
      <p className="muted">Leave End blank for an unfinished record. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      <details ref={assumptions} className="session-assumptions">
        <summary>Power &amp; electricity rate<span className="muted">{power || '—'} kW · CAD ${rate || '—'}/kWh</span></summary>
        <IonList className="settings-fields" lines="full">
          <IonItem><IonInput ref={powerInput} label="Power (kW)" aria-label="Session power (kW)" labelPlacement="start" required type="number" min="0.001" max="1000" step="0.001" value={power} onIonInput={event => setPower(event.detail.value ?? '')} disabled={busy} /></IonItem>
          <IonItem><IonInput ref={rateInput} label="Rate (CAD/kWh)" aria-label="Session electricity rate (CAD/kWh)" labelPlacement="start" required type="number" min="0" max="100" step="0.000001" value={rate} onIonInput={event => setRate(event.detail.value ?? '')} disabled={busy} /></IonItem>
        </IonList>
        <p className="muted">Used to estimate this session’s energy and cost. Changes apply only to this session; your charging defaults stay the same.</p>
      </details>
      {error && <p role="alert" className="error">{error}</p>}
    </form></IonContent>
  </IonModal>;
}
