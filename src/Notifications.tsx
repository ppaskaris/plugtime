import { useEffect, useRef, useState } from 'react';
import { IonToast } from '@ionic/react';

export interface Notice { id: number; message: string; undo?: () => Promise<void> }
export type Notify = (message: string, undo?: () => Promise<void>) => void;
export function useNotifications() {
  const [queue, setQueue] = useState<Notice[]>([]);
  const sequence = useRef(0);
  const notify: Notify = (message, undo) => setQueue(items => [...items, { id: ++sequence.current, message, undo }]);
  return { queue, notify, remove: (id: number) => setQueue(items => items.filter(item => item.id !== id)) };
}

export function Notifications({ notice, remove, onError }: { notice?: Notice; remove: (id: number) => void; onError: (message: string) => void }) {
  const toast = useRef<HTMLIonToastElement>(null);
  const remaining = useRef(0), shown = useRef(false), running = useRef(false);
  const pauses = useRef(new Set<string>());
  useEffect(() => {
    remaining.current = notice?.undo ? 8000 : 3000;
    shown.current = false; pauses.current.clear();
    let last = performance.now();
    const resumed = () => { last = performance.now(); };
    const released = () => pauses.current.delete('touch');
    document.addEventListener('visibilitychange', resumed);
    window.addEventListener('pointerup', released); window.addEventListener('pointercancel', released);
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now - last; last = now;
      if (!shown.current || document.hidden || pauses.current.size || running.current) return;
      remaining.current -= elapsed;
      if (remaining.current <= 0) { shown.current = false; void toast.current?.dismiss(); }
    }, 100);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resumed); window.removeEventListener('pointerup', released); window.removeEventListener('pointercancel', released); };
  }, [notice?.id]);
  if (!notice) return null;
  return <IonToast key={notice.id} ref={toast} isOpen message={notice.message + (notice.undo ? ' Undo available.' : '')}
    cssClass="app-notice" position="bottom" positionAnchor="main-tabs" duration={0}
    onDidPresent={() => { shown.current = true; }} onDidDismiss={() => remove(notice.id)}
    onPointerEnter={() => pauses.current.add('hover')} onPointerLeave={() => pauses.current.delete('hover')}
    onPointerDown={() => pauses.current.add('touch')} onPointerUp={() => pauses.current.delete('touch')}
    onPointerCancel={() => pauses.current.delete('touch')}
    onFocusCapture={() => pauses.current.add('focus')} onBlurCapture={() => pauses.current.delete('focus')}
    buttons={notice.undo ? [{ text: 'Undo', handler: () => {
      if (running.current) return false;
      running.current = true;
      void notice.undo!().catch(error => onError(error instanceof Error ? error.message : 'Undo failed. Review History and Account & sync.'))
        .finally(() => { running.current = false; void toast.current?.dismiss(); });
      return false;
    } }, { text: 'Close', role: 'cancel' }] : [{ text: 'Close', role: 'cancel' }]} />;
}
