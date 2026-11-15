import {Router} from '../http.js';
import rateLimit from 'express-rate-limit';
import {requireAuth} from '../middleware/requireAuth.js';
import {realPool} from '../db.js';
import {safePlanningSecret,PlanningContractError} from '../tiquetPlanningContract.js';
import {markTiquetReviewReady,closeTiquetServiceProject} from '../tiquetPlanningLifecycle.js';

export const planningUserRouter=Router();
export const planningGatewayRouter=Router();
const gatewayLimiter=rateLimit({windowMs:60000,max:80,standardHeaders:true,legacyHeaders:false});

function sendError(res,error){
  if(error instanceof PlanningContractError)
    return res.status(error.status).json({error:error.message,code:error.code});
  console.error('[FFPRO Planning] transaction error:',error?.code||error?.name||'unknown');
  return res.status(503).json({error:'Planning operation temporarily unavailable.'});
}

planningUserRouter.post('/:id/ready-for-review',requireAuth,async(req,res)=>{
  try{
    const result=await markTiquetReviewReady(realPool,{
      projectId:req.params.id,userId:req.user.id,
      approvedFileIds:req.body?.approvedFileIds||[]
    });
    return res.json({ok:true,...result});
  }catch(error){return sendError(res,error)}
});

planningGatewayRouter.post('/tiquet/planning/closed',gatewayLimiter,async(req,res)=>{
  if(!safePlanningSecret(req.get('X-Tiquet-Planning-Secret'),
    process.env.TIQUET_PLANNING_GATEWAY_SECRET))
    return res.status(401).json({error:'Unauthorized planning gateway.'});
  try{
    const result=await closeTiquetServiceProject(realPool,{
      organizationId:req.body?.organizationId,
      jobId:req.body?.jobId,
      projectId:req.body?.projectId
    });
    return res.json({ok:true,...result});
  }catch(error){return sendError(res,error)}
});
