import { useEffect, useRef, useState } from 'react';
import { IonButton, IonList, IonItem, IonInput } from '@ionic/react';
import { saveSettings } from './db';
import type { Settings } from './domain';
import { download, historyCsv, makeBackup } from './exports';
import { ImportPanel } from './ImportPanel';
import { Disclosure, Surface } from './UI';
import type { useAppUpdates } from './useAppUpdates';

export function SettingsPanel({ settings, act, updates, offlineReady, updateBlocked }: { settings: Settings; act: (job: () => Promise<unknown>, message: string) => Promise<void>; updates: ReturnType<typeof useAppUpdates>; offlineReady: boolean; updateBlocked: boolean }) {
  const powerInput = useRef<HTMLIonInputElement>(null), rateInput = useRef<HTMLIonInputElement>(null);
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
  return <div className="settings-stack">
    <Surface className="settings-section"><h2>Charging defaults</h2>
    <form className="flow" onSubmit={async e => {
      e.preventDefault();
      for (const field of [powerInput, rateInput]) {
        const input = await field.current?.getInputElement();
        if (input && !input.reportValidity()) return;
      }
      void act(() => saveSettings({ powerWatts: Math.round(Number(power) * 1000), rateMicrosPerKwh: Math.round(Number(rate) * 1_000_000) }), 'Defaults saved. Existing sessions keep their assumptions.');
    }}>
      <IonList className="settings-fields" lines="full">
        <IonItem><IonInput ref={powerInput} label="Power (kW)" aria-label="Charging power (kW)" labelPlacement="start" required type="number" min="0.001" max="1000" step="0.001" value={power} onIonInput={event => setPower(event.detail.value ?? '')} /></IonItem>
        <IonItem><IonInput ref={rateInput} label="Rate (CAD/kWh)" aria-label="Electricity rate (CAD/kWh)" labelPlacement="start" required type="number" min="0" max="100" step="0.000001" value={rate} onIonInput={event => setRate(event.detail.value ?? '')} /></IonItem>
      </IonList>
      <p className="muted">These defaults apply to new sessions. Consumption and cost assume continuous charging and are estimates.</p>
      <IonButton className="settings-action" type="submit">Save defaults</IonButton>
    </form>
    </Surface><Surface className="settings-section"><h2>Data</h2><div className="flow"><h3>Backups</h3><p>Saved on this device. Check Account & sync for synchronization status. Export JSON regularly to keep a complete copy.</p>
      <div className="actions">
        <IonButton fill="outline" onClick={() => void act(async () => { const backup = await makeBackup(); download('plugtime-backup.json', JSON.stringify(backup, null, 2), 'application/json'); }, 'JSON export prepared. Save it somewhere safe.')}>Export JSON</IonButton>
        <IonButton fill="outline" onClick={() => void act(async () => { const backup = await makeBackup(); download('plugtime-history.csv', historyCsv(backup.sessions), 'text/csv;charset=utf-8'); }, 'CSV export prepared.')}>Export CSV</IonButton>
      </div>
    </div>
    <Disclosure title="Import JSON backup"><ImportPanel /></Disclosure></Surface>
    <Surface className="settings-section"><h2>App</h2><p>{offlineReady ? 'Ready for offline use' : 'Offline setup pending — reopen online to finish caching the app.'}</p><div className="app-updates"><h3>App updates</h3><p>PlugTime checks for updates when opened, resumed or reconnected. Pull to refresh to check anytime.</p>
      {updates.needRefresh && <div className="settings-update flow" role="region" aria-label="Available app update"><p>An app update is ready.{updateBlocked ? ' Finish charging and close the editor to install.' : ''}</p><IonButton className="settings-action" disabled={updateBlocked} onClick={() => updates.install()}>Install update</IonButton></div>}
      <IonButton className="settings-action" fill="outline" disabled={updates.checking} onClick={() => void updates.check(true)}>{updates.checking ? 'Checking for updates…' : 'Check for app updates'}</IonButton>
      {updates.message && <p className="update-message" role="status">{updates.message}</p>}
    </div>
    <div className="divider"><p>{storage}</p><IonButton fill="outline" onClick={() => void act(async () => {
      const granted = await navigator.storage?.persist?.();
      setStorage(granted ? 'Persistent storage granted.' : 'Persistent storage was not granted. Keep exporting backups.');
    }, 'Storage request completed.')}>Request persistent storage</IonButton></div>
    <p className="muted">On iPhone, use Safari’s Share menu → Add to Home Screen. Open PlugTime online once and wait for “Ready for offline use” before entering the garage.</p>
    </Surface>
  </div>;
}

