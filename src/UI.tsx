import { useRef, useState, type ReactNode } from 'react';
import { IonAccordion, IonAccordionGroup, IonAlert, IonButton, IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/react';
import { MIN_SESSION_MS, type Session } from './domain';

// Ionic owns surfaces and interactions; callers own semantic content and layout.
export function Surface({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return <IonCard className={`app-surface ${className}`} ><IonCardContent role={label ? 'region' : undefined} aria-label={label}>{children}</IonCardContent></IonCard>;
}

export function Feedback({ children, dismiss }: { children: ReactNode; dismiss?: () => void }) {
  return <div className="error" role="alert"><p>{children}</p>{dismiss && <IonButton fill="clear" color="danger" onClick={dismiss}>Dismiss</IonButton>}</div>;
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [value, setValue] = useState<string>();
  return <IonAccordionGroup value={value} onIonChange={event => {
    if (event.target === event.currentTarget) setValue(event.detail.value);
  }}><IonAccordion value="content"><IonItem slot="header" lines="none"><IonLabel className="ion-text-wrap">{title}</IonLabel></IonItem><div slot="content" className="disclosure-content flow">{children}</div></IonAccordion></IonAccordionGroup>;
}

export function useCancellation() {
  const request = useRef<((confirmed: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  function confirm(session: Session, trigger?: HTMLElement): Promise<boolean> {
    if (request.current) return Promise.resolve(false);
    if (session.state !== 'active' || Date.now() - Date.parse(session.startAt) < MIN_SESSION_MS) return Promise.resolve(true);
    opener.current = trigger ?? document.activeElement as HTMLElement;
    return new Promise(resolve => { request.current = resolve; setPending(true); });
  }
  const alert = <IonAlert isOpen={pending} header="Cancel this charge?"
    message="It will not count in your history or statistics."
    buttons={[{ text: 'Keep charging', role: 'cancel' }, { text: 'Cancel charge', role: 'confirm', cssClass: 'alert-destructive' }]}
    onDidDismiss={event => {
      const resolve = request.current; request.current = null; setPending(false);
      const confirmed = event.detail.role === 'confirm';
      // React reenables the host, then Stencil updates its native button.
      if (!confirmed) requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = opener.current;
        if (target?.isConnected) (target.shadowRoot?.querySelector<HTMLElement>('button, a') ?? target).focus();
      }));
      resolve?.(confirmed);
    }} />;
  return { confirm, alert, pending, isPending: () => !!request.current };
}
