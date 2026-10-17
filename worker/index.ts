import { accessConfigured, authorize } from './auth';
import { applyMutation, snapshot } from './store';
import { parseUpload } from '../src/protocol';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' } });
}
async function readUpload(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('Expected application/json.');
  if (Number(request.headers.get('content-length')) > 16_384) throw new Error('Request too large.');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const result = await reader.read(); if (result.done) break;
    length += result.value.byteLength;
    if (length > 16_384) { await reader.cancel(); throw new Error('Request too large.'); }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseUpload(JSON.parse(new TextDecoder().decode(bytes)));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/config' && request.method === 'GET') return json({ enabled: accessConfigured(env) });
    if (!accessConfigured(env)) return json({ error: 'not_configured' }, 503);
    if (!await authorize(request, env)) return json({ error: 'authentication_required' }, 401);
    if (request.method === 'GET' && url.pathname === '/api/login')
      return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
    try {
      if (request.method === 'GET' && url.pathname === '/api/snapshot') return json({ sessions: await snapshot(env.DB) });
      if (request.method === 'POST' && url.pathname === '/api/mutations') {
        if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
          return json({ error: 'invalid_origin' }, 403);
        let upload;
        try { upload = await readUpload(request); } catch { return json({ error: 'invalid_request' }, 400); }
        const result = await applyMutation(env.DB, upload);
        return json(result, result.status);
      }
      return json({ error: 'not_found' }, 404);
    } catch {
      console.error(JSON.stringify({ event: 'api_failure', path: url.pathname }));
      return json({ error: 'server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
