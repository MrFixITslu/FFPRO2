import { useState } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
interface Props { onClose:()=>void; onSuccess:(institution:string,account:string,balance:number,type:'bank'|'credit_union'|'investment')=>void }
export default function BankSyncModal({onClose,onSuccess}:Props) {
  const [name,setName]=useState('');const [balance,setBalance]=useState('');const [kind,setKind]=useState<'bank'|'credit_union'|'investment'>('bank');
  const dialog=useAccessibleDialog(onClose);
  return <div className="fixed inset-0 z-[200] bg-stone-900/70 flex items-center justify-center p-4"><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="manual-account-title" className="bg-white rounded-2xl max-w-md w-full p-6">
    <h2 id="manual-account-title" className="text-xl font-bold">Add a manual account</h2>
    <p className="my-3 text-sm">Track balances and transactions yourself. Automatic bank connections are not available. Do not enter bank passwords or API keys.</p>
    <form onSubmit={e=>{e.preventDefault();const amount=Number(balance);if(name.trim() && Number.isFinite(amount)){onSuccess(name.trim(),'Manual',amount,kind);onClose();}}} className="space-y-4">
      <label className="block">Institution<input className="border rounded p-3 w-full" required maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label className="block">Account type<select className="border rounded p-3 w-full" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="bank">Bank</option><option value="credit_union">Credit union</option><option value="investment">Investment</option></select></label>
      <label className="block">Opening balance<input className="border rounded p-3 w-full" type="number" step="0.01" required value={balance} onChange={e=>setBalance(e.target.value)} /></label>
      <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="p-3">Cancel</button><button className="bg-indigo-700 text-white rounded p-3">Save manual account</button></div>
    </form>
  </section></div>;
}
