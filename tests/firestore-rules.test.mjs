import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Firestore rules deny all client reads and writes', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const policy = rules.replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
  assert.equal(policy, [
    "rules_version = '2';",
    'service cloud.firestore {',
    'match /databases/{database}/documents {',
    'match /{document=**} {',
    'allow read, write: if false;',
    '} } }',
  ].join(' '));
});
