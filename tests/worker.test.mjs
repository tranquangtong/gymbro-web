import test from 'node:test';
import assert from 'node:assert/strict';
import { env, call, token, otherKeys, ADMIN, ORIGIN, T } from './worker-env.mjs';
import { fingerprint } from '../reconcile.js';

const meal = (id, date, extra = {}) => ({ id, date, meal: 'lunch', food: 'Phở bò', portion: '1 tô', kcal: 500, protein: 30, carbs: 60, fat: 15, nutrition_source: 'estimate', created_at: date + 'T05:00:00Z', updated_at: date + 'T05:00:00Z', deleted: false, ...extra });

test('rejects missing, forged, foreign-project, expired and over-14-day tokens', async () => {
  const e = env();
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals')).status, 401);
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: await token({}, { key: otherKeys.privateKey }) })).status, 401);
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: await token({ aud: 'other' }) })).status, 401);
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: await token({ exp: T - 120 }) })).status, 401);
  const old = await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: await token({ auth_time: T - 15 * 86400 }) });
  assert.equal(old.status, 401); assert.match(old.body.error, /14 ngày/);
  const ok = await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: await token() });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await call(e, 'GET', '/v1/health')).status, 200);
});

test('scopes data by UID; only the verified admin can act for another owner', async () => {
  const e = env(), a = await token(), b = await token({ sub: 'user-b', email: 'b@example.com' });
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30') }] } })).status, 200);
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: b })).body.rows.length, 0, 'B never sees A');
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals&owner=user-a', { tok: b })).status, 403);
  assert.equal((await call(e, 'POST', '/v1/records', { tok: b, body: { owner: 'user-a', kind: 'WebMeals', items: [{ record: meal('m2', '2026-10-30') }] } })).status, 403);
  const unverified = await token({ sub: 'admin', email: ADMIN, email_verified: false });
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals&owner=user-a', { tok: unverified })).status, 403, 'unverified admin email is not admin');
  const admin = await token({ sub: 'admin', email: ADMIN });
  const seen = await call(e, 'GET', '/v1/records?kind=WebMeals&owner=user-a', { tok: admin });
  assert.deepEqual(seen.body.rows.map(r => r.id), ['m1']);
  const edited = await call(e, 'POST', '/v1/records', { tok: admin, body: { owner: 'user-a', kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30', { food: 'Phở gà', updated_at: '2026-10-30T06:00:00Z' }), expected: '2026-10-30T05:00:00Z' }] } });
  assert.deepEqual(edited.body.saved, ['m1']);
  await call(e, 'POST', '/v1/me', { tok: a });
  assert.equal((await call(e, 'GET', '/v1/admin/users', { tok: a })).status, 403);
  assert.deepEqual((await call(e, 'GET', '/v1/admin/users', { tok: admin })).body.users.map(u => u.uid), ['user-a']);
});

test('date-range queries page by (date, id) with an opaque cursor', async () => {
  const e = env(), a = await token();
  const items = Array.from({ length: 7 }, (_, i) => ({ record: meal('m' + i, `2026-10-2${i}`) }));
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items } });
  const p1 = await call(e, 'GET', '/v1/records?kind=WebMeals&from=2026-10-22&to=2026-10-26&limit=2', { tok: a });
  assert.deepEqual(p1.body.rows.map(r => r.date), ['2026-10-22', '2026-10-23']); assert.ok(p1.body.next_cursor);
  const p2 = await call(e, 'GET', `/v1/records?kind=WebMeals&from=2026-10-22&to=2026-10-26&limit=2&cursor=${encodeURIComponent(p1.body.next_cursor)}`, { tok: a });
  const p3 = await call(e, 'GET', `/v1/records?kind=WebMeals&from=2026-10-22&to=2026-10-26&limit=2&cursor=${encodeURIComponent(p2.body.next_cursor)}`, { tok: a });
  assert.deepEqual([...p2.body.rows, ...p3.body.rows].map(r => r.date), ['2026-10-24', '2026-10-25', '2026-10-26']); assert.equal(p3.body.next_cursor, null);
  assert.equal(p1.body.rows[0]._revision, '2026-10-22T05:00:00Z');
  assert.equal((await call(e, 'GET', '/v1/records?kind=WebMeals&from=26-10-2026', { tok: a })).status, 400);
  // The planner uses the (owner_uid, kind, date, id) index rather than scanning the table.
  const plan = e.DB.db.prepare("EXPLAIN QUERY PLAN SELECT id FROM records WHERE owner_uid = 'a' AND kind = 'WebMeals' AND date >= '2026-10-01' AND date <= '2026-10-31' ORDER BY date, id").all().map(r => r.detail).join(' ');
  assert.match(plan, /records_by_date/);
});

