import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):/\.m?js$/.test(n)?[p]:[];});
const files=['src','worker/src','scripts','tests'].flatMap(d=>walk(join(root,d))).concat(join(root,'sw.js'));
// Every static, side-effect and dynamic relative import: `from '…'`, `import '…'`, `import('…')`.
const IMPORT=/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

test('Every relative import points at an existing file',()=>{
  const missing=[];
  for(const f of files){
    for(const [,spec] of readFileSync(f,'utf8').matchAll(IMPORT)){
      if(!existsSync(resolve(dirname(f),spec)))missing.push(`${f.slice(root.length+1)} → ${spec}`);
    }
  }
  assert.deepEqual(missing,[]);
});

test('Files referenced by index.html and the manifest exist',()=>{
  const refs=[...readFileSync(join(root,'index.html'),'utf8').matchAll(/(?:src|href)="\.\/([^"]+)"/g),
    ...readFileSync(join(root,'manifest.webmanifest'),'utf8').matchAll(/"src":\s*"\.\/([^"]+)"/g)].map(m=>m[1]);
  assert.ok(refs.length>3);
  assert.deepEqual(refs.filter(r=>!existsSync(join(root,r))),[]);
});
