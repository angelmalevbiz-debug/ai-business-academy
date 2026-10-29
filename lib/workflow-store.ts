import { randomUUID } from 'node:crypto';
import { AppError, digest, textField } from './auth';
import { getDb, transaction } from './db';
import type { Member } from './domain';
import type { BrandBrain, WorkflowArtifact, WorkflowCapability, WorkflowEvent, WorkflowProject, WorkflowRun, WorkflowState, WorkflowTemplateId,WorkflowPlanItem } from './workflow-domain';
import { WORKFLOW_ROLES, WORKFLOW_TEMPLATES } from './workflow-domain';
import {WORKFLOW_RECIPES,workflowRecipe} from './workflow-recipes';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
export function workflowMember(user: Member | null): Member {
  if (!user) throw new AppError('Влез в профила си, за да запазиш Workflow.',401);
  return user;
}
function optionalText(value: unknown, label: string, max: number) { return value===undefined || value==='' ? '' : textField(value,label,0,max); }
const projectDTO = (row: Row): WorkflowProject => ({id:String(row.id),templateId:row.template_id as WorkflowTemplateId,title:String(row.title),brief:String(row.brief),recipeId:row.recipe_id?String(row.recipe_id):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)});
const runDTO = (row: Row): WorkflowRun => ({id:String(row.id),projectId:String(row.project_id),templateId:row.template_id as WorkflowTemplateId,status:row.status as WorkflowRun['status'],currentStep:Number(row.current_step),totalSteps:Number(row.total_steps),brainVersion:Number(row.brain_version),error:row.error?String(row.error):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at),autoStatus:(row.auto_status||'off') as WorkflowRun['autoStatus']});
const artifactDTO = (row: Row): WorkflowArtifact => ({id:String(row.id),projectId:String(row.project_id),runId:String(row.run_id),role:row.role as WorkflowArtifact['role'],title:String(row.title),content:String(row.content),revision:Number(row.revision),status:row.status as WorkflowArtifact['status'],feedback:String(row.feedback),provenance:row.provenance as WorkflowArtifact['provenance'],provider:row.provider?String(row.provider):null,model:row.model?String(row.model):null,sourceId:row.source_id?String(row.source_id):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)});
const eventDTO = (row: Row): WorkflowEvent => ({id:String(row.id),projectId:String(row.project_id),runId:row.run_id?String(row.run_id):null,kind:String(row.kind),message:String(row.message),createdAt:String(row.created_at)});
const planDTO=(row:Row):WorkflowPlanItem=>({id:String(row.id),projectId:String(row.project_id),day:String(row.day),phase:row.phase as WorkflowPlanItem['phase'],status:row.status as WorkflowPlanItem['status'],version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at)});
function ownedRun(user: Member, id: unknown) {
  const runId=textField(id,'Процес',1,100);
  const row=getDb().prepare('SELECT * FROM workflow_runs WHERE id=? AND member_id=?').get(runId,user.id);
  if (!row) throw new AppError('Процесът не е достъпен.',404);
  return row;
}
function event(user: Member, projectId: string, runId: string|null, kind: string, message: string) {
  getDb().prepare('INSERT INTO workflow_events(id,member_id,project_id,run_id,kind,message,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),user.id,projectId,runId,kind,message,now());
}
function preserveArtifact(row: Row) {
  getDb().prepare('INSERT OR IGNORE INTO workflow_artifact_revisions(artifact_id,revision,payload,created_at) VALUES(?,?,?,?)').run(String(row.id),Number(row.revision),JSON.stringify(artifactDTO(row)),now());
}

export function getWorkflowState(user: Member|null, capability: WorkflowCapability): WorkflowState {
  if (!user) return {brain:null,projects:[],runs:[],artifacts:[],events:[],capability,templates:WORKFLOW_TEMPLATES,roles:WORKFLOW_ROLES,recipes:WORKFLOW_RECIPES,planItems:[]};
  const db=getDb();
  const expired=db.prepare("SELECT id,project_id,lease_token FROM workflow_runs WHERE member_id=? AND status='running' AND lease_expires_at<=?").all(user.id,Date.now());
  if(expired.length)transaction(()=>{for(const row of expired){const changed=db.prepare("UPDATE workflow_runs SET status='failed',error='Изпълнението е прекъснато. Провери резултата при доставчика преди нов опит.',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND member_id=? AND status='running' AND lease_token=? AND lease_expires_at<=?").run(now(),String(row.id),user.id,String(row.lease_token),Date.now());if(changed.changes)event(user,String(row.project_id),String(row.id),'step_interrupted','Изпълнението е прекъснато. Няма автоматичен повторен опит.');}});
  const brain=db.prepare('SELECT payload FROM workflow_brains WHERE member_id=?').get(user.id);
  return {
    brain:brain?JSON.parse(String(brain.payload)) as BrandBrain:null,
    projects:db.prepare('SELECT * FROM workflow_projects WHERE member_id=? ORDER BY updated_at DESC LIMIT 100').all(user.id).map(projectDTO),
    runs:db.prepare('SELECT r.*,a.status AS auto_status FROM workflow_runs r LEFT JOIN workflow_auto_runs a ON a.run_id=r.id WHERE r.member_id=? ORDER BY r.updated_at DESC LIMIT 100').all(user.id).map(runDTO),
    artifacts:db.prepare('SELECT * FROM workflow_artifacts WHERE member_id=? ORDER BY updated_at DESC LIMIT 1000').all(user.id).map(artifactDTO),
    events:db.prepare('SELECT * FROM workflow_events WHERE member_id=? ORDER BY created_at DESC,rowid DESC LIMIT 200').all(user.id).map(eventDTO),
    planItems:db.prepare('SELECT * FROM workflow_plan_items WHERE member_id=? ORDER BY day DESC LIMIT 500').all(user.id).map(planDTO),
    capability,templates:WORKFLOW_TEMPLATES,roles:WORKFLOW_ROLES,recipes:WORKFLOW_RECIPES,
  };
}

export function saveWorkflowBrain(userInput: Member|null, data: Record<string,unknown>) {
  const user=workflowMember(userInput);
  const fields={name:textField(data.name,'Име на бранда',2,100),audience:textField(data.audience,'Аудитория',3,2000),voice:textField(data.voice,'Глас',3,2000),offer:textField(data.offer,'Предложение',3,2000),notes:optionalText(data.notes,'Контекст',6000),guardrails:optionalText(data.guardrails,'Ограничения',3000)};
  return transaction(()=>{
    const db=getDb();
    const existing=db.prepare('SELECT * FROM workflow_brains WHERE member_id=?').get(user.id);
    const version=existing?Number(existing.version):0;
    if (data.expectedVersion!==version) throw new AppError('Брандът има друга версия. Зареди го отново преди запис.',409);
    const brain:BrandBrain={id:existing?String(existing.id):randomUUID(),version:version+1,...fields,updatedAt:now()};
    const payload=JSON.stringify(brain);
    db.prepare('INSERT INTO workflow_brains(member_id,id,version,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,updated_at=excluded.updated_at').run(user.id,brain.id,brain.version,payload,brain.updatedAt);
    db.prepare('INSERT INTO workflow_brain_versions(member_id,version,payload,created_at) VALUES(?,?,?,?)').run(user.id,brain.version,payload,brain.updatedAt);
    return brain;
  });
}

export function createWorkflowProject(userInput: Member|null, data: Record<string,unknown>) {
  const user=workflowMember(userInput);
  const template=WORKFLOW_TEMPLATES.find(item=>item.id===data.templateId);
  if (!template) throw new AppError('Избери съществуващ Workflow.');
  if(template.adultOnly&&user.ageBand!=='18+')throw new AppError('Този Workflow е за пълнолетни. Избери учебен процес за съдържание, операции или пазарно проучване.',403);
  const recipe=data.recipeId===undefined||data.recipeId===null?null:workflowRecipe(data.recipeId);
  if(data.recipeId!==undefined&&data.recipeId!==null&&(!recipe||recipe.templateId!==template.id))throw new AppError('Задачата не принадлежи към избраното направление.');
  const roles=recipe?.roles||template.roles;
  const title=textField(data.title,'Задача',3,140),brief=textField(data.brief,'Какво искаш да стане',10,6000),requestId=textField(data.requestId,'Идентификатор на заявката',8,100);
  const requestHash=digest(JSON.stringify({templateId:template.id,title,brief,...(recipe?{recipeId:recipe.id}:{})}));
  return transaction(()=>{
    const db=getDb();
    const existing=db.prepare('SELECT * FROM workflow_projects WHERE member_id=? AND request_id=?').get(user.id,requestId);
    if (existing) {if (existing.request_hash!==requestHash) throw new AppError('Тази заявка вече е използвана за друга задача.',409);return projectDTO(existing);}
    const storedBrain=db.prepare('SELECT * FROM workflow_brains WHERE member_id=?').get(user.id);
    if (!storedBrain) throw new AppError('Първо запази контекста на бранда.');
    const count=Number(db.prepare('SELECT COUNT(*) AS n FROM workflow_projects WHERE member_id=?').get(user.id)!.n);
    if(count>=100)throw new AppError('Достигна лимита от 100 проекта. Експортирай работата си и се свържи с екипа.',409);
    const projectId=randomUUID(),runId=randomUUID(),timestamp=now();
    db.prepare('INSERT INTO workflow_projects(id,member_id,template_id,title,brief,request_id,request_hash,created_at,updated_at,recipe_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(projectId,user.id,template.id,title,brief,requestId,requestHash,timestamp,timestamp,recipe?.id||null);
    db.prepare("INSERT INTO workflow_runs(id,member_id,project_id,template_id,status,current_step,total_steps,brain_version,brain_snapshot,created_at,updated_at) VALUES(?,?,?,?,'ready',0,?,?,?,?,?)").run(runId,user.id,projectId,template.id,roles.length,Number(storedBrain.version),String(storedBrain.payload),timestamp,timestamp);
    event(user,projectId,runId,'created','Задачата е създадена със запазена версия на бранда.');
    return projectDTO(db.prepare('SELECT * FROM workflow_projects WHERE id=?').get(projectId)!);
  });
}

export interface ReservedWorkflowStep { ownerId:string; token:string; run:WorkflowRun; project:WorkflowProject; brain:BrandBrain; inputs:WorkflowArtifact[]; role:WorkflowArtifact['role']; stepIndex:number; feedback:string }
export function reserveWorkflowStep(userInput: Member|null, runId: unknown, requestIdInput: unknown):ReservedWorkflowStep|null {
  const user=workflowMember(userInput),requestId=textField(requestIdInput,'Идентификатор на заявката',8,100);
  return transaction(()=>{
    const db=getDb(),row=ownedRun(user,runId);
    const previous=db.prepare('SELECT * FROM workflow_step_requests WHERE member_id=? AND request_id=?').get(user.id,requestId);
    if (previous) {if(previous.run_id!==row.id)throw new AppError('Тази заявка е използвана за друг процес.',409);return null;}
    if (row.status==='cancelled'||row.status==='completed') throw new AppError('Този процес е приключил.',409);
    if (row.status==='awaiting_approval') throw new AppError('Прегледай крайния резултат преди следващо действие.',409);
    if (row.status==='running'&&Number(row.lease_expires_at)>Date.now()) throw new AppError('Агентът още работи по тази задача.',409);
    const template=WORKFLOW_TEMPLATES.find(item=>item.id===row.template_id)!;
    const projectRow=db.prepare('SELECT * FROM workflow_projects WHERE id=? AND member_id=?').get(String(row.project_id),user.id)!;
    const stepIndex=Number(row.current_step),role=(workflowRecipe(projectRow.recipe_id)?.roles||template.roles)[stepIndex];
    if(!role)throw new AppError('Няма следваща стъпка за изпълнение.',409);
    const token=randomUUID(),timestamp=now();
    db.prepare("UPDATE workflow_runs SET status='running',error=NULL,lease_token=?,lease_expires_at=?,updated_at=? WHERE id=? AND member_id=?").run(token,Date.now()+180_000,timestamp,String(row.id),user.id);
    db.prepare('INSERT INTO workflow_step_requests(member_id,request_id,run_id,step_index,created_at) VALUES(?,?,?,?,?)').run(user.id,requestId,String(row.id),stepIndex,timestamp);
    event(user,String(row.project_id),String(row.id),'step_started',`${WORKFLOW_ROLES.find(item=>item.id===role)!.name} започна работа.`);
    const project=db.prepare('SELECT * FROM workflow_projects WHERE id=? AND member_id=?').get(String(row.project_id),user.id)!;
    const previousAttempt=db.prepare('SELECT feedback FROM workflow_artifacts WHERE run_id=? AND step_index=?').get(String(row.id),stepIndex);
    return {ownerId:user.id,token,run:runDTO({...row,status:'running'}),project:projectDTO(project),brain:JSON.parse(String(row.brain_snapshot)),inputs:db.prepare("SELECT * FROM workflow_artifacts WHERE run_id=? AND member_id=? AND step_index<? AND status!='rejected' ORDER BY step_index").all(String(row.id),user.id,stepIndex).map(artifactDTO),role,stepIndex,feedback:previousAttempt?String(previousAttempt.feedback):''};
  });
}

export function finishWorkflowStep(user:Member, reservation:ReservedWorkflowStep, output:{title:string;content:string;provider:string|null;model:string|null;provenance?:'ai'|'compiled'}) {
  const title=textField(output.title,'Заглавие на резултата',1,180),content=textField(output.content,'Резултат',10,20000);
  return transaction(()=>{
    const db=getDb(),row=ownedRun(user,reservation.run.id);
    if(row.status!=='running'||row.lease_token!==reservation.token||Number(row.current_step)!==reservation.stepIndex)return false;
    const existing=db.prepare('SELECT * FROM workflow_artifacts WHERE run_id=? AND step_index=?').get(reservation.run.id,reservation.stepIndex);
    if(existing)preserveArtifact(existing);
    const id=existing?String(existing.id):randomUUID(),revision=existing?Number(existing.revision)+1:1,timestamp=now();
    db.prepare("INSERT INTO workflow_artifacts(id,member_id,project_id,run_id,step_index,role,title,content,revision,status,feedback,provenance,provider,model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'draft','',?,?,?,?,?) ON CONFLICT(run_id,step_index) DO UPDATE SET title=excluded.title,content=excluded.content,revision=excluded.revision,status='draft',feedback='',provenance=excluded.provenance,provider=excluded.provider,model=excluded.model,updated_at=excluded.updated_at").run(id,user.id,reservation.project.id,reservation.run.id,reservation.stepIndex,reservation.role,title,content,revision,output.provenance||'ai',output.provider,output.model,timestamp,timestamp);
    preserveArtifact(db.prepare('SELECT * FROM workflow_artifacts WHERE id=?').get(id)!);
    const next=reservation.stepIndex+1,status=next>=Number(row.total_steps)?'awaiting_approval':'ready';
    db.prepare('UPDATE workflow_runs SET status=?,current_step=?,lease_token=NULL,lease_expires_at=NULL,error=NULL,updated_at=? WHERE id=?').run(status,next,timestamp,reservation.run.id);
    db.prepare('UPDATE workflow_projects SET updated_at=? WHERE id=?').run(timestamp,reservation.project.id);
    event(user,reservation.project.id,reservation.run.id,'step_finished',`${WORKFLOW_ROLES.find(item=>item.id===reservation.role)!.name} запази чернова за преглед.`);
    return true;
  });
}

export function failWorkflowStep(user:Member,reservation:ReservedWorkflowStep,message:string) {
  transaction(()=>{
    const db=getDb(),row=ownedRun(user,reservation.run.id);
    if(row.status!=='running'||row.lease_token!==reservation.token)return;
    db.prepare("UPDATE workflow_runs SET status='failed',error=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?").run(message.slice(0,500),now(),reservation.run.id);
    event(user,reservation.project.id,reservation.run.id,'step_failed',message.slice(0,500));
  });
}

export function mutateWorkflowArtifact(userInput:Member|null,data:Record<string,unknown>,action:'editArtifact'|'approveArtifact'|'rejectArtifact') {
  const user=workflowMember(userInput),id=textField(data.artifactId,'Резултат',1,100);
  const content=action==='editArtifact'?textField(data.content,'Текст',10,20000):null;
  const feedback=action==='rejectArtifact'?textField(data.feedback,'Какво да се промени',3,2000):'';
  transaction(()=>{
    const db=getDb(),row=db.prepare('SELECT * FROM workflow_artifacts WHERE id=? AND member_id=?').get(id,user.id);
    if(!row)throw new AppError('Резултатът не е достъпен.',404);
    if(data.expectedRevision!==Number(row.revision))throw new AppError('Има по-нова версия на текста. Зареди я преди промяна.',409);
    const run=ownedRun(user,row.run_id);
    if(run.status==='running'||run.status==='cancelled')throw new AppError('Спри текущата работа преди промяна.',409);
    if(Number(row.step_index)>=Number(run.current_step))throw new AppError('Този резултат изисква ново изпълнение. Първо завърши предходната работа.',409);
    if(action==='approveArtifact'&&row.status==='approved')return;
    preserveArtifact(row);
    const timestamp=now(),step=Number(row.step_index),status=action==='approveArtifact'?'approved':action==='rejectArtifact'?'rejected':'draft';
    db.prepare('UPDATE workflow_artifacts SET content=?,revision=revision+1,status=?,feedback=?,provenance=?,updated_at=? WHERE id=?').run(content??String(row.content),status,feedback,action==='editArtifact'?'human':String(row.provenance),timestamp,id);
    preserveArtifact(db.prepare('SELECT * FROM workflow_artifacts WHERE id=?').get(id)!);
    if(action!=='approveArtifact'){
      db.prepare('UPDATE workflow_bundle_approvals SET revoked_at=? WHERE run_id=? AND revoked_at IS NULL').run(timestamp,String(run.id));
      db.prepare("UPDATE workflow_auto_runs SET status='paused',updated_at=? WHERE run_id=?").run(timestamp,String(run.id));
      const downstream=db.prepare('SELECT * FROM workflow_artifacts WHERE run_id=? AND step_index>?').all(String(run.id),step);
      for(const artifact of downstream){preserveArtifact(artifact);db.prepare("UPDATE workflow_artifacts SET status='rejected',revision=revision+1,feedback='Предходният резултат е променен. Нужна е нова версия.',updated_at=? WHERE id=?").run(timestamp,String(artifact.id));preserveArtifact(db.prepare('SELECT * FROM workflow_artifacts WHERE id=?').get(String(artifact.id))!);}
      const next=action==='rejectArtifact'?step:step+1;
      db.prepare('UPDATE workflow_runs SET status=?,current_step=?,error=NULL,updated_at=? WHERE id=?').run(next>=Number(run.total_steps)?'awaiting_approval':'ready',next,timestamp,String(run.id));
    }
    db.prepare('UPDATE workflow_projects SET updated_at=? WHERE id=?').run(timestamp,String(row.project_id));
    event(user,String(row.project_id),String(row.run_id),action,action==='approveArtifact'?'Одобрена е конкретната версия. Нищо не е изпратено или публикувано.':action==='editArtifact'?'Текстът е променен. Следващите резултати изискват нова версия.':'Резултатът е върнат с обратна връзка.');
  });
}

export function cancelWorkflowRun(userInput:Member|null,id:unknown) {
  const user=workflowMember(userInput);
  transaction(()=>{const row=ownedRun(user,id);getDb().prepare("UPDATE workflow_runs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?").run(now(),String(row.id));getDb().prepare("UPDATE workflow_auto_runs SET status='paused',updated_at=? WHERE run_id=?").run(now(),String(row.id));getDb().prepare('UPDATE workflow_bundle_approvals SET revoked_at=? WHERE run_id=? AND revoked_at IS NULL').run(now(),String(row.id));event(user,String(row.project_id),String(row.id),'cancelled','Работата е спряна. Нови резултати няма да бъдат записани.');});
}

export function approveWorkflowRun(userInput:Member|null,data:Record<string,unknown>){
  const user=workflowMember(userInput);
  if(!Array.isArray(data.expectedArtifacts)||!data.expectedArtifacts.length||data.expectedArtifacts.length>7)throw new AppError('Прегледай всички версии в пакета преди одобрение.');
  const expected=data.expectedArtifacts.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new AppError('Невалиден пакет за одобрение.');const value=item as Record<string,unknown>;return{id:textField(value.id,'Резултат',1,100),revision:value.revision};});
  if(new Set(expected.map(item=>item.id)).size!==expected.length)throw new AppError('Пакетът съдържа повторен резултат.');
  transaction(()=>{
    const db=getDb(),run=ownedRun(user,data.runId);
    if(run.status!=='awaiting_approval'||Number(run.current_step)!==Number(run.total_steps))throw new AppError('Целият пакет още не е готов за одобрение.',409);
    const artifacts=db.prepare('SELECT * FROM workflow_artifacts WHERE run_id=? AND member_id=? AND step_index>=0 ORDER BY step_index').all(String(run.id),user.id);
    if(artifacts.length!==Number(run.total_steps)||artifacts.length!==expected.length||artifacts.some((item,index)=>item.status==='rejected'||Number(item.step_index)!==index||!expected.some(record=>record.id===item.id&&record.revision===Number(item.revision))))throw new AppError('Пакетът има променени, липсващи или върнати версии. Прегледай го отново.',409);
    const timestamp=now(),manifest=[];
    for(const item of artifacts){preserveArtifact(item);const revision=Number(item.revision)+(item.status==='approved'?0:1);db.prepare("UPDATE workflow_artifacts SET status='approved',revision=?,updated_at=? WHERE id=?").run(revision,timestamp,String(item.id));preserveArtifact(db.prepare('SELECT * FROM workflow_artifacts WHERE id=?').get(String(item.id))!);manifest.push({id:String(item.id),revision,role:String(item.role),contentSha256:digest(String(item.content))});}
    const encoded=JSON.stringify(manifest);
    db.prepare('INSERT INTO workflow_bundle_approvals(id,member_id,run_id,manifest,manifest_hash,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),user.id,String(run.id),encoded,digest(encoded),timestamp);
    db.prepare("UPDATE workflow_runs SET status='completed',updated_at=? WHERE id=?").run(timestamp,String(run.id));
    db.prepare("UPDATE workflow_auto_runs SET status='completed',updated_at=? WHERE run_id=?").run(timestamp,String(run.id));
    event(user,String(run.project_id),String(run.id),'approveRun',`Одобрен е целият пакет от ${manifest.length} конкретни версии. Нищо не е публикувано или изпратено.`);
  });
}

export function startWorkflowAutoRun(userInput:Member|null,id:unknown){
  const user=workflowMember(userInput);
  transaction(()=>{const db=getDb(),run=ownedRun(user,id);if(!['ready','failed','running'].includes(String(run.status)))throw new AppError('Този процес не може да бъде пуснат. Прегледай текущия пакет.',409);const timestamp=now();if(run.status==='failed')db.prepare("UPDATE workflow_runs SET status='ready',error=NULL,updated_at=? WHERE id=?").run(timestamp,String(run.id));db.prepare("INSERT INTO workflow_auto_runs(run_id,member_id,status,created_at,updated_at) VALUES(?,?,'queued',?,?) ON CONFLICT(run_id) DO UPDATE SET status=CASE WHEN workflow_auto_runs.status='running' THEN 'running' ELSE 'queued' END,error=NULL,updated_at=excluded.updated_at").run(String(run.id),user.id,timestamp,timestamp);event(user,String(run.project_id),String(run.id),'auto_started','Пуснат е целият екип. Работата продължава и след затваряне на страницата, докато локалният worker работи.');});
}
export function pauseWorkflowAutoRun(userInput:Member|null,id:unknown){
  const user=workflowMember(userInput);
  transaction(()=>{const db=getDb(),run=ownedRun(user,id),timestamp=now();db.prepare("UPDATE workflow_auto_runs SET status='paused',updated_at=? WHERE run_id=? AND member_id=?").run(timestamp,String(run.id),user.id);event(user,String(run.project_id),String(run.id),'auto_paused','Екипът ще спре след текущия резултат.');});
}
export interface WorkflowAutoJob {owner:Member;runId:string}
export function getDueWorkflowJobs(limit=1):WorkflowAutoJob[]{
  const db=getDb();
  const interrupted=db.prepare("SELECT r.id,r.member_id FROM workflow_runs r JOIN workflow_auto_runs a ON a.run_id=r.id WHERE a.status IN ('queued','running') AND r.status='running' AND r.lease_expires_at<=?").all(Date.now());
  for(const item of interrupted){const owner=workflowMemberById(String(item.member_id));if(owner)getWorkflowState(owner,{provider:'none',model:null,configured:false,status:'needs_setup',message:'worker recovery',networkChecked:false,publishing:false,editing:false});db.prepare("UPDATE workflow_auto_runs SET status='failed',error='Прекъснато изпълнение. Нужен е изричен нов опит.',updated_at=? WHERE run_id=? AND status IN ('queued','running')").run(now(),String(item.id));}
  db.prepare("UPDATE workflow_auto_runs SET status='failed',error='Последното изпълнение не завърши. Нужен е изричен нов опит.',updated_at=? WHERE status IN ('queued','running') AND run_id IN (SELECT id FROM workflow_runs WHERE status='failed')").run(now());
  const rows=db.prepare("SELECT a.run_id,a.member_id FROM workflow_auto_runs a JOIN workflow_runs r ON r.id=a.run_id WHERE a.status IN ('queued','running') AND r.status='ready' ORDER BY a.updated_at LIMIT ?").all(Math.max(1,Math.min(10,Math.floor(limit))));
  return rows.flatMap(row=>{const owner=workflowMemberById(String(row.member_id));return owner?[{owner,runId:String(row.run_id)}]:[];});
}
function workflowMemberById(id:string){const row=getDb().prepare('SELECT id,name,email,role,age_band,profile FROM members WHERE id=?').get(id);return row?{id:String(row.id),name:String(row.name),email:String(row.email),role:row.role as Member['role'],ageBand:row.age_band as Member['ageBand'],profile:row.profile?JSON.parse(String(row.profile)):null} as Member:null;}
export function beginWorkflowAutoJob(job:WorkflowAutoJob){const changed=getDb().prepare("UPDATE workflow_auto_runs SET status='running',updated_at=? WHERE run_id=? AND member_id=? AND status IN ('queued','running')").run(now(),job.runId,job.owner.id);return Boolean(changed.changes);}
export function reconcileWorkflowAutoJob(job:WorkflowAutoJob,error?:string){const row=getDb().prepare('SELECT status FROM workflow_runs WHERE id=? AND member_id=?').get(job.runId,job.owner.id);if(!row)return;const status=error||row.status==='failed'?'failed':row.status==='ready'?'queued':row.status==='running'?'running':row.status==='cancelled'?'paused':'completed';getDb().prepare("UPDATE workflow_auto_runs SET status=?,error=?,updated_at=? WHERE run_id=? AND member_id=? AND status IN ('queued','running')").run(status,error?.slice(0,500)||null,now(),job.runId,job.owner.id);}

export function importWorkflowDraft(userInput:Member|null,input:{sourceId:string;title:string;content:string;requestId?:unknown}) {
  const user=workflowMember(userInput);
  if(user.role!=='admin')throw new AppError('Импортът от локалното студио е само за оператора.',403);
  const sourceId=textField(input.sourceId,'Източник',1,160),title=textField(input.title,'Заглавие',1,140),content=textField(input.content,'Текст',10,20000);
  const requestId=input.requestId===undefined?`import:${randomUUID()}`:textField(input.requestId,'Идентификатор на импорта',8,100);
  const requestHash=digest(JSON.stringify({sourceId,title,content}));
  return transaction(()=>{
    const db=getDb(),projectId=randomUUID(),runId=randomUUID(),artifactId=randomUUID(),timestamp=now();
    const existing=db.prepare('SELECT id,request_hash FROM workflow_projects WHERE member_id=? AND request_id=?').get(user.id,requestId);
    if(existing){if(existing.request_hash!==requestHash)throw new AppError('Тази заявка за импорт е използвана за друг източник или друга версия.',409);return String(existing.id);}
    if(Number(db.prepare('SELECT COUNT(*) AS n FROM workflow_projects WHERE member_id=?').get(user.id)!.n)>=100)throw new AppError('Достигна лимита от 100 проекта. Експортирай работата си и се свържи с екипа.',409);
    const stored=db.prepare('SELECT payload,version FROM workflow_brains WHERE member_id=?').get(user.id);
    const snapshot=stored?String(stored.payload):JSON.stringify({name:'Импорт от локално студио',version:0});
    db.prepare('INSERT INTO workflow_projects(id,member_id,template_id,title,brief,request_id,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(projectId,user.id,'content',title,'Изрично избрано копие от локалното студио.',requestId,requestHash,timestamp,timestamp);
    db.prepare("INSERT INTO workflow_runs(id,member_id,project_id,template_id,status,current_step,total_steps,brain_version,brain_snapshot,created_at,updated_at) VALUES(?,?,?,'content','awaiting_approval',1,1,?,?,?,?)").run(runId,user.id,projectId,Number(stored?.version||0),snapshot,timestamp,timestamp);
    db.prepare("INSERT INTO workflow_artifacts(id,member_id,project_id,run_id,step_index,role,title,content,revision,status,feedback,provenance,source_id,created_at,updated_at) VALUES(?,?,?,?,0,'copy',?,?,1,'draft','','imported',?,?,?)").run(artifactId,user.id,projectId,runId,title,content,sourceId,timestamp,timestamp);
    preserveArtifact(db.prepare('SELECT * FROM workflow_artifacts WHERE id=?').get(artifactId)!);
    event(user,projectId,runId,'imported','Запазено е избрано копие от локалното студио. Оригиналът не е променен.');
    return projectId;
  });
}
