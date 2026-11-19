import test from 'node:test';
import assert from 'node:assert/strict';
import {markTiquetReviewReady,closeTiquetServiceProject} from '../server/tiquetPlanningLifecycle.js';

const P='123e4567-e89b-42d3-a456-426614174000';
const U='123e4567-e89b-42d3-a456-426614174001';
const SYSTEM_FILE='123e4567-e89b-42d3-a456-426614174010';
const ORG='org-caribbean-1234';
const JOB='tiquet-job-123';
const baseData=()=>({
  name:'Customer — Tiquet 123',status:'planned',
  tasks:[{id:'scope',completed:true},{id:'review',completed:true}],
  files:[{id:'f1',systemFileId:SYSTEM_FILE},{id:'f2',systemFileId:'123e4567-e89b-42d3-a456-426614174011'}],
  tiquet:{organizationId:ORG,jobId:JOB,approvedFileIds:[]}
});

function db({role='owner',state='in-planning',tasksComplete=true,wrongTenant=false}={}){
  let status=state,data=baseData(),updated=0,callbacks=0,commits=0,rollbacks=0;
  if(!tasksComplete)data.tasks[0].completed=false;
  if(wrongTenant)data.tiquet.organizationId='another-org';
  const client={
    async query(sql,params=[]){
      if(sql==='BEGIN')return {rows:[]};
      if(sql==='COMMIT'){commits++;return {rows:[]}};
      if(sql==='ROLLBACK'){rollbacks++;return {rows:[]}};
      if(sql.includes('SELECT role FROM project_members'))return {rows:role?[{role}]:[]};
      if(sql.includes('SELECT id,project_type,data,version FROM projects'))
        return {rows:[{id:P,project_type:'service',data,version:1+updated}]};
      if(sql.includes('SELECT organization_id,tiquet_job_id,state FROM tiquet_planning_links'))
        return {rows:[{organization_id:ORG,tiquet_job_id:JOB,state:status}]};
      if(sql.includes('SELECT l.state,p.data FROM tiquet_planning_links'))
        return {rows:[{state:status,data}]};
      if(sql.includes('SELECT id,file_name,file_type,file_size,file_data FROM system_files')){
        const fileData=Buffer.from('synthetic-integration-document');
        return {rows:params[1].map(id=>({
          id,file_name:'synthetic.pdf',file_type:'application/pdf',
          file_size:fileData.length,file_data:fileData
        }))};
      }
      if(sql.includes('INSERT INTO tiquet_planning_shared_files'))
        return {rows:[]};
      if(sql.includes('UPDATE projects SET')){
        data=JSON.parse(params[0]);updated++;return {rows:[]};
      }
      if(sql.includes('UPDATE tiquet_planning_links')){
        status=sql.includes("state='closed'")?'closed':'review-ready';return {rows:[]};
      }
      if(sql.includes('INSERT INTO tiquet_planning_callbacks')){
        callbacks++;return {rows:[]};
      }
      throw new Error('Unknown SQL '+sql.slice(0,100));
    },release(){}
  };
  return {pool:{connect:async()=>client},get:()=>({status,data,updated,callbacks,commits,rollbacks})};
}

test('Planning Review requires owner/editor, not viewer or unknown user',async()=>{
  for(const role of ['viewer',null]){
    const x=db({role});
    await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:P,userId:U}),e=>e.status===403);
    assert.equal(x.get().updated,0);
  }
});

test('Rejects incomplete checklist and unknown client-visible file IDs',async()=>{
  let x=db({tasksComplete:false});
  await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:P,userId:U}),e=>e.status===409);
  x=db();
  await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:P,userId:U,approvedFileIds:['other']}),e=>e.status===400);
  assert.equal(x.get().callbacks,0);
});

test('Completed planning queues one callback; repeated action is idempotent',async()=>{
  const x=db();
  const first=await markTiquetReviewReady(x.pool,{projectId:P,userId:U,approvedFileIds:['f1']});
  const second=await markTiquetReviewReady(x.pool,{projectId:P,userId:U,approvedFileIds:['f1']});
  assert.equal(first.state,'review-ready');
  assert.equal(first.duplicate,false);
  assert.equal(second.duplicate,true);
  assert.equal(x.get().callbacks,1);
  assert.deepEqual(x.get().data.tiquet.approvedFileIds,['f1']);
  assert.equal(x.get().status,'review-ready');
});

test('Refuses cross-organisation planning even with a project member',async()=>{
  const x=db({wrongTenant:true});
  await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:P,userId:U}),e=>e.status===403);
  assert.equal(x.get().updated,0);
});

test('Closing is only allowed from Review-ready and preserves tenant boundary',async()=>{
  const x=db();
  await assert.rejects(()=>closeTiquetServiceProject(x.pool,{
    organizationId:ORG,jobId:JOB,projectId:P}),e=>e.status===409);
  const y=db({state:'review-ready'});
  const a=await closeTiquetServiceProject(y.pool,{organizationId:ORG,jobId:JOB,projectId:P});
  const b=await closeTiquetServiceProject(y.pool,{organizationId:ORG,jobId:JOB,projectId:P});
  assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
  assert.equal(y.get().status,'closed');assert.equal(y.get().data.status,'closed');
  assert.equal(y.get().updated,1);
});

test('Unrecognised project UUIDs and duplicate selected artefacts are rejected',async()=>{
  const x=db();
  await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:'x',userId:U}),e=>e.status===400);
  await assert.rejects(()=>markTiquetReviewReady(x.pool,{projectId:P,userId:U,approvedFileIds:['f1','f1']}),e=>e.status===400);
});
