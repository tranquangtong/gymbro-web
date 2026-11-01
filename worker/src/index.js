// GymBro API on Cloudflare Workers + D1.
// Every request (except /v1/health) carries a Firebase ID token. A user can
// only touch their own rows; the verified admin may pass ?owner=<uid>.
import { verifyIdToken, AuthError } from './auth.js';
import { StoreError, assertKind, listRecords, changesSince, saveRecords, registerUser, listUsers, reconcile, savePhoto, getPhoto, purgeExpiredPhotos, purgeDeletedRecords } from './store.js';

const MAX_BODY = 512 * 1024;

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const headers = { 'vary': 'origin' };
  if (allowed.includes(origin)) Object.assign(headers, {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400'
  });
  return headers;
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) throw new StoreError('Dữ liệu gửi lên quá lớn.', 413);
  const text = await request.text();
  if (text.length > MAX_BODY) throw new StoreError('Dữ liệu gửi lên quá lớn.', 413);
  try { return JSON.parse(text || '{}'); } catch { throw new StoreError('JSON không hợp lệ.'); }
}

// Whose data this request acts on. Only the verified admin may name another UID.
function ownerFor(user, requested) {
  const owner = requested || user.uid;
  if (owner !== user.uid && !user.admin) throw new StoreError('Chỉ admin được mở dữ liệu người khác.', 403, 'forbidden');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(owner)) throw new StoreError('UID không hợp lệ.');
  return owner;
}

export async function handle(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const headers = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const url = new URL(request.url), path = url.pathname, q = url.searchParams;
  try {
    if (path === '/v1/health' && request.method === 'GET') return json({ ok: true }, 200, headers);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = await verifyIdToken(token, { projectId: env.FIREBASE_PROJECT_ID, adminEmail: env.ADMIN_EMAIL, fetchImpl, now });
    const db = env.DB;

    if (path === '/v1/me' && request.method === 'POST') {
      await registerUser(db, user);
      return json({ uid: user.uid, email: user.email, admin: user.admin }, 200, headers);
    }
    if (path === '/v1/admin/users' && request.method === 'GET') {
      if (!user.admin) throw new StoreError('Chỉ admin được xem danh sách tài khoản.', 403, 'forbidden');
      return json({ users: await listUsers(db) }, 200, headers);
    }
    if (path === '/v1/admin/users' && request.method === 'POST') {
      if (!user.admin) throw new StoreError('Chỉ admin được ghi danh bạ tài khoản.', 403, 'forbidden');
      const body = await readJson(request);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(body.uid || ''))) throw new StoreError('UID không hợp lệ.');
      await registerUser(db, { uid: body.uid, email: String(body.email || '').slice(0, 320), name: String(body.display_name || '').slice(0, 200) });
      return json({ ok: true }, 200, headers);
    }
    if (path === '/v1/records' && request.method === 'GET') {
      const owner = ownerFor(user, q.get('owner'));
      return json(await listRecords(db, owner, { kind: q.get('kind'), from: q.get('from') || '', to: q.get('to') || '', cursor: q.get('cursor') || '', limit: q.get('limit') }), 200, headers);
    }
    if (path === '/v1/records' && request.method === 'POST') {
      const body = await readJson(request);
      const owner = ownerFor(user, body.owner);
      assertKind(body.kind);
      return json(await saveRecords(db, owner, body.kind, body.items, now), 200, headers);
    }
    if (path === '/v1/changes' && request.method === 'GET') {
      const owner = ownerFor(user, q.get('owner'));
      return json(await changesSince(db, owner, q.get('since'), q.get('limit')), 200, headers);
    }
    if (path === '/v1/photos' && request.method === 'POST') {
      const body = await readJson(request);
      const owner = ownerFor(user, body.owner);
      return json(await savePhoto(db, owner, body.photo, now), 200, headers);
    }
    const photoPath = path.match(/^\/v1\/photos\/([^/]+)$/);
    if (photoPath && request.method === 'GET') {
      const owner = ownerFor(user, q.get('owner'));
      return json(await getPhoto(db, owner, decodeURIComponent(photoPath[1]), now), 200, headers);
    }
    if (path === '/v1/reconcile' && request.method === 'GET') {
      const owner = ownerFor(user, q.get('owner'));
      return json(await reconcile(db, owner), 200, headers);
    }
    return json({ error: 'Không có endpoint này.' }, 404, headers);
  } catch (e) {
    if (e instanceof AuthError || e instanceof StoreError) return json({ error: e.message, code: e.code || '' }, e.status, headers);
    console.error(e);
    return json({ error: 'Máy chủ GymBro gặp lỗi. Thử lại sau.' }, 500, headers);
  }
}

export async function scheduled(env, now = Date.now()) {
  const photos = await purgeExpiredPhotos(env.DB, now);
  const records = await purgeDeletedRecords(env.DB, now);
  console.log(`Removed ${photos} expired photos and ${records} records deleted over 60 days ago`);
  return { photos, records };
}

export default {
  fetch: (request, env) => handle(request, env),
  // Daily cron (wrangler.toml [triggers]): delete photos older than 7 days and records
  // soft-deleted more than 60 days ago.
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(env, event.scheduledTime || Date.now()))
};
