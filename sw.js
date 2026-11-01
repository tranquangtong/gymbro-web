// Network-first for this site's own files: every load revalidates with GitHub Pages
// (cheap 304 when unchanged), so a phone never keeps running an old release.
// Nothing is stored; when offline the browser's normal cache is used.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  // Navigation requests can't be re-issued with options, so rebuild a plain GET from the URL.
  e.respondWith(fetch(new Request(url.href,{cache:'no-cache',credentials:'same-origin'})).catch(()=>fetch(req)));
});
