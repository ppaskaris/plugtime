import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, afterEach, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { applyMutation, snapshot } from '../../worker/store';
import { authorize } from '../../worker/auth';
import { defaults, type Session } from '../../src/domain';
import { parseUpload } from '../../src/protocol';
let mf: Miniflare;
let database: D1Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch() {return new Response("test");}}', d1Databases:['DB'] }));
  database = await mf.getD1Database('DB');
  const sql = await readFile('migrations/0001_sync.sql','utf8');
  await database.exec(sql.replaceAll(/--[^\n]*/g, '').replaceAll(/\r?\n/g, ' '));
});
afterEach(async () => { await database.batch([database.prepare('DELETE FROM mutation_receipts'),database.prepare('DELETE FROM sessions')]); });
afterAll(async () => { await mf?.dispose(); });
function session(): Session { const start = '2026-01-01T12:00:00.000Z'; return { ...defaults,id:crypto.randomUUID(),startAt:start,endAt:'2026-01-01T13:00:00.000Z',state:'completed',createdAt:start,updatedAt:start,revision:1,serverRevision:0 }; }

it('uses real D1 to deduplicate retries and atomically reject stale revisions', async () => {
  const first = session(); const upload = {id:crypto.randomUUID(),baseServerRevision:0,snapshot:first};
  const [one,two] = await Promise.all([applyMutation(database, upload),applyMutation(database,upload)]);
  expect(one.status).toBe(200); expect(two.status).toBe(200);
  expect((await snapshot(database))[0].serverRevision).toBe(1);
  const stale = await applyMutation(database,{...upload,id:crypto.randomUUID()});
  expect(stale.status).toBe(409);
  expect(await database.prepare('SELECT COUNT(*) as count FROM mutation_receipts').first('count')).toBe(1);
  const update = await applyMutation(database,{...upload,id:crypto.randomUUID(),baseServerRevision:1,snapshot:{...first,state:'deleted'}});
  expect(update.status).toBe(200);
  expect((await snapshot(database))[0].state).toBe('deleted');
});

it('rejects reusing a mutation ID with a different payload', async () => {
  const upload = {id:crypto.randomUUID(),baseServerRevision:0,snapshot:session()};
  await applyMutation(database,upload);
  expect((await applyMutation(database,{...upload,snapshot:{...upload.snapshot,powerWatts:7000}})).status).toBe(409);
});

it('rejects simultaneous active sessions and rolls back the failed receipt', async () => {
  const first: Session = {...session(),state:'active',endAt:null};
  expect((await applyMutation(database,{id:crypto.randomUUID(),baseServerRevision:0,snapshot:first})).status).toBe(200);
  const failed = await applyMutation(database,{id:crypto.randomUUID(),baseServerRevision:0,snapshot:{...first,id:crypto.randomUUID()}});
  expect(failed.status).toBe(409);
  expect('active' in failed && failed.active?.id).toBe(first.id);
  expect(await database.prepare('SELECT COUNT(*) as count FROM mutation_receipts').first('count')).toBe(1);
});

it('validates request shapes, units and completed duration', () => {
  const valid = {id:crypto.randomUUID(),baseServerRevision:0,snapshot:session()};
  expect(parseUpload(valid)).toEqual(valid);
  expect(()=>parseUpload({...valid,baseServerRevision:-1})).toThrow();
  expect(()=>parseUpload({...valid,snapshot:{...valid.snapshot,powerWatts:0}})).toThrow();
  expect(()=>parseUpload({...valid,snapshot:{...valid.snapshot,endAt:'2026-01-01T12:00:30.000Z'}})).toThrow();
});

it('verifies signed JWTs and rejects expired, forged, wrong-audience and wrong-identity tokens', async () => {
  const env = {ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',ACCESS_AUDIENCE:'test-audience',ALLOWED_EMAIL:'owner@example.com'};
  const keys = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({keys:[{...await exportJWK(keys.publicKey),kid:'test-key'}]});
  async function token(email = env.ALLOWED_EMAIL, audience = env.ACCESS_AUDIENCE, expiry = '1h') {
    return new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(audience).setSubject('test-owner').setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey);
  }
  const request = (value: string) => new Request('https://app.example/api/snapshot',{headers:{'Cf-Access-Jwt-Assertion':value}});
  expect(await authorize(request(await token()),env,jwks)).toBe(true);
  expect(await authorize(request(await token('other@example.com')),env,jwks)).toBe(false);
  expect(await authorize(request(await token(env.ALLOWED_EMAIL,'wrong')),env,jwks)).toBe(false);
  expect(await authorize(request(await token(env.ALLOWED_EMAIL,env.ACCESS_AUDIENCE,'-1h')),env,jwks)).toBe(false);
  expect(await authorize(request('forged'),env,jwks)).toBe(false);
  expect(await authorize(request(await token()),{...env,ACCESS_AUDIENCE:''},jwks)).toBe(false);
});
