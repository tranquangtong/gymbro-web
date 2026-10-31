import test from 'node:test';
import assert from 'node:assert/strict';
import { env, token, workerFetch, ADMIN } from './worker-env.mjs';
import { CloudflareRepository } from '../cloudflare.js';
import { diffRows } from '../migrate-cloudflare.js';
import { shiftDate, today } from '../core.js';

const meal = (id, date, extra = {}) => ({ id, date, meal: 'lunch', food: 'Phở', portion: '1 tô', kcal: 500, protein: 30, carbs: 60, fat: 15, nutrition_source: 'estimate', created_at: 'c', updated_at: 'u-' + id, deleted: false, ...extra });
async function service(claims = {}) {
  const tok = await token(claims);
  return { sessionExpiresAt: Date.now() + 3600e3, auth: { currentUser: { uid: claims.sub || 'user-a', email: claims.email || 'a@example.com', emailVerified: true, getIdToken: async () => tok } } };
}
const repoFor = async (e, claims, target = null, opts = {}) => new CloudflareRepository(await service(claims), target, { apiBase: 'https://api.test/', fetchImpl: workerFetch(e), ...opts });

test('loads a recent window, pages older dates on demand and never sends other owners data', async () => {
  const e = env(), repo = await repoFor(e, {}, null, { windowDays: 10 });
  const recent = shiftDate(today(), -2), old = shiftDate(today(), -40);
  await repo.saveMany('WebMeals', [meal('new', recent), meal('old', old)]);
  await repo.saveMany('WebProfile', [{ id: 'p1', date: old, weight_kg: 80, kcal_target: 2000, created_at: 'c', updated_at: 'u', deleted: false }]);
  const fresh = await repoFor(e, {}, null, { windowDays: 10 });
  const data = await fresh.load();
  assert.deepEqual(data.WebMeals.map(r => r.id), ['new'], 'window excludes old meals');
  assert.deepEqual(data.WebProfile.map(r => r.id), ['p1'], 'profile rows are always loaded');
  const wider = await fresh.ensureRange(shiftDate(today(), -60));
  assert.deepEqual(wider.WebMeals.map(r => r.id).sort(), ['new', 'old']);
  assert.equal(await fresh.ensureRange(shiftDate(today(), -50)), null, 'already covered → no request');
  const other = await repoFor(e, { sub: 'user-b', email: 'b@example.com' });
  assert.equal((await other.load()).WebMeals.length, 0);
});

test('save keeps optimistic revisions, polling picks up writes from another device', async () => {
  const e = env(), phone = await repoFor(e), laptop = await repoFor(e);
  const date = today();
  await phone.saveMany('WebMeals', [meal('m1', date)]);
  const seen = await laptop.load();
  const updates = [];
  const stop = laptop.subscribe((table, rows) => updates.push([table, rows.map(r => r.kcal)]), err => assert.fail(err));
  const row = (await phone.load()).WebMeals[0];
  assert.equal(await phone.save('WebMeals', { ...row, kcal: 650, updated_at: 'u2' }), true);
  await assert.rejects(() => laptop.save('WebMeals', { ...seen.WebMeals[0], kcal: 1, updated_at: 'u3' }), /thiết bị khác/);
  await laptop.poll().then(t => assert.deepEqual([...t], ['WebMeals']));
  assert.equal((await laptop.load()).WebMeals[0].kcal, 650);
  stop();
});

test('admin reads another owner; ordinary users cannot', async () => {
  const e = env(), a = await repoFor(e);
  await a.saveMany('WebMeals', [meal('m1', today())]);
  const admin = await repoFor(e, { sub: 'admin', email: ADMIN }, 'user-a');
  assert.deepEqual((await admin.load()).WebMeals.map(r => r.id), ['m1']);
  assert.throws(() => new CloudflareRepository({ sessionExpiresAt: Date.now() + 1e6, auth: { currentUser: { uid: 'user-b', email: 'b@x', emailVerified: true } } }, 'user-a', { apiBase: 'https://api.test' }), /Chỉ admin/);
});

test('food library seeds once and import is insert-only', async () => {
  const e = env(), repo = await repoFor(e);
  const seeded = await repo.seedFoods(); assert.ok(seeded.length >= 5);
  assert.equal((await repo.seedFoods()).length, seeded.length);
  const r = await repo.importBundle({ data: { WebMeals: [meal('i1', today()), meal('i1b', today())], WebWorkouts: [], WebProfile: [], Archive: [] } });
  assert.deepEqual(r, { inserted: 2, skipped: 0 });
  assert.deepEqual(await repo.importBundle({ data: { WebMeals: [meal('i1', today(), { kcal: 1 })], WebWorkouts: [], WebProfile: [], Archive: [] } }), { inserted: 0, skipped: 1 });
});

test('migration diff names missing, changed and extra IDs', () => {
  assert.deepEqual(diffRows([{ id: 'a', updated_at: '1' }, { id: 'b', updated_at: '2' }], [{ id: 'b', updated_at: '3' }, { id: 'c', updated_at: '1' }]), { missing: ['a'], changed: ['b'], extra: ['c'] });
});
