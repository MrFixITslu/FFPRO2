import { useState } from 'react';
import type { AuthUser } from '../services/authService';
export function EmailVerificationNotice({user}:{user:AuthUser}) {
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  if(user.emailVerified)return null;
  return <aside className="bg-blue-50 border-b p-3 text-sm" role="status">
    Verify your email before accepting project invitations. <button disabled={busy} className="underline p-2" onClick={async()=>{
      setBusy(true);try{const res=await fetch('/api/auth/verify-email/send',{method:'POST'});const body=await res.json();setMessage(res.ok?'Verification email sent.':body.error);}catch{setMessage('Could not send email. Please retry.');}finally{setBusy(false);}
    }}>Send verification email</button>{message}
  </aside>;
}
export function EmailVerificationScreen() {
  const [message,setMessage]=useState('Confirm your email to enable project invitations.');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
  const token=new URLSearchParams(location.search).get('token');
  return <main className="max-w-lg mx-auto p-8"><h1 className="text-2xl font-bold mb-4">Verify your email</h1><p role="status">{message}</p>
    {!done && <button disabled={busy || !token} className="bg-indigo-700 text-white rounded p-3 my-4" onClick={async()=>{
      setBusy(true);try{const res=await fetch('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const body=await res.json();if(!res.ok)throw new Error(body.error);setDone(true);setMessage('Email verified. You can now return to the app.');history.replaceState({},'', '/verify-email');}catch(e:any){setMessage(e.message);}finally{setBusy(false);}
    }}>Verify email</button>}<a className="block underline p-2" href="/">Return to Fire Finance Pro</a>
  </main>;
}
