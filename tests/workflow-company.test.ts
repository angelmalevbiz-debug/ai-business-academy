import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createMember,AppError} from '../lib/auth';
import {closeDb,getDb} from '../lib/db';
import {saveWorkflowBrain,getWorkflowState} from '../lib/workflow-store';
import {companyPlans,dispatchCompanyPlan,proposeCompanyPlan,rejectCompanyPlan} from '../lib/workflow-company';
import type {WorkflowCapability} from '../lib/workflow-domain';
import {exportAccountData,deleteAccount} from '../lib/privacy';

const root=mkdtempSync(join(tmpdir(),'academy-company-')),database=join(root,'test.db');process.env.COMMUNITY_DB_PATH=database;process.env.WORKFLOW_AI_PROVIDER='none';
const fingerprint=createHash('sha256').update(process.platform==='win32'?resolve(database).toLowerCase():resolve(database)).digest('hex').slice(0,16),heartbeat=resolve('.data','workflow-services',`worker-${fingerprint}.json`);
mkdirSync(resolve('.data','workflow-services'),{recursive:true});
function worker(){writeFileSync(heartbeat,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),lastSeen:new Date().toISOString(),state:'idle',databaseFingerprint:fingerprint}));}
const cap:WorkflowCapability={configured:true,provider:'ollama',model:'explicit test fixture',status:'ready',message:'Fixture',networkChecked:false,publishing:false,editing:false};
const password='Isolated-company-test-password';
async function member(ageBand:'18+'|'14-17'='18+'){const user=await createMember({name:'Test business',email:`company-${randomUUID()}@example.test`,password,ageBand});saveWorkflowBrain(user,{expectedVersion:0,name:'Тестов бизнес',audience:'Измислена аудитория',voice:'Кратко',offer:'Измислена услуга',notes:'Без реални клиенти',guardrails:'Без измислени резултати'});return user;}
const objective='Подреди съдържание и отговори за моя бизнес.';
const generate=async()=>({summary:'Подготвяме представяне и ясни отговори.',tasks:[{recipeId:'content-first-reel',reason:'Нужен е ясен първи материал.',brief:'Представи наличната оферта без непредоставени обещания.',needs:['Конкретен пример от работата']},{recipeId:'support-faq',reason:'Да подредим често задаваните въпроси.',brief:'Използвай наличните факти и маркирай липсващите отговори.',needs:[]}]});
after(()=>{closeDb();rmSync(root,{recursive:true,force:true});rmSync(heartbeat,{force:true});});
test('company proposal saves a real owner-scoped unstarted plan and reuses an identical intent',async()=>{
  const user=await member(),requestId=randomUUID(),plan=await proposeCompanyPlan(user,{objective,requestId},{capability:cap,generate});
  assert.equal(plan.status,'proposed');assert.equal(plan.tasks.length,2);assert.equal(getWorkflowState(user,cap).projects.length,0);assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_auto_runs').get()!.n,0);
  assert.equal((await proposeCompanyPlan(user,{objective,requestId},{capability:cap,generate})).id,plan.id);
  const other=await member();assert.deepEqual(companyPlans(other),[]);assert.deepEqual(companyPlans(null),[]);
  await assert.rejects(()=>proposeCompanyPlan(user,{objective:'Съвсем друга цел за задачата.',requestId},{capability:cap,generate}),/друга цел/);
});
test('unknown, duplicated or forbidden department proposals never create tasks or a plan',async()=>{
  const user=await member('14-17');
  for(const recipeId of ['unknown','sales-offer'])await assert.rejects(()=>proposeCompanyPlan(user,{objective,requestId:randomUUID()},{capability:cap,generate:async()=>({summary:'Конкретен план за тестовия бизнес.',tasks:[{recipeId,reason:'Нужен е тестов резултат.',brief:'Това е тестово задание.',needs:[]}]})}),/непозната/);
  assert.equal(companyPlans(user).length,0);assert.equal(getWorkflowState(user,cap).projects.length,0);
});
test('plan acceptance enqueues actual recipe-specific work exactly once and retains shared brain version',async()=>{
  const user=await member(),plan=await proposeCompanyPlan(user,{objective,requestId:randomUUID()},{capability:cap,generate});worker();
  dispatchCompanyPlan(user,{id:plan.id,expectedVersion:plan.version});const saved=companyPlans(user)[0];assert.equal(saved.status,'active');
  const state=getWorkflowState(user,cap);assert.equal(state.projects.length,2);assert.equal(state.runs.length,2);assert.equal(state.runs.filter(item=>item.autoStatus==='queued').length,2);assert.ok(state.runs.every(item=>item.brainVersion===plan.brainVersion));assert.ok(saved.tasks.every(item=>item.projectId&&item.runId));
  assert.throws(()=>dispatchCompanyPlan(user,{id:plan.id,expectedVersion:plan.version}),/променен/);assert.equal(getWorkflowState(user,cap).projects.length,2);
});
test('stale brand version and another member cannot accept an approved plan',async()=>{
  const user=await member(),other=await member(),plan=await proposeCompanyPlan(user,{objective,requestId:randomUUID()},{capability:cap,generate});worker();
  assert.throws(()=>dispatchCompanyPlan(other,{id:plan.id,expectedVersion:plan.version}),(error:unknown)=>error instanceof AppError&&error.status===404);
  saveWorkflowBrain(user,{expectedVersion:1,name:'Обновен бизнес',audience:'Друга аудитория',voice:'Ясно',offer:'Друга услуга',notes:'',guardrails:''});
  assert.throws(()=>dispatchCompanyPlan(user,{id:plan.id,expectedVersion:plan.version}),/Контекстът е променен/);assert.equal(getWorkflowState(user,cap).projects.length,0);
});
test('rejection is versioned, does not start work, and owned company records export/delete',async()=>{
  const user=await member(),plan=await proposeCompanyPlan(user,{objective,requestId:randomUUID()},{capability:cap,generate});rejectCompanyPlan(user,{id:plan.id,expectedVersion:1});assert.equal(companyPlans(user)[0].status,'rejected');assert.equal(getWorkflowState(user,cap).projects.length,0);assert.ok(JSON.stringify(exportAccountData(user)).includes(plan.id));await deleteAccount(user,{password,confirmation:'DELETE'});assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_company_plans WHERE member_id=?').get(user.id)!.n,0);
});

test('interrupted dispatch resumes after its lease without duplicating previously assigned tasks',async()=>{
  const user=await member(),plan=await proposeCompanyPlan(user,{objective,requestId:randomUUID()},{capability:cap,generate});worker();
  dispatchCompanyPlan(user,{id:plan.id,expectedVersion:plan.version});
  const ids=getWorkflowState(user,cap).projects.map(item=>item.id).sort(),db=getDb();
  db.prepare("UPDATE workflow_company_plans SET status='dispatching',updated_at=? WHERE id=?").run(new Date().toISOString(),plan.id);
  let saved=companyPlans(user)[0];assert.throws(()=>dispatchCompanyPlan(user,{id:plan.id,expectedVersion:saved.version}),/още се стартира/);
  db.prepare('UPDATE workflow_company_plans SET updated_at=? WHERE id=?').run(new Date(Date.now()-61000).toISOString(),plan.id);
  saved=companyPlans(user)[0];dispatchCompanyPlan(user,{id:plan.id,expectedVersion:saved.version});
  assert.equal(companyPlans(user)[0].status,'active');assert.deepEqual(getWorkflowState(user,cap).projects.map(item=>item.id).sort(),ids);
});
