import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PlanningContractError,parsePlanningApproval,
  safePlanningSecret,buildTiquetServiceProject
} from '../server/tiquetPlanningContract.js';

const event=()=>({
  organizationId:'org-saint-lucia-001',
  jobId:'job-12345',
  ticketNumber:'T-2026-001',
  customerName:'Caribbean Customer',
  jobTitle:'Managed ICT installation',
  eventId:'approval-12345678',
  approvedAt:new Date().toISOString(),
  approval:'client-quote-approved'
});

test('Handoff requires a separate 32-character planning secret',()=>{
  const key='x'.repeat(36);
  assert.equal(safePlanningSecret(key,key),true);
  assert.equal(safePlanningSecret('y'.repeat(36),key),false);
  assert.equal(safePlanningSecret('x'.repeat(31),'x'.repeat(31)),false);
  assert.equal(safePlanningSecret(undefined,key),false);
});

test('Quote-approved event includes immutable organisation, job and event identity',()=>{
  const e=parsePlanningApproval(event());
  assert.equal(e.organizationId,'org-saint-lucia-001');
  assert.equal(e.jobId,'job-12345');
  assert.match(e.fingerprint,/^[0-9a-f]{64}$/);
  assert.equal(parsePlanningApproval(event()).fingerprint,e.fingerprint);
});

test('Reject prospect enquiries, missing tenants, unsupported event and malformed identifiers',()=>{
  for(const patch of [
    {approval:'prospect-created'}, {approval:'status-changed'}, {organizationId:''},
    {jobId:'../../etc/passwd'}, {eventId:'short'}, {customerName:''},
    {approvedAt:'invalid date'}, {ticketNumber:''}
  ]){
    assert.throws(()=>parsePlanningApproval({...event(),...patch}),PlanningContractError);
  }
});

test('Reject stale, future, and oversized identity values',()=>{
  assert.throws(()=>parsePlanningApproval({...event(),approvedAt:'2000-01-01'}));
  assert.throws(()=>parsePlanningApproval({...event(),approvedAt:'2050-01-01'}));
  assert.throws(()=>parsePlanningApproval({...event(),jobTitle:'X'.repeat(300)}));
});

test('ICT service project is private and compatible with FFPRO shared Planner data',()=>{
  const p=buildTiquetServiceProject(parsePlanningApproval(event()));
  assert.equal(p.projectType,'service');
  assert.equal(p.data.eventType,'service');
  assert.equal(p.data.status,'planned');
  assert.match(p.name,/Caribbean Customer.*T-2026-001/);
  assert.equal(p.data.tiquet.organizationId,'org-saint-lucia-001');
  assert.deepEqual(p.data.tiquet.approvedFileIds,[]);
  assert.ok(p.data.tasks.length>=3);
  assert.ok(p.data.tasks.every(t=>t.completed===false));
  assert.deepEqual(p.data.files,[]);
  assert.equal(p.data.items.length,0);
});