test('revision conflicts abort the whole batch; insert-only import never overwrites and is safe to retry', async () => {
  const e = env(), a = await token();
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30') }, { record: meal('m2', '2026-10-30') }] } });
  const clash = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [
    { record: meal('m1', '2026-10-30', { kcal: 1, updated_at: 'x' }), expected: '2026-10-30T05:00:00Z' },
    { record: meal('m2', '2026-10-30', { kcal: 2, updated_at: 'y' }), expected: 'stale' }] } });
  assert.equal(clash.status, 409);
  const rows = (await call(e, 'GET', '/v1/records?kind=WebMeals', { tok: a })).body.rows;
  assert.deepEqual(rows.map(r => r.kcal), [500, 500], 'neither row changed');
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('gone', '2026-10-30'), expected: 'r' }] } })).status, 409, 'expected revision on a missing row fails');
  const imp = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30', { kcal: 9 }), insertOnly: true }, { record: meal('m3', '2026-10-29'), insertOnly: true }] } });
  assert.deepEqual(imp.body, { saved: ['m3'], skipped: ['m1'], seq: imp.body.seq });
  const again = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m3', '2026-10-29'), insertOnly: true }] } });
  assert.deepEqual(again.body.skipped, ['m3']);
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: { ...meal('bad', '2026-10-30'), kcal: -5 } }] } })).status, 400);
  const legacy = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: { ...meal('old', '2026-01-02'), nutrition_source: undefined }, insertOnly: true }] } });
  assert.deepEqual(legacy.body.saved, ['old'], 'legacy rows Firestore accepted still import');
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: { ...meal('bad2', '2026-01-02'), nutrition_source: undefined } }] } })).status, 400, 'normal writes stay strict');
  const newer = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [
    { record: meal('m1', '2026-10-30', { kcal: 600, updated_at: '2026-10-31T00:00:00Z' }), newerOnly: true },
    { record: meal('m3', '2026-10-29', { kcal: 1, updated_at: '2020-01-01T00:00:00Z' }), newerOnly: true }] } });
  assert.deepEqual([newer.body.saved, newer.body.skipped], [['m1'], ['m3']], 'migration re-run applies later edits only');
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'Nope', items: [{ record: meal('x', '2026-10-30') }] } })).status, 400);
});

test('changes feed returns only rows written after a sequence, including soft deletes', async () => {
  const e = env(), a = await token();
  const first = await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30') }] } });
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebWorkouts', items: [{ record: { id: 'w1', date: '2026-10-30', exercise: 'Lat pulldown', kind: 'strength', sets_json: JSON.stringify([{ weight_kg: 40, reps: 12 }]), created_at: 'c', updated_at: 'u', deleted: false } }] } });
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('m1', '2026-10-30', { deleted: true, updated_at: 'z' }), expected: '2026-10-30T05:00:00Z' }] } });
  const ch = await call(e, 'GET', `/v1/changes?since=${first.body.seq}`, { tok: a });
  assert.deepEqual(ch.body.changes.map(c => [c.kind, c.row.id, c.row.deleted]), [['WebWorkouts', 'w1', false], ['WebMeals', 'm1', true]]);
  assert.equal((await call(e, 'GET', `/v1/changes?since=${ch.body.seq}`, { tok: a })).body.changes.length, 0);
});

test('reconcile fingerprints match the shared client-side fingerprint', async () => {
  const e = env(), a = await token(), rows = [meal('m1', '2026-10-30'), meal('m2', '2026-10-29', { deleted: 'true' })];
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: rows.map(record => ({ record })) } });
  const r = await call(e, 'GET', '/v1/reconcile', { tok: a });
  assert.equal(r.body.WebMeals.count, 2); assert.equal(r.body.WebMeals.hash, await fingerprint(rows)); assert.equal(r.body.FoodLibrary.count, 0);
});

