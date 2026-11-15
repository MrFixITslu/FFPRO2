import { PlanningContractError } from './tiquetPlanningContract.js';
import {approvePlanningFiles} from './tiquetPlanningSharedFiles.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ident=/^[A-Za-z0-9._:-]{8,180}$/;

export async function markTiquetReviewReady(pool,{projectId,userId,approvedFileIds=[]}) {
  if(!pool)throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  if(!uuid.test(projectId)||!uuid.test(userId)||!Array.isArray(approvedFileIds)||
     approvedFileIds.length>25||approvedFileIds.some(x=>typeof x!=='string'||x.length>100)){
    throw new PlanningContractError('INVALID','Invalid project or file selection.');
  }
  if(new Set(approvedFileIds).size!==approvedFileIds.length)
    throw new PlanningContractError('INVALID','Duplicate file selection.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const owner=(await client.query(
      'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
      [projectId,userId])).rows[0];
    if(!owner||!['owner','editor'].includes(owner.role))
      throw new PlanningContractError('FORBIDDEN','Not authorised for this plan.',403);
    const plan=(await client.query(
      'SELECT id,project_type,data,version FROM projects WHERE id=$1 FOR UPDATE',
      [projectId])).rows[0];
    if(!plan||plan.project_type!=='service')
      throw new PlanningContractError('NOT_FOUND','Service project not found.',404);
    const link=(await client.query(
      'SELECT organization_id,tiquet_job_id,state FROM tiquet_planning_links WHERE project_id=$1 FOR UPDATE',
      [projectId])).rows[0];
    if(!link)throw new PlanningContractError('NOT_FOUND','Planning link not found.',404);
    const data=typeof plan.data==='string'?JSON.parse(plan.data):plan.data;
    if(data?.tiquet?.organizationId!==link.organization_id||
       data?.tiquet?.jobId!==link.tiquet_job_id)
      throw new PlanningContractError('TENANT_MISMATCH','Plan has incorrect tenant.',403);
    if(link.state==='closed')
      throw new PlanningContractError('CLOSED','Closed project cannot be sent to Review.',409);
    if(link.state==='review-ready'){
      await client.query('COMMIT');
      return {projectId,state:'review-ready',version:plan.version,duplicate:true};
    }
    const tasks=data.tasks||[];
    if(!tasks.length||!tasks.every(task=>task.completed===true))
      throw new PlanningContractError('TASKS_INCOMPLETE','Complete the planning checklist first.',409);
    const files=new Set((data.files||[]).map(f=>f.id));
    if(approvedFileIds.some(id=>!files.has(id)))
      throw new PlanningContractError('UNKNOWN_FILE','Unrecognised project file.',400);
    // Immutable, tenant-bound grants are inserted in this same transaction.
    // Project metadata alone cannot authorise a client download.
    await approvePlanningFiles(client,{
      projectId,selectedFileIds:approvedFileIds,projectData:data
    });
    const updated={...data,tiquet:{...data.tiquet,
      planningStatus:'review-ready',approvedFileIds:[...approvedFileIds]},
      lastUpdated:new Date().toISOString()};
    await client.query(
      'UPDATE projects SET data=$1::jsonb,version=version+1,updated_at=NOW() WHERE id=$2',
      [JSON.stringify(updated),projectId]);
    await client.query(
      "UPDATE tiquet_planning_links SET state='review-ready',updated_at=NOW() WHERE project_id=$1",
      [projectId]);
    await client.query(
      'INSERT INTO tiquet_planning_callbacks(project_id,organization_id,tiquet_job_id,event_id)'+
      " VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO NOTHING",
      [projectId,link.organization_id,link.tiquet_job_id,'tiquet-review-'+projectId]);
    await client.query('COMMIT');
    return {projectId,state:'review-ready',version:plan.version+1,duplicate:false};
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
}

export async function closeTiquetServiceProject(pool,{organizationId,jobId,projectId}) {
  if(!pool)throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  if(!ident.test(organizationId)||!jobId||jobId.length>160||!uuid.test(projectId))
    throw new PlanningContractError('INVALID','Invalid project closure.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const row=(await client.query(
      'SELECT l.state,p.data FROM tiquet_planning_links l JOIN projects p ON p.id=l.project_id '+
      'WHERE l.organization_id=$1 AND l.tiquet_job_id=$2 AND l.project_id=$3 FOR UPDATE OF l,p',
      [organizationId,jobId,projectId])).rows[0];
    if(!row)throw new PlanningContractError('NOT_FOUND','Planning project not found.',404);
    if(row.state==='closed'){
      await client.query('COMMIT');
      return {projectId,state:'closed',duplicate:true};
    }
    if(row.state!=='review-ready')
      throw new PlanningContractError('INVALID_STAGE','Project has not reached Review.',409);
    const data=typeof row.data==='string'?JSON.parse(row.data):row.data;
    if(data?.tiquet?.organizationId!==organizationId||data?.tiquet?.jobId!==jobId)
      throw new PlanningContractError('TENANT_MISMATCH','Project tenant mismatch.',403);
    const updated={...data,status:'closed',closedAt:new Date().toISOString(),
      tiquet:{...data.tiquet,planningStatus:'closed'}};
    await client.query(
      'UPDATE projects SET data=$1::jsonb,version=version+1,updated_at=NOW() WHERE id=$2',
      [JSON.stringify(updated),projectId]);
    await client.query(
      "UPDATE tiquet_planning_links SET state='closed',updated_at=NOW() WHERE project_id=$1",
      [projectId]);
    await client.query('COMMIT');
    return {projectId,state:'closed',duplicate:false};
  }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
}
