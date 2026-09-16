import type { ReactNode } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
export function AccessibleDialog({children,label,onClose}:{children:ReactNode;label:string;onClose:()=>void}){
  const ref=useAccessibleDialog(onClose);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">{children}</div>;
}
