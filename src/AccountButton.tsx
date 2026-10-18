import { IonAvatar, IonBadge, IonButton, IonIcon, IonSpinner } from '@ionic/react';
import { alertOutline, checkmarkOutline, cloudOfflineOutline, personOutline } from 'ionicons/icons';
import type { CloudSync } from './CloudPanel';

export function AccountButton({ service, open }: { service: CloudSync; open: () => void }) {
  const { data, label, online, syncing } = service;
  const cloud = data?.cloud, pending = data?.pending ?? 0;
  const attention = !!data?.conflicts.length || cloud?.status === 'auth' || cloud?.status === 'error' || cloud?.status === 'conflict';
  const offline = !online || cloud?.status === 'offline';
  return <IonButton className="account-badge" aria-label={`Account & sync: ${label}`} title={label} onClick={open}>
    <span className="account-indicator" aria-hidden="true">
      <IonAvatar>{cloud?.identity ? <span>{cloud.identity.email.slice(0, 1).toUpperCase()}</span> : <IonIcon icon={personOutline} />}</IonAvatar>
      <IonBadge className={`account-status ${attention ? 'needs-attention' : ''}`}>
        {attention ? <IonIcon icon={alertOutline} /> : syncing ? <IonSpinner name="crescent" /> : offline ? <IonIcon icon={cloudOfflineOutline} /> : pending ? (pending > 99 ? '99+' : pending) : <IonIcon icon={cloud?.lastSuccessAt && cloud.enabled ? checkmarkOutline : cloudOfflineOutline} />}
      </IonBadge>
      {pending > 0 && (attention || syncing || offline) && <IonBadge className="account-count">{pending > 99 ? '99+' : pending}</IonBadge>}
    </span>
  </IonButton>;
}
