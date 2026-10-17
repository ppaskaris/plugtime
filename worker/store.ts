import { parseSession, type Upload } from '../src/protocol';
import type { Session } from '../src/domain';

export async function snapshot(database: D1Database): Promise<Session[]> {
  const rows = await database.prepare('SELECT body FROM sessions ORDER BY id LIMIT 10001').all<{ body: string }>();
  if (rows.results.length > 10000) throw new Error('Snapshot exceeds supported size.');
  return rows.results.map(row => parseSession(JSON.parse(row.body)));
}
export async function applyMutation(database: D1Database, upload: Upload) {
  const serialized = JSON.stringify(upload);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))), byte => byte.toString(16).padStart(2, '0')).join('');
  async function receipt() {
    const row = await database.prepare('SELECT digest, body FROM mutation_receipts WHERE id = ?').bind(upload.id).first<{digest: string; body: string}>();
    if (!row) return null;
    return row.digest === digest ? { status: 200, session: parseSession(JSON.parse(row.body)) } : { status: 409, error: 'mutation_id_reused' };
  }
  const existing = await receipt(); if (existing) return existing;
  const revision = upload.baseServerRevision + 1;
  const session: Session = { ...upload.snapshot, serverRevision: revision, revision };
  try {
    await database.prepare('INSERT INTO mutation_receipts(id, digest, session_id, base_revision, body, received_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(upload.id, digest, session.id, upload.baseServerRevision, JSON.stringify(session), new Date().toISOString()).run();
    return { status: 200, session };
  } catch (error) {
    const concurrentReceipt = await receipt(); if (concurrentReceipt) return concurrentReceipt;
    const message = error instanceof Error ? error.message : String(error);
    if (!/revision_conflict|UNIQUE constraint failed/.test(message)) throw error;
    const row = await database.prepare('SELECT body FROM sessions WHERE id = ?').bind(session.id).first<{body: string}>();
    const blocker = session.state === 'active' ? await database.prepare("SELECT body FROM sessions WHERE json_extract(body, '$.state') = 'active'").first<{body: string}>() : null;
    return { status: 409, error: blocker && !row ? 'active_conflict' : 'revision_conflict',
      remote: row ? parseSession(JSON.parse(row.body)) : null, active: blocker ? parseSession(JSON.parse(blocker.body)) : null };
  }
}
