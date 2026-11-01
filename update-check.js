// Tells a long-open tab that a newer release is live. Compares the ETag/Last-Modified of
// the app's main files with the ones seen at start-up; never reloads by itself, so
// nothing being typed is lost.
const FILES=['./index.html','./app.js','./quick-ui.js','./quick.js','./cloudflare.js','./dashboard.js','./style.css'];
const stamp=async f=>{try{const r=await fetch(f,{method:'HEAD',cache:'no-store'});return r.ok?(r.headers.get('etag')||r.headers.get('last-modified')||''):'';}catch{return '';}};
export function watchForUpdates({interval=5*60*1000}={}){
  if(typeof document==='undefined'||location.protocol==='file:')return;
  let baseline=null,last=0,shown=false;
  const snapshot=()=>Promise.all(FILES.map(stamp));
  snapshot().then(s=>{baseline=s;});
  const check=async()=>{
    if(shown||!baseline||document.visibilityState!=='visible'||Date.now()-last<interval)return;last=Date.now();
    const now=await snapshot();
    if(now.some((v,i)=>v&&baseline[i]&&v!==baseline[i])){shown=true;show();}
  };
  document.addEventListener('visibilitychange',check);setInterval(check,interval);
}
function show(){
  const bar=document.createElement('div');bar.className='update-banner';bar.setAttribute('role','status');
  bar.innerHTML='<span>Đã có bản GymBro mới.</span><button type="button" class="button primary small">Tải lại</button>';
  bar.querySelector('button').onclick=()=>location.reload();document.body.append(bar);
}
