import {createHash,randomUUID} from 'node:crypto';
import {AppError,digest,textField} from './auth';
import {getDb,transaction} from './db';
import type {Member} from './domain';
import {WORKFLOW_TEMPLATES,type WorkflowRoleId,type WorkflowTemplateId} from './workflow-domain';
import {workflowRecipe} from './workflow-recipes';
import {workflowMember} from './workflow-store';
import type {CompanyTask} from './workflow-company';

type Row=Record<string,unknown>;
interface TaskSpec{title:string;brief:string;templateId:WorkflowTemplateId;recipeId:string|null;roles:WorkflowRoleId[];totalSteps:number;sourceProjectId:string;sourceRunId:string}
export interface CompanyCycleTask{projectId:string;runId:string;title:string}
export interface CompanySchedule{id:string;planId:string;intervalHours:24|168;enabled:boolean;status:'scheduled'|'waiting'|'paused';version:number;nextRunAt:string;lastRunAt:string|null;lastCycleId:string|null;cycleCount:number;brainVersion:number;message:string;createdAt:string;lastTasks:CompanyCycleTask[]}
const VALID_LIMIT=30;
const nowISO=(milliseconds:number)=>new Date(milliseconds).toISOString();
const scheduleDTO=(row:Row):CompanySchedule=>({id:String(row.id),planId:String(row.plan_id),intervalHours:Number(row.interval_hours) as 24|168,enabled:Boolean(row.enabled),status:row.status as CompanySchedule['status'],version:Number(row.version),nextRunAt:String(row.next_run_at),lastRunAt:row.last_run_at?String(row.last_run_at):null,lastCycleId:row.last_cycle_id?String(row.last_cycle_id):null,cycleCount:Number(row.cycle_count),brainVersion:Number(row.brain_version),message:String(row.message),createdAt:String(row.created_at),lastTasks:row.last_cycle_id?JSON.parse(String(getDb().prepare('SELECT tasks FROM workflow_company_cycles WHERE id=? AND member_id=?').get(row.last_cycle_id as string,row.member_id as string)?.tasks||'[]')):[]});
export const companySchedules=(user:Member|null):CompanySchedule[]=>user?getDb().prepare('SELECT * FROM workflow_company_schedules WHERE member_id=? ORDER BY created_at DESC LIMIT 30').all(user.id).map(scheduleDTO):[];

