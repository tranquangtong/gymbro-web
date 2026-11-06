// Native dialogs are positioned in the layout viewport on iOS. The keyboard
// changes the visual viewport's height AND offset, so height alone is not enough.
export function viewportBounds(win){
  const view=win.visualViewport;
  return {height:view?.height||win.innerHeight,top:view?.offsetTop||0,
    // visualViewport.height shrinks both with the keyboard and with zoom; multiplying by scale undoes
    // the zoom, so a keyboard is still detected when Safari has zoomed in (it used to require scale 1).
    keyboard:!!view&&win.innerHeight-view.height*(view.scale||1)>120};
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
// Top-anchored sheets: when a field low on the screen is tapped, lift it to the top of its scroll area
// before the keyboard opens, so the keyboard never covers it and iOS has no reason to pan the page.
// Returns how far to scroll the container (0 when the field already sits in the upper part).
export function focusLiftDelta(field,container,viewHeight,gap=12){
  if(field.bottom<=viewHeight*0.42)return 0;
  return Math.max(0,field.top-(container.top+gap));
}
const EDITABLE='input:not([type=file]):not([type=hidden]):not([type=date]):not([type=checkbox]):not([type=radio]),textarea';
export function installDialogViewport(win=window,doc=document){
  let scheduled=false;
  const update=()=>{
    scheduled=false;
    const bounds=viewportBounds(win),root=doc.documentElement;
    root.style.setProperty('--dialog-viewport',bounds.height+'px');
    root.style.setProperty('--dialog-viewport-top',bounds.top+'px');
    root.classList.toggle('keyboard-open',bounds.keyboard);
    const field=doc.activeElement;
    // Only fields that bring up the keyboard; a <select> opens a picker, scrolling for it only made the sheet jump.
    if(!field?.matches?.(EDITABLE)||!field.closest('dialog[open]'))return;
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
  // Synchronously on focus (before the keyboard animates): mark the page as editing, which gives the
  // sheet's scroll area room below its content, then lift the field into the upper part of the sheet.
  doc.addEventListener('focusin',e=>{
    const field=e.target;if(!field?.matches?.(EDITABLE)||!field.closest('dialog[open]'))return;
    const container=field.closest('.quick-content,.editor-fields');if(!container)return;
    doc.documentElement.classList.add('field-focus');
    const delta=focusLiftDelta(field.getBoundingClientRect(),container.getBoundingClientRect(),win.visualViewport?.height||win.innerHeight);
    if(delta)container.scrollTop+=delta;
  });
  doc.addEventListener('focusout',()=>{win.setTimeout(()=>{const f=doc.activeElement;if(!(f?.matches?.(EDITABLE)&&f.closest('dialog[open]')))doc.documentElement.classList.remove('field-focus');},150);});
  update();
}
