import test from "node:test";
import assert from "node:assert/strict";
import { hubManagedSessionExpired } from "../server/hubManagedSessionPolicy.js";
test("Hub-owned FFPRO session expires exactly at deadline",()=>{
  const now=Date.now();
  assert.equal(hubManagedSessionExpired({hubManaged:true,hubAccessExpiresAt:now+1},now),false);
  assert.equal(hubManagedSessionExpired({hubManaged:true,hubAccessExpiresAt:now},now),true);
});
test("missing, malformed and past expiry fail closed",()=>{
  assert.equal(hubManagedSessionExpired({hubManaged:true}),true);
  assert.equal(hubManagedSessionExpired({hubManaged:true,hubAccessExpiresAt:"invalid"}),true);
  assert.equal(hubManagedSessionExpired({hubManaged:true,hubAccessExpiresAt:0}),true);
  assert.equal(hubManagedSessionExpired({hubManaged:false}),false);
});
