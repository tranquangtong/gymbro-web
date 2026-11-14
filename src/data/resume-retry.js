// One visible-page retry, also released by a dialog's native close event.
export function createResumeRetry({run,visible,blocked,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,pending=false,attempt=0;
 const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const retry={
  defer(){pending=true;if(timer!==null||!visible())return;timer=setTimer(()=>{timer=null;if(!pending||!visible())return;if(blocked())return retry.defer();return run();},5000);},
  failed(){pending=true;if(!visible()||timer!==null)return;timer=setTimer(()=>{timer=null;if(visible())return run();},[5000,15000,30000,60000][Math.min(attempt++,3)]);},
  closed(){if(pending&&visible()&&!blocked()){cancel();run();}},
  pause(){cancel();},
  reset(){cancel();pending=false;attempt=0;}
 };return retry;
}
