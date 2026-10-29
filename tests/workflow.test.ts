import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {NextRequest} from 'next/server';
import {AppError,createMember,createSession,SESSION_COOKIE} from '../lib/auth';
import {getDb,closeDb} from '../lib/db';
import {deleteAccount,exportAccountData} from '../lib/privacy';
import {approveWorkflowRun,cancelWorkflowRun,createWorkflowProject,finishWorkflowStep,getDueWorkflowJobs,getWorkflowState,importWorkflowDraft,mutateWorkflowArtifact,pauseWorkflowAutoRun,reserveWorkflowStep,saveWorkflowBrain,startWorkflowAutoRun,type ReservedWorkflowStep} from '../lib/workflow-store';
import {generateWorkflowOutput,runWorkflowAutoJob,runWorkflowStep,type WorkflowOutput} from '../lib/workflow-runner';
import type {WorkflowCapability} from '../lib/workflow-domain';
import {GET,POST} from '../app/api/workflow/route';

const directory=mkdtempSync(join(tmpdir(),'academy-workflow-'));
process.env.COMMUNITY_DB_PATH=join(directory,'test.db');
process.env.APP_ORIGIN='http://127.0.0.1:3101';
process.env.WORKFLOW_AI_PROVIDER='none';
const password='workflow test password 2026';
const capability:WorkflowCapability={provider:'ollama',model:'test-fixture',configured:true,status:'ready',message:'Injected test provider only',networkChecked:false,publishing:false,editing:false};
const unavailable:WorkflowCapability={...capability,configured:false,status:'needs_setup',message:'Configure a test provider'};
const member=(role:'member'|'admin'='member',ageBand:'14-17'|'18+'='18+')=>createMember({name:'Workflow test',email:`workflow-${randomUUID()}@example.test`,password,ageBand},role);
const brainInput={expectedVersion:0,name:'Тестов бранд',audience:'Малки местни бизнеси',voice:'Ясен и кратък',offer:'Практични автоматизации',notes:'Частен собствен контекст',guardrails:'Не измисляй резултати.'};
const fake=async(reservation:ReservedWorkflowStep):Promise<WorkflowOutput>=>({title:`Тестова чернова ${reservation.role}`,content:`Тестова чернова за ролята ${reservation.role}, проверена само с подменен модел.`,provider:'test-fixture',model:'test-fixture'});
async function project(templateId='content') {const user=await member();saveWorkflowBrain(user,brainInput);const project=createWorkflowProject(user,{templateId,title:'Сценарий за автоматизация',brief:'Подготви кратък пример с конкретна задача и без обещания за доход.',requestId:randomUUID()});const run=getWorkflowState(user,capability).runs.find(item=>item.projectId===project.id)!;return {user,project,run};}
after(()=>{closeDb();const absolute=resolve(directory);if(!absolute.startsWith(resolve(tmpdir())+'\\')&&!absolute.startsWith(resolve(tmpdir())+'/'))throw new Error('Unsafe temporary path');rmSync(absolute,{recursive:true,force:true});});

test('brand version compare-and-swap and immutable run snapshot preserve the actual brief context',async()=>{
  const {user,run}=await project();
  assert.throws(()=>saveWorkflowBrain(user,{...brainInput,expectedVersion:0,name:'Остарял запис'}),(error:unknown)=>error instanceof AppError&&error.status===409);
  saveWorkflowBrain(user,{...brainInput,expectedVersion:1,name:'Нов бранд'});
  const reservation=reserveWorkflowStep(user,run.id,randomUUID())!;
  assert.equal(reservation.brain.version,1);assert.equal(reservation.brain.name,brainInput.name);
  assert.equal(getWorkflowState(user,capability).brain!.version,2);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_brain_versions WHERE member_id=?').get(user.id)!.n,2);
  cancelWorkflowRun(user,run.id);
});

