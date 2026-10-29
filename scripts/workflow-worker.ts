import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getDueWorkflowJobs, runWorkflowAutoJob } from '../lib/workflow-runner';
import { closeDb } from '../lib/db';
import {claimWorkflowMediaJob,runWorkflowMediaJob} from '../lib/workflow-media-runner';
import {cleanWorkflowMediaDeletions} from '../lib/workflow-media';
import {tickCompanySchedules} from '../lib/workflow-company-schedules';

const database = resolve(process.env.COMMUNITY_DB_PATH || '.data/community.db');
const fingerprint = createHash('sha256').update(process.platform==='win32'?database.toLowerCase():database).digest('hex').slice(0,16);
const root = resolve('.data/workflow-services');
const heartbeatPath = resolve(root, `worker-${fingerprint}.json`);
const stopPath = resolve(root, `worker-${fingerprint}.stop`);
mkdirSync(dirname(heartbeatPath), {recursive:true});
let stopping = false;
let working = false;
const startedAt = new Date().toISOString();

function heartbeat() {
  const temporary = `${heartbeatPath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({pid:process.pid,startedAt,lastSeen:new Date().toISOString(),state:stopping?'stopping':working?'running':'idle',databaseFingerprint:fingerprint,provider:process.env.WORKFLOW_AI_PROVIDER||'ollama',model:process.env.WORKFLOW_AI_MODEL||'auto',copyModel:process.env.WORKFLOW_AI_COPY_MODEL||null}));
  renameSync(temporary, heartbeatPath);
}
function requestStop() { stopping = true; heartbeat(); }
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal, requestStop);
const timer = setInterval(()=>{try{if(existsSync(stopPath))stopping=true;heartbeat();}catch{stopping=true;}},2000);
const delay = (milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function main() {
  heartbeat();
  console.log('Workflow worker ready. Owner-scoped text and real private media jobs; external publishing is disabled.');
  while(!stopping) {
    try {
      if(existsSync(stopPath)){stopping=true;break;}
      tickCompanySchedules();
      await cleanWorkflowMediaDeletions();
      const mediaJob=claimWorkflowMediaJob();
      if(mediaJob){working=true;heartbeat();await runWorkflowMediaJob(mediaJob);working=false;heartbeat();continue;}
      const job = getDueWorkflowJobs(1)[0];
      if(job){working=true;heartbeat();await runWorkflowAutoJob(job);working=false;heartbeat();}
      else await delay(1500);
    } catch {
      working=false;
      // Errors contain no generated content, account data or arbitrary provider diagnostics.
      console.error('Workflow worker could not finish a local queue check. Retrying after a bounded pause.');
      await delay(2500);
    }
  }
}
main().catch(()=>{process.exitCode=1;}).finally(()=>{
  stopping=true;working=false;clearInterval(timer);
  try{heartbeat();}catch{}
  try{closeDb();}catch{}
  try{if(existsSync(stopPath))unlinkSync(stopPath);}catch{}
  try{const own=JSON.parse(readFileSync(heartbeatPath,'utf8'));if(own.pid===process.pid){own.state='stopped';own.lastSeen=new Date().toISOString();writeFileSync(heartbeatPath,JSON.stringify(own));}}catch{}
});
