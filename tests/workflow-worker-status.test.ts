import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {getWorkflowWorkerStatus} from '../lib/workflow-worker-status';

test('worker status uses the exact database fingerprint, fresh heartbeat and a live process',()=>{
  const previousCwd=process.cwd(),previousDb=process.env.COMMUNITY_DB_PATH;
  const directory=mkdtempSync(join(tmpdir(),'workflow-heartbeat-'));
  try{
    process.chdir(directory);process.env.COMMUNITY_DB_PATH=join(directory,'MixedCase.db');
    assert.equal(getWorkflowWorkerStatus().available,false);
    const database=resolve(process.env.COMMUNITY_DB_PATH),fingerprint=createHash('sha256').update(process.platform==='win32'?database.toLowerCase():database).digest('hex').slice(0,16);
    const folder=join(directory,'.data','workflow-services');mkdirSync(folder,{recursive:true});
    const path=join(folder,`worker-${fingerprint}.json`);
    const heartbeat={pid:process.pid,lastSeen:new Date().toISOString(),state:'idle',databaseFingerprint:fingerprint};
    writeFileSync(path,JSON.stringify(heartbeat));assert.equal(getWorkflowWorkerStatus().available,true);
    writeFileSync(path,JSON.stringify({...heartbeat,lastSeen:new Date(Date.now()-11000).toISOString()}));assert.equal(getWorkflowWorkerStatus().available,false);
    writeFileSync(path,JSON.stringify({...heartbeat,state:'stopped'}));assert.equal(getWorkflowWorkerStatus().available,false);
    writeFileSync(path,JSON.stringify({...heartbeat,databaseFingerprint:'other-database'}));assert.equal(getWorkflowWorkerStatus().available,false);
    writeFileSync(path,JSON.stringify({...heartbeat,pid:2147483647}));assert.equal(getWorkflowWorkerStatus().available,false);
  }finally{
    process.chdir(previousCwd);if(previousDb===undefined)delete process.env.COMMUNITY_DB_PATH;else process.env.COMMUNITY_DB_PATH=previousDb;
    const path=resolve(directory),base=resolve(tmpdir());if(!path.startsWith(base+'\\')&&!path.startsWith(base+'/'))throw new Error('Unsafe temporary cleanup');rmSync(path,{recursive:true,force:true});
  }
});