test('projects are idempotent per owner and administrator status never grants private brain access',async()=>{
  const alice=await member(),bob=await member(),admin=await member('admin');
  saveWorkflowBrain(alice,brainInput);saveWorkflowBrain(bob,{...brainInput,name:'Друг бранд'});
  const input={templateId:'content',title:'Конкретна задача',brief:'Подготви реален сценарий с предоставения контекст.',requestId:randomUUID()};
  const a=createWorkflowProject(alice,input),again=createWorkflowProject(alice,input),b=createWorkflowProject(bob,input);
  assert.equal(a.id,again.id);assert.notEqual(a.id,b.id);
  assert.throws(()=>createWorkflowProject(alice,{...input,title:'Друга задача'}),(error:unknown)=>error instanceof AppError&&error.status===409);
  assert.equal(getWorkflowState(admin,capability).brain,null);assert.equal(getWorkflowState(admin,capability).projects.length,0);
  const run=getWorkflowState(alice,capability).runs[0];
  assert.throws(()=>reserveWorkflowStep(bob,run.id,randomUUID()),(error:unknown)=>error instanceof AppError&&error.status===404);
  assert.equal(JSON.stringify(getWorkflowState(null,capability)).includes(brainInput.notes),false);
});

test('age safeguards are enforced by the server for sales, deals and finance templates',async()=>{
  const user=await member('member','14-17');saveWorkflowBrain(user,brainInput);
  for(const templateId of ['sales','deals','finance'])assert.throws(()=>createWorkflowProject(user,{templateId,title:'Учебна задача',brief:'Използвам измислени данни за тестов процес.',requestId:randomUUID()}),(error:unknown)=>error instanceof AppError&&error.status===403);
  assert.ok(createWorkflowProject(user,{templateId:'operations',title:'Учебен процес',brief:'Използвам измислени данни за тестов процес.',requestId:randomUUID()}));
});

test('missing model creates neither a fake result nor a running job',async()=>{
  const {user,run}=await project();let calls=0;
  await assert.rejects(runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability:unavailable,generate:async r=>{calls++;return fake(r);}}),(error:unknown)=>error instanceof AppError&&error.status===503);
  const state=getWorkflowState(user,capability);assert.equal(calls,0);assert.equal(state.artifacts.length,0);assert.equal(state.runs[0].status,'ready');
});

test('concurrent requests and duplicate intents cannot execute the same paid step twice',async()=>{
  const {user,run}=await project();let release!:(output:WorkflowOutput)=>void,calls=0;
  const requestId=randomUUID();
  const first=runWorkflowStep(user,{runId:run.id,requestId},{capability,generate:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  await new Promise(resolve=>setImmediate(resolve));
  await runWorkflowStep(user,{runId:run.id,requestId},{capability,generate:fake});
  await assert.rejects(runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake}),(error:unknown)=>error instanceof AppError&&error.status===409);
  release({title:'Една чернова',content:'Само една действително записана тестова чернова.',provider:'test-fixture',model:'test-fixture'});await first;
  await runWorkflowStep(user,{runId:run.id,requestId},{capability,generate:async r=>{calls++;return fake(r);}});
  assert.equal(calls,1);assert.equal(getWorkflowState(user,capability).artifacts.length,1);assert.equal(getWorkflowState(user,capability).runs[0].currentStep,1);
});

test('FAQ approval cannot approve a seven-role package; exact-version bundle approval and edit revocation are enforced',async()=>{
  const {user,run}=await project();
  for(let index=0;index<7;index++)await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  let state=getWorkflowState(user,capability);
  assert.equal(state.artifacts.length,7);assert.ok(state.artifacts.every(item=>item.status==='draft'&&item.provenance==='ai'));
  assert.equal(state.runs[0].status,'awaiting_approval');
  const final=state.artifacts.find(item=>item.role==='community')!;
  mutateWorkflowArtifact(user,{artifactId:final.id,expectedRevision:final.revision},'approveArtifact');
  state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'awaiting_approval');assert.equal(state.capability.publishing,false);
  assert.ok(state.events.some(item=>item.kind==='approveArtifact'&&item.message.includes('Нищо не е изпратено')));
  const expectedArtifacts=state.artifacts.map(item=>({id:item.id,revision:item.revision}));
  assert.throws(()=>approveWorkflowRun(user,{runId:run.id,expectedArtifacts:expectedArtifacts.slice(1)}),/променени, липсващи/);
  assert.throws(()=>approveWorkflowRun(user,{runId:run.id,expectedArtifacts:expectedArtifacts.map((item,index)=>index===0?{...item,revision:0}:item)}),/променени, липсващи/);
  approveWorkflowRun(user,{runId:run.id,expectedArtifacts});
  state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'completed');assert.ok(state.artifacts.every(item=>item.status==='approved'));
  const receipt=getDb().prepare('SELECT * FROM workflow_bundle_approvals WHERE run_id=?').get(run.id)!;
  assert.equal(JSON.parse(String(receipt.manifest)).length,7);assert.equal(String(receipt.manifest_hash).length,64);assert.equal(receipt.revoked_at,null);
  const exported=exportAccountData(user);assert.equal(exported.workflow.approvalReceipts.length,1);assert.equal(exported.workflow.approvalReceipts[0].manifest.length,7);
  const first=state.artifacts.find(item=>item.role==='chief')!;
  mutateWorkflowArtifact(user,{artifactId:first.id,expectedRevision:first.revision,content:'Човек промени целта на брифа и очаквания резултат.'},'editArtifact');
  state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'ready');assert.equal(state.runs[0].currentStep,1);
  assert.equal(state.artifacts.find(item=>item.id===first.id)!.provenance,'human');
  assert.ok(getDb().prepare('SELECT revoked_at FROM workflow_bundle_approvals WHERE run_id=?').get(run.id)!.revoked_at);
  assert.ok(state.artifacts.filter(item=>item.id!==first.id).every(item=>item.status==='rejected'));
  const oldFinal=state.artifacts.find(item=>item.id===final.id)!;
  assert.throws(()=>mutateWorkflowArtifact(user,{artifactId:oldFinal.id,expectedRevision:oldFinal.revision},'approveArtifact'),/ново изпълнение/);
  assert.throws(()=>mutateWorkflowArtifact(user,{artifactId:first.id,expectedRevision:1,content:'Друг човек вече промени това съдържание.'},'editArtifact'),/по-нова версия/);
});

