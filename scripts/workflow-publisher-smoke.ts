import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMember} from '../lib/auth';
import {closeDb} from '../lib/db';
import {getPublisherStatus,listPublisherDrafts,readPublisherDraft} from '../lib/workflow-publisher';
import {getWorkflowState,importWorkflowDraft} from '../lib/workflow-store';
import {exportAccountData} from '../lib/privacy';
import type {WorkflowCapability} from '../lib/workflow-domain';

async function main(){
  const base=resolve('.data');mkdirSync(base,{recursive:true});const directory=mkdtempSync(resolve(base,'publisher-import-check-'));
  process.env.COMMUNITY_DB_PATH=resolve(directory,'test.db');process.env.WORKFLOW_PUBLISHER_ORIGIN='http://127.0.0.1:8881';
  try{
    const operator=await createMember({name:'Isolated bridge QA',email:`bridge-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),ageBand:'18+'},'admin');
    const status=await getPublisherStatus(operator);assert.equal(status.available,true);assert.equal(status.bridgeMode,'read-only');
    const drafts=await listPublisherDrafts(operator);assert.ok(drafts.length>0,'The source must contain an actual selectable draft.');
    const selected=await readPublisherDraft(operator,drafts[0].id),requestId=randomUUID();
    const project=importWorkflowDraft(operator,{sourceId:selected.id,title:selected.title,content:selected.content,requestId});
    assert.equal(importWorkflowDraft(operator,{sourceId:selected.id,title:selected.title,content:selected.content,requestId}),project);
    const capability:WorkflowCapability={provider:'none',model:null,configured:false,status:'needs_setup',message:'No model called for import',networkChecked:false,publishing:false,editing:false};
    const state=getWorkflowState(operator,capability);assert.equal(state.artifacts.length,1);assert.equal(state.artifacts[0].content,selected.content);assert.equal(state.artifacts[0].status,'draft');assert.equal(state.artifacts[0].provenance,'imported');
    const exported=exportAccountData(operator);assert.ok(JSON.stringify(exported).includes(state.artifacts[0].id));
    writeFileSync('docs/workflow/live-import-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),actualNetworkReads:true,sourceDraftsAvailable:drafts.length,sourceDraftContentPrinted:false,importedTextIdentical:true,privateIsolatedDatabase:true,importUnapproved:true,retryReusedSameProject:true,includedInAccountExport:true,sourceWrites:0,postingWorkersStarted:false},null,2));
    console.log('Real read-only draft import, owner storage, retry idempotency and export passed; source content was not printed.');
  }finally{closeDb();const target=resolve(directory);if(!target.startsWith(base+sep)||!target.startsWith(resolve(base,'publisher-import-check-')))throw new Error('Refusing cleanup outside the isolated test directory.');rmSync(target,{recursive:true,force:true});}
}
void main();
