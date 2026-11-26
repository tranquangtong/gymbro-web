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
  let scheduled=false,fieldFocus=false;
  const last={height:null,top:null,keyboard:null};
  const hasOpenDialog=()=>!!(doc.querySelector?doc.querySelector('dialog[open]'):doc.activeElement?.closest?.('dialog[open]'));
  const clearField=()=>{if(fieldFocus){doc.documentElement.classList.remove('field-focus');fieldFocus=false;}};
  const reset=()=>{
    clearField();if(last.height===null)return;
    const root=doc.documentElement;if(last.keyboard)root.classList.remove('keyboard-open');
    root.style.removeProperty('--dialog-viewport');root.style.removeProperty('--dialog-viewport-top');
    last.height=last.top=last.keyboard=null;
  };
  const update=()=>{
    scheduled=false;
    if(!hasOpenDialog()){reset();return;}
    const bounds=viewportBounds(win),root=doc.documentElement;
    if(bounds.height!==last.height){root.style.setProperty('--dialog-viewport',bounds.height+'px');last.height=bounds.height;}
    if(bounds.top!==last.top){root.style.setProperty('--dialog-viewport-top',bounds.top+'px');last.top=bounds.top;}
    if(bounds.keyboard!==last.keyboard){root.classList.toggle('keyboard-open',bounds.keyboard);last.keyboard=bounds.keyboard;}
    const field=doc.activeElement;
    // Only fields that bring up the keyboard; a <select> opens a picker, scrolling for it only made the sheet jump.
    if(!field?.matches?.(EDITABLE)||!field.closest('dialog[open]')){clearField();return;}
    const container=field.closest('.quick-content,.editor-fields');
    if(!container)return;
    const suggestion=field.closest('.name-field-group')?.querySelector('.inline-suggestions:not([hidden]) .suggestion-button');
    const delta=fieldScrollDelta(field.getBoundingClientRect(),container.getBoundingClientRect(),bounds,suggestion?.getBoundingClientRect().bottom);
    if(delta)container.scrollTop+=delta;
  };
  const schedule=()=>{if(scheduled||last.height===null&&!fieldFocus&&!hasOpenDialog())return;scheduled=true;win.requestAnimationFrame(update);};
  win.visualViewport?.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('scroll',schedule);
  win.addEventListener('resize',schedule);
  doc.addEventListener('input',schedule);
  doc.addEventListener('toggle',e=>{if(e.target.matches?.('dialog[open]'))schedule();},true);
  doc.addEventListener('close',()=>{if(!hasOpenDialog())reset();else schedule();},true);
  // Synchronously on focus (before the keyboard animates): read layout first, then mark the page as
  // editing (giving the sheet's scroll area room below its content) and lift the field into view.
  doc.addEventListener('focusin',e=>{
    schedule();
    const field=e?.target;if(!field?.matches?.(EDITABLE)||!field.closest('dialog[open]'))return;
    const container=field.closest('.quick-content,.editor-fields');if(!container)return;
    const delta=focusLiftDelta(field.getBoundingClientRect(),container.getBoundingClientRect(),win.visualViewport?.height||win.innerHeight);
    if(!fieldFocus){doc.documentElement.classList.add('field-focus');fieldFocus=true;}
    if(delta)container.scrollTop+=delta;
  });
  doc.addEventListener('focusout',()=>{win.setTimeout(()=>{const f=doc.activeElement;if(!(f?.matches?.(EDITABLE)&&f.closest('dialog[open]')))clearField();if(!hasOpenDialog())reset();},150);});
  update();
}