test('bundle approval rejects foreign results, races and a not-yet-finished run',async()=>{
  const {user,run}=await project('support'),other=await project('support');
  assert.throws(()=>approveWorkflowRun(user,{runId:run.id,expectedArtifacts:[{id:'missing',revision:1}]}),/още не е готов/);
  for(let step=0;step<4;step++)await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  const artifacts=getWorkflowState(user,capability).artifacts;
  assert.throws(()=>approveWorkflowRun(other.user,{runId:run.id,expectedArtifacts:artifacts.map(item=>({id:item.id,revision:item.revision}))}),(error:unknown)=>error instanceof AppError&&error.status===404);
  const snapshot=artifacts.map(item=>({id:item.id,revision:item.revision}));
  const final=artifacts.find(item=>item.role==='community')!;
  mutateWorkflowArtifact(user,{artifactId:final.id,expectedRevision:final.revision,content:'Човешка корекция на крайния отговор, която трябва да се прегледа.'},'editArtifact');
  assert.throws(()=>approveWorkflowRun(user,{runId:run.id,expectedArtifacts:snapshot}),/променени, липсващи/);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_bundle_approvals WHERE run_id=?').get(run.id)!.n,0);
});

test('durable team execution continues after reconnect, pauses after the current step and respects cancellation',async()=>{
  const {user,run}=await project('support');
  startWorkflowAutoRun(user,run.id);closeDb();
  let due=getDueWorkflowJobs(10).find(item=>item.runId===run.id)!;assert.ok(due);
  let release!:(value:WorkflowOutput)=>void;
  const running=runWorkflowAutoJob(due,{capability,generate:async()=>new Promise(resolve=>{release=resolve;})});
  await new Promise(resolve=>setImmediate(resolve));
  pauseWorkflowAutoRun(user,run.id);
  release({title:'Текущ резултат',content:'Текущата стъпка е завършена, но екипът не продължава след паузата.',provider:'test',model:'test'});await running;
  let state=getWorkflowState(user,capability);assert.equal(state.runs[0].autoStatus,'paused');assert.equal(state.runs[0].currentStep,1);assert.equal(getDueWorkflowJobs(10).some(item=>item.runId===run.id),false);
  startWorkflowAutoRun(user,run.id);
  for(let index=1;index<4;index++){due=getDueWorkflowJobs(10).find(item=>item.runId===run.id)!;assert.ok(due);await runWorkflowAutoJob(due,{capability,generate:fake});}
  state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'awaiting_approval');assert.equal(state.runs[0].autoStatus,'completed');assert.equal(state.artifacts.length,4);
  const cancelled=await project();startWorkflowAutoRun(cancelled.user,cancelled.run.id);const cancelledJob=getDueWorkflowJobs(10).find(item=>item.runId===cancelled.run.id)!;cancelWorkflowRun(cancelled.user,cancelled.run.id);let calls=0;await runWorkflowAutoJob(cancelledJob,{capability,generate:async r=>{calls++;return fake(r);}});assert.equal(calls,0);
});

