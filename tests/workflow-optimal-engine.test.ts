import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../lib/auth';
import { getOptimalEngineStatus,searchOptimalEngineMemory } from '../lib/workflow-optimal-engine';
import type { Member } from '../lib/domain';

const originalFetch=globalThis.fetch,originalOrigin=process.env.WORKFLOW_OPTIMAL_ORIGIN,originalKey=process.env.WORKFLOW_OPTIMAL_API_KEY;
const actor:Member={id:'owner-a',name:'Test',email:'test@example.test',role:'member',ageBand:'18+',profile:null};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
afterEach(()=>{globalThis.fetch=originalFetch;for(const [name,value] of [['WORKFLOW_OPTIMAL_ORIGIN',originalOrigin],['WORKFLOW_OPTIMAL_API_KEY',originalKey]]){if(value===undefined)delete process.env[name!];else process.env[name!]=value;}});

test('the optional engine is not represented as running merely because source code was copied',async()=>{
  delete process.env.WORKFLOW_OPTIMAL_ORIGIN;globalThis.fetch=async()=>assert.fail('Unconfigured engine was probed');
  const status=await getOptimalEngineStatus({role:'admin'});assert.equal(status.available,false);assert.equal(status.configured,false);
  await assert.rejects(()=>searchOptimalEngineMemory(actor,'съдържание'),(error:unknown)=>error instanceof AppError&&error.status===503);
});

test('engine configuration and operator status cannot probe arbitrary hosts or leak credentials',async()=>{
  globalThis.fetch=async()=>assert.fail('Unauthorized engine probe');
  await assert.rejects(()=>getOptimalEngineStatus(actor),(error:unknown)=>error instanceof AppError&&error.status===403);
  for(const origin of ['https://example.com','http://127.0.0.1:8881','http://user:secret@127.0.0.1:4200','http://127.0.0.1:4200/private']){process.env.WORKFLOW_OPTIMAL_ORIGIN=origin;const result=await getOptimalEngineStatus({role:'admin'});assert.equal(result.available,false);assert.equal(result.configured,false);assert.equal(JSON.stringify(result).includes('secret'),false);}
});

test('copied SDK HTTP client performs a bounded server-side status read without returning its key',async()=>{
  process.env.WORKFLOW_OPTIMAL_ORIGIN='http://127.0.0.1:4200';process.env.WORKFLOW_OPTIMAL_API_KEY='private-engine-key';
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),'http://127.0.0.1:4200/api/status');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-engine-key');return json({status:'ok',version:'0.3.10',private:'private-engine-key'});};
  const value=await getOptimalEngineStatus({role:'admin'});assert.equal(value.available,true);assert.equal(value.version,'0.3.10');assert.equal(JSON.stringify(value).includes('private-engine-key'),false);
});

test('copied SDK retrieval encodes query and actor workspace; foreign or inherited results are removed',async()=>{
  process.env.WORKFLOW_OPTIMAL_ORIGIN='http://127.0.0.1:4200';
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:4200');assert.equal(url.pathname,'/api/search');assert.equal(url.searchParams.get('workspace'),'academy:owner-a');assert.equal(url.searchParams.get('q'),'тема & workspace=other');assert.equal(init?.method,'GET');return json({results:[{id:'own',workspace_id:'academy:owner-a',source_workspace_id:'academy:owner-a',inherited:false,content:'Наши данни',title:'Контекст',uri:'optimal://academy/own',score:.8,metadata:{private:'not-returned'}},{id:'other',workspace_id:'academy:other',content:'Скрит чужд текст',inherited:false},{id:'org',workspace_id:'academy:owner-a',source_workspace_id:'org-default',content:'Друга организация',inherited:true}]});};
  const value=await searchOptimalEngineMemory(actor,'тема & workspace=other');assert.equal(value.length,1);assert.equal(value[0].id,'own');assert.equal(value[0].workspaceId,'academy:owner-a');assert.equal(JSON.stringify(value).includes('metadata'),false);assert.equal(JSON.stringify(value).includes('Скрит'),false);
});

test('a missing or oversized engine response remains an unavailable optional integration',async()=>{
  process.env.WORKFLOW_OPTIMAL_ORIGIN='http://127.0.0.1:4200';
  for(const response of [()=>json({error:'private server detail'},403),()=>new Response('x',{headers:{'Content-Type':'application/json','Content-Length':'1000001'}}),()=>json({status:'ok',version:'another-server'})]){globalThis.fetch=async()=>response();const status=await getOptimalEngineStatus({role:'admin'});assert.equal(status.available,false);assert.equal(JSON.stringify(status).includes('private server detail'),false);}
});
