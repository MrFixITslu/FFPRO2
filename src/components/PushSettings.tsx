import { useState } from 'react';
export function PushSettings(){
  const [message,setMessage]=useState('Daily reminders for saved calendar items and bills are delivered after 9 AM in this device’s timezone.');
  const [busy,setBusy]=useState(false);
  const change=async(enabled:boolean)=>{
    setBusy(true);
    try {
      if(!('serviceWorker' in navigator) || !('PushManager' in window))throw new Error('This browser does not support background notifications. On iPhone, install the app on your Home Screen first.');
      if(enabled && await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser settings to enable reminders.');
      const status=await fetch('/api/notifications/push/config').then(r=>r.json());
      if(enabled && !status.enabled)throw new Error('Background reminders need VAPID notification keys configured by the server administrator.');
      const registration=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(enabled){
        if(!subscription){
          const binary=atob(status.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
          subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(binary,c=>c.charCodeAt(0))});
        }
        const res=await fetch('/api/notifications/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
        if(!res.ok)throw new Error('Could not save notification settings. Please retry.');
        setMessage('Daily background reminders enabled for this device. Delivery depends on browser and network availability.');
      }else{
        if(subscription){
          const res=await fetch('/api/notifications/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})});
          if(!res.ok)throw new Error('Could not disable notifications. Please retry.');
          await subscription.unsubscribe();
        }
        setMessage('Background reminders disabled on this device.');
      }
    }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  };
  return <section className="rounded-xl border border-stone-200 p-4 my-4"><h3 className="font-bold">Background reminders</h3><p role="status" className="text-sm my-2">{message}</p><div className="flex gap-4"><button disabled={busy} onClick={()=>change(true)} className="underline">Enable on this device</button><button disabled={busy} onClick={()=>change(false)} className="underline">Disable</button></div></section>;
}