test('photos are shared across devices for 7 days, scoped by owner, and purged by the daily job', async () => {
  const { scheduled } = await import('../worker/src/index.js');
  const e = env(), a = await token(), b = await token({ sub: 'user-b', email: 'b@example.com' });
  const NOW_ISO = new Date(T * 1000).toISOString();
  const photo = { id: 'p1', meal_id: 'm1', data_url: 'data:image/jpeg;base64,AAAA', created_at: NOW_ISO };
  const saved = await call(e, 'POST', '/v1/photos', { tok: a, body: { photo } });
  assert.equal(saved.status, 200); assert.equal(saved.body.saved, true); assert.equal(saved.body.expires_at, T * 1000 + 7 * 86400e3);
  assert.equal((await call(e, 'POST', '/v1/photos', { tok: a, body: { photo: { ...photo, data_url: 'data:image/jpeg;base64,BBBB' } } })).body.saved, false, 'photos are immutable');
  const got = await call(e, 'GET', '/v1/photos/p1', { tok: a });
  assert.deepEqual(got.body, photo);
  assert.equal((await call(e, 'GET', '/v1/photos/p1', { tok: b })).status, 404, 'another user cannot see it');
  assert.equal((await call(e, 'GET', '/v1/photos/p1?owner=user-a', { tok: b })).status, 403);
  assert.equal((await call(e, 'GET', '/v1/photos/p1?owner=user-a', { tok: await token({ sub: 'admin', email: ADMIN }) })).status, 200);
  const old = await call(e, 'POST', '/v1/photos', { tok: a, body: { photo: { ...photo, id: 'old', created_at: new Date((T - 8 * 86400) * 1000).toISOString() } } });
  assert.equal(old.status, 410);
  const future = await call(e, 'POST', '/v1/photos', { tok: a, body: { photo: { ...photo, id: 'fut', created_at: '2099-01-01T00:00:00Z' } } });
  assert.equal(future.body.expires_at, T * 1000 + 7 * 86400e3, 'client clock cannot extend retention');
  assert.equal((await call(e, 'POST', '/v1/photos', { tok: a, body: { photo: { ...photo, id: 'bad', data_url: 'data:image/png;base64,AAAA' } } })).status, 400);
  assert.equal((await scheduled(e, T * 1000 + 6 * 86400e3)).photos, 0);
  assert.equal((await scheduled(e, T * 1000 + 7 * 86400e3 + 1)).photos, 2);
  assert.equal(e.DB.db.prepare('SELECT count(*) n FROM photos').get().n, 0);
});

test('soft-deleted records are removed 60 days after deletion; live and restored rows stay', async () => {
  const { scheduled } = await import('../worker/src/index.js');
  const e = env(), a = await token(), DAY = 86400e3, NOW = T * 1000;
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: ['keep', 'gone', 'back'].map(id => ({ record: meal(id, '2026-10-30') })) } });
  const del = id => ({ record: meal(id, '2026-10-30', { deleted: true, updated_at: 'd-' + id }), expected: '2026-10-30T05:00:00Z' });
  assert.equal((await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [del('gone'), del('back')] } })).status, 200);
  const row = id => e.DB.db.prepare("SELECT deleted, deleted_at FROM records WHERE id = ?").get(id);
  assert.equal(row('gone').deleted_at, NOW, 'server time, not the client clock');
  assert.equal(row('keep').deleted_at, null);
  // Saving a deleted row again keeps its original deletion time; restoring clears it.
  await call(e, 'POST', '/v1/records', { tok: a, body: { kind: 'WebMeals', items: [{ record: meal('gone', '2026-10-30', { deleted: true, updated_at: 'd2' }), expected: 'd-gone' }, { record: meal('back', '2026-10-30', { deleted: false, updated_at: 'r' }), expected: 'd-back' }] } });
  assert.equal(row('gone').deleted_at, NOW); assert.equal(row('back').deleted_at, null);
  assert.equal((await scheduled(e, NOW + 59 * DAY)).records, 0);
  assert.equal((await scheduled(e, NOW + 60 * DAY)).records, 1);
  assert.deepEqual(e.DB.db.prepare('SELECT id FROM records ORDER BY id').all().map(r => r.id), ['back', 'keep']);
});
