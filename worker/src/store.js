// D1 queries. Every statement is scoped by owner_uid; callers decide which
// owner the authenticated user may act for.
import { cleanRecord, validateArchive } from '../../migration.js';
import { validateRecord } from '../../core.js';
import { cleanFood, validateFood } from '../../quick.js';
import { fingerprint } from '../../reconcile.js';
import { validatePhoto } from '../../media.js';
import { PHOTO_RETENTION_MS } from '../../photo-retention.js';

export const DATED_KINDS = ['WebMeals', 'WebWorkouts', 'WebProfile', 'Archive'];
export const KINDS = [...DATED_KINDS, 'FoodLibrary'];
export const MAX_PAGE = 1000;
export const MAX_WRITE = 100;
const MAX_RECORD = 64 * 1024;

export class StoreError extends Error {
  constructor(message, status = 400, code = '') { super(message); this.status = status; this.code = code; }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[-a-zA-Z0-9_]{1,128}$/;
export function assertKind(kind) { if (!KINDS.includes(kind)) throw new StoreError('Loại dữ liệu không hợp lệ.'); }
function assertDate(v, label) { if (v !== undefined && v !== null && v !== '' && !DATE.test(v)) throw new StoreError(`${label} phải có dạng YYYY-MM-DD.`); }

// Normal writes get the same cleaning/validation the web app applies.
// Insert-only imports (migration of existing history) are cleaned and shape-checked
// but not re-validated, so legacy rows that Firestore accepted are not rejected.
export function cleanForKind(kind, record, { strict = true } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new StoreError('Bản ghi không hợp lệ.');
  try {
    if (kind === 'FoodLibrary') { const food = cleanFood(record); if (strict) validateFood(food); else if (!ID.test(String(food.id || ''))) throw Error('ID món không hợp lệ.'); return food; }
    const clean = cleanRecord(kind, record);
    if (strict) { if (kind === 'Archive') validateArchive(clean); else validateRecord(kind, clean); }
    if (!ID.test(String(clean.id || ''))) throw Error('ID bản ghi không hợp lệ.');
    if (!DATE.test(String(clean.date || ''))) throw Error('Ngày bản ghi không hợp lệ.');
    return clean;
  } catch (e) { throw new StoreError(e.message || 'Bản ghi không hợp lệ.'); }
}

const isDeleted = r => r.deleted === true || String(r.deleted).toLowerCase() === 'true';
const parse = row => ({ ...JSON.parse(row.body), id: row.id, _revision: row.updated_at });

export async function currentSeq(db) {
  return (await db.prepare("SELECT value FROM counters WHERE name = 'seq'").first('value')) ?? 0;
}

// Keyset pagination over (date, id); cursor is opaque base64 of "date|id".
const encodeCursor = (date, id) => btoa(unescape(encodeURIComponent(`${date}|${id}`)));
function decodeCursor(c) {
  if (!c) return null;
  try { const [date, ...rest] = decodeURIComponent(escape(atob(c))).split('|'); return { date, id: rest.join('|') }; }
  catch { throw new StoreError('Cursor không hợp lệ.'); }
}

export async function listRecords(db, owner, { kind, from = '', to = '', cursor = '', limit = 500 }) {
  assertKind(kind); assertDate(from, 'Từ ngày'); assertDate(to, 'Đến ngày');
  const size = Math.max(1, Math.min(MAX_PAGE, Number(limit) || 500));
  const seq = await currentSeq(db); // read before rows so a later change is never skipped by /changes
  const where = ['owner_uid = ?1', 'kind = ?2'], args = [owner, kind];
  if (from) { args.push(from); where.push(`date >= ?${args.length}`); }
  if (to) { args.push(to); where.push(`date <= ?${args.length}`); }
  const after = decodeCursor(cursor);
  if (after) { args.push(after.date, after.id); where.push(`(date > ?${args.length - 1} OR (date = ?${args.length - 1} AND id > ?${args.length}))`); }
  args.push(size + 1);
  const { results } = await db.prepare(`SELECT id, date, updated_at, body FROM records WHERE ${where.join(' AND ')} ORDER BY date, id LIMIT ?${args.length}`).bind(...args).all();
  const page = results.slice(0, size);
  const last = page.at(-1);
  return { rows: page.map(parse), next_cursor: results.length > size ? encodeCursor(last.date, last.id) : null, seq };
}

export async function changesSince(db, owner, since, limit = 500) {
  const size = Math.max(1, Math.min(MAX_PAGE, Number(limit) || 500));
  const from = Math.max(0, Number(since) || 0);
  const { results } = await db.prepare('SELECT kind, id, date, updated_at, body, seq FROM records WHERE owner_uid = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3').bind(owner, from, size + 1).all();
  const page = results.slice(0, size);
  // Rows sharing one seq are written by one batch; never cut a batch in half.
  const cut = results.length > size ? page.filter(r => r.seq < results[size].seq) : page;
  if (results.length > size && !cut.length) throw new StoreError('Lô thay đổi quá lớn để đồng bộ.', 500);
  const next = cut.length ? cut.at(-1).seq : from;
  return { changes: cut.map(r => ({ kind: r.kind, row: parse(r) })), seq: next, more: results.length > size };
}

// items: [{ record, expected?: string, insertOnly?: boolean }]
// expected → the stored updated_at must equal it (fails the whole batch otherwise).
// insertOnly → keep an existing row untouched (import, safe to retry).
// newerOnly → insert, or replace only when the incoming updated_at is later (migration re-runs).
export async function saveRecords(db, owner, kind, items) {
  assertKind(kind);
  if (!Array.isArray(items) || !items.length || items.length > MAX_WRITE) throw new StoreError(`Mỗi lần lưu từ 1 đến ${MAX_WRITE} mục.`);
  const cleans = items.map(i => ({ ...i, clean: cleanForKind(kind, i?.record, { strict: !i?.insertOnly && !i?.newerOnly }) }));
  if (new Set(cleans.map(c => c.clean.id)).size !== cleans.length) throw new StoreError('Trùng ID trong lần lưu.');
  const stmts = [db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'seq'")];
  const seqExpr = "(SELECT value FROM counters WHERE name = 'seq')";
  const writeIndex = [];
  for (const { clean, expected, insertOnly, newerOnly } of cleans) {
    const body = JSON.stringify(clean);
    if (body.length > MAX_RECORD) throw new StoreError('Bản ghi quá lớn.', 413);
    const date = kind === 'FoodLibrary' ? '' : clean.date, updated = String(clean.updated_at || ''), del = isDeleted(clean) ? 1 : 0;
    if (expected !== undefined && expected !== null && expected !== '') {
      stmts.push(db.prepare('INSERT INTO revision_guard (ok) SELECT coalesce((SELECT updated_at FROM records WHERE owner_uid = ?1 AND kind = ?2 AND id = ?3) = ?4, 0)').bind(owner, kind, clean.id, String(expected)));
    }
    const update = 'ON CONFLICT (owner_uid, kind, id) DO UPDATE SET date = excluded.date, updated_at = excluded.updated_at, deleted = excluded.deleted, body = excluded.body, seq = excluded.seq';
    const conflict = insertOnly ? 'ON CONFLICT (owner_uid, kind, id) DO NOTHING' : newerOnly ? update + ' WHERE excluded.updated_at > records.updated_at' : update;
    writeIndex.push(stmts.length);
    stmts.push(db.prepare(`INSERT INTO records (owner_uid, kind, id, date, updated_at, deleted, body, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ${seqExpr}) ${conflict}`).bind(owner, kind, clean.id, date, updated, del, body));
  }
  stmts.push(db.prepare('DELETE FROM revision_guard'));
  let results;
  try { results = await db.batch(stmts); }
  catch (e) {
    if (/CHECK constraint failed/i.test(String(e?.message || e?.cause?.message || ''))) throw new StoreError('Mục này đã được sửa trên thiết bị khác. Hãy làm mới rồi mở lại.', 409, 'conflict');
    throw e;
  }
  const written = writeIndex.map(i => (results[i]?.meta?.changes ?? 0) > 0);
  return {
    saved: cleans.filter((_, i) => written[i]).map(c => c.clean.id),
    skipped: cleans.filter((_, i) => !written[i]).map(c => c.clean.id),
    seq: await currentSeq(db)
  };
}

export async function registerUser(db, user) {
  await db.prepare('INSERT INTO users (uid, email, display_name, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (uid) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at')
    .bind(user.uid, user.email || '', user.name || '', new Date().toISOString()).run();
}
export async function listUsers(db) {
  const { results } = await db.prepare('SELECT uid, email, display_name, updated_at FROM users ORDER BY email LIMIT 1000').all();
  return results;
}

// Per-kind count and SHA-256 over sorted "id|updated_at|deleted" lines, so the
// migration tool can compare Firestore and D1 without shipping every row back.
export async function reconcile(db, owner) {
  const out = {};
  for (const kind of KINDS) {
    const { results } = await db.prepare('SELECT id, updated_at, deleted FROM records WHERE owner_uid = ?1 AND kind = ?2 ORDER BY id').bind(owner, kind).all();
    out[kind] = { count: results.length, hash: await fingerprint(results) };
  }
  return out;
}

// Meal photos: immutable once stored, readable by the owner (or admin) on any device for 7 days.
export async function savePhoto(db, owner, photo, now = Date.now()) {
  let p;
  try { p = validatePhoto(photo); } catch (e) { throw new StoreError(e.message || 'Ảnh không hợp lệ.'); }
  const created = Date.parse(p.created_at);
  // Never trust a client clock to extend retention: at most 7 days from now.
  const expires = Math.min(Number.isFinite(created) ? created + PHOTO_RETENTION_MS : Infinity, now + PHOTO_RETENTION_MS);
  if (expires <= now) throw new StoreError('Ảnh đã quá hạn lưu 7 ngày.', 410, 'photo/expired');
  const r = await db.prepare('INSERT INTO photos (owner_uid, id, meal_id, data_url, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (owner_uid, id) DO NOTHING')
    .bind(owner, p.id, p.meal_id, p.data_url, p.created_at, expires).run();
  return { saved: (r.meta?.changes ?? 0) > 0, expires_at: expires };
}
export async function getPhoto(db, owner, id, now = Date.now()) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(id || ''))) throw new StoreError('ID ảnh không hợp lệ.');
  const row = await db.prepare('SELECT id, meal_id, data_url, created_at, expires_at FROM photos WHERE owner_uid = ?1 AND id = ?2 AND expires_at > ?3').bind(owner, id, now).first();
  if (!row) throw new StoreError('Ảnh không còn được lưu (ảnh chỉ giữ 7 ngày).', 404, 'photo/not-found');
  return { id: row.id, meal_id: row.meal_id, data_url: row.data_url, created_at: row.created_at };
}
export async function purgeExpiredPhotos(db, now = Date.now()) {
  const r = await db.prepare('DELETE FROM photos WHERE expires_at <= ?1').bind(now).run();
  return r.meta?.changes ?? 0;
}
