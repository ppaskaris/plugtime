import { useState } from 'react';
import { IonButton } from '@ionic/react';
import { applyImport, reviewImport, type ImportReview } from './imports';
import { download, makeBackup } from './exports';

export function ImportPanel() {
  const [review, setReview] = useState<ImportReview>();
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="divider stack">
    <h3>Import JSON backup</h3>
    <p>Review missing records before adding them. Existing records, edits, conflicts and deletions are kept. Cloud differences require conflict review after sync. Defaults are restored only to an empty, unconfigured local store.</p>
    <label className="native-field">Choose PlugTime JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; setReview(undefined); setError(''); setMessage('');
      if (!file) return;
      setBusy(true);
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Backup is too large (maximum 10 MB).');
        setReview(await reviewImport(await file.text()));
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not read backup.'); }
      finally { setBusy(false); }
    }} /></label>
    {review && <>
      <p role="status">{review.rows.filter(r => r.action === 'add').length} to add, {review.rows.filter(r => r.action === 'skip' && !r.deletionPreserved).length} already present, {review.rows.filter(r => r.action === 'blocked' && !r.deletionPreserved).length} blocked.{review.rows.some(r => r.deletionPreserved) && ` ${review.rows.filter(r => r.deletionPreserved).length} deletions preserved.`}</p>
      <details><summary>Review records</summary><p>Records are matched by their saved IDs. Start times below help you identify them.</p><ul>{review.rows.map(r => <li key={r.id}>{new Date(r.startAt).toLocaleString()} — {r.deletionPreserved ? 'deletion preserved' : r.action}: {r.reason}</li>)}</ul></details>
      <IonButton fill="outline" disabled={busy || !review.rows.some(r => r.action === 'add')} onClick={async () => {
        setBusy(true); setError('');
        try {
          const before = await makeBackup();
          download('plugtime-before-import.json', JSON.stringify(before, null, 2), 'application/json');
          const rows = await applyImport(review);
          setMessage(`${rows.filter(r => r.action === 'add').length} records added on this device. Keep the downloaded pre-import backup. Check Account & sync for pending changes or conflicts.`);
          setReview(undefined);
        } catch (err) { setError(err instanceof Error ? err.message : 'Import failed.'); }
        finally { setBusy(false); }
      }}>Add missing records</IonButton>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}
