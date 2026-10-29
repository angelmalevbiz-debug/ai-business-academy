'use client';

import {useEffect,useState} from 'react';
import type {WorkflowProject,WorkflowRun,WorkflowState} from '@/lib/workflow-domain';

type Resume={owner:string;status:'ready';project:WorkflowProject|null;run:WorkflowRun|null}|{owner:string;status:'failed'};

export function useWorkflowResume(owner:string|undefined){
 const [result,setResult]=useState<Resume|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!owner)return;
  const controller=new AbortController();
  void fetch('/api/workflow',{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Work unavailable');
   const data=await response.json() as WorkflowState;
   if(controller.signal.aborted)return;
   const latestRuns=new Map<string,WorkflowRun>();
   for(const run of [...data.runs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))if(!latestRuns.has(run.projectId))latestRuns.set(run.projectId,run);
   const project=[...data.projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).find(item=>{const run=latestRuns.get(item.id);return run&&!['completed','cancelled'].includes(run.status);})||null;
   setResult({owner,status:'ready',project,run:project?latestRuns.get(project.id)||null:null});
  }).catch(()=>{if(!controller.signal.aborted)setResult({owner,status:'failed'});});
  return()=>controller.abort();
 },[owner,revision]);
 const current=result?.owner===owner?result:null;
 return {loading:Boolean(owner&&!current),failed:current?.status==='failed',project:current?.status==='ready'?current.project:null,run:current?.status==='ready'?current.run:null,retry:()=>{setResult(null);setRevision(value=>value+1);}};
}
