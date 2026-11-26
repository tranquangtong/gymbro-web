import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const origin = 'https://example.test';
const scope = `${origin}/gymbro-web/`;
const cacheName = 'gymbro-shell-v1';

function loadWorker(fetch, entries = []) {
  const handlers = new Map();
  const stores = new Map(entries);
  const lifecycle = [];
  const urlFor = key => typeof key === 'string' ? key : key.url;
  runInNewContext(source, {
    URL, Request, fetch,
    self: {
      location: { origin },
      registration: { scope },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: () => lifecycle.push('skipWaiting'),
      clients: { claim: async () => lifecycle.push('claim') },
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async name => {
        lifecycle.push(`delete ${name}`);
        return stores.delete(name);
      },
      open: async name => {
        if (!stores.has(name)) stores.set(name, new Map());
        return { put: async (key, copy) => stores.get(name).set(urlFor(key), copy) };
      },
      match: async (key, { cacheName }) => stores.get(cacheName)?.get(urlFor(key)),
    },
  });

  return {
    stores, lifecycle,
    dispatch(name, request) {
      let response;
      const pending = [];
      handlers.get(name)({
        request,
        respondWith: promise => { response = promise; },
        waitUntil: promise => pending.push(promise),
      });
      return { response, settled: Promise.all(pending) };
    },
  };
}

function response(body, { ok = true, type = 'basic' } = {}) {
  return { body, ok, type, clone: () => ({ body, ok, type }) };
}

const offline = async () => { throw new Error('offline'); };

test('online requests revalidate and save a copy in the current cache', async () => {
  const request = new Request(`${scope}src/app.js?v=2`);
  const latest = response('latest');
  const previous = response('previous');
  const shell = new Map([[request.url, previous]]);
  const calls = [];
  const worker = loadWorker(async (...args) => {
    calls.push(args);
    return latest;
  }, [[cacheName, shell]]);

  const event = worker.dispatch('fetch', request);
  assert.equal(await event.response, latest);
  await event.settled;
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], request);
  assert.equal(calls[0][1].cache, 'no-cache');
  assert.equal(shell.get(request.url).body, 'latest');
  assert.notEqual(shell.get(request.url), latest);
});

test('offline assets use the exact URL from the current cache', async () => {
  const request = new Request(`${scope}src/app.js?v=2`);
  const saved = response('saved');
  const worker = loadWorker(offline, [
    ['gymbro-old', new Map([[request.url, response('old')]])],
    [cacheName, new Map([[request.url, saved]])],
  ]);

  assert.equal(await worker.dispatch('fetch', request).response, saved);
  await assert.rejects(worker.dispatch('fetch', new Request(`${scope}src/app.js?v=3`)).response, /offline/);
});

test('offline navigation falls back to the index under the worker scope', async () => {
  const index = response('app shell');
  const worker = loadWorker(offline, [[cacheName, new Map([[`${scope}index.html`, index]])]]);
  const request = { url: `${scope}workouts?tab=recent`, method: 'GET', mode: 'navigate' };

  assert.equal(await worker.dispatch('fetch', request).response, index);
});

test('navigation preserves the network query and reuses the cached page across queries', async () => {
  const page = response('workouts');
  const requests = [];
  const worker = loadWorker(async request => {
    requests.push(request);
    return requests.length === 1 ? page : offline();
  });
  const request = { url: `${scope}workouts?tab=recent`, method: 'GET', mode: 'navigate' };

  const online = worker.dispatch('fetch', request);
  assert.equal(await online.response, page);
  await online.settled;
  assert.equal(requests[0].url, request.url);
  assert.equal(requests[0].cache, 'no-cache');

  const cached = worker.dispatch('fetch', { ...request, url: `${scope}workouts?tab=all` });
  assert.equal((await cached.response).body, 'workouts');
  assert.equal(requests[1].url, `${scope}workouts?tab=all`);
});

test('cross-origin, POST, HEAD and no-store requests bypass the worker', () => {
  const worker = loadWorker(() => assert.fail('unexpected fetch'));
  const requests = [
    new Request('https://fonts.googleapis.com/css2'),
    new Request(scope, { method: 'POST' }),
    new Request(scope, { method: 'HEAD', cache: 'no-store' }),
    new Request(scope, { cache: 'no-store' }),
  ];
  for (const request of requests) assert.equal(worker.dispatch('fetch', request).response, undefined);
});

test('HTTP errors and non-basic responses pass through without replacing the cache', async () => {
  const request = new Request(`${scope}index.html`);
  const saved = response('saved');
  const shell = new Map([[request.url, saved]]);
  for (const result of [response('404', { ok: false }), response('external', { type: 'cors' })]) {
    const worker = loadWorker(async () => result, [[cacheName, shell]]);
    const event = worker.dispatch('fetch', request);
    assert.equal(await event.response, result);
    await event.settled;
    assert.equal(shell.get(request.url), saved);
  }
});

test('installation skips waiting and activation deletes only old GymBro caches before claiming', async () => {
  const names = ['gymbro-old', cacheName, 'unrelated', 'gymbro-assets-v0'];
  const worker = loadWorker(offline, names.map(name => [name, new Map()]));

  await worker.dispatch('install').settled;
  await worker.dispatch('activate').settled;
  assert.deepEqual([...worker.stores.keys()], [cacheName, 'unrelated']);
  assert.deepEqual(worker.lifecycle, ['skipWaiting', 'delete gymbro-old', 'delete gymbro-assets-v0', 'claim']);
});
