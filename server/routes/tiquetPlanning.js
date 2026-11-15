import { Router } from '../http.js';
import rateLimit from 'express-rate-limit';
import { realPool } from '../db.js';
import {
  PlanningContractError,safePlanningSecret,parsePlanningApproval
} from '../tiquetPlanningContract.js';
import { createApprovedPlanningProject } from '../tiquetPlanningStore.js';

const router=Router();
const limiter=rateLimit({windowMs:60*1000,max:50,standardHeaders:true,legacyHeaders:false});

router.post('/tiquet/planning/approved',limiter,async(req,res)=>{
  const secret=process.env.TIQUET_PLANNING_GATEWAY_SECRET;
  if(!safePlanningSecret(req.get('X-Tiquet-Planning-Secret'),secret))
    return res.status(401).json({error:'Unauthorized planning gateway.'});
  if(!realPool)
    return res.status(503).json({error:'Planning gateway requires PostgreSQL.'});
  try{
    const event=parsePlanningApproval(req.body);
    const result=await createApprovedPlanningProject(realPool,event);
    res.status(result.duplicate?200:201).json({ok:true,...result});
  }catch(err){
    if(err instanceof PlanningContractError)
      return res.status(err.status).json({error:err.message,code:err.code});
    console.error('[FFPRO Planning] transaction failed:',err?.code||err?.name||'unknown');
    res.status(503).json({error:'Planning handoff temporarily unavailable.'});
  }
});

export default router;
