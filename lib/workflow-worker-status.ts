import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export interface WorkflowWorkerStatus {available:boolean;message:string;lastSeen:string|null}
export function getWorkflowWorkerStatus():WorkflowWorkerStatus{
  // This runtime path is hashed for identity, not bundled as an input file.
  // The private database and heartbeat remain on the configured runtime disk.
  const database=resolve(/* turbopackIgnore: true */ process.env.COMMUNITY_DB_PATH||resolve(process.cwd(),'.data','community.db'));
  const fingerprint=createHash('sha256').update(process.platform==='win32'?database.toLowerCase():database).digest('hex').slice(0,16);
  try{
    const path=resolve(process.cwd(),'.data','workflow-services',`worker-${fingerprint}.json`);
    const raw=readFileSync(path,'utf8');if(raw.length>8000)throw new Error();
    const value=JSON.parse(raw) as Record<string,unknown>;
    const seen=Date.parse(String(value.lastSeen));
    if(value.databaseFingerprint!==fingerprint||!Number.isInteger(value.pid)||Number(value.pid)<1||!['idle','running'].includes(String(value.state))||!Number.isFinite(seen)||Date.now()-seen>10000||seen>Date.now()+5000)throw new Error();
    process.kill(Number(value.pid),0);
    return{available:true,message:'Локалният worker е на линия. Задачите продължават и след затваряне на страницата.',lastSeen:String(value.lastSeen)};
  }catch{return{available:false,message:'Пусни локалния Workflow worker за тази база. Единичните стъпки остават достъпни.',lastSeen:null};}
}
