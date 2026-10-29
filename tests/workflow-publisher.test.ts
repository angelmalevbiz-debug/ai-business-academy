import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../lib/auth';
import { getPublisherStatus, listPublisherDrafts, readPublisherDraft } from '../lib/workflow-publisher';

const originalFetch = globalThis.fetch;
const originalOrigin = process.env.WORKFLOW_PUBLISHER_ORIGIN;
const operator = {role:'admin'} as const;
const id = 'a'.repeat(32);
const otherId = 'b'.repeat(32);
const bootstrap = {name:'Cutroom',version:'3.1.0',worker_mode:'academy',csrf_token:'private-mutation-token',social:{instagram:12}};
const draft = {id,title:'Покажи процеса',caption:'Първи опит с измислени данни.',updated_at:'2026-10-27T12:00:00Z',status:'NEEDS_REVIEW',slides:[{headline:'Вход',body:'Едно запитване',reference_path:'C:/private/reference.png'},{headline:'Проверка',body:'Човек преглежда резултата'}],access_token:'private-provider-token',account_id:'private-account',path:'C:/private/source'};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
type FetchInput = Parameters<typeof fetch>[0];
function stub(reply: (url:string,init?:RequestInit)=>Response|Promise<Response>) {
  const calls:{url:string,method:string,headers:Headers}[]=[];
  globalThis.fetch = async (input:FetchInput,init?:RequestInit) => {
    const url=String(input);calls.push({url,method:init?.method||'GET',headers:new Headers(init?.headers)});
    return reply(url,init);
  };
  return calls;
}
function configured() { process.env.WORKFLOW_PUBLISHER_ORIGIN='http://127.0.0.1:8881'; }
afterEach(()=>{globalThis.fetch=originalFetch;if(originalOrigin===undefined)delete process.env.WORKFLOW_PUBLISHER_ORIGIN;else process.env.WORKFLOW_PUBLISHER_ORIGIN=originalOrigin;});

test('publisher reads reject guests and members before any local network request',async()=>{
  configured();const calls=stub(()=>assert.fail('Unauthorized network call'));
  for(const actor of [null,undefined,{role:'member'} as const]){
    for(const action of [()=>getPublisherStatus(actor),()=>listPublisherDrafts(actor),()=>readPublisherDraft(actor,id)]) await assert.rejects(action,(error:unknown)=>error instanceof AppError&&error.status===403);
  }
  assert.equal(calls.length,0);
});

test('unset bridge configuration does not auto-probe the operator computer',async()=>{
  delete process.env.WORKFLOW_PUBLISHER_ORIGIN;const calls=stub(()=>assert.fail('Unexpected probe'));
  assert.deepEqual(await getPublisherStatus(operator),{available:false,configured:false,message:'Свържи локалното Cutroom студио чрез WORKFLOW_PUBLISHER_ORIGIN на сървъра.'});
  await assert.rejects(()=>listPublisherDrafts(operator),(error:unknown)=>error instanceof AppError&&error.status===503);
  assert.equal(calls.length,0);
});

test('bridge accepts only the two explicit loopback studio origins and no credentials or paths',async()=>{
  const calls=stub(()=>assert.fail('Forbidden origin requested'));
  for(const value of ['https://example.com','http://localhost:8881','http://127.0.0.1:3000','http://127.0.0.1:8881/private','http://operator:secret@127.0.0.1:8881','http://127.0.0.1:8881/?target=private','file:///private','not-a-url']){
    process.env.WORKFLOW_PUBLISHER_ORIGIN=value;const status=await getPublisherStatus(operator);assert.equal(status.available,false);assert.equal(status.configured,false);
    assert.equal(JSON.stringify(status).includes('secret'),false);
  }
  assert.equal(calls.length,0);
});

test('a configured but absent API is unavailable without leaking its server error body',async()=>{
  configured();stub(()=>json({error:'private diagnostic and token'},404));
  const status=await getPublisherStatus(operator);assert.equal(status.configured,true);assert.equal(status.available,false);assert.equal(JSON.stringify(status).includes('private diagnostic'),false);
});

