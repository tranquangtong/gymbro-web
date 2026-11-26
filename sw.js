// Bump this on each frontend release. Install snapshots the shell and the entire
// module graph, including lazy imports, before the new worker can take control.
const CACHE_VERSION='1';
const SHELL='index.html';
const PRECACHE=[
  SHELL,'manifest.webmanifest',
  'assets/style.css','assets/icons/apple-touch-icon.png','assets/icons/icon.svg',
  'assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png',
  'src/app.js','src/config/backend-config.js','src/config/firebase-config.js',
  'src/core/core.js','src/core/media.js','src/core/migration.js','src/core/photo-retention.js',
  'src/core/quick.js','src/core/reconcile.js','src/core/walking.js','src/core/workout-kcal.js',
  'src/data/access.js','src/data/backend.js','src/data/cloudflare.js','src/data/errors.js',
  'src/data/firebase.js','src/data/idle.js','src/data/local-extras.js','src/data/migrate-cloudflare.js',
  'src/data/resume-retry.js','src/data/snapshot.js','src/data/sync.js','src/data/timeout.js',
  'src/ui/boot-timing.js','src/ui/calendar.js','src/ui/dashboard.js','src/ui/dialog-viewport.js',
  'src/ui/exercise-library.js','src/ui/firebase-ui.js','src/ui/inapp.js','src/ui/quick-ui.js',
  'src/ui/update-check.js',
];

function requestStrategy(request,scope){
  const url=new URL(request.url),base=new URL(scope);
  if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname)
    ||request.cache==='no-store'||request.headers.has('authorization')||request.headers.has('range')
    ||/^gymbro-api(?:[.-][^.]+)*\.workers\.dev$/.test(url.hostname))return 'bypass';
  const path=url.pathname.slice(base.pathname.length);
  if(request.mode==='navigate'&&(path===''||path===SHELL))return 'network-first';
  if(request.mode!=='navigate'&&(/^(src|assets)\//.test(path)||path==='manifest.webmanifest'))return 'stale-while-revalidate';
  return 'bypass';
}

function cacheable(response){
  const policy=response.headers.get('cache-control')||'';
  return response.ok&&response.status===200&&!response.redirected
    &&!/\b(private|no-store)\b/i.test(policy)&&response.headers.get('vary')!=='*';
}

async function sameContent(cached,fresh){
  if(cached.headers.get('content-type')!==fresh.headers.get('content-type'))return false;
  const bytes=await Promise.all([cached.clone().arrayBuffer(),fresh.clone().arrayBuffer()]);
  const [before,after]=bytes.map(buffer=>new Uint8Array(buffer));
  return before.length===after.length&&before.every((byte,i)=>byte===after[i]);
}

const scope=self.registration.scope;
const cachePrefix='gymbro-shell:'+scope+':';
const cacheName=cachePrefix+CACHE_VERSION;
const urls=new Set(PRECACHE.map(path=>new URL(path,scope).href));
const shell=new URL(SHELL,scope).href;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(
    [...urls].map(url=>new Request(url,{cache:'reload',redirect:'error'})),
  )));
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.registration.navigationPreload?.enable().catch(()=>{}),
    caches.keys().then(keys=>Promise.all(keys
      .filter(key=>key.startsWith(cachePrefix)&&key!==cacheName)
      .map(key=>caches.delete(key)))),
  ]));
});

// The default waiting lifecycle keeps this release available to open windows.
// The network can refresh entries with identical contents during a deploy.
// Changed bytes belong to the next release's cache.
async function networkFirst(event,cache){
  const cached=await cache.match(shell);
  try{
    const preloaded=await Promise.resolve(event.preloadResponse).catch(()=>undefined);
    const response=preloaded||await fetch(event.request);
    if(cacheable(response)&&cached&&await sameContent(cached,response))return response;
    return cached||response;
  }catch{
    return cached||Response.error();
  }
}

function staleWhileRevalidate(event,cache,url){
  const canonical=url.origin+url.pathname,pinned=urls.has(canonical);
  const key=pinned?canonical:event.request;
  const cached=cache.then(cache=>cache.match(key));
  const refresh=cached.then(async previous=>{
    if(pinned&&!previous)return Response.error();
    const response=await fetch(event.request);
    if(cacheable(response)&&(!pinned||await sameContent(previous,response))){
      await cache.then(cache=>cache.put(key,response.clone())).catch(()=>{});
    }
    return response;
  });
  event.waitUntil(refresh.catch(()=>{}));
  return cached.then(previous=>previous||refresh);
}

self.addEventListener('fetch',event=>{
  const strategy=requestStrategy(event.request,scope);
  if(strategy==='bypass')return;
  const cache=caches.open(cacheName);
  event.respondWith(strategy==='network-first'
    ?cache.then(cache=>networkFirst(event,cache))
    :staleWhileRevalidate(event,cache,new URL(event.request.url)));
});
