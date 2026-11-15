import React, {useEffect,useMemo,useState} from 'react';
import {CheckCircle2, FileText, Loader2, ShieldCheck} from 'lucide-react';
import type {BudgetEvent} from '../types';
import {projectsService} from '../services/projectsService';

interface Props{
  event:BudgetEvent;
  onRefresh:()=>Promise<void>;
}

export function ProjectPlanningReviewPanel({event,onRefresh}:Props){
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState(false);
  const link=event.tiquet;
  const projectId=event.sharedProjectId||event.id;
  const editable=event.role==='owner'||event.role==='editor';
  const complete=Boolean(event.tasks?.length)&&event.tasks.every(t=>t.completed===true);
  const serverFiles=useMemo(()=>(event.files||[]).filter(f=>Boolean(f.systemFileId)),[event.files]);
  const localCount=(event.files||[]).length-serverFiles.length;
  useEffect(()=>{
    setSelectedIds([]);setError(null);setSuccess(false);
  },[projectId]);
  if(!link)return null;
  const approved=link.planningStatus==='review-ready';
  const closed=link.planningStatus==='closed';
  const stateText=closed?'Closed':approved?'Sent for customer review':'Planning in progress';
  const toggle=(id:string)=>{
    setError(null);
    setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  };
  const submit=async()=>{
    if(!editable||sending||approved||closed)return;
    if(!complete){
      setError('Complete all project planning tasks before submitting for Review.');
      return;
    }
    const message='Send this plan to Tiquet Review? '+
      selectedIds.length+' approved document(s) will become available to the client. '+
      'Unselected files will remain private.';
    if(!window.confirm(message))return;
    setSending(true);setError(null);
    try{
      await projectsService.readyForReview(projectId,selectedIds);
      setSuccess(true);
      await onRefresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Could not send the project for Review.');
    }finally{setSending(false)}
  };
  return (
    <section aria-label="Tiquet delivery review" className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-stone-100 p-2.5 text-stone-700"><ShieldCheck size={19}/></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">Tiquet delivery review</h3>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">{stateText}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {link.ticketNumber} · Only documents you approve below will be shared with the client.
          </p>
        </div>
      </div>
      {(approved||closed||success)?(
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
          <CheckCircle2 size={16} className="text-stone-700"/>
          {closed?'This project is closed.':'Planning was submitted for Review. Client access is limited to the approved documents.'}
        </p>
      ):(
        <>
          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold text-stone-800">Select client-visible documents</p>
            <p className="mt-1 text-xs text-stone-500">
              Unticked files remain private. You can submit without sharing any files.
            </p>
            <div className="mt-3 space-y-2">
              {serverFiles.length===0&&<p className="text-xs text-stone-500">No database-backed documents are available to share.</p>}
              {serverFiles.map(file=>(
                <label key={file.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                  <input type="checkbox" className="h-4 w-4 accent-stone-800"
                    checked={selectedIds.includes(file.id)}
                    disabled={!editable||sending}
                    onChange={()=>toggle(file.id)}
                    aria-label={'Share '+file.name+' with client'}/>
                  <FileText size={16} className="text-stone-500"/>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800">{file.name}</span>
                </label>
              ))}
            </div>
            {localCount>0&&<p className="mt-2 text-xs text-stone-600">
              {localCount} local-only document(s) cannot be shared until uploaded to the system database.
            </p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              {complete?'Planning checklist complete.':'Finish every planning task before Review.'}
            </p>
            <button type="button" onClick={submit}
              disabled={!editable||!complete||sending}
              className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40">
              {sending?<Loader2 size={15} className="animate-spin"/>:<ShieldCheck size={15}/>}
              {sending?'Sending…':'Send to Tiquet Review'}
            </button>
          </div>
          {!editable&&<p className="mt-2 text-xs text-stone-600">Only project owners and editors can submit this review.</p>}
          {error&&<p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
        </>
      )}
    </section>
  );
}
