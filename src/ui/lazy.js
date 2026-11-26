// Lightweight single-flight lazy module loader and trailing debounce with flush/cancel.
export function createLazyLoader(importer){
  let value=null,pending=null;
  const load=()=>{
    if(value)return Promise.resolve(value);
    if(!pending)pending=Promise.resolve().then(importer).then(
      mod=>{value=mod;pending=null;return mod;},
      err=>{pending=null;throw err;}
    );
    return pending;
  };
  return {
    load,
    preload(){load().catch(()=>{});},
    peek(){return value;}
  };
}

export function debounce(fn,wait=150,{setTimer=(cb,ms)=>setTimeout(cb,ms),clearTimer=id=>clearTimeout(id)}={}){
  let timer=null,lastArgs=null;
  const cancel=()=>{if(timer!==null){clearTimer(timer);timer=null;}lastArgs=null;};
  const flush=()=>{if(timer===null)return;const args=lastArgs;cancel();fn(...args);};
  const run=(...args)=>{lastArgs=args;if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;const a=lastArgs;lastArgs=null;fn(...a);},wait);};
  run.cancel=cancel;
  run.flush=flush;
  run.pending=()=>timer!==null;
  return run;
}
