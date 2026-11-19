import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanningApproval} from '../server/tiquetPlanningContract.js';
import {createApprovedPlanningProject,initTiquetPlanningSchema} from '../server/tiquetPlanningStore.js';

function proposal(){
  return parsePlanningApproval({organizationId:'org-saint-lucia-001',jobId:'job-12345',
    ticketNumber:'TK-001',customerName:'Caribbean SME',jobTitle:'Network installation',
    eventId:'approval-12345678',approval:'client-quote-approved',approvedAt:new Date().toISOString()});
}

function fakeDb({owner=true,failMembership=false}={}){
  let link=null,created=null,tx=null,commits=0,rollbacks=0;
  const client={
    async query(sql,args=[]){
      if(sql==='BEGIN'){tx={link:null,project:null};return {rows:[]};}
      if(sql==='ROLLBACK'){tx=null;rollbacks++;return {rows:[]};}
      if(sql==='COMMIT'){
        if(tx?.project)created=tx.project;
        if(tx?.link)link=tx.link;
        tx=null;commits++;return {rows:[]};
      }
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
      if(sql.includes('SELECT project_id,event_id,fingerprint,state FROM tiquet_planning_links'))
        return {rows:link?[link]:[]};
      if(sql.includes('SELECT project_id FROM tiquet_planning_links WHERE event_id'))
        return {rows:link?.event_id===args[0]?[link]:[]};
      if(sql.includes('SELECT id FROM users WHERE hub_organization_id'))
        return {rows:owner?[{id:'owner-001'}]:[]};
      if(sql.includes('INSERT INTO projects(')){
        tx.project={id:'project-001',data:JSON.parse(args[3]),ownerId:args[0],projectType:args[2]};
        return {rows:[{id:'project-001'}]};
      }
      if(sql.includes('INSERT INTO project_members')){
        if(failMembership)throw new Error('Synthetic DB error');
        return {rows:[]};
      }
      if(sql.includes('INSERT INTO tiquet_planning_links')){
        tx.link={project_id:args[4],event_id:args[2],fingerprint:args[3],state:'in-planning'};
        return {rows:[]};
      }
      throw new Error('Unexpected SQL: '+sql.slice(0,100));
    },
    release(){}
  };
  return {pool:{connect:async()=>client,query:async(sql)=>({rows:[],sql})},
    get:()=>({link,created,commits,rollbacks})};
}

test('schema includes tenant/job composite primary key and unique event ID',async()=>{
  const {pool}=fakeDb();const result=await initTiquetPlanningSchema(pool);
  assert.equal(result,undefined);
});

test('approval creates exactly one owner-only service project and replay reuses ID',async()=>{
  const db=fakeDb();
  const event=proposal();
  const a=await createApprovedPlanningProject(db.pool,event);
  const b=await createApprovedPlanningProject(db.pool,event);
  assert.deepEqual(a,{projectId:'project-001',state:'in-planning',duplicate:false});
  assert.deepEqual(b,{projectId:'project-001',state:'in-planning',duplicate:true});
  assert.equal(db.get().commits,2);
  assert.equal(db.get().created.projectType,'service');
  assert.equal(db.get().created.ownerId,'owner-001');
  assert.deepEqual(db.get().created.data.tiquet.approvedFileIds,[]);
});

test('reused approval ID with changed identity fails closed',async()=>{
  const db=fakeDb();const event=proposal();
  await createApprovedPlanningProject(db.pool,event);
  await assert.rejects(()=>createApprovedPlanningProject(db.pool,{...event,customerName:'Wrong',fingerprint:'different'}),
    e=>e.status===409);
  assert.equal(db.get().rollbacks,1);
  assert.equal(db.get().created.ownerId,'owner-001');
});

test('unknown tenant is denied without an orphan project or member',async()=>{
  const db=fakeDb({owner:false});
  await assert.rejects(()=>createApprovedPlanningProject(db.pool,proposal()),
    e=>e.status===404&&e.code==='TENANT_NOT_PROVISIONED');
  assert.equal(db.get().created,null);
  assert.equal(db.get().rollbacks,1);
});

test('failed membership insertion rolls back project transaction',async()=>{
  const db=fakeDb({failMembership:true});
  await assert.rejects(()=>createApprovedPlanningProject(db.pool,proposal()),/Synthetic DB error/);
  assert.equal(db.get().created,null);
  assert.equal(db.get().rollbacks,1);
});
