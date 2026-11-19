export async function sweepPlanningCallbacks({
  pool,baseUrl,secret,fetchImpl=fetch,limit=12
}) {
  if(!pool||!baseUrl||!/^https:\/\//.test(baseUrl)||!secret||secret.length<32)
    return {disabled:true,processed:0};
  const pending=(await pool.query(
    "SELECT project_id,organization_id,tiquet_job_id,event_id FROM tiquet_planning_callbacks "+
    "WHERE (status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()))"+
    " OR (status='sending' AND lease_until<NOW()) ORDER BY created_at LIMIT $1",
    [limit])).rows;
  let processed=0;
  for(const p of pending){
    const claimed=(await pool.query(
      "UPDATE tiquet_planning_callbacks SET status='sending',lease_until=NOW()+INTERVAL '40 seconds',"+
      "attempts=attempts+1 WHERE project_id=$1 AND "+
      "((status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()))"+
      " OR (status='sending' AND lease_until<NOW())) RETURNING project_id",
      [p.project_id])).rows[0];
    if(!claimed)continue;
    processed++;
    let kind='retry',reason='Tiquet gateway unavailable';
    try{
      const r=await fetchImpl(baseUrl.replace(/\/$/,'')+'/api/gateway/ffpro/planning/ready',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-FFPRO-Planning-Secret':secret},
        body:JSON.stringify({
          eventId:p.event_id,organizationId:p.organization_id,
          jobId:p.tiquet_job_id,projectId:p.project_id
        }),signal:AbortSignal.timeout(8500)
      });
      if(r.ok)kind='sent';
      else if(r.status===401||r.status===403||r.status===404){
        kind='permanent';reason='Tiquet rejected planning callback ('+r.status+')';
      }else reason='Tiquet callback not ready ('+r.status+')';
    }catch{}
    await pool.query(
      'UPDATE tiquet_planning_callbacks SET status=$2,lease_until=NULL,last_error=$3,'+
      "next_attempt_at=CASE WHEN $2='retry' THEN NOW()+INTERVAL '5 minutes' ELSE NULL END,"+
      "delivered_at=CASE WHEN $2='sent' THEN NOW() ELSE delivered_at END "+
      'WHERE project_id=$1',
      [p.project_id,kind,kind==='sent'?null:reason]);
  }
  return {disabled:false,processed};
}
