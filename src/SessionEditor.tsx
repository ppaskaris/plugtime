import { useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { IonAccordion, IonAccordionGroup, IonLabel, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonList, IonItem, IonInput } from '@ionic/react';
import { checkmarkOutline, trashOutline } from 'ionicons/icons';
import { deleteSession, restoreSession, saveSession } from './db';
import { localInput, parseLocal, type Session, type Settings } from './domain';
import type { Notify } from './Notifications';
import { Feedback, useCancellation } from './UI';

export function SessionEditor({ session, settings, close, notify, opener }: { session: Session | null; settings: Settings; close: () => void; notify: Notify; opener: HTMLElement | null }) {
  const modal = useRef<HTMLIonModalElement>(null), closeButton = useRef<HTMLIonButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const assumptions = useRef<HTMLIonAccordionGroupElement>(null);
  const [assumptionsValue, setAssumptionsValue] = useState<string>();
  const cancellation = useCancellation();
  const powerInput = useRef<HTMLIonInputElement>(null), rateInput = useRef<HTMLIonInputElement>(null);
  const writing = useRef(false);
  const [start, setStart] = useState(localInput(session?.startAt ?? new Date().toISOString()));
  const [end, setEnd] = useState(session?.endAt ? localInput(session.endAt) : '');
  const [power, setPower] = useState(String((session ?? settings).powerWatts / 1000));
  const [rate, setRate] = useState(String((session ?? settings).rateMicrosPerKwh / 1_000_000));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function finish(job: () => Promise<void>) {
    if (writing.current || cancellation.isPending()) return;
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
        if (assumptions.current?.contains(native)) setAssumptionsValue('assumptions');
        // Reveal the accordion before native focus/validation.
        if (assumptions.current?.contains(native)) await new Promise<void>(resolve => setTimeout(resolve, 350));
        native.focus(); native.reportValidity();
        return;
      }
    }
    void finish(async () => {
      await saveSession({ startAt: parseLocal(start, session?.startAt), endAt: end ? parseLocal(end, session?.endAt ?? undefined) : null,
        powerWatts: Math.round(Number(power) * 1000), rateMicrosPerKwh: Math.round(Number(rate) * 1_000_000) }, session ?? undefined);
      notify('Session saved.');
    });
  }
  async function remove(event: MouseEvent<HTMLIonButtonElement>) {
    if (!session || writing.current || !await cancellation.confirm(session, event.currentTarget)) return;
    void finish(async () => {
      const deleted = await deleteSession(session);
      notify(session.state === 'active' ? 'Charge cancelled.' : 'Session deleted.', async () => {
        const restored = await restoreSession(session, deleted.revision);
        notify(restored.state === 'incomplete' && session.state === 'active' ? 'Restored as unfinished; another charge is active.' : 'Charge restored.');
      });
    });
  }
  return <><IonModal ref={modal} isOpen className="session-sheet" aria-label={session ? 'Edit session' : 'Add a session'}
    initialBreakpoint={1} breakpoints={[0, 1]} handle backdropDismiss canDismiss={async () => !writing.current && !cancellation.isPending()}
    onDidPresent={() => closeButton.current?.shadowRoot?.querySelector('button')?.focus()}
    onDidDismiss={() => { close(); if (opener?.isConnected) (opener.shadowRoot?.querySelector<HTMLElement>('button, a') ?? opener).focus(); }}>
    <IonHeader><IonToolbar>
      <IonButtons slot="start"><IonButton ref={closeButton} disabled={busy || cancellation.pending} onClick={() => void modal.current?.dismiss()}>Close</IonButton></IonButtons>
      <IonTitle id="editor-title">{session ? 'Edit session' : 'Add a session'}</IonTitle>
      <IonButtons slot="end">
        {session && <IonButton aria-label="Delete session" color="danger" disabled={busy || cancellation.pending} onClick={remove}><IonIcon slot="icon-only" icon={trashOutline} /></IonButton>}
        <IonButton aria-label="Save session" disabled={busy || cancellation.pending} onClick={() => form.current?.requestSubmit()}><IonIcon slot="icon-only" icon={checkmarkOutline} /></IonButton>
      </IonButtons>
    </IonToolbar></IonHeader>
    <IonContent><form ref={form} className="sheet-body" noValidate onSubmit={save}>
      <label className="native-field">Start<input type="datetime-local" step="1" required value={start} onChange={event => setStart(event.target.value)} disabled={busy || cancellation.pending} /></label>
      <label className="native-field">End<input type="datetime-local" step="1" value={end} onChange={event => setEnd(event.target.value)} disabled={busy || cancellation.pending} /></label>
      <p className="muted">Leave End blank for an unfinished record. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      <IonAccordionGroup ref={assumptions} className="session-assumptions" value={assumptionsValue} onIonChange={event => { if (event.target === event.currentTarget) setAssumptionsValue(event.detail.value); }}><IonAccordion value="assumptions">
        <IonItem slot="header" lines="none"><IonLabel className="ion-text-wrap">Power &amp; electricity rate<span className="muted assumptions-summary">{power || '—'} kW · CAD ${rate || '—'}/kWh</span></IonLabel></IonItem><div slot="content" className="disclosure-content flow">
        <IonList className="settings-fields" lines="full">
          <IonItem><IonInput ref={powerInput} label="Power (kW)" aria-label="Session power (kW)" labelPlacement="start" required type="number" min="0.001" max="1000" step="0.001" value={power} onIonInput={event => setPower(event.detail.value ?? '')} disabled={busy || cancellation.pending} /></IonItem>
          <IonItem><IonInput ref={rateInput} label="Rate (CAD/kWh)" aria-label="Session electricity rate (CAD/kWh)" labelPlacement="start" required type="number" min="0" max="100" step="0.000001" value={rate} onIonInput={event => setRate(event.detail.value ?? '')} disabled={busy || cancellation.pending} /></IonItem>
        </IonList>
        <p className="muted">Used to estimate this session’s energy and cost. Changes apply only to this session; your charging defaults stay the same.</p>
      </div></IonAccordion></IonAccordionGroup>
      {error && <Feedback>{error}</Feedback>}
    </form></IonContent>
  </IonModal>{cancellation.alert}</>;
}
