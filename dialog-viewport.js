// Native dialogs are positioned in the layout viewport on iOS. The keyboard
// changes the visual viewport's height AND offset, so height alone is not enough.
export function viewportBounds(win){
  const view=win.visualViewport;
  return {height:view?.height||win.innerHeight,top:view?.offsetTop||0,
    keyboard:!!view&&view.scale===1&&win.innerHeight-view.height>120};
}
export function fieldScrollDelta(field,container,viewport,suggestionBottom=field.bottom){
  const top=Math.max(container.top,viewport.top)+10;
  const bottom=Math.min(container.bottom,viewport.top+viewport.height)-12;
  if(bottom<=top)return 0;
  if(field.top<top)return field.top-top;
  // Keep the input visible first; show a suggestion when there is enough room.
  const end=Math.min(suggestionBottom,field.bottom+64);
  if(end>bottom)return Math.min(end-bottom,Math.max(0,field.top-top));
  return 0;
}
export function installDialogViewport(win=window,doc=document){
  let scheduled=false;
  const update=()=>{
    scheduled=false;
    const bounds=viewportBounds(win),root=doc.documentElement;
    root.style.setProperty('--dialog-viewport',bounds.height+'px');
    root.style.setProperty('--dialog-viewport-top',bounds.top+'px');
    root.classList.toggle('keyboard-open',bounds.keyboard);
    const field=doc.activeElement;
    if(!field?.matches?.('input:not([type=file]):not([type=hidden]),textarea,select')||!field.closest('dialog[open]'))return;
    const container=field.closest('.quick-content,.editor-fields');
    if(!container)return;
    const suggestion=field.closest('.name-field-group')?.querySelector('.inline-suggestions:not([hidden]) .suggestion-button');
    const delta=fieldScrollDelta(field.getBoundingClientRect(),container.getBoundingClientRect(),bounds,suggestion?.getBoundingClientRect().bottom);
    if(delta)container.scrollTop+=delta;
  };
  const schedule=()=>{if(!scheduled){scheduled=true;win.requestAnimationFrame(update);}};
  win.visualViewport?.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('scroll',schedule);
  win.addEventListener('resize',schedule);
  doc.addEventListener('focusin',schedule);
  doc.addEventListener('input',schedule);
  update();
}