test('verified status exposes whitelisted capability labels, never tokens, accounts or settings',async()=>{
  configured();const calls=stub(url=>url.endsWith('/api/bootstrap')?json(bootstrap):json({drafts:[],providers:{text:{status:'configured_unverified',api_key:'secret'},image:{status:'malicious provider diagnostic',token:'secret'},openai_key_present:true},settings:{private:'secret'},accounts:[{id:'private-account'}]}));
  const value=await getPublisherStatus(operator);assert.equal(value.available,true);assert.equal(value.canImport,true);assert.equal(value.workerMode,'academy');assert.deepEqual(value.generation,{text:'configured_unverified',image:'unknown',runtimeVerified:false});
  const encoded=JSON.stringify(value);for(const forbidden of ['secret','csrf','private-account','openai_key_present','malicious provider'])assert.equal(encoded.includes(forbidden),false);
  assert.ok(calls.every(call=>call.method==='GET'&&!call.headers.has('x-studio-token')));
});

test('a different local process is not mislabeled as a working Cutroom service',async()=>{
  configured();const calls=stub(()=>json({name:'Another app',version:'3.1.0',worker_mode:'academy'}));
  const value=await getPublisherStatus(operator);assert.equal(value.available,false);assert.equal(calls.length,1);
});

test('listing drafts copies only selected text fields and does not import files or approval as Academy approval',async()=>{
  configured();stub(url=>url.endsWith('/api/bootstrap')?json(bootstrap):json({drafts:[draft,draft,{id:'../private',caption:'invalid'},{id:otherId,title:'Empty'}],settings:{token:'secret'}}));
  const rows=await listPublisherDrafts(operator);assert.equal(rows.length,1);assert.equal(rows[0].id,id);assert.equal(rows[0].status,'NEEDS_REVIEW');assert.match(rows[0].content,/Вход\nЕдно запитване/);assert.match(rows[0].content,/Проверка\nЧовек/);
  const encoded=JSON.stringify(rows);for(const forbidden of ['private-provider-token','private-account','reference_path','C:/private','approved_revision','csrf'])assert.equal(encoded.includes(forbidden),false);
  assert.deepEqual(Object.keys(rows[0]).sort(),['content','id','status','title','updatedAt']);
});

test('list response is deduplicated and bounded even if the studio returns many drafts',async()=>{
  configured();stub(url=>url.endsWith('/api/bootstrap')?json(bootstrap):json({drafts:Array.from({length:99},(_,index)=>({...draft,id:index.toString(16).padStart(32,'0')}))}));
  const rows=await listPublisherDrafts(operator);assert.equal(rows.length,40);assert.ok(rows.every(item=>item.content.length<=18000));
});

test('selected draft rejects traversal, arbitrary URLs and wrong response identity',async()=>{
  configured();const calls=stub(()=>json(bootstrap));
  for(const invalid of ['../settings','https://example.com',id+'/export',null,14])await assert.rejects(()=>readPublisherDraft(operator,invalid),(error:unknown)=>error instanceof AppError&&error.status===400);
  assert.equal(calls.length,0);
  stub(url=>url.endsWith('/api/bootstrap')?json(bootstrap):json({...draft,id:otherId}));
  await assert.rejects(()=>readPublisherDraft(operator,id),(error:unknown)=>error instanceof AppError&&error.status===502);
});

test('selected draft uses only whitelisted GET paths and returns a bounded usable copy',async()=>{
  process.env.WORKFLOW_PUBLISHER_ORIGIN='http://127.0.0.1:8878/';
  const calls=stub((url,init)=>{assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.ok(init?.signal);return url.endsWith('/api/bootstrap')?json({...bootstrap,worker_mode:'all'}):json({...draft,caption:'x'.repeat(50_000),slides:[{body:'y'.repeat(50_000)}]});});
  const result=await readPublisherDraft(operator,id);assert.equal(result.id,id);assert.ok(result.content.length<=18000);
  assert.deepEqual(calls.map(call=>call.url),['http://127.0.0.1:8878/api/bootstrap','http://127.0.0.1:8878/api/academy/drafts/'+id]);assert.ok(calls.every(call=>call.method==='GET'));
});

test('oversized JSON, non-JSON and connection failures produce bounded safe errors',async()=>{
  configured();
  for(const reply of [()=>new Response('private html',{headers:{'content-type':'text/html'}}),()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'2000001'}}),()=>new Response(JSON.stringify({value:'x'.repeat(2_000_001)}),{headers:{'content-type':'application/json'}}),()=>json([]),()=>{throw new Error('Bearer PRIVATE_TOKEN');}]){
    stub(reply);const value=await getPublisherStatus(operator);assert.equal(value.available,false);assert.equal(JSON.stringify(value).includes('PRIVATE_TOKEN'),false);assert.equal(JSON.stringify(value).includes('private html'),false);
  }
});
