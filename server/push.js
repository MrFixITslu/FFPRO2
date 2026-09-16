import webPush from 'web-push';
import crypto from 'node:crypto';
import { DateTime, IANAZone } from 'luxon';
import { realPool } from './db.js';
import { decryptForUser } from './crypto.js';
export const pushConfigured = () => Boolean(realPool && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
export function validSubscription(subscription) {
  try {
    const url=new URL(subscription.endpoint);
    const trusted=url.hostname==='fcm.googleapis.com' || url.hostname==='updates.push.services.mozilla.com' || url.hostname.endsWith('.push.apple.com');
    return trusted && url.protocol==='https:' && !url.username && !url.password && !url.port && subscription.endpoint.length<2048 && /^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh) && /^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth);
  } catch { return false; }
}
export async function initPush() {
  if(!realPool)return;
  await realPool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL, timezone TEXT NOT NULL, last_day TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);`);
  if(pushConfigured()) webPush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
}
export async function saveSubscription(userId,subscription,timezone) {
  if(!validSubscription(subscription) || !IANAZone.isValidZone(timezone)) throw Object.assign(new Error('Invalid notification subscription.'),{status:400});
  const hash=crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
  const client=await realPool.connect();
  try {
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`push:${userId}`]);
    const existing=(await client.query('SELECT endpoint_hash FROM push_subscriptions WHERE user_id=$1',[userId])).rows;
    if(existing.length>=10 && !existing.some(x=>x.endpoint_hash===hash)) throw Object.assign(new Error('Remove a device before adding more notification subscriptions.'),{status:400});
    await client.query(`INSERT INTO push_subscriptions(endpoint_hash,user_id,subscription,timezone) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,timezone=EXCLUDED.timezone,updated_at=now()`,[hash,userId,JSON.stringify(subscription),timezone]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function removeSubscription(userId,endpoint) {
  if(!realPool)return;
  const hash=crypto.createHash('sha256').update(String(endpoint)).digest('hex');
  await realPool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2',[userId,hash]);
}
export function reminderCount(state,today) {
  return (state.calendarItems || []).filter(x=>!x.completed && x.date===today).length +
    (state.recurringExpenses || []).filter(x=>x.nextDueDate && x.nextDueDate<=today).length +
    (state.recurringIncomes || []).filter(x=>x.nextDueDate===today).length;
}
let running=false;
export async function deliverReminders() {
  if(running || !pushConfigured())return;running=true;
  let client;
  try {
    client=await realPool.connect();
    const locked=(await client.query('SELECT pg_try_advisory_lock(7983211) AS locked')).rows[0].locked;
    if(!locked)return;
    let cursor='';
    while(true){
      const {rows}=await client.query(`SELECT s.*,d.ciphertext,d.iv,d.auth_tag FROM push_subscriptions s JOIN user_data d ON d.user_id=s.user_id WHERE s.endpoint_hash>$1 ORDER BY s.endpoint_hash LIMIT 100`,[cursor]);
      for(const row of rows){
        cursor=row.endpoint_hash;
        const local=DateTime.now().setZone(row.timezone),day=local.toISODate();
        if(local.hour<9 || row.last_day===day)continue;
        try {
          const state=decryptForUser(row.user_id,{ciphertext:row.ciphertext,iv:row.iv,authTag:row.auth_tag});
          const count=reminderCount(state,day);
          if(count>0)await webPush.sendNotification(row.subscription,JSON.stringify({title:'FFPRO2 reminders',body:'You have saved reminders due. Open FFPRO2 to review them.',url:'/',tag:`ffpro-reminders-${day}`,badgeCount:count}),{TTL:3600,timeout:10000});
          await client.query('UPDATE push_subscriptions SET last_day=$1 WHERE endpoint_hash=$2',[day,row.endpoint_hash]);
        }catch(error){
          if([404,410].includes(error.statusCode))await client.query('DELETE FROM push_subscriptions WHERE endpoint_hash=$1',[row.endpoint_hash]);
          else console.warn('[push] Delivery deferred:',error.statusCode || error.name);
        }
      }
      if(rows.length<100)break;
    }
  }finally{if(client){await client.query('SELECT pg_advisory_unlock(7983211)').catch(()=>{});client.release();}running=false;}
}
export function startPushScheduler(){
  if(!pushConfigured())return null;
  const tick=()=>deliverReminders().catch(()=>console.warn('[push] Reminder service unavailable.'));
  tick();const timer=setInterval(tick,60000);timer.unref();return timer;
}
