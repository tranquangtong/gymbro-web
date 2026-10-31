import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle } from '../worker/src/index.js';
import { resetKeyCache, JWKS_URL } from '../worker/src/auth.js';

// Minimal D1 stand-in over node:sqlite: same prepare/bind/first/all/run/batch shape,
// batch runs in one transaction like D1.
class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  async first(col) { const row = this.db.prepare(this.sql).get(...this.args); return row ? (col ? row[col] : { ...row }) : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(r => ({ ...r })) }; }
  async run() { return this._run(); }
  _run() {
    if (/^\s*select/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args), meta: { changes: 0 } };
    const r = this.db.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(r.changes) } };
  }
}
export class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec(readFileSync(new URL('../worker/migrations/0001_init.sql', import.meta.url), 'utf8')); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { this.db.exec('BEGIN'); try { const out = stmts.map(s => s._run()); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
}

export const PROJECT = 'gymbro-web', ADMIN = 'tongquangtran@gmail.com', ORIGIN = 'https://tranquangtong.github.io';
const b64url = buf => Buffer.from(buf).toString('base64url');
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
export const otherKeys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
export const NOW = Date.parse('2026-10-31T10:00:00Z'), T = Math.floor(NOW / 1000);
export async function token(claims = {}, { key = keys.privateKey, kid = 'k1' } = {}) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const p = b64url(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'user-a', email: 'a@example.com', email_verified: true, iat: T - 10, exp: T + 3000, auth_time: T - 3600, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
export const fetchImpl = async url => { assert.equal(url, JWKS_URL); return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } }); };
export const env = () => ({ DB: new D1(), FIREBASE_PROJECT_ID: PROJECT, ADMIN_EMAIL: ADMIN, ALLOWED_ORIGINS: ORIGIN });
export async function call(e, method, path, { tok, body } = {}) {
  resetKeyCache();
  const res = await handle(new Request('https://api.test' + path, { method, headers: { origin: ORIGIN, ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }), e, { fetchImpl, now: NOW });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

// fetch() replacement that routes straight into the Worker, for client tests.
export const workerFetch = e => async (url, init = {}) => { resetKeyCache(); return handle(new Request(url, { ...init, headers: { origin: ORIGIN, ...(init.headers || {}) } }), e, { fetchImpl, now: NOW }); };
