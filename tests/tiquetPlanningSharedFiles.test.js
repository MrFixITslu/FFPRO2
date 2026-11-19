import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {approvePlanningFiles,listPlanningSharedFiles,getApprovedPlanningFile,
  ensurePlanningFileGrantsSchema} from '../server/tiquetPlanningSharedFiles.js';

const P='123e4567-e89b-42d3-a456-426614174000';
const A='123e4567-e89b-42d3-a456-426614174010';
const B='123e4567-e89b-42d3-a456-426614174011';
const ORG='org-caribbean-1234';
const JOB='job-123';
const file=(id,backing)=>({id,systemFileId:backing});
const data={files:[file('f1',A),file('f2',B)]};
function mock(){
  const inserted=[];
  const bytes=Buffer.from('synthetic private document');
  const rows=[
    {id:A,file_name:'approved.pdf',file_type:'application/pdf',file_size:bytes.length,file_data:bytes},
    {id:B,file_name:'private.pdf',file_type:'application/pdf',file_size:bytes.length,file_data:bytes}
  ];
  return {inserted,bytes,client:{
    query:async(sql,params=[])=>{
      if(sql.includes('SELECT id,file_name,file_type,file_size,file_data FROM system_files'))
        return {rows:rows.filter(x=>params[1].includes(x.id))};
      if(sql.includes('INSERT INTO tiquet_planning_shared_files')){
        inserted.push(params);return {rows:[]};
      }
      throw Error('unexpected SQL '+sql);
    }
  }};
}

test('Only stored, project-backed files may receive immutable grants',async()=>{
  const m=mock();
  const grants=await approvePlanningFiles(m.client,{projectId:P,
    selectedFileIds:['f1'],projectData:data});
  assert.deepEqual(grants,[A]);
  assert.equal(m.inserted.length,1);
  assert.equal(m.inserted[0][1],A);
  assert.equal(m.inserted[0][5],crypto.createHash('sha256').update(m.bytes).digest('hex'));
});

test('Rejects unattached, missing backing, forged, or repeated files',async()=>{
  for(const selectedFileIds of [['bogus'],['f1','f1']]){
    await assert.rejects(()=>approvePlanningFiles(mock().client,
      {projectId:P,selectedFileIds,projectData:data}));
  }
  await assert.rejects(()=>approvePlanningFiles(mock().client,{
    projectId:P,selectedFileIds:['f1'],projectData:{files:[{id:'f1'}]}
  }));
});

test('No selected files means no grants or DB reads',async()=>{
  const m=mock();
  assert.deepEqual(await approvePlanningFiles(m.client,{
    projectId:P,selectedFileIds:[],projectData:data
  }),[]);
  assert.equal(m.inserted.length,0);
});

test('File lists are tenant-scoped and return only server-controlled metadata',async()=>{
  let captured;
  const pool={query:async(sql,params)=>{captured={sql,params};return {
    rows:[{id:A,name:'approved.pdf',type:'application/pdf',size:'24'}]
  }}};
  const items=await listPlanningSharedFiles(pool,
    {projectId:P,organizationId:ORG,jobId:JOB});
  assert.deepEqual(items,[{id:A,name:'approved.pdf',type:'application/pdf',size:24}]);
  assert.deepEqual(captured.params,[P,ORG,JOB]);
  assert.match(captured.sql,/tiquet_planning_shared_files/);
  assert.match(captured.sql,/review-ready/);
});

test('File retrieval verifies immutable content fingerprint',async()=>{
  const bytes=Buffer.from('private content');
  let changed=false;
  const pool={query:async()=>({rows:[{
    approved_name:'approved.pdf',approved_type:'application/pdf',
    approved_size:bytes.length,approved_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    file_data:changed?Buffer.from('tampered bytes!'):bytes
  }]})};
  const scope={projectId:P,organizationId:ORG,jobId:JOB,fileId:A};
  const allowed=await getApprovedPlanningFile(pool,scope);
  assert.deepEqual(allowed.data,bytes);
  assert.equal(allowed.fileType,'application/octet-stream');
  changed=true;
  await assert.rejects(()=>getApprovedPlanningFile(pool,scope),
    e=>e.code==='FILE_CHANGED');
});

test('Cross-org, malformed file IDs and missing grants fail closed',async()=>{
  const pool={query:async()=>({rows:[]})};
  await assert.rejects(()=>getApprovedPlanningFile(pool,
    {projectId:P,organizationId:'wrong',jobId:JOB,fileId:A}),e=>e.status===404);
  await assert.rejects(()=>getApprovedPlanningFile(pool,
    {projectId:P,organizationId:ORG,jobId:JOB,fileId:B}),e=>e.status===404);
});

test('Schema registration creates a dedicated server-only grant table',async()=>{
  let sql;await ensurePlanningFileGrantsSchema({query:async(x)=>{sql=x;return {rows:[]}}});
  assert.match(sql,/CREATE TABLE IF NOT EXISTS tiquet_planning_shared_files/);
  assert.match(sql,/approved_sha256/);
});
