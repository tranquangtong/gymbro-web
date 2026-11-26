import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/deploy-web.yml');
const apiConfig = read('worker/wrangler.toml');

test('the web workflow deploys main and next after syntax checks and tests', () => {
  assert.equal(existsSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url)), false);
  assert.match(workflow, /^name: Deploy Cloudflare Web$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /^  push:\n    branches: \[main, next\]$/m);
  const ignored = workflow.match(/^    paths-ignore:\n((?:      - .+\n)+)/m)?.[1];
  assert.ok(ignored, 'push should have a paths-ignore list');
  assert.deepEqual(ignored.trim().split('\n').map(line => line.trim()), [
    "- 'docs/**'",
    "- '**/*.md'",
    "- 'worker/**'",
  ]);

  const check = workflow.search(/^          npm run check$/m);
  const tests = workflow.search(/^          npm test$/m);
  const deploy = workflow.search(/^          npx wrangler deploy /m);
  assert.ok(check >= 0 && check < tests && tests < deploy);
  assert.match(workflow, /npm install --no-save --no-audit --no-fund wrangler@4/);
  assert.match(workflow, /main\) worker_name=gymbro-web ;;/);
  assert.match(workflow, /next\) worker_name=gymbro-web-next ;;/);
  assert.match(workflow, /wrangler deploy --config web\/wrangler\.jsonc --name "\$worker_name"/);
  assert.match(workflow, /https:\/\/\$\{worker_name\}\.tongquangtran\.workers\.dev\//);
  assert.doesNotMatch(workflow, /wrangler pages (?:deploy|project)/);
});

test('the web Worker serves only static assets and uses the API compatibility date', () => {
  const compatibilityDate = apiConfig.match(/^compatibility_date = "([^"]+)"$/m)?.[1];
  assert.ok(compatibilityDate, 'the API Worker should define a compatibility date');
  assert.deepEqual(JSON.parse(read('web/wrangler.jsonc')), {
    name: 'gymbro-web',
    compatibility_date: compatibilityDate,
    workers_dev: true,
    assets: {
      directory: '../dist',
      html_handling: 'auto-trailing-slash',
      not_found_handling: 'none',
    },
  });
});

test('the dist allowlist excludes tests, docs, worker, scripts, collab.md and .github', () => {
  const build = workflow.match(/^      - name: Build frontend\n        run: \|\n((?:          .+\n)+)/m)?.[1];
  assert.ok(build, 'the workflow should have a build step');
  assert.deepEqual(build.trim().split('\n').map(line => line.trim()), [
    'mkdir dist',
    'cp -R -- index.html sw.js manifest.webmanifest _headers assets src dist/',
  ]);
});

test('the web Worker revalidates the service worker and permits Google sign-in popups', () => {
  const headers = read('_headers');
  assert.match(headers, /^\/sw\.js\n  Cache-Control: no-cache$/m);
  assert.doesNotMatch(headers, /Cross-Origin-Opener-Policy|Content-Security-Policy/i);
});

test('the API Worker allows both web Workers, GitHub Pages and local development', () => {
  const allowlist = apiConfig.match(/^ALLOWED_ORIGINS = "([^"]+)"$/m)?.[1];
  assert.ok(allowlist, 'the Worker should define an origin allowlist');
  assert.deepEqual(allowlist.split(',').sort(), [
    'https://gymbro-web.tongquangtran.workers.dev',
    'https://gymbro-web-next.tongquangtran.workers.dev',
    'https://tranquangtong.github.io',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ].sort());
});
