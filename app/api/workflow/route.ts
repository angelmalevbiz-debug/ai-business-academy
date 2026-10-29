import {NextRequest,NextResponse} from 'next/server';
import {AppError,rateLimit,SESSION_COOKIE,sessionMember} from '@/lib/auth';
import {getWorkflowCapability,runWorkflowStep} from '@/lib/workflow-runner';
import {approveWorkflowRun,cancelWorkflowRun,createWorkflowProject,getWorkflowState,importWorkflowDraft,mutateWorkflowArtifact,pauseWorkflowAutoRun,saveWorkflowBrain,startWorkflowAutoRun,workflowMember} from '@/lib/workflow-store';
import {getPublisherStatus,listPublisherDrafts,readPublisherDraft} from '@/lib/workflow-publisher';
import {createWorkflowFromRecipe,searchWorkflowMemory,planWorkflowProduction,updateWorkflowPlanItem} from '@/lib/workflow-tasks';
import {refineWorkflowBrief} from '@/lib/workflow-refinement';
import {companyPlans,dispatchCompanyPlan,proposeCompanyPlan,rejectCompanyPlan} from '@/lib/workflow-company';
import {companySchedules,saveCompanySchedule,toggleCompanySchedule} from '@/lib/workflow-company-schedules';
import {getPositioningState,savePositioningProduct,generatePositioning,createPositioningMaterial} from '@/lib/workflow-positioning';
import {applyPositioningBrain} from '@/lib/workflow-positioning-brain';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function failure(error:unknown){if(error instanceof AppError)return response({error:error.message},error.status);console.error('Workflow request failed.');return response({error:'Workflow не завърши действието. Опитай отново.'},500);}
function expectedOrigin(request:NextRequest){
  if(process.env.APP_ORIGIN){try{const url=new URL(process.env.APP_ORIGIN);if(!['http:','https:'].includes(url.protocol)||url.origin!==process.env.APP_ORIGIN)throw new Error();return url.origin;}catch{throw new AppError('Сървърът няма валиден APP_ORIGIN.',503);}}
  if(process.env.NODE_ENV==='production')throw new AppError('Сървърът изисква настроен APP_ORIGIN.',503);
  const internal=new URL(request.url),host=request.headers.get('host')||internal.host;
  if(!['http:','https:'].includes(internal.protocol)||!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))throw new AppError('Адресът на заявката не е разрешен.',403);
  return new URL(`${internal.protocol}//${host}`).origin;
}
async function body(request:NextRequest){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Очаква се JSON заявка.',415);
  if(Number(request.headers.get('content-length'))>64000)throw new AppError('Заявката е прекалено голяма.',413);
  const reader=request.body?.getReader();if(!reader)throw new AppError('Липсват данни.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>64000){await reader.cancel();throw new AppError('Заявката е прекалено голяма.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  try{const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data as Record<string,unknown>;}catch{throw new AppError('Невалидни данни.');}
}
export async function GET(request:NextRequest){try{const user=sessionMember(request.cookies.get(SESSION_COOKIE)?.value);if(request.nextUrl.searchParams.get('scope')==='company')return response({plans:companyPlans(user),schedules:companySchedules(user)});if(request.nextUrl.searchParams.get('scope')==='positioning')return response(getPositioningState(user));return response(getWorkflowState(user,await getWorkflowCapability()));}catch(error){return failure(error);}}
export async function POST(request:NextRequest){
  try{
    if(request.headers.get('origin')!==expectedOrigin(request))throw new AppError('Заявката трябва да е от този сайт.',403);
    const data=await body(request),user=workflowMember(sessionMember(request.cookies.get(SESSION_COOKIE)?.value));
    rateLimit(`workflow-write:${user.id}`,100);
    if(data.action==='savePositioningProduct'){savePositioningProduct(user,data);return response(getPositioningState(user));}
    if(data.action==='generatePositioning'){await generatePositioning(user,data);return response(getPositioningState(user));}
    if(data.action==='createPositioningMaterial'){createPositioningMaterial(user,data);return response(getPositioningState(user));}
    if(data.action==='usePositioningBrain'){applyPositioningBrain(user,data);return response(getPositioningState(user));}
    if(data.action==='proposeCompanyPlan'){await proposeCompanyPlan(user,data);return response({plans:companyPlans(user),schedules:companySchedules(user)});}
    if(data.action==='dispatchCompanyPlan'){dispatchCompanyPlan(user,data);return response({plans:companyPlans(user),schedules:companySchedules(user)});}
    if(data.action==='rejectCompanyPlan'){rejectCompanyPlan(user,data);return response({plans:companyPlans(user),schedules:companySchedules(user)});}
    if(data.action==='saveCompanySchedule'){saveCompanySchedule(user,data);return response({plans:companyPlans(user),schedules:companySchedules(user)});}
    if(data.action==='toggleCompanySchedule'){toggleCompanySchedule(user,data);return response({plans:companyPlans(user),schedules:companySchedules(user)});}
    if(data.action==='saveBrain')saveWorkflowBrain(user,data);
    else if(data.action==='createFromRecipe')createWorkflowFromRecipe(user,data);
    else if(data.action==='refineBrief')return response({refinement:await refineWorkflowBrief(user,data)});
    else if(data.action==='searchWorkflowMemory')return response(searchWorkflowMemory(user,data));
    else if(data.action==='planProduction')planWorkflowProduction(user,data);
    else if(data.action==='updatePlanItem')updateWorkflowPlanItem(user,data);
    else if(data.action==='createProject')createWorkflowProject(user,data);
    else if(data.action==='runStep')await runWorkflowStep(user,data);
    else if(data.action==='startRun'){const capability=await getWorkflowCapability();if(!capability.configured)throw new AppError(capability.message,503);if(!capability.worker?.available)throw new AppError(capability.worker?.message||'Локалният Workflow worker не е на линия.',503);startWorkflowAutoRun(user,data.runId);}
    else if(data.action==='pauseRun')pauseWorkflowAutoRun(user,data.runId);
    else if(data.action==='approveRun')approveWorkflowRun(user,data);
    else if(data.action==='editArtifact'||data.action==='approveArtifact'||data.action==='rejectArtifact')mutateWorkflowArtifact(user,data,data.action);
    else if(data.action==='cancelRun')cancelWorkflowRun(user,data.runId);
    else if(data.action==='publisherStatus')return response({publisher:await getPublisherStatus(user)});
    else if(data.action==='publisherDrafts')return response({drafts:await listPublisherDrafts(user)});
    else if(data.action==='importPublisherDraft'){
      const imported=await readPublisherDraft(user,String(data.draftId||''));
      importWorkflowDraft(user,{sourceId:imported.id,title:imported.title,content:imported.content,requestId:data.requestId});
    }else if(data.action==='refreshCapability')return response(getWorkflowState(user,await getWorkflowCapability(true)));
    else throw new AppError('Действието не е разпознато.');
    return response(getWorkflowState(user,await getWorkflowCapability()));
  }catch(error){return failure(error);}
}
