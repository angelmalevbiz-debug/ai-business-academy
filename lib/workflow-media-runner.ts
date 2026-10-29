import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {getDb,transaction} from './db';
import {MEDIA_STORAGE_LIMIT,mediaCommand,mediaMemberKey,mediaRendererConfiguration,memberMediaStorage,privateMediaPath,probeWorkflowVideo,workflowMediaRoot} from './workflow-media';
import type {WorkflowMediaParameters} from './workflow-media-domain';

export function claimWorkflowMediaJob(){
  return transaction(()=>{
    const db=getDb(),now=Date.now();
    db.prepare("UPDATE workflow_media_jobs SET status='failed',error='Обработката прекъсна. Можеш да опиташ отново.',version=version+1,lease_token=NULL,lease_expires=NULL WHERE status='running' AND lease_expires<?").run(now);
    const row=db.prepare("SELECT j.*,a.storage_key,a.duration,a.name FROM workflow_media_jobs j JOIN workflow_media_assets a ON a.id=j.asset_id AND a.member_id=j.member_id WHERE j.status='queued' AND j.attempts<3 ORDER BY j.created_at LIMIT 1").get();if(!row)return null;
    const token=randomUUID();db.prepare("UPDATE workflow_media_jobs SET status='running',progress=0,version=version+1,attempts=attempts+1,lease_token=?,lease_expires=?,updated_at=? WHERE id=? AND status='queued'").run(token,now+60000,new Date().toISOString(),row.id);
    return{...row,token} as {id:string;member_id:string;storage_key:string;parameters:string;duration:number;token:string};
  });
}
export async function runWorkflowMediaJob(job:NonNullable<ReturnType<typeof claimWorkflowMediaJob>>){
  const memberKey=mediaMemberKey(String(job.member_id)),attemptKey=`${memberKey}/${job.id}/${job.token}`;
  const directory=privateMediaPath(`${attemptKey}/render`),cancelFile=privateMediaPath(`${attemptKey}/cancel`),configFile=privateMediaPath(`${attemptKey}/request.json`);
  const scratchRoot=resolve(process.cwd(),'.data','media-render-scratch'),scratch=join(scratchRoot,job.token);
  if(dirname(scratch)!==scratchRoot)throw new Error('Invalid scratch scope');
  await mkdir(directory,{recursive:true});
  await mkdir(scratch,{recursive:true});
  const config=mediaRendererConfiguration(),parameters=JSON.parse(String(job.parameters)) as WorkflowMediaParameters;
  await writeFile(configFile,JSON.stringify({root:workflowMediaRoot(),publisher:config.publisher,source:privateMediaPath(String(job.storage_key)),directory,scratch,cancelFile,parameters,duration:job.duration}),{mode:0o600});
  let resultKey:string|null=null,lost=false,stage='renderer';
  const owns=()=>Boolean(getDb().prepare("SELECT id FROM workflow_media_jobs WHERE id=? AND member_id=? AND lease_token=? AND status='running'").get(job.id,job.member_id,job.token));
  const monitor=setInterval(()=>{
    if(!owns()){lost=true;void writeFile(cancelFile,'cancel').catch(()=>{});return;}
    getDb().prepare("UPDATE workflow_media_jobs SET lease_expires=? WHERE id=? AND lease_token=? AND status='running'").run(Date.now()+60000,job.id,job.token);
  },750);
  try{
    await mediaCommand(config.python,[config.script,configFile],{timeout:12*60*1000,cancelFile,onLine:line=>{
      let value:Record<string,unknown>;try{value=JSON.parse(line);}catch{return;}
      if(Number.isInteger(value.progress)&&Number(value.progress)>=0&&Number(value.progress)<=99)getDb().prepare("UPDATE workflow_media_jobs SET progress=MAX(progress,?),updated_at=? WHERE id=? AND lease_token=? AND status='running'").run(value.progress as number,new Date().toISOString(),job.id,job.token);
      if(typeof value.result==='string'&&value.result.startsWith(`${attemptKey}/render/`))resultKey=value.result;
    }});
    if(lost||!owns())return;
    stage='result';if(!resultKey)throw new Error('No rendered output');
    stage='probe';
    const path=privateMediaPath(resultKey),media=await probeWorkflowVideo(path),file=await stat(path);
    const expected=parameters.aspect==='9:16'?[1080,1920]:parameters.aspect==='1:1'?[1080,1080]:[1920,1080];
    stage='validation';if(media.width!==expected[0]||media.height!==expected[1]||Math.abs(media.duration-(parameters.end-parameters.start))>.35||file.size<1000||file.size>500*1024*1024)throw new Error('Output validation failed');
    const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
    if(memberMediaStorage(String(job.member_id))+file.size>MEDIA_STORAGE_LIMIT)throw new Error('Output storage quota exceeded');
    stage='save';const changed=getDb().prepare("UPDATE workflow_media_jobs SET status='ready',progress=100,version=version+1,output_key=?,output_bytes=?,output_sha256=?,output_width=?,output_height=?,output_duration=?,error=NULL,lease_token=NULL,lease_expires=NULL,updated_at=? WHERE id=? AND member_id=? AND lease_token=? AND status='running'").run(resultKey,file.size,hash.digest('hex'),media.width,media.height,media.duration,new Date().toISOString(),job.id,job.member_id,job.token);
    if(!changed.changes)await rm(dirname(configFile),{recursive:true,force:true}).catch(()=>{});
  }catch{
    console.error(`Private media job failed at ${stage}.`);
    getDb().prepare("UPDATE workflow_media_jobs SET status='failed',error='Обработката не завърши. Провери откъса и опитай отново.',version=version+1,lease_token=NULL,lease_expires=NULL,updated_at=? WHERE id=? AND member_id=? AND lease_token=? AND status='running'").run(new Date().toISOString(),job.id,job.member_id,job.token);
  }finally{
    await rm(scratch,{recursive:true,force:true}).catch(()=>{});
    clearInterval(monitor);const current=getDb().prepare('SELECT status,output_key FROM workflow_media_jobs WHERE id=? AND member_id=?').get(job.id,job.member_id);
    if(current?.status!=='ready'||current.output_key!==resultKey)await rm(dirname(configFile),{recursive:true,force:true}).catch(()=>{});
    else{await rm(configFile,{force:true}).catch(()=>{});await rm(cancelFile,{force:true}).catch(()=>{});}
  }
}
