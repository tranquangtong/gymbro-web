// iOS Safari swallows the `click` of a tap that lands while the page is still
// momentum-scrolling: the first tap only stops the scroll. Touch events still
// arrive, so bottom-bar links navigate on touchend instead of waiting for click.
const SLOP=10,MAX_MS=600;

export function isTap(start,end){
  if(!start||!end)return false;
  return Math.abs(end.x-start.x)<=SLOP&&Math.abs(end.y-start.y)<=SLOP&&end.t-start.t<=MAX_MS;
}

export function installNavTap(nav,navigate,now=()=>Date.now()){
  let start=null;
  const point=e=>{const t=e.changedTouches?.[0];return t?{x:t.clientX,y:t.clientY,t:now()}:null;};
  nav.addEventListener('touchstart',e=>{
    start=e.touches.length===1&&e.target.closest?.('a[href^="#"]')?{...point(e),link:e.target.closest('a[href^="#"]')}:null;
  },{passive:true});
  nav.addEventListener('touchmove',e=>{if(start&&!isTap(start,point(e)))start=null;},{passive:true});
  nav.addEventListener('touchcancel',()=>{start=null;},{passive:true});
  nav.addEventListener('touchend',e=>{
    const s=start;start=null;
    if(!s||!isTap(s,point(e))||!nav.contains(s.link))return;
    // Stops the (possibly never-coming) synthetic click so a normal tap does not navigate twice.
    e.preventDefault();
    navigate(s.link.getAttribute('href'));
  },{passive:false});
}
