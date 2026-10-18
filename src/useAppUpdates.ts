import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function useAppUpdates() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [reloadReady, setReloadReady] = useState(false);
  const requested = useRef(false), inFlight = useRef(false);
  const { offlineReady: [offlineReady], needRefresh: [needRefresh, setNeedRefresh] } = useRegisterSW({
    onRegisteredSW: (_url, value) => setRegistration(value),
    // Reload only after this view explicitly approves installation. Another tab's
    // activation must not interrupt a charge, editor, or import review here.
    onNeedReload: () => {},
    onRegisterError: () => setMessage('Offline setup failed. Reopen online to try again. Your saved sessions are still on this device.'),
  });
  useEffect(() => {
    let previous = navigator.serviceWorker?.controller;
    const changed = () => {
      const next = navigator.serviceWorker.controller;
      if (previous && next !== previous) {
        setReloadReady(true);
        if (requested.current) window.location.reload();
      }
      previous = next;
    };
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', changed);
  }, []);
  const check = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    if (!navigator.onLine) { if (manual) setMessage('Go online to check for app updates.'); return; }
    if (!registration) { if (manual) setMessage('Offline setup is not ready. Reopen online to try again.'); return; }
    inFlight.current = true; setChecking(true);
    if (manual) setMessage('');
    try {
      await registration.update();
      if (registration.waiting) setNeedRefresh(true);
      if (manual) setMessage(registration.waiting ? 'An app update is ready to install.' : 'Update check complete. You’ll be notified when an update is ready.');
    } catch { if (manual) setMessage('Could not check for updates. Try again when online.'); }
    finally { inFlight.current = false; setChecking(false); }
  }, [registration, setNeedRefresh]);
  useEffect(() => {
    if (!registration) return;
    let installing: ServiceWorker | null = null;
    const waiting = () => { if (registration.waiting && navigator.serviceWorker.controller) setNeedRefresh(true); };
    const found = () => {
      installing?.removeEventListener('statechange', waiting);
      installing = registration.installing;
      installing?.addEventListener('statechange', waiting);
      waiting();
    };
    const foreground = () => { if (document.visibilityState === 'visible') void check(); };
    registration.addEventListener('updatefound', found); found();
    window.addEventListener('pageshow', foreground); window.addEventListener('online', foreground);
    document.addEventListener('visibilitychange', foreground);
    foreground();
    return () => {
      registration.removeEventListener('updatefound', found); installing?.removeEventListener('statechange', waiting);
      window.removeEventListener('pageshow', foreground); window.removeEventListener('online', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [registration, check, setNeedRefresh]);
  function install() {
    if (reloadReady) { window.location.reload(); return; }
    if (registration?.waiting) {
      requested.current = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }
  return { offlineReady, needRefresh: needRefresh || reloadReady, checking, message, check, install };
}