test('automatic execution failure is persisted and not endlessly retried by the worker',async()=>{
  const {user,run}=await project();startWorkflowAutoRun(user,run.id);
  const job=getDueWorkflowJobs(10).find(item=>item.runId===run.id)!;
  await runWorkflowAutoJob(job,{capability,generate:async()=>{throw new AppError('Доставчикът не е достъпен.',503);}});
  assert.equal(getWorkflowState(user,capability).runs[0].autoStatus,'failed');assert.equal(getDueWorkflowJobs(10).some(item=>item.runId===run.id),false);
  startWorkflowAutoRun(user,run.id);assert.equal(getDueWorkflowJobs(10).some(item=>item.runId===run.id),true);cancelWorkflowRun(user,run.id);
});

test('a process crash between durable step failure and queue reconciliation does not automatically retry',async()=>{
  const {user,run}=await project();startWorkflowAutoRun(user,run.id);
  getDb().prepare("UPDATE workflow_runs SET status='failed',error='Uncertain upstream request' WHERE id=?").run(run.id);
  getDb().prepare("UPDATE workflow_auto_runs SET status='running' WHERE run_id=?").run(run.id);
  assert.equal(getDueWorkflowJobs(10).some(item=>item.runId===run.id),false);
  assert.equal(getWorkflowState(user,capability).runs[0].autoStatus,'failed');
  startWorkflowAutoRun(user,run.id);assert.equal(getDueWorkflowJobs(10).some(item=>item.runId===run.id),true);cancelWorkflowRun(user,run.id);
});

test('rejection feedback reaches the next model call and stale generation cannot revive a cancelled run',async()=>{
  const {user,run}=await project();
  await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  const artifact=getWorkflowState(user,capability).artifacts[0];
  mutateWorkflowArtifact(user,{artifactId:artifact.id,expectedRevision:1,feedback:'Дай конкретен пример от предоставената задача.'},'rejectArtifact');
  const reserved=reserveWorkflowStep(user,run.id,randomUUID())!;assert.match(reserved.feedback,/конкретен пример/);
  cancelWorkflowRun(user,run.id);
  assert.equal(finishWorkflowStep(user,reserved,await fake(reserved)),false);
  assert.equal(getWorkflowState(user,capability).runs[0].status,'cancelled');
  assert.equal(getWorkflowState(user,capability).artifacts[0].status,'rejected');
});

test('a failed generation is durable and needs a new explicit intent before retry',async()=>{
  const {user,run}=await project();const requestId=randomUUID();
  await assert.rejects(runWorkflowStep(user,{runId:run.id,requestId},{capability,generate:async()=>{throw new Error('private upstream secret');}}),/не завърши/);
  let state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'failed');assert.equal(state.artifacts.length,0);assert.equal(JSON.stringify(state).includes('private upstream secret'),false);
  let calls=0;await runWorkflowStep(user,{runId:run.id,requestId},{capability,generate:async r=>{calls++;return fake(r);}});assert.equal(calls,0);
  await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'ready');assert.equal(state.runs[0].currentStep,1);
});

test('expired execution leases become recoverable failures and cannot accept a late result',async()=>{
  const {user,run}=await project();
  const reservation=reserveWorkflowStep(user,run.id,randomUUID())!;
  getDb().prepare('UPDATE workflow_runs SET lease_expires_at=? WHERE id=?').run(Date.now()-1,run.id);
  const state=getWorkflowState(user,capability);assert.equal(state.runs[0].status,'failed');assert.ok(state.events.some(item=>item.kind==='step_interrupted'));
  assert.equal(finishWorkflowStep(user,reservation,await fake(reservation)),false);
  await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  assert.equal(getWorkflowState(user,capability).artifacts.length,1);
});

test('a selected imported draft is a private unapproved copy and never inherits upstream approval',async()=>{
  const admin=await member('admin'),other=await member();
  assert.throws(()=>importWorkflowDraft(other,{sourceId:'draft-one',title:'Тестова чернова',content:'Сценарий от оригиналното локално студио.'}),(error:unknown)=>error instanceof AppError&&error.status===403);
  importWorkflowDraft(admin,{sourceId:'draft-one',title:'Тестова чернова',content:'Сценарий от оригиналното локално студио.'});
  const state=getWorkflowState(admin,capability);assert.equal(state.artifacts[0].provenance,'imported');assert.equal(state.artifacts[0].status,'draft');assert.equal(state.runs[0].status,'awaiting_approval');assert.equal(getWorkflowState(other,capability).artifacts.length,0);
});