function sourcePlan(user:Member,id:unknown){const row=getDb().prepare('SELECT * FROM workflow_company_plans WHERE id=? AND member_id=?').get(textField(id,'План',1,100),user.id);if(!row)throw new AppError('Планът не е достъпен.',404);if(row.status!=='active')throw new AppError('Първо одобри и стартирай този бизнес план.',409);return row;}
function currentBrain(user:Member,version:number){const row=getDb().prepare('SELECT version,payload FROM workflow_brains WHERE member_id=?').get(user.id);if(!row||row.version!==version)throw new AppError('Контекстът е променен. Одобри нов план преди повторение.',409);return row;}
function specsFor(user:Member,plan:Row):TaskSpec[]{
  const tasks=JSON.parse(String(plan.tasks)) as CompanyTask[];if(!Array.isArray(tasks)||tasks.length<1||tasks.length>4)throw new AppError('Планът няма подходящи задачи за повторение.',409);
  return tasks.map(task=>{
    const row=getDb().prepare('SELECT p.*,r.id AS run_id,r.total_steps,r.brain_version FROM workflow_projects p JOIN workflow_runs r ON r.project_id=p.id AND r.member_id=p.member_id WHERE p.id=? AND p.member_id=? AND r.id=?').get(task.projectId||'',user.id,task.runId||'');
    const recipe=row?.recipe_id?workflowRecipe(row.recipe_id):null,template=WORKFLOW_TEMPLATES.find(item=>item.id===row?.template_id),roles=recipe?.roles||template?.roles;
    if(!row||!template||!roles||row.brain_version!==plan.brain_version||roles.length!==row.total_steps)throw new AppError('Запазените задачи са променени. Одобри нов план.',409);
    if(template.adultOnly&&user.ageBand!=='18+')throw new AppError('Този план е за пълнолетни.',403);
    return{title:String(row.title),brief:String(row.brief),templateId:template.id,recipeId:row.recipe_id?String(row.recipe_id):null,roles:[...roles],totalSteps:Number(row.total_steps),sourceProjectId:String(row.id),sourceRunId:String(row.run_id)};
  });
}
function interval(value:unknown){if(value!==24&&value!==168)throw new AppError('Избери повторение през 24 часа или 7 дни.');return value;}
function version(value:unknown){if(!Number.isInteger(value)||Number(value)<0)throw new AppError('Липсва версията на повторението.');return Number(value);}
export function saveCompanySchedule(userInput:Member|null,data:Record<string,unknown>,milliseconds=Date.now()){
  const user=workflowMember(userInput),hours=interval(data.intervalHours),expected=version(data.expectedVersion);if(typeof data.enabled!=='boolean')throw new AppError('Избери дали повторението да е включено.');
  return transaction(()=>{const db=getDb(),plan=sourcePlan(user,data.planId),brain=currentBrain(user,Number(plan.brain_version)),specs=specsFor(user,plan),existing=db.prepare('SELECT * FROM workflow_company_schedules WHERE member_id=? AND plan_id=?').get(user.id,plan.id);
    if(existing&&existing.version!==expected||!existing&&expected!==0)throw new AppError('Повторението е променено. Зареди го отново.',409);
    if(existing&&Number(existing.cycle_count)>=VALID_LIMIT&&data.enabled)throw new AppError('Това повторение достигна 30 цикъла. Прегледай историята и одобри нов план.',409);
    if(!existing&&Number(db.prepare('SELECT COUNT(*) AS n FROM workflow_company_schedules WHERE member_id=?').get(user.id)!.n)>=30)throw new AppError('Достигнат е лимитът от 30 повторения.',409);
    const timestamp=nowISO(milliseconds),next=nowISO(milliseconds+hours*3600000),message=data.enabled?'Следващият цикъл изчаква одобрение на предишните резултати.':'Повторението е изключено. Вече започнатите задачи остават.';
    if(existing)db.prepare('UPDATE workflow_company_schedules SET interval_hours=?,enabled=?,status=?,version=version+1,brain_version=?,brain_snapshot=?,task_specs=?,next_run_at=?,message=?,last_checked_ms=0,updated_at=? WHERE id=? AND member_id=? AND version=?').run(hours,Number(data.enabled),data.enabled?'scheduled':'paused',plan.brain_version,brain.payload,JSON.stringify(specs),next,message,timestamp,existing.id,user.id,expected);
    else db.prepare('INSERT INTO workflow_company_schedules(id,member_id,plan_id,interval_hours,enabled,status,brain_version,brain_snapshot,task_specs,next_run_at,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),user.id,plan.id,hours,Number(data.enabled),data.enabled?'scheduled':'paused',plan.brain_version,brain.payload,JSON.stringify(specs),next,message,timestamp,timestamp);
    return companySchedules(user).find(item=>item.planId===plan.id)!;
  });
}
export function toggleCompanySchedule(userInput:Member|null,data:Record<string,unknown>,milliseconds=Date.now()){
  const user=workflowMember(userInput),id=textField(data.id,'Повторение',1,100),expected=version(data.expectedVersion);if(typeof data.enabled!=='boolean')throw new AppError('Избери включено или изключено повторение.');
  return transaction(()=>{const db=getDb(),row=db.prepare('SELECT * FROM workflow_company_schedules WHERE id=? AND member_id=?').get(id,user.id);if(!row)throw new AppError('Повторението не е достъпно.',404);if(row.version!==expected)throw new AppError('Повторението е променено. Зареди го отново.',409);
    if(data.enabled){sourcePlan(user,row.plan_id);currentBrain(user,Number(row.brain_version));if(Number(row.cycle_count)>=VALID_LIMIT)throw new AppError('Това повторение достигна 30 цикъла. Одобри нов план.',409);}
    db.prepare('UPDATE workflow_company_schedules SET enabled=?,status=?,version=version+1,next_run_at=?,message=?,last_checked_ms=0,updated_at=? WHERE id=? AND member_id=? AND version=?').run(Number(data.enabled),data.enabled?'scheduled':'paused',data.enabled?nowISO(milliseconds+Number(row.interval_hours)*3600000):row.next_run_at,data.enabled?'Повторението е включено. Изчаква следващия срок и одобрението на предишната работа.':'Повторението е изключено. Вече започнатите задачи остават.',nowISO(milliseconds),id,user.id,expected);
    return companySchedules(user).find(item=>item.id===id)!;
  });
}
function pause(row:Row,message:string,milliseconds:number){getDb().prepare("UPDATE workflow_company_schedules SET enabled=0,status='paused',version=version+1,message=?,last_checked_ms=?,updated_at=? WHERE id=?").run(message,milliseconds,nowISO(milliseconds),row.id as string);}
function prerequisite(row:Row,specs:TaskSpec[]):{state:'ready'|'waiting'|'failed';message:string}{
  const tasks=row.last_cycle_id?JSON.parse(String(getDb().prepare('SELECT tasks FROM workflow_company_cycles WHERE id=? AND member_id=?').get(row.last_cycle_id as string,row.member_id as string)?.tasks||'[]')) as CompanyCycleTask[]:specs.map(item=>({projectId:item.sourceProjectId,runId:item.sourceRunId,title:item.title}));
  if(tasks.length!==specs.length)return{state:'failed',message:'Предишните задачи не са достъпни. Повторението е спряно.'};
  for(const task of tasks){const run=getDb().prepare('SELECT status FROM workflow_runs WHERE id=? AND project_id=? AND member_id=?').get(task.runId,task.projectId,row.member_id as string);if(!run||['failed','cancelled','blocked'].includes(String(run.status)))return{state:'failed',message:'Предишна задача е неуспешна или спряна. Прегледай я преди да включиш повторението.'};if(run.status!=='completed'||!getDb().prepare('SELECT id FROM workflow_bundle_approvals WHERE run_id=? AND member_id=? AND revoked_at IS NULL').get(task.runId,row.member_id as string))return{state:'waiting',message:'Изчаква завършване и одобрение на предишния пакет. Нови задачи не се натрупват.'};}
  return{state:'ready',message:''};
}
export function tickCompanySchedules(milliseconds=Date.now()){
  if(!Number.isSafeInteger(milliseconds)||milliseconds<0)throw new Error('Invalid schedule clock');
  const due=getDb().prepare("SELECT id FROM workflow_company_schedules WHERE enabled=1 AND next_run_at<=? AND last_checked_ms<=? ORDER BY next_run_at LIMIT 20").all(nowISO(milliseconds),milliseconds-60000),created:string[]=[];
  for(const candidate of due)transaction(()=>{
    const db=getDb(),row=db.prepare('SELECT * FROM workflow_company_schedules WHERE id=? AND enabled=1 AND next_run_at<=?').get(candidate.id as string,nowISO(milliseconds));if(!row)return;
    const member=db.prepare('SELECT id,name,email,role,age_band,profile FROM members WHERE id=?').get(row.member_id as string),plan=db.prepare('SELECT status,brain_version FROM workflow_company_plans WHERE id=? AND member_id=?').get(row.plan_id as string,row.member_id as string),brain=db.prepare('SELECT version FROM workflow_brains WHERE member_id=?').get(row.member_id as string);
    if(!member||!plan||plan.status!=='active'||!brain||brain.version!==row.brain_version||plan.brain_version!==row.brain_version){pause(row,'Брандът или одобреният план е променен. Одобри нов план преди следващ цикъл.',milliseconds);return;}
    const specs=JSON.parse(String(row.task_specs)) as TaskSpec[];
    if(specs.some(spec=>{const template=WORKFLOW_TEMPLATES.find(item=>item.id===spec.templateId),roles=spec.recipeId?workflowRecipe(spec.recipeId)?.roles:template?.roles;return !template||template.adultOnly&&member.age_band!=='18+'||JSON.stringify(roles)!==JSON.stringify(spec.roles);})) {pause(row,'Изпълнимите роли са променени. Одобри нов план преди повторение.',milliseconds);return;}
    const previous=prerequisite(row,specs);if(previous.state==='failed'){pause(row,previous.message,milliseconds);return;}if(previous.state==='waiting'){db.prepare("UPDATE workflow_company_schedules SET status='waiting',message=?,version=version+CASE WHEN status!='waiting' OR message!=? THEN 1 ELSE 0 END,last_checked_ms=?,updated_at=? WHERE id=?").run(previous.message,previous.message,milliseconds,nowISO(milliseconds),row.id as string);return;}
    if(Number(row.cycle_count)>=VALID_LIMIT||Number(db.prepare('SELECT COUNT(*) AS n FROM workflow_projects WHERE member_id=?').get(row.member_id as string)!.n)+specs.length>100){pause(row,'Достигнат е лимитът за историята. Повторението е спряно; експортирай работата и прегледай следващия план.',milliseconds);return;}
    const already=db.prepare('SELECT id FROM workflow_company_cycles WHERE schedule_id=? AND due_at=?').get(row.id as string,row.next_run_at as string);if(already){db.prepare('UPDATE workflow_company_schedules SET next_run_at=?,last_checked_ms=? WHERE id=?').run(nowISO(milliseconds+Number(row.interval_hours)*3600000),milliseconds,row.id as string);return;}
    const cycleId=randomUUID(),timestamp=nowISO(milliseconds),tasks:CompanyCycleTask[]=[];
    for(const [index,spec] of specs.entries()){
      const projectId=randomUUID(),runId=randomUUID(),requestId=`repeat:${createHash('sha256').update(`${row.id}:${row.next_run_at}:${index}`).digest('hex')}`,requestHash=digest(JSON.stringify({templateId:spec.templateId,title:spec.title,brief:spec.brief,...(spec.recipeId?{recipeId:spec.recipeId}:{})}));
      db.prepare('INSERT INTO workflow_projects(id,member_id,template_id,title,brief,request_id,request_hash,created_at,updated_at,recipe_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(projectId,row.member_id as string,spec.templateId,spec.title,spec.brief,requestId,requestHash,timestamp,timestamp,spec.recipeId);
      db.prepare("INSERT INTO workflow_runs(id,member_id,project_id,template_id,status,current_step,total_steps,brain_version,brain_snapshot,created_at,updated_at) VALUES(?,?,?,?,'ready',0,?,?,?,?,?)").run(runId,row.member_id as string,projectId,spec.templateId,spec.totalSteps,row.brain_version as number,row.brain_snapshot as string,timestamp,timestamp);
      db.prepare("INSERT INTO workflow_auto_runs(run_id,member_id,status,created_at,updated_at) VALUES(?,?,'queued',?,?)").run(runId,row.member_id as string,timestamp,timestamp);
      db.prepare('INSERT INTO workflow_events(id,member_id,project_id,run_id,kind,message,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),row.member_id as string,projectId,runId,'scheduled_cycle','Повтаря се одобрената задача със същия запазен бранд. Нищо не е публикувано.',timestamp);
      tasks.push({projectId,runId,title:spec.title});
    }
    db.prepare('INSERT INTO workflow_company_cycles(id,member_id,schedule_id,due_at,tasks,brain_version,created_at) VALUES(?,?,?,?,?,?,?)').run(cycleId,row.member_id as string,row.id as string,row.next_run_at as string,JSON.stringify(tasks),row.brain_version as number,timestamp);
    db.prepare("UPDATE workflow_company_schedules SET status='scheduled',version=version+1,cycle_count=cycle_count+1,last_cycle_id=?,last_run_at=?,next_run_at=?,message=?,last_checked_ms=?,updated_at=? WHERE id=?").run(cycleId,timestamp,nowISO(milliseconds+Number(row.interval_hours)*3600000),'Създадени са истински задачи от одобрения план. Следващият цикъл ще изчака техния преглед.',milliseconds,timestamp,row.id as string);created.push(cycleId);
  });
  return{createdCycleIds:created};
}
