/** Optional, read-only integration using the Apache-2.0 Optimal Engine SDK.
 * The copied SDK is unchanged; this local subclass adds bounded reads, fixed
 * routing, no redirects and safe errors. No Elixir service is installed here.
 */
import { AppError, textField } from './auth';
import type { Member } from './domain';
import { HttpClient, type RequestOptions } from './vendor/optimal-engine/http';
import { OptimalEngineError } from './vendor/optimal-engine/error';
import { RetrievalClient } from './vendor/optimal-engine/retrieval';
import { asWorkspaceId, type StatusResult } from './vendor/optimal-engine/types';

export interface OptimalEngineStatus { configured:boolean; available:boolean; message:string; version?:string }
export interface WorkflowMemoryHit { id:string; title:string; content:string; citation:string|null; score:number|null; workspaceId:string }

function settings() {
  const configured=process.env.WORKFLOW_OPTIMAL_ORIGIN?.trim();
  if(!configured)return null;
  let url:URL;
  try{url=new URL(configured);}catch{throw new AppError('Провери WORKFLOW_OPTIMAL_ORIGIN на сървъра.',503);}
  if(url.origin!=='http://127.0.0.1:4200'||url.pathname!=='/'||url.username||url.password||url.hash||url.search)throw new AppError('Optimal Engine използва отделен локален origin на порт 4200.',503);
  return {origin:url.origin,key:process.env.WORKFLOW_OPTIMAL_API_KEY};
}

class ReadOnlyEngineClient extends HttpClient {
  override async request<T>(path:string,options:RequestOptions={}):Promise<T> {
    if((options.method||'GET')!=='GET'||!(path==='/api/status'||path.startsWith('/api/search?')))throw new AppError('Тази връзка към паметта разрешава само проверка и търсене.',403);
    let response:Response;
    try{response=await fetch(this.baseUrl+path,{method:'GET',headers:{Accept:'application/json',...this.authHeaders()},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2500)});}catch{throw new AppError('Optimal Engine не отговаря. Локалният контекст на Workflow остава отделен.',503);}
    if(!response.ok){await response.body?.cancel();throw new OptimalEngineError(response.status,'engine_unavailable','Optimal Engine не върна достъпни данни.');}
    if(!response.headers.get('content-type')?.includes('application/json')||Number(response.headers.get('content-length'))>1_000_000){await response.body?.cancel();throw new AppError('Паметта върна неподходящ отговор.',502);}
    const reader=response.body?.getReader();if(!reader)throw new AppError('Паметта върна празен отговор.',502);
    const chunks:Uint8Array[]=[];let size=0;
    try{
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();throw new AppError('Отговорът от паметта е твърде голям.',502);}chunks.push(value);}
      const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid payload');
      return data as T;
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('Паметта върна нечетим отговор.',502);}finally{reader.releaseLock();}
  }
}

export async function getOptimalEngineStatus(actor:Pick<Member,'role'>|null):Promise<OptimalEngineStatus> {
  if(actor?.role!=='admin')throw new AppError('Само администраторът проверява връзката към Optimal Engine.',403);
  let config:ReturnType<typeof settings>;
  try{config=settings();}catch{return {configured:false,available:false,message:'Провери локалния адрес на Optimal Engine на сървъра.'};}
  if(!config)return {configured:false,available:false,message:'Optimal Engine не е свързан. Workflow използва собствените запазени бранд снимки и резултати.'};
  try{
    const status=await new ReadOnlyEngineClient(config.origin,config.key).get<StatusResult>('/api/status');
    if(!['ok','degraded'].includes(status.status)||typeof status.version!=='string'||!/^0\.3\.\d+$/.test(status.version))throw new Error('Unverified engine');
    return {configured:true,available:true,version:status.version,message:status.status==='degraded'?'Optimal Engine отговаря с ограничена готовност.':'Optimal Engine отговаря. Търсенето остава в личното работно пространство.'};
  }catch{return {configured:true,available:false,message:'Optimal Engine не е достъпен или версията не е потвърдена. Това не е работеща външна памет.'};}
}

export async function searchOptimalEngineMemory(actor:Member|null,query:unknown):Promise<WorkflowMemoryHit[]> {
  if(!actor)throw new AppError('Влез в профила си, за да търсиш в своята памет.',401);
  const question=textField(query,'Търсене',2,600),config=settings();
  if(!config)throw new AppError('Optimal Engine не е свързан. Няма външни резултати за показване.',503);
  const workspace=asWorkspaceId(`academy:${actor.id}`);
  const client=new RetrievalClient(new ReadOnlyEngineClient(config.origin,config.key),workspace);
  const value=await client.search(question,{limit:8,mode:'lexical'});
  if(!Array.isArray(value.results))throw new AppError('Паметта не върна списък с резултати.',502);
  return value.results.slice(0,20).filter(row=>row&&row.workspace_id===workspace&&!row.inherited&&(!row.source_workspace_id||row.source_workspace_id===workspace)&&typeof row.id==='string'&&typeof row.content==='string').slice(0,8).map(row=>({
    id:row.id.slice(0,100),title:(typeof row.title==='string'?row.title:'Запазен източник').slice(0,200),content:row.content!.slice(0,2000),citation:typeof row.uri==='string'&&row.uri.startsWith('optimal://')?row.uri.slice(0,1000):null,score:typeof row.score==='number'&&Number.isFinite(row.score)?row.score:null,workspaceId:workspace,
  }));
}
