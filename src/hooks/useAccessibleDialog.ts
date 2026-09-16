import { useEffect, useRef } from 'react';
export function useAccessibleDialog(onClose:()=>void, enabled=true) {
  const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const root=ref.current;if(!root || !enabled)return;
    const before=document.activeElement as HTMLElement;
    const focusables=()=>Array.from<HTMLElement>(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
    (focusables()[0] || root).focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const all=focusables();const first=all[0],last=all[all.length-1];
        if(!first){event.preventDefault();root.focus();}
        else if(event.shiftKey && (document.activeElement===first || !root.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    root.addEventListener('keydown',onKey);return()=>{root.removeEventListener('keydown',onKey);before?.focus();};
  },[enabled]);
  return ref;
}
