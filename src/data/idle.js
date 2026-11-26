// Run maintenance on a later task, preferably when the browser has idle time.
export function runWhenIdle(task,{timeout=8000,fallbackDelay=100}={}){
  if(typeof globalThis.requestIdleCallback==='function'){
    globalThis.requestIdleCallback(task,{timeout});
  }else{
    setTimeout(task,fallbackDelay);
  }
}
