import { PlanningContractError, buildTiquetServiceProject } from './tiquetPlanningContract.js';
import {ensurePlanningFileGrantsSchema} from './tiquetPlanningSharedFiles.js';

export async function initTiquetPlanningSchema(pool) {
  if (!pool) throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS tiquet_planning_links ('+
    'organization_id TEXT NOT NULL, tiquet_job_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE,'+
    'fingerprint TEXT NOT NULL, project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,'+
    'finance_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,'+
    "state TEXT NOT NULL DEFAULT 'in-planning',"+
    'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),'+
    'PRIMARY KEY(organization_id,tiquet_job_id),'+
    "CONSTRAINT chk_tiquet_plan_state CHECK (state IN ('in-planning','review-ready','closed'))"+
    '); CREATE INDEX IF NOT EXISTS idx_tiquet_planning_owner ON tiquet_planning_links(finance_owner_id,state);'
  );
  await pool.query(
    'CREATE TABLE IF NOT EXISTS tiquet_planning_callbacks ('+
    'project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE RESTRICT,'+
    'organization_id TEXT NOT NULL,tiquet_job_id TEXT NOT NULL,'+
    'event_id TEXT NOT NULL UNIQUE,'+
    "status TEXT NOT NULL DEFAULT 'pending',"+
    'attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ,'+
    'lease_until TIMESTAMPTZ, delivered_at TIMESTAMPTZ,last_error TEXT,'+
    'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),'+
    "CONSTRAINT chk_tiquet_callback_status CHECK (status IN ('pending','sending','retry','sent','permanent'))"+
    ');'
  );
  await ensurePlanningFileGrantsSchema(pool);
}

export async function createApprovedPlanningProject(pool, event) {
  if (!pool) throw new PlanningContractError('DATABASE_REQUIRED','PostgreSQL required.',503);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
      ['tiquet-plan:'+event.organizationId+':'+event.jobId]);
    const existing=(await client.query(
      'SELECT project_id,event_id,fingerprint,state FROM tiquet_planning_links '+
      'WHERE organization_id=$1 AND tiquet_job_id=$2 FOR UPDATE',
      [event.organizationId,event.jobId])).rows[0];
    if (existing) {
      if (existing.event_id!==event.eventId || existing.fingerprint!==event.fingerprint)
        throw new PlanningContractError('REPLAY_CONFLICT','Conflicting approval event.',409);
      await client.query('COMMIT');
      return { projectId:existing.project_id, state:existing.state, duplicate:true };
    }
    const already=(await client.query(
      'SELECT project_id FROM tiquet_planning_links WHERE event_id=$1',[event.eventId])).rows[0];
    if (already) throw new PlanningContractError('REPLAY_CONFLICT','Event ID already used.',409);
    const owner=(await client.query(
      'SELECT id FROM users WHERE hub_organization_id=$1 AND hub_finance_owner=TRUE LIMIT 1',
      [event.organizationId])).rows[0];
    if (!owner) throw new PlanningContractError('TENANT_NOT_PROVISIONED',
      'Finance workspace not provisioned for this organisation.',404);
    const plan=buildTiquetServiceProject(event);
    const project=(await client.query(
      'INSERT INTO projects(owner_id,name,project_type,data) VALUES($1,$2,$3,$4::jsonb) RETURNING id',
      [owner.id,plan.name,plan.projectType,JSON.stringify(plan.data)])).rows[0];
    await client.query(
      "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'owner')",
      [project.id,owner.id]);
    await client.query(
      'INSERT INTO tiquet_planning_links '+
      '(organization_id,tiquet_job_id,event_id,fingerprint,project_id,finance_owner_id,state)'+
      " VALUES($1,$2,$3,$4,$5,$6,'in-planning')",
      [event.organizationId,event.jobId,event.eventId,event.fingerprint,project.id,owner.id]);
    await client.query('COMMIT');
    return {projectId:project.id,state:'in-planning',duplicate:false};
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally { client.release(); }
}
