import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const {version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const github='https://tranquangtong.github.io/gymbro-web/';
const workers='https://gymbro-web.example.workers.dev/';
const request=(url,options={})=>({url,method:'GET',headers:new Headers(),...options});

function worker(scope,{fetch,caches,navigationPreload}={}){
  const listeners={};
  const context={self:{registration:{scope,navigationPreload},addEventListener:(event,fn)=>{listeners[event]=fn;}},
    URL,Request,Response,fetch,caches};
  runInNewContext(script,context);
  return {listeners,route:context.requestStrategy,precache:runInNewContext('PRECACHE',context)};
}

test('routes app navigations, static assets and the manifest at both hosting paths',()=>{
  for(const scope of [github,workers]){
    const {route}=worker(scope);
    for(const path of ['', 'index.html','?source=pwa']){
      assert.equal(route(request(scope+path,{mode:'navigate'}),scope),'network-first');
    }
    for(const path of ['src/app.js','assets/style.css','manifest.webmanifest']){
      assert.equal(route(request(scope+path),scope),'stale-while-revalidate');
    }
    assert.equal(route(request(scope+'src/app.js',{method:'HEAD'}),scope),'bypass');
    assert.equal(route(request(scope+'src/app.js',{headers:new Headers({authorization:'Bearer user'})}),scope),'bypass');
    assert.equal(route(request(scope+'assets/style.css',{cache:'no-store'}),scope),'bypass');
  }
  assert.equal(worker(github).route(request('https://tranquangtong.github.io/src/app.js'),github),'bypass');
});

test('GymBro API and Firebase/Google auth requests bypass the service worker',()=>{
  const api='https://gymbro-api.tongquangtran.workers.dev/';
  for(const scope of [github,workers,api]){
    const {route}=worker(scope);
    for(const url of [
      api+'v1/records',api,scope+'v1/photos/p',scope+'__/auth/handler',
      'https://gymbro-web.firebaseapp.com/__/auth/handler','https://accounts.google.com/o/oauth2/v2/auth',
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup','https://securetoken.googleapis.com/v1/token',
      'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js',
    ]){
      for(const mode of ['navigate','cors']){
        assert.equal(route(request(url,{mode}),scope),'bypass',url);
      }
    }
  }
});

test('the release cache includes all first-party assets and lazy modules',()=>{
  const {precache}=worker(github);
  const root=fileURLToPath(new URL('../',import.meta.url));
  for(const dir of ['src','assets']){
    for(const entry of readdirSync(join(root,dir),{recursive:true,withFileTypes:true})){
      if(entry.isFile()){
        const path=relative(root,join(entry.parentPath,entry.name));
        assert.ok(precache.includes(path),path);
      }
    }
  }
  for(const path of ['./','manifest.webmanifest'])assert.ok(precache.includes(path),path);
  for(const path of precache){
    if(path!=='./')assert.match(path,/\.(?:js|css|png|svg|webmanifest)$/);
  }
});

test('installation precaches the release in one batch relative to the registration scope',async()=>{
  for(const scope of [github,workers]){
    let cacheName,requests,installed;
    const {listeners,precache}=worker(scope,{
      caches:{open:async name=>{
        cacheName=name;
        return {addAll:async batch=>{requests=batch;}};
      }},
    });
    listeners.install({waitUntil:value=>{installed=value;}});
    await installed;
    assert.equal(cacheName,'gymbro-shell:'+scope+':gymbro-v'+version);
    assert.deepEqual(Array.from(requests,req=>req.url),Array.from(precache,path=>new URL(path,scope).href));
    assert.ok(requests.some(req=>req.url===scope));
    assert.ok(requests.every(req=>req.cache==='reload'&&req.redirect==='error'));
  }
});

test('a 307 response for any precache request rejects installation',async()=>{
  const {precache}=worker(workers);
  for(const path of precache){
    const redirectedUrl=new URL(path,workers).href;
    const {listeners}=worker(workers,{
      caches:{open:async()=>({addAll:async batch=>{
        for(const req of batch){
          const response=req.url===redirectedUrl
            ?Response.redirect(new URL('target',workers),307)
            :new Response('asset');
          // Model fetch rejecting the redirect before addAll can store the batch.
          if(response.status===307&&req.redirect==='error')throw new TypeError('Precache request redirected');
        }
      }})},
    });
    let installed;
    listeners.install({waitUntil:value=>{installed=value;}});
    await assert.rejects(installed,{name:'TypeError',message:'Precache request redirected'},redirectedUrl);
  }
});

function fetchEvent(listener,req,preloadResponse){
  let response,background;
  listener({request:req,preloadResponse,respondWith:value=>{response=value;},waitUntil:value=>{background=value;}});
  return {response,background};
}

test('the old release serves cached HTML and modules when a new deploy appears',async()=>{
  const entries=new Map([[github,'old html'],[github+'src/app.js','old app']]);
  const cache={match:async key=>entries.has(key)?new Response(entries.get(key)):undefined,
    put:async(key,response)=>entries.set(key,await response.text())};
  let networkBody='new app',requests=0;
  const {listeners}=worker(github,{caches:{open:async()=>cache},fetch:async()=>{
    requests++;
    return new Response(networkBody);
  }});
  const {response:navigation}=fetchEvent(listeners.fetch,request(github,{mode:'navigate'}),Promise.resolve(new Response('new html')));
  assert.equal(await (await navigation).text(),'old html');
  assert.equal(requests,0,'preload should replace the request');
  assert.equal(entries.get(github),'old html');

  const asset=request(github+'src/app.js?from=page');
  const {response,background}=fetchEvent(listeners.fetch,asset);
  assert.equal(await (await response).text(),'old app');
  await background;
  assert.equal(requests,1);
  assert.equal(entries.get(github+'src/app.js'),'old app');

  networkBody='old html';
  const {response:fallback}=fetchEvent(listeners.fetch,request(github+'index.html',{mode:'navigate'}),Promise.reject(Error('preload failed')));
  assert.equal(await (await fallback).text(),'old html');
  assert.equal(requests,2);
});

test('offline navigation uses the pinned shell and activation removes only older caches in the same scope',async()=>{
  const prefix='gymbro-shell:'+workers+':';
  const removed=[];
  let preloads=0;
  const {listeners}=worker(workers,{
    navigationPreload:{enable:async()=>{preloads++;}},
    caches:{keys:async()=>[prefix+'0',prefix+'gymbro-v'+version,'gymbro-shell:'+github+':0','another-app'],
      delete:async key=>removed.push(key),open:async()=>({match:async key=>key===workers?new Response('offline shell'):undefined})},
    fetch:async()=>{throw Error('offline');},
  });
  let activated;
  listeners.activate({waitUntil:value=>{activated=value;}});
  await activated;
  assert.equal(preloads,1);
  assert.deepEqual(removed,[prefix+'0']);
  for(const path of ['', 'index.html']){
    const {response}=fetchEvent(listeners.fetch,request(workers+path,{mode:'navigate'}));
    assert.equal(await (await response).text(),'offline shell');
  }
});