test('import retries with the same owner intent reuse one copy and reject changed source versions',async()=>{
  const admin=await member('admin'),requestId=randomUUID();
  const input={sourceId:'same-upstream-source',title:'Един импорт',content:'Изрично избрано съдържание от локалното студио.',requestId};
  const first=importWorkflowDraft(admin,input),again=importWorkflowDraft(admin,input);
  assert.equal(first,again);assert.equal(getWorkflowState(admin,capability).projects.length,1);
  assert.throws(()=>importWorkflowDraft(admin,{...input,content:'Различна версия на избраното съдържание, която има нужда от ново действие.'}),(error:unknown)=>error instanceof AppError&&error.status===409);
});

test('export includes complete owned workflow history and deletion cascades without touching other members',async()=>{
  const {user,run}=await project();const other=await member();saveWorkflowBrain(other,{...brainInput,name:'Друг частен бранд'});
  await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()},{capability,generate:fake});
  const exported=exportAccountData(user);assert.equal(exported.workflow.brainVersions.length,1);assert.equal(exported.workflow.artifacts.length,1);assert.equal(exported.workflow.artifactRevisions.length,1);
  const serialized=JSON.stringify(exported);assert.equal(serialized.includes('Друг частен бранд'),false);assert.equal(serialized.includes('lease_token'),false);
  await deleteAccount(user,{password,confirmation:'DELETE'});
  for(const table of ['workflow_brains','workflow_brain_versions','workflow_projects','workflow_runs','workflow_artifacts','workflow_events','workflow_step_requests','workflow_bundle_approvals','workflow_auto_runs'])assert.equal(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE member_id=?`).get(user.id)!.n,0);
  assert.equal(getWorkflowState(other,capability).brain!.name,'Друг частен бранд');
});

test('workflow HTTP routes enforce session, origin, bounded JSON and read-only guest state',async()=>{
  const origin=process.env.APP_ORIGIN!;
  const guest=await GET(new NextRequest(`${origin}/api/workflow`));assert.equal(guest.status,200);const publicState=await guest.json();assert.equal(publicState.brain,null);assert.equal(publicState.templates.length,7);
  const post=(data:unknown,headers:Record<string,string>={})=>POST(new NextRequest(`${origin}/api/workflow`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)}));
  assert.equal((await post({action:'saveBrain',...brainInput})).status,401);
  const user=await member(),token=createSession(user.id),auth={Cookie:`${SESSION_COOKIE}=${token}`};
  assert.equal((await post({action:'saveBrain',...brainInput},{...auth,Origin:'https://evil.example'})).status,403);
  assert.equal((await post({action:'saveBrain',...brainInput},{...auth,'Content-Type':'text/plain'})).status,415);
  assert.equal((await post({action:'saveBrain',...brainInput,notes:'x'.repeat(65000)},auth)).status,413);
  assert.equal((await post({action:'saveBrain',...brainInput},auth)).status,200);
  assert.equal((await post({action:'publisherDrafts'},auth)).status,403);
});

test('structured provider validation rejects incomplete output without leaking raw provider responses',async()=>{
  const {user,run}=await project(),reservation=reserveWorkflowStep(user,run.id,randomUUID())!;
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"title":"Incomplete","content":"tiny"}'}]}]}),{status:200,headers:{'Content-Type':'application/json'}});};
    await assert.rejects(generateWorkflowOutput(reservation,{...capability,provider:'openai'}),/не попълни секцията/);assert.equal(calls,2);
    globalThis.fetch=async()=>new Response('private provider response secret',{status:401});
    await assert.rejects(generateWorkflowOutput(reservation,{...capability,provider:'openai'}),(error:unknown)=>error instanceof AppError&&!error.message.includes('secret')&&error.message.includes('отказа достъп'));
    const duplicate='Предходен текст, който моделът не трябва да преписва за друга роля.';
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'Повторение',content:duplicate})}]}]}),{status:200});
    await assert.rejects(generateWorkflowOutput({...reservation,role:'copy',project:{...reservation.project,templateId:'sales'},inputs:[{id:'prior',projectId:reservation.project.id,runId:reservation.run.id,role:'chief',title:'Предходен',content:duplicate,revision:1,status:'draft',feedback:'',provenance:'ai',provider:'test',model:'test',sourceId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]},{...capability,provider:'openai'}),/повтори предходния/);
  }finally{globalThis.fetch=original;cancelWorkflowRun(user,run.id);}
});
