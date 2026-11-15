import {Router} from '../http.js';
import rateLimit from 'express-rate-limit';
import {realPool} from '../db.js';
import {safePlanningSecret,PlanningContractError} from '../tiquetPlanningContract.js';
import {listPlanningSharedFiles,getApprovedPlanningFile} from '../tiquetPlanningSharedFiles.js';

const router=Router();
const limiter=rateLimit({
  windowMs:60*1000,max:35,standardHeaders:true,legacyHeaders:false
});
router.use(limiter);
router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(!safePlanningSecret(req.get('X-Tiquet-Planning-Secret'),
    process.env.TIQUET_PLANNING_GATEWAY_SECRET))
    return res.status(401).json({error:'Unauthorised file gateway'});
  if(!realPool)return res.status(503).json({error:'File sharing requires PostgreSQL'});
  next();
});
const scope=req=>({
  projectId:req.params.projectId,
  organizationId:req.get('X-Tiquet-Organization-Id'),
  jobId:req.get('X-Tiquet-Job-Id')
});
function fail(res,error){
  if(error instanceof PlanningContractError)
    return res.status(error.status).json({error:error.code});
  console.error('[FFPRO file grant] unexpected fault:',error?.code||error?.name||'unknown');
  return res.status(503).json({error:'File service unavailable'});
}
router.get('/tiquet/planning/:projectId/files',async(req,res)=>{
  try{
    const files=await listPlanningSharedFiles(realPool,scope(req));
    return res.json({files});
  }catch(e){return fail(res,e)}
});
router.get('/tiquet/planning/:projectId/files/:fileId',async(req,res)=>{
  try{
    const file=await getApprovedPlanningFile(realPool,{
      ...scope(req),fileId:req.params.fileId
    });
    // Never inline arbitrary HTML/PDF/scripts; only Tiquet's authenticated
    // portal token holder may receive these bytes through the proxy route.
    const name=String(file.fileName||'approved-file.bin')
      .replace(/[^\w .-]+/g,'_').replace(/^\.+/,'_').slice(0,120);
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename="'+name+'"');
    res.setHeader('Content-Length',String(file.data.length));
    return res.end(file.data);
  }catch(e){return fail(res,e)}
});

export default router;
