import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {access,mkdir,open,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {AppError,rateLimit,textField} from './auth';
import {getDb,transaction} from './db';
import type {Member} from './domain';
import type {WorkflowMediaAsset,WorkflowMediaJob,WorkflowMediaParameters,WorkflowMediaState} from './workflow-media-domain';
import {workflowMember} from './workflow-store';
import {getWorkflowWorkerStatus} from './workflow-worker-status';

export const MEDIA_UPLOAD_LIMIT=250*1024*1024;
export const MEDIA_STORAGE_LIMIT=2*1024*1024*1024;
type Row=Record<string,unknown>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const mediaMemberKey=(id:string)=>createHash('sha256').update(id).digest('hex');
export function workflowMediaRoot(){
  const db=resolve(/* turbopackIgnore: true */ process.env.COMMUNITY_DB_PATH||join(process.cwd(),'.data','community.db'));
  return resolve(/* turbopackIgnore: true */ process.env.COMMUNITY_MEDIA_PATH||join(dirname(db),`workflow-media-${createHash('sha256').update(db).digest('hex').slice(0,16)}`));
}
export function privateMediaPath(key:string){
  if(!/^[a-f0-9]{64}\/[a-f0-9-]{36}\/[a-zA-Z0-9_.\/-]+$/.test(key)||key.split('/').some(part=>part==='..'||part===''))throw new Error('Invalid private storage key');
  const root=workflowMediaRoot(),path=resolve(root,key),rel=relative(root,path);
  if(!rel||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('Private media path escaped storage');
  return path;
}
export async function mediaCommand(command:string,args:string[],options:{timeout?:number;onLine?:(value:string)=>void;cancelFile?:string}={}){
  return new Promise<string>((done,fail)=>{
    const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']}),limit=128*1024;
    let output='',pending='',diagnosticBytes=0,failed=false;
    const timer=setTimeout(()=>{failed=true;if(options.cancelFile)void writeFile(options.cancelFile,'cancel').catch(()=>{});setTimeout(()=>{if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();},2500).unref();fail(new Error('Media command timed out'));},options.timeout||20000);
    child.stdout.on('data',(chunk:Buffer)=>{if(output.length+chunk.length>limit){failed=true;child.kill();return;}const text=chunk.toString();output+=text;pending+=text;const lines=pending.split(/\r?\n/);pending=lines.pop()||'';for(const line of lines)options.onLine?.(line);});
    child.stderr.on('data',(chunk:Buffer)=>{diagnosticBytes+=chunk.length;if(diagnosticBytes>2*1024*1024){failed=true;child.kill();}});
    child.on('error',error=>{clearTimeout(timer);fail(error);});
    child.on('close',code=>{clearTimeout(timer);if(pending)options.onLine?.(pending);if(failed||code!==0)fail(new Error('Local media command failed'));else done(output);});
  });
}
export async function probeWorkflowVideo(path:string){
  let value:Record<string,unknown>;
  try{value=JSON.parse(await mediaCommand(process.env.WORKFLOW_FFPROBE||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',path]));}
  catch{throw new AppError('Файлът не се разчита като видео. Избери друг MP4 или WebM файл.');}
  const streams=Array.isArray(value.streams)?value.streams as Row[]:[],picture=streams.find(item=>item.codec_type==='video'),format=value.format as Row|undefined;
  const duration=Number(format?.duration||picture?.duration),width=Number(picture?.width),height=Number(picture?.height),container=String(format?.format_name||'');
  if(!picture||!Number.isFinite(duration)||duration<=0||duration>1800||!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>7680||height>7680||!/(^|,)(mov|mp4|matroska|webm)(,|$)/.test(container))throw new AppError('Избери MP4 или WebM до 30 минути и до 8K.');
  return{duration,width,height,mime:/(webm|matroska)/.test(container)?'video/webm':'video/mp4'};
}
export function mediaAsset(user:Member,id:unknown){
  const assetId=textField(id,'Видео',1,100),row=getDb().prepare('SELECT * FROM workflow_media_assets WHERE id=? AND member_id=?').get(assetId,user.id);
  if(!row)throw new AppError('Видеото не е достъпно.',404);return row;
}
function mediaJob(user:Member,id:unknown){const row=getDb().prepare('SELECT j.*,a.name AS asset_name FROM workflow_media_jobs j JOIN workflow_media_assets a ON a.id=j.asset_id AND a.member_id=j.member_id WHERE j.id=? AND j.member_id=?').get(textField(id,'Обработка',1,100),user.id);if(!row)throw new AppError('Обработката не е достъпна.',404);return row;}
const assetDTO=(row:Row):WorkflowMediaAsset=>({id:String(row.id),name:String(row.name),mime:String(row.mime),bytes:Number(row.bytes),duration:Number(row.duration),width:Number(row.width),height:Number(row.height),createdAt:String(row.created_at),sourceUrl:`/api/workflow/media/${row.id}?kind=source`});
const jobDTO=(row:Row):WorkflowMediaJob=>({...JSON.parse(String(row.parameters)) as WorkflowMediaParameters,id:String(row.id),assetId:String(row.asset_id),assetName:String(row.asset_name),status:row.status as WorkflowMediaJob['status'],progress:Number(row.progress),version:Number(row.version),createdAt:String(row.created_at),outputUrl:row.status==='ready'&&row.output_key?`/api/workflow/media/${row.id}?kind=output`:null,error:row.error?String(row.error):null});
export const memberMediaStorage=(id:string)=>Number(getDb().prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM workflow_media_assets WHERE member_id=?').get(id)!.n)+Number(getDb().prepare('SELECT COALESCE(SUM(output_bytes),0) AS n FROM workflow_media_jobs WHERE member_id=?').get(id)!.n);

const activeUploads=new Set<string>();
export async function uploadWorkflowVideo(userInput:Member|null,input:{name:string;type:string;length:number|null;body:ReadableStream<Uint8Array>|null;signal?:AbortSignal}){
  const user=workflowMember(userInput);
  rateLimit(`media-upload:${user.id}`,30,24*60*60*1000);
  if(activeUploads.has(user.id))throw new AppError('Изчакай текущото качване да завърши.',409);
  if(!input.body||!/^video\/(mp4|webm|quicktime)$/i.test(input.type)||input.length!==null&&(!Number.isSafeInteger(input.length)||input.length<1||input.length>MEDIA_UPLOAD_LIMIT))throw new AppError('Избери MP4 или WebM до 250 MB.',413);
  const name=textField(input.name,'Име на файла',1,180).replace(/[\u0000-\u001f\u007f/\\]/g,'_');
  if(Number(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_media_assets WHERE member_id=?').get(user.id)!.n)>=50||memberMediaStorage(user.id)>=MEDIA_STORAGE_LIMIT)throw new AppError('Личното видео пространство е пълно.',409);
  activeUploads.add(user.id);const id=randomUUID(),key=`${mediaMemberKey(user.id)}/${id}/source`,path=privateMediaPath(key),hash=createHash('sha256');
  let bytes=0,saved=false;const reader=input.body.getReader(),abort=()=>{void reader.cancel().catch(()=>{});};input.signal?.addEventListener('abort',abort,{once:true});
  try{
    await mkdir(dirname(path),{recursive:true});const file=await open(path,'wx',0o600);
    try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort();reject(new AppError('Качването спря. Опитай отново.',408));},30000);});let read:ReadableStreamReadResult<Uint8Array>;try{read=await Promise.race([reader.read(),timeout]);}finally{clearTimeout(timer);}const {done,value}=read;if(input.signal?.aborted)throw new AppError('Качването е прекъснато.',408);if(done)break;bytes+=value.byteLength;if(bytes>MEDIA_UPLOAD_LIMIT){await reader.cancel();throw new AppError('Клипът надхвърля 250 MB.',413);}hash.update(value);await file.writeFile(value);}}finally{await file.close();}
    if(bytes<16||input.length!==null&&input.length!==bytes)throw new AppError('Качването не завърши. Избери файла отново.');
    const signature=await open(path,'r');const magic=Buffer.alloc(16);try{await signature.read(magic,0,16,0);}finally{await signature.close();}
    if(magic.toString('ascii',4,8)!=='ftyp'&&magic.readUInt32BE(0)!==0x1a45dfa3)throw new AppError('Файлът няма MP4 или WebM съдържание.');
    const media=await probeWorkflowVideo(path);
    transaction(()=>{if(memberMediaStorage(user.id)+bytes>MEDIA_STORAGE_LIMIT)throw new AppError('Личното видео пространство е пълно.',409);getDb().prepare('INSERT INTO workflow_media_assets(id,member_id,storage_key,name,mime,bytes,duration,width,height,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,key,name,media.mime,bytes,media.duration,media.width,media.height,hash.digest('hex'),new Date().toISOString());});
    saved=true;return id;
  }finally{input.signal?.removeEventListener('abort',abort);reader.releaseLock();activeUploads.delete(user.id);if(!saved)await rm(dirname(path),{recursive:true,force:true}).catch(()=>{});}
}

function parameters(value:Record<string,unknown>,duration:number):WorkflowMediaParameters{
  const start=Number(value.start),end=Number(value.end),aspect=value.aspect,layout=value.layout;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.02||end-start<.2||end-start>180)throw new AppError('Избери откъс между 0,2 и 180 секунди в рамките на клипа.');
  if(aspect!=='9:16'&&aspect!=='1:1'&&aspect!=='16:9')throw new AppError('Избери вертикален, квадратен или широк формат.');
  if(layout!=='fit'&&layout!=='fill')throw new AppError('Избери как кадърът да запълва формата.');
  const captionText=value.captionText===undefined||value.captionText===''?'':textField(value.captionText,'Надпис',1,180);
  return{start,end,aspect,layout,captionText};
}
export function createWorkflowMediaJob(userInput:Member|null,value:Record<string,unknown>){
  const user=workflowMember(userInput),requestId=textField(value.requestId,'Заявка',1,100);if(!uuid.test(requestId))throw new AppError('Липсва идентификатор на заявката.');
  return transaction(()=>{
    const asset=mediaAsset(user,value.assetId),input=parameters(value,Number(asset.duration)),serialized=JSON.stringify(input),hash=createHash('sha256').update(`${asset.id}:${serialized}`).digest('hex'),db=getDb();
    const previous=db.prepare('SELECT id,input_hash FROM workflow_media_jobs WHERE member_id=? AND request_id=?').get(user.id,requestId);if(previous){if(previous.input_hash!==hash)throw new AppError('Тази заявка вече е използвана с други настройки.',409);return String(previous.id);}
    if(Number(db.prepare("SELECT COUNT(*) AS n FROM workflow_media_jobs WHERE member_id=? AND status IN ('queued','running')").get(user.id)!.n)>=3)throw new AppError('Изчакай една от трите текущи обработки да приключи.',409);
    if(Number(db.prepare('SELECT COUNT(*) AS n FROM workflow_media_jobs WHERE member_id=?').get(user.id)!.n)>=100)throw new AppError('Достигнат е лимитът от 100 обработки в това пространство.',409);
    const id=randomUUID(),now=new Date().toISOString();db.prepare("INSERT INTO workflow_media_jobs(id,member_id,asset_id,request_id,input_hash,status,parameters,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?,?)").run(id,user.id,asset.id,requestId,hash,serialized,now,now);return id;
  });
}
export function changeWorkflowMediaJob(userInput:Member|null,value:Record<string,unknown>,action:'cancel'|'retry'){
  const user=workflowMember(userInput);return transaction(()=>{
    const row=mediaJob(user,value.jobId);if(!Number.isInteger(value.expectedVersion)||row.version!==value.expectedVersion)throw new AppError('Обработката е променена. Зареди състоянието отново.',409);
    if(action==='cancel'&&!['queued','running'].includes(String(row.status))||action==='retry'&&!['failed','cancelled'].includes(String(row.status)))throw new AppError('Това действие вече не е приложимо.',409);
    if(action==='retry'&&Number(row.attempts)>=3)throw new AppError('Три опита не успяха. Провери файла и създай нова обработка.',409);
    if(action==='retry'&&Number(getDb().prepare("SELECT COUNT(*) AS n FROM workflow_media_jobs WHERE member_id=? AND status IN ('queued','running')").get(user.id)!.n)>=3)throw new AppError('Първо изчакай текущите обработки.',409);
    getDb().prepare('UPDATE workflow_media_jobs SET status=?,version=version+1,progress=0,error=NULL,lease_token=NULL,lease_expires=NULL,updated_at=? WHERE id=? AND member_id=?').run(action==='cancel'?'cancelled':'queued',new Date().toISOString(),row.id,user.id);
  });
}

let toolCache:{at:number;ready:boolean}|null=null;
export function mediaRendererConfiguration(){
  const publisher=resolve(/* turbopackIgnore: true */ process.env.WORKFLOW_PUBLISHER_ROOT||'C:/Users/Chavd/Desktop/tiktok_publisher/tiktok_publisher');
  return{publisher,python:process.env.WORKFLOW_MEDIA_PYTHON||join(publisher,'.venv','Scripts','python.exe'),script:join(process.cwd(),'scripts','workflow-media-render.py')};
}
async function mediaToolsReady(){
  if(process.env.WORKFLOW_MEDIA_DISABLED==='1')return false;
  if(toolCache&&Date.now()-toolCache.at<15000)return toolCache.ready;
  let ready=false;try{const config=mediaRendererConfiguration();await Promise.all([access(config.python),access(config.script),access(join(config.publisher,'tiktok_clip_factory','studio','rendering.py'))]);await mediaCommand(process.env.WORKFLOW_FFPROBE||'ffprobe',['-version'],{timeout:3000});await mediaCommand(process.env.WORKFLOW_FFMPEG||'ffmpeg',['-version'],{timeout:3000});ready=true;}catch{}
  toolCache={at:Date.now(),ready};return ready;
}
export async function getWorkflowMediaState(userInput:Member|null):Promise<WorkflowMediaState>{
  const tools=await mediaToolsReady(),worker=getWorkflowWorkerStatus().available;
  const assets=userInput?getDb().prepare('SELECT * FROM workflow_media_assets WHERE member_id=? ORDER BY created_at DESC LIMIT 50').all(userInput.id).map(assetDTO):[];
  const jobs=userInput?getDb().prepare('SELECT j.*,a.name AS asset_name FROM workflow_media_jobs j JOIN workflow_media_assets a ON a.id=j.asset_id AND a.member_id=j.member_id WHERE j.member_id=? ORDER BY j.created_at DESC LIMIT 100').all(userInput.id).map(jobDTO):[];
  return{assets,jobs,capability:{upload:tools,render:tools,worker,message:!tools?'Видео обработката изисква локалните FFmpeg и Python renderer.':!worker?'Клипът се пази. Пусни локалния worker, за да започне обработката.':'Локалната видео обработка е на линия. Готовият MP4 остава личен.'}};
}
export async function workflowMediaFile(userInput:Member|null,id:string,kind:string){
  const user=workflowMember(userInput);let row:Row,key:string,mime:string,name:string;
  if(kind==='source'){row=mediaAsset(user,id);key=String(row.storage_key);mime=String(row.mime);name=String(row.name);}
  else if(kind==='output'){row=mediaJob(user,id);if(row.status!=='ready'||!row.output_key)throw new AppError('Клипът още не е готов.',404);key=String(row.output_key);mime='video/mp4';name=`academy-${row.id}.mp4`;}
  else throw new AppError('Избери оригинал или готов клип.');
  if(!key.startsWith(`${mediaMemberKey(user.id)}/`))throw new Error('Media ownership boundary failed');
  const path=privateMediaPath(key);let size:number;try{size=(await stat(path)).size;}catch{throw new AppError('Файлът не е наличен. Качи го отново.',404);}return{path,size,mime,name};
}
export function markWorkflowMediaForDeletion(memberId:string){
  const key=mediaMemberKey(memberId),db=getDb();db.prepare("UPDATE workflow_media_jobs SET status='cancelled',lease_token=NULL,lease_expires=NULL WHERE member_id=? AND status IN ('queued','running')").run(memberId);db.prepare('INSERT OR IGNORE INTO workflow_media_purge(member_key,created_at) VALUES(?,?)').run(key,new Date().toISOString());
}
export async function cleanWorkflowMediaDeletions(){
  for(const row of getDb().prepare('SELECT member_key FROM workflow_media_purge LIMIT 20').all()){
    const key=String(row.member_key);if(!/^[a-f0-9]{64}$/.test(key))continue;
    const root=workflowMediaRoot(),path=resolve(root,key);if(dirname(path)!==root)throw new Error('Media cleanup scope failed');
    try{await rm(path,{recursive:true,force:true});getDb().prepare('DELETE FROM workflow_media_purge WHERE member_key=?').run(key);}catch{/* A renderer may hold a Windows file handle. The durable purge remains for the next worker pass. */}
  }
}
export function readWorkflowMediaExport(memberId:string){
  return{assets:getDb().prepare('SELECT id,name,mime,bytes,duration,width,height,sha256,created_at FROM workflow_media_assets WHERE member_id=? ORDER BY created_at').all(memberId),jobs:getDb().prepare('SELECT id,asset_id,status,progress,version,parameters,output_bytes,output_sha256,output_width,output_height,output_duration,error,created_at,updated_at FROM workflow_media_jobs WHERE member_id=? ORDER BY created_at').all(memberId).map(row=>({...row,parameters:JSON.parse(String(row.parameters))}))};
}
