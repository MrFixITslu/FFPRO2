import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createHubSessionEnforcement } from "../server/hubSessionEnforcement.js";
import { createHubEntitlementChecker } from "../server/hubEntitlementRevalidation.js";

test("Hub-managed FFPRO session enforces signed live subscription on actual Express HTTP route",async t => {
  const secret="ffpro-runtime-staging-secret-1234567890";
  let revoked=false, offline=false, count=0, loggedOut=false;
  const hub = createServer(async(req,res)=>{
    if(offline) {res.writeHead(503);return res.end("{}");}
    const parts=[];
    for await (const p of req) parts.push(p);
    const body=Buffer.concat(parts).toString("utf8");
    const stamp=String(req.headers["x-v79-timestamp"]||"");
    const digest=createHash("sha256").update(body).digest("hex");
    const expected=createHmac("sha256",secret).update(["POST",req.url,stamp,digest].join("\n")).digest("hex");
    const a=Buffer.from(expected,"hex"),b=Buffer.from(String(req.headers["x-v79-signature"]||""),"hex");
    if(a.length!==b.length||!timingSafeEqual(a,b)||Math.abs(Date.now()-Number(stamp))>300000) {
      res.writeHead(401);return res.end("{}");
    }
    count++;
    const payload=JSON.parse(body);
    const allowed=!revoked && payload.organizationId==="test-customer-a" &&
      payload.scopedUserId==="test-scoped-user" && payload.product==="ffpro";
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({allowed,validForSeconds:allowed?1:0}));
  });
  await new Promise(resolve=>hub.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>hub.close(resolve)));
  const check=createHubEntitlementChecker({
    product:"ffpro",
    hubUrl:"http://127.0.0.1:"+hub.address().port,
    secret,
  });
  const app=express();
  let session={
    hubManaged:true,hubOrganizationId:"test-customer-a",hubUserId:"test-scoped-user",
    hubAccessExpiresAt:Date.now()+60000,
  };
  app.use((req,res,next)=>{
    req.session={
      ...session,
      destroy: cb=>{loggedOut=true;cb();},
    };
    req.logout=cb=>{loggedOut=true;cb();};
    req.isAuthenticated=()=>true;
    next();
  });
  app.use(createHubSessionEnforcement({checkHubSubscription:check}));
  app.get("/api/private", (req,res)=>res.json({ok:true}));
  app.get("/api/health", (req,res)=>res.json({ok:true}));
  const server=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url="http://127.0.0.1:"+server.address().port;
  async function get(path="/api/private") {return fetch(url+path);}
  assert.equal((await get()).status,200,"existing authenticated session permits valid access");
  assert.equal(count,1);
  session.hubManaged=false;
  // The request is still authenticated by Passport, but no Hub entitlement exists.
  // The test injects req.isAuthenticated in its synthetic session middleware.
  assert.equal((await get()).status,403,"authenticated legacy local cookie cannot bypass Hub enforcement");
  session.hubManaged=true;
  session.hubUserId="other-tenant-user";
  assert.equal((await get()).status,403,"cross-tenant scoped identity fails");
  session.hubUserId="test-scoped-user";
  await new Promise(resolve=>setTimeout(resolve,1100));
  revoked=true;
  assert.equal((await get()).status,403,"revocation blocks already-issued session");
  revoked=false;offline=true;
  assert.equal((await get()).status,403,"Hub outage denies access");
  session.hubAccessExpiresAt=Date.now()-1;
  assert.equal((await get()).status,401,"expired Hub session denied in same API request");
  assert.equal(loggedOut,true);
  assert.equal((await get("/api/health")).status,200,"health status stays available");
});
