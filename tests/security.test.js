import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const folder=await mkdtemp(path.join(tmpdir(),'ffpro-test-'));
process.env.NODE_ENV='test';
process.env.DATABASE_FILE=path.join(folder,'db.json');
process.env.ENCRYPTION_KEY_FILE=path.join(folder,'key');
process.env.DATA_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
process.env.SESSION_SECRET=crypto.randomBytes(32).toString('hex');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL || '';
process.env.FRONTEND_URL='http://localhost:3197';
process.env.PORT='3197';
process.env.TAVILY_API_KEY='';process.env.GEMINI_API_KEY='';
process.env.GOOGLE_CLIENT_ID='';process.env.GOOGLE_CLIENT_SECRET='';
process.env.FACEBOOK_APP_ID='';process.env.FACEBOOK_APP_SECRET='';
process.env.SMTP_HOST='';
await import('../server/config.js');
const db=await import('../server/db.js');await db.databaseReady;
const security=await import('../server/securityStore.js');await security.initSecuritySchema();
const {safeFileType}=await import('../server/routes/files.js');
const {validSubscription,reminderCount}=await import('../server/push.js');
const {findOrCreateOAuthUser}=await import('../server/passport.js');
let logs='';
const child=spawn(process.execPath,['--import','tsx','server.ts'],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
const base='http://localhost:3197';
class Client {
  cookie='';token='';
  async request(route,{method='GET',data,body,headers={}}={}) {
    const response=await fetch(base+route,{method,headers:{Origin:base,...(this.cookie?{Cookie:this.cookie}:{}),...(this.token?{'x-csrf-token':this.token}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):body,redirect:'manual'});
    for(const cookie of response.headers.getSetCookie())this.cookie=cookie.split(';')[0];
    return response;
  }
  async csrf(){this.token=(await (await this.request('/api/auth/csrf')).json()).csrfToken;}
  async register(email){await this.csrf();const res=await this.request('/api/auth/register',{method:'POST',data:{email,username:email.split('@')[0],password:'Strong-test-123!'}});assert.equal(res.status,201,await res.clone().text());const json=await res.json();assert.ok(json.user.id);assert.equal(json.token,undefined);await this.csrf();return json.user;}
}
async function waitReady(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/live')).ok)return;}catch{}if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}throw new Error(logs);}
async function insertReset(userId,token){const row={id:crypto.randomUUID(),user_id:userId,token_hash:crypto.createHash('sha256').update(token).digest('hex'),expires_at:new Date(Date.now()+60000).toISOString()};if(db.realPool)await db.realPool.query('INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',Object.values(row));else{const data=db.readDB();data.password_reset_tokens.push(row);db.writeDB(data);}}
test('security and persistence integration',async t=>{
  try{
    await waitReady();
    const owner=new Client(),other=new Client(),anonymous=new Client();
    const suffix=crypto.randomBytes(5).toString('hex');
    const user=await owner.register(`owner-${suffix}@example.test`), stranger=await other.register(`other-${suffix}@example.test`);
    await t.test('cookie-only authentication and CSRF protect writes',async()=>{
      assert.match(owner.cookie,/ffpro.sid/);
      assert.equal((await anonymous.request('/api/files/not-a-file')).status,401);
      assert.equal((await owner.request('/api/data',{method:'PUT',data:{data:{transactions:[],events:[]},expectedVersion:0},headers:{'x-csrf-token':''}})).status,403);
      assert.equal((await owner.request('/api/data',{method:'PUT',data:{data:{transactions:[],events:[]},expectedVersion:0},headers:{Origin:'https://attacker.example'}})).status,403);
      assert.equal((await owner.request('/api/ai/ollama/config',{method:'POST',data:{baseUrl:'http://127.0.0.1'}})).status,403);
      assert.equal((await owner.request('/api/ai/bank-sync',{method:'POST',data:{}})).status,501);
    });
    await t.test('concurrent first saves conflict and reset retains monotonically increasing versions',async()=>{
      const payload={transactions:[],events:[{id:'personal-plan'}],bankConnections:[{institution:'Manual',openingBalance:0}],cashOpeningBalance:0};
      const responses=await Promise.all([owner.request('/api/data',{method:'PUT',data:{data:payload,expectedVersion:0}}),owner.request('/api/data',{method:'PUT',data:{data:payload,expectedVersion:0}})]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      assert.equal((await (await owner.request('/api/data')).json()).data.cashOpeningBalance,0);
      assert.equal((await owner.request('/api/data',{method:'PUT',data:{data:payload,expectedVersion:0,force:true}})).status,409);
      assert.equal((await owner.request('/api/data',{method:'DELETE',data:{expectedVersion:0}})).status,409);
    });
    let fileId;
    await t.test('only the owner can read or delete personal files; active uploads rejected',async()=>{
      const form=new FormData();form.append('file',new Blob(['private text']), 'notes.txt');form.append('projectId','personal-plan');
      const uploaded=await owner.request('/api/files/upload',{method:'POST',body:form});assert.equal(uploaded.status,201,await uploaded.clone().text());fileId=(await uploaded.json()).files[0].id;
      const file=await owner.request(`/api/files/${fileId}`);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/attachment/);assert.equal(await file.text(),'private text');
      assert.equal((await other.request(`/api/files/${fileId}`)).status,404);
      assert.equal((await other.request(`/api/files/${fileId}`,{method:'DELETE'})).status,404);
      assert.throws(()=>safeFileType('attack.html',Buffer.from('<script>alert(1)</script>')));
      assert.throws(()=>safeFileType('attack.png',Buffer.from('<svg onload=alert(1)>')));
    });
    await t.test('email verification is one-time and does not auto-link existing OAuth accounts',async()=>{
      const token=await security.createVerification(user.id);
      assert.equal(await security.consumeVerification(token),true);assert.equal(await security.consumeVerification(token),false);
      await assert.rejects(findOrCreateOAuthUser({provider:'google',providerId:'fake-'+suffix,email:user.email,emailVerified:true}),/existing password/);
    });
    await t.test('invite preview works, verification is required and consumption is atomic',async()=>{
      const {projectsDb,acceptInvitation}=await import('../server/projectsDb.js');
      const project=await projectsDb.createProject({ownerId:user.id,name:'Test',projectType:'event',data:{}});
      const invite=await projectsDb.createInvite({projectId:project.id,email:stranger.email,role:'viewer',invitedBy:user.id});
      const preview=await anonymous.request(`/api/invites/${invite.token}`);assert.equal(preview.status,200,await preview.clone().text());
      assert.equal((await other.request(`/api/invites/${invite.token}/accept`,{method:'POST'})).status,403);
      await security.verifyUser(stranger.id);const verified=await security.getUser(stranger.id);
      const accepted=await Promise.all([acceptInvitation(invite.token,verified),acceptInvitation(invite.token,verified)]);
      assert.equal(accepted.filter(Boolean).length,1);assert.equal((await projectsDb.getMembership(project.id,stranger.id)).role,'viewer');
    });
    await t.test('password reset revokes existing sessions and token cannot be replayed',async()=>{
      const token=crypto.randomBytes(32).toString('hex');await insertReset(user.id,token);
      await anonymous.csrf();
      const res=await anonymous.request('/api/auth/reset-password',{method:'POST',data:{token,password:'New-strong-123!'}});assert.equal(res.status,200,await res.clone().text());
      assert.equal((await (await owner.request('/api/auth/me')).json()).user,null);
      assert.equal((await anonymous.request('/api/auth/reset-password',{method:'POST',data:{token,password:'New-strong-123!'}})).status,400);
    });
    await t.test('reset preserves version and rejects a stale save afterward',async()=>{
      await owner.csrf();const login=await owner.request('/api/auth/login',{method:'POST',data:{email:user.email,password:'New-strong-123!'}});assert.equal(login.status,200);await owner.csrf();
      const res=await owner.request('/api/data',{method:'DELETE',data:{expectedVersion:1}});assert.equal(res.status,200,await res.clone().text());
      assert.equal((await (await owner.request('/api/data')).json()).version,2);
      assert.equal((await owner.request('/api/data',{method:'PUT',data:{data:{transactions:[],events:[]},expectedVersion:1}})).status,409);
      assert.equal((await owner.request(`/api/files/${fileId}`,{method:'DELETE'})).status,200);
    });
    await t.test('push endpoints cannot target internal services and reminders are deterministic',()=>{
      assert.equal(validSubscription({endpoint:'https://127.0.0.1/private',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}),false);
      assert.equal(validSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}),true);
      assert.equal(reminderCount({calendarItems:[{date:'2026-09-15'},{date:'2026-09-15',completed:true}],recurringExpenses:[{nextDueDate:'2026-09-14'}]},'2026-09-15'),2);
    });
  }finally{
    child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>{const timer=setTimeout(r,11000);timer.unref();})]);if(child.exitCode===null)child.kill('SIGKILL');
    if(db.realPool)await db.realPool.end();await rm(folder,{recursive:true,force:true});
  }
});
