import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { IonApp, IonPage, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet, IonRefresher, IonRefresherContent, IonModal } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, Routes } from 'react-router-dom';
import { flashOutline, timeOutline, barChartOutline, settingsOutline, addOutline, cloudDownloadOutline } from 'ionicons/icons';
import { db, deleteSession, getSettings, restoreSession } from './db';
import { defaults, type Session } from './domain';
import { useCloudSync, AccountPanel } from './CloudPanel';
import { useAppUpdates } from './useAppUpdates';
import { useNotifications, Notifications } from './Notifications';
import { SessionEditor } from './SessionEditor';
import { Charging, History, Statistics, SettingsScreen } from './Screens';
import { AccountButton } from './AccountButton';
import { useSafeArea } from './useSafeArea';

function useController() {
  useSafeArea();
  const cloud = useCloudSync(), updates = useAppUpdates(), notices = useNotifications();
  const [editor, setEditor] = useState<Session | null | undefined>();
  const opener = useRef<HTMLElement | null>(null);
  const [account, setAccount] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [now, setNow] = useState(Date.now()), [controlled, setControlled] = useState(!!navigator.serviceWorker?.controller);
  const data = useLiveQuery(async () => {
    try { return { sessions: await db.sessions.orderBy('startAt').reverse().toArray(), settings: await getSettings(), error: '' }; }
    catch (error) { return { sessions: [], settings: defaults, error: error instanceof Error ? error.message : 'Could not open your log.' }; }
  }, []);
  useEffect(() => {
    const update = () => { if (!document.hidden) setNow(Date.now()); };
    const worker = () => setControlled(!!navigator.serviceWorker?.controller);
    const timer = window.setInterval(update, 1000);
    window.addEventListener('pageshow', update); document.addEventListener('visibilitychange', update);
    navigator.serviceWorker?.addEventListener('controllerchange', worker);
    return () => { clearInterval(timer); window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update); navigator.serviceWorker?.removeEventListener('controllerchange', worker); };
  }, []);
  async function act<T>(job: () => Promise<T>, message: string | ((result: T) => string)) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const result = await job(); const text = typeof message === 'function' ? message(result) : message; if (text) notices.notify(text); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function edit(session: Session | null) { opener.current = document.activeElement as HTMLElement; setEditor(session); }
  function undo(original: Session, deleted: Session, message: string) {
    notices.notify(message, async () => {
      const restored = await restoreSession(original, deleted.revision);
      notices.notify(original.state === 'active' && restored.state === 'incomplete' ? 'Restored as unfinished; another charge is active.' : 'Charge restored.');
    });
  }
  async function remove(session: Session) {
    await act(async () => { const deleted = await deleteSession(session); undo(session, deleted, session.state === 'active' ? 'Charge cancelled.' : 'Session deleted.'); }, '');
  }
  return { data, sessions: data?.sessions.filter(session => session.state !== 'deleted') ?? [], settings: data?.settings ?? defaults,
    cloud, updates, notices, editor, setEditor, opener, edit, account, setAccount, error, setError, busy, now, controlled, act, undo, remove };
}
const ModelContext = createContext<ReturnType<typeof useController> | null>(null);
export function useAppModel() { const model = useContext(ModelContext); if (!model) throw new Error('App context missing'); return model; }

function Page({ title, children, add = false }: { title: string; children: ReactNode; add?: boolean }) {
  const app = useAppModel();
  const active = app.sessions.some(session => session.state === 'active');
  const failed = app.error || app.data?.error;
  return <IonPage>
    <IonHeader className="main-header"><IonToolbar><IonTitle>{title}</IonTitle><IonButtons slot="end">
      {add && <IonButton aria-label="Add a session" onClick={() => app.edit(null)}><IonIcon slot="icon-only" icon={addOutline} /></IonButton>}
      {app.updates.needRefresh && <IonButton className="toolbar-update" aria-label="Install app update" title={active || app.editor !== undefined ? 'Finish charging and close the editor to install the update' : 'Install app update'} disabled={active || app.editor !== undefined || app.busy} onClick={() => app.updates.install()}><IonIcon slot="icon-only" icon={cloudDownloadOutline} /></IonButton>}
      <AccountButton service={app.cloud} open={() => app.setAccount(true)} />
    </IonButtons></IonToolbar></IonHeader>
    <IonContent forceOverscroll>
      <IonRefresher slot="fixed" onIonRefresh={event => { void Promise.allSettled([app.cloud.sync(), app.updates.check(true)]).finally(() => event.detail.complete()); }}><IonRefresherContent pullingText="Pull to refresh" refreshingText="Checking…" /></IonRefresher>
      <main className="page-body">
        {failed && <div className="error" role="alert"><p>{failed}</p><button onClick={() => app.setError('')}>Dismiss</button></div>}
        {!app.data ? <p>Opening your charging log…</p> : app.data.error ? <p>Reopen the app and check device storage. No changes have been saved.</p> : children}
      </main>
    </IonContent>
  </IonPage>;
}

const tabs = [ ['charging', 'Charging', flashOutline], ['history', 'History', timeOutline], ['statistics', 'Statistics', barChartOutline], ['settings', 'Settings', settingsOutline] ];
export function App() {
  const app = useController();
  const accountModal = useRef<HTMLIonModalElement>(null), accountClose = useRef<HTMLIonButtonElement>(null);
  return <IonApp><ModelContext.Provider value={app}><IonReactRouter>
    <IonTabs><IonRouterOutlet animated={false}><Routes>
      <Route path="/charging" element={<Page title="Charging"><Charging /></Page>} />
      <Route path="/history" element={<Page title="History" add><History /></Page>} />
      <Route path="/statistics" element={<Page title="Statistics"><Statistics /></Page>} />
      <Route path="/settings" element={<Page title="Settings"><SettingsScreen /></Page>} />
      <Route path="/" element={<Navigate to="/charging" replace />} />
      <Route path="*" element={<Navigate to="/charging" replace />} />
    </Routes></IonRouterOutlet>
      <IonTabBar slot="bottom" id="main-tabs" aria-label="Main navigation">{tabs.map(([id, label, icon]) => <IonTabButton key={id} tab={id} href={`/${id}`}><IonIcon aria-hidden="true" icon={icon} /><IonLabel>{label}</IonLabel></IonTabButton>)}</IonTabBar>
    </IonTabs>
  </IonReactRouter>
    <IonModal ref={accountModal} isOpen={app.account} initialBreakpoint={1} breakpoints={[0, 1]} className="account-sheet" aria-label="Account & sync" onDidDismiss={() => app.setAccount(false)} onDidPresent={() => accountClose.current?.shadowRoot?.querySelector('button')?.focus()}>
      <IonHeader><IonToolbar><IonTitle>Account &amp; sync</IonTitle><IonButtons slot="start"><IonButton ref={accountClose} onClick={() => void accountModal.current?.dismiss()}>Close</IonButton></IonButtons></IonToolbar></IonHeader>
      <IonContent><div className="sheet-body"><AccountPanel service={app.cloud} /></div></IonContent>
    </IonModal>
    {app.editor !== undefined && <SessionEditor session={app.editor} settings={app.settings} opener={app.opener.current} close={() => app.setEditor(undefined)} notify={app.notices.notify} />}
    <Notifications notice={app.notices.queue[0]} remove={app.notices.remove} onError={app.setError} />
  </ModelContext.Provider></IonApp>;
}
