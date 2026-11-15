import crypto from 'node:crypto';
import {PlanningContractError} from './tiquetPlanningContract.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORG=/^[A-Za-z0-9._:-]{8,180}$/;
const JOB=/^[A-Za-z0-9:._-]{1,160}$/;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export async function ensurePlanningFileGrantsSchema(pool){
  if(!pool)throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS tiquet_planning_shared_files ('+
    'project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,'+
    'file_id UUID NOT NULL REFERENCES system_files(id) ON DELETE RESTRICT,'+
    'approved_name TEXT NOT NULL,approved_type TEXT NOT NULL,'+
    'approved_size BIGINT NOT NULL,approved_sha256 TEXT NOT NULL,'+
    'approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),'+
    'PRIMARY KEY(project_id,file_id))'
  );
}

export async function approvePlanningFiles(client,{projectId,selectedFileIds,projectData}){
  if(!UUID.test(projectId)||!Array.isArray(selectedFileIds)||
    selectedFileIds.length>25||new Set(selectedFileIds).size!==selectedFileIds.length)
    throw new PlanningContractError('INVALID_FILES','Invalid file approval.',400);
  if(!selectedFileIds.length)return [];
  const files=Array.isArray(projectData?.files)?projectData.files:[];
  const requested=selectedFileIds.map(uiId=>{
    const item=files.find(f=>f?.id===uiId);
    if(!item||!UUID.test(item.systemFileId))
      throw new PlanningContractError('UNBACKED_FILE',
        'Only project files stored in the approved database may be shared.',400);
    return item.systemFileId;
  });
  if(new Set(requested).size!==requested.length)
    throw new PlanningContractError('INVALID_FILES','Repeated backing file.',400);
  const result=await client.query(
    'SELECT id,file_name,file_type,file_size,file_data FROM system_files '+
    'WHERE project_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',
    [projectId,requested]);
  if(result.rows.length!==requested.length)
    throw new PlanningContractError('UNBACKED_FILE','File does not belong to this project.',403);
  const actual=new Map(result.rows.map(x=>[String(x.id),x]));
  for(const fileId of requested){
    const row=actual.get(fileId);
    if(!row||!Buffer.isBuffer(row.file_data)||row.file_data.length>10*1024*1024)
      throw new PlanningContractError('INVALID_FILE','File could not be safely shared.',400);
    await client.query(
      'INSERT INTO tiquet_planning_shared_files '+
      '(project_id,file_id,approved_name,approved_type,approved_size,approved_sha256) '+
      'VALUES($1,$2,$3,$4,$5,$6)',
      [projectId,fileId,String(row.file_name).slice(0,240),
       String(row.file_type||'application/octet-stream').slice(0,120),
       row.file_data.length,digest(row.file_data)]);
  }
  return requested;
}

function validateScope({projectId,organizationId,jobId}){
  if(!UUID.test(projectId)||!ORG.test(organizationId)||!JOB.test(jobId))
    throw new PlanningContractError('NOT_FOUND','Shared file not found.',404);
}
export async function listPlanningSharedFiles(pool,scope){
  if(!pool)throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  validateScope(scope);
  const {rows}=await pool.query(
    'SELECT f.file_id AS id,f.approved_name AS name,f.approved_type AS type,'+
    'f.approved_size AS size FROM tiquet_planning_links l '+
    'JOIN tiquet_planning_shared_files f ON f.project_id=l.project_id '+
    'JOIN system_files s ON s.id=f.file_id AND s.project_id=l.project_id::text '+
    'WHERE l.project_id=$1 AND l.organization_id=$2 AND l.tiquet_job_id=$3 '+
    "AND l.state IN ('review-ready','closed') ORDER BY f.approved_name,f.file_id",
    [scope.projectId,scope.organizationId,scope.jobId]);
  return rows.map(x=>({id:x.id,name:x.name,type:x.type,size:Number(x.size)}));
}

export async function getApprovedPlanningFile(pool,{projectId,organizationId,jobId,fileId}){
  if(!pool)throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  validateScope({projectId,organizationId,jobId});
  if(!UUID.test(fileId))throw new PlanningContractError('NOT_FOUND','Shared file not found.',404);
  const {rows}=await pool.query(
    'SELECT f.approved_name,f.approved_type,f.approved_size,f.approved_sha256,'+
    's.file_data FROM tiquet_planning_links l '+
    'JOIN tiquet_planning_shared_files f ON f.project_id=l.project_id '+
    'JOIN system_files s ON s.id=f.file_id AND s.project_id=l.project_id::text '+
    'WHERE l.project_id=$1 AND l.organization_id=$2 AND l.tiquet_job_id=$3 '+
    "AND l.state IN ('review-ready','closed') AND f.file_id=$4",
    [projectId,organizationId,jobId,fileId]);
  const x=rows[0];
  if(!x)throw new PlanningContractError('NOT_FOUND','Shared file not found.',404);
  if(!Buffer.isBuffer(x.file_data)||x.file_data.length!==Number(x.approved_size)||
    x.file_data.length>10*1024*1024||digest(x.file_data)!==x.approved_sha256)
    throw new PlanningContractError('FILE_CHANGED','Approved file changed since review.',409);
  return {
    fileName:x.approved_name,
    fileType:'application/octet-stream',
    data:x.file_data
  };
}
