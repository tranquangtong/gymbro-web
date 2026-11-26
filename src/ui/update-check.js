import {runWhenIdle} from '../data/idle.js';

// A waiting worker has already cached the complete next release. Let existing
// pages finish using their active release before the browser switches workers.
export function watchForUpdates({interval=5*60*1000}={}){
  if(typeof document==='undefined'||location.protocol==='file'||!navigator.serviceWorker)return;
  runWhenIdle(()=>{
    let registration,installing,shown=false,last=-Infinity,checking=false;
    const notify=(reload=false)=>{
      if(!shown&&(reload||(registration?.active&&registration.waiting))){
        shown=true;
        show(reload);
      }
    };
    const watchInstalling=()=>{
      const worker=registration.installing;
      if(worker&&worker!==installing){
        installing=worker;
        const replacing=Boolean(registration.active);
        worker.addEventListener('statechange',()=>{
          notify(replacing&&worker.state==='activated'&&!navigator.serviceWorker.controller);
        });
      }
    };
    const check=async()=>{
      if(shown||checking||document.visibilityState!=='visible'||Date.now()-last<interval)return;
      last=Date.now();checking=true;
      try{
        if(!registration){
          registration=await navigator.serviceWorker.getRegistration();
          registration?.addEventListener('updatefound',watchInstalling);
          if(registration)watchInstalling();
        }
        notify();
        if(!shown)await registration?.update();
        notify();
      }catch{}finally{checking=false;}
    };
    document.addEventListener('visibilitychange',check);
    setInterval(check,interval);
    void check();
  },{fallbackDelay:8000});
}

function show(reload){
  const bar=document.createElement('div');
  bar.className='update-banner';
  bar.setAttribute('role','status');
  bar.textContent='Đã có bản GymBro mới.';
  if(reload){
    const button=document.createElement('button');
    button.type='button';
    button.className='button primary small';
    button.textContent='Tải lại';
    button.onclick=()=>location.reload();
    bar.append(button);
  }else{
    bar.textContent+=' Đóng tất cả cửa sổ và tab GymBro rồi mở lại để cập nhật.';
  }
  document.body.append(bar);
}
