// Revalidate with GitHub Pages on every load and keep a copy for offline use.
const CACHE_NAME='gymbro-shell-v1';

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('gymbro-')&&name!==CACHE_NAME)
    .map(name=>caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||req.cache==='no-store'||url.origin!==self.location.origin)return;

  const navigation=req.mode==='navigate';
  // Navigation requests cannot be reissued with a cache override.
  const network=navigation
    ? fetch(new Request(url.href,{cache:'no-cache',credentials:'same-origin',redirect:req.redirect}))
    : fetch(req,{cache:'no-cache'});
  if(navigation)url.search='';
  const key=navigation?url.href:req;

  e.waitUntil(network.then(async res=>{
    if(!res.ok||res.type!=='basic'||res.redirected)return;
    const copy=res.clone();
    const cache=await caches.open(CACHE_NAME);
    await cache.put(key,copy);
  }).catch(()=>{}));

  e.respondWith(network.catch(async ()=>{
    const options={cacheName:CACHE_NAME};
    try{
      const cached=await caches.match(key,options);
      if(cached)return cached;
      if(navigation){
        for(const path of ['./','./index.html']){
          const shell=await caches.match(new URL(path,self.registration.scope).href,options);
          if(shell)return shell;
        }
      }
    }catch{} // Cache Storage can be unavailable even when the HTTP cache works.
    return fetch(req);
  }));
});
