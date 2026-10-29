import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {websiteModelTarget,generateWebsiteModelJson} from '../lib/website-model-transport';
import {getWebsiteLocalCapability} from '../lib/website-local-agent';
const keys=['WEBSITE_OLLAMA_ORIGIN','WEBSITE_OLLAMA_TOKEN','WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP','WEBSITE_AI_PROVIDER','WEBSITE_AI_MODEL','WORKFLOW_AI_PROVIDER','WORKFLOW_AI_MODEL','WORKFLOW_AI_COPY_MODEL','WORKFLOW_OLLAMA_ORIGIN'] as const;
const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));afterEach(()=>{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}});
const capability={provider:'ollama' as const,configured:true,status:'ready' as const,model:'fixture-local',message:'fixture',publishing:false as const,editing:false as const,networkChecked:true};
test('separate operator model URL permits secure remote and explicitly private HTTP, never inherits a remote Workflow URL',()=>{
 delete process.env.WEBSITE_OLLAMA_ORIGIN;process.env.WORKFLOW_OLLAMA_ORIGIN='https://model.example.test';assert.throws(()=>websiteModelTarget(),/WEBSITE_OLLAMA_ORIGIN/);
 process.env.WEBSITE_OLLAMA_ORIGIN='https://model.example.test';assert.equal(websiteModelTarget().execution,'remote');
 process.env.WEBSITE_OLLAMA_ORIGIN='http://10.12.0.8:11434';delete process.env.WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP;assert.throws(()=>websiteModelTarget(),/HTTPS/);process.env.WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP='true';assert.equal(websiteModelTarget().execution,'remote');
 for(const url of ['http://example.test','https://user:secret@model.example.test','https://model.example.test/path','https://model.example.test/?token=secret','http://169.254.169.254']){process.env.WEBSITE_OLLAMA_ORIGIN=url;assert.throws(()=>websiteModelTarget());}
});
test('actual HTTP tags, show and generate transport sends server bearer, structured schema and no cloud request',async()=>{
 const calls:{path:string;authorization:string|undefined;body:Record<string,unknown>}[]=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({path:req.url!,authorization:req.headers.authorization,body:body?JSON.parse(body):{}});res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/tags'?{models:[{name:'fixture-local'}]}:req.url==='/api/show'?{details:{format:'gguf'},model_info:{architecture:'fixture'}}:{done:true,response:JSON.stringify({html:'<h1>Explicit HTTP fixture</h1>',css:''})}));});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{process.env.WEBSITE_OLLAMA_ORIGIN=`http://127.0.0.1:${(server.address() as {port:number}).port}`;process.env.WEBSITE_OLLAMA_TOKEN='explicit-fixture-secret';process.env.WEBSITE_AI_PROVIDER='ollama';process.env.WEBSITE_AI_MODEL='fixture-local';process.env.WORKFLOW_AI_PROVIDER='openai';
 const cap=await getWebsiteLocalCapability(true);assert.equal(cap.configured,true);assert.ok(!JSON.stringify(cap).includes('explicit-fixture-secret'));assert.ok(!JSON.stringify(cap).includes('127.0.0.1'));
 const output=await generateWebsiteModelJson(cap,{system:'fixture system',user:'fixture input'},{type:'object'}, {maxOutputTokens:500});assert.equal(output.html,'<h1>Explicit HTTP fixture</h1>');assert.deepEqual(calls.map(c=>c.path),['/api/tags','/api/show','/api/show','/api/generate']);assert.ok(calls.every(c=>c.authorization==='Bearer explicit-fixture-secret'));assert.equal(calls.at(-1)?.body.stream,false);assert.deepEqual(calls.at(-1)?.body.format,{type:'object'});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('remote HTTPS fixture carries no secret to client; cloud flags and paid capability stop before generation',async()=>{
 const savedFetch=fetch,calls:string[]=[];process.env.WEBSITE_OLLAMA_ORIGIN='https://owned-model.example.test';process.env.WEBSITE_AI_PROVIDER='ollama';process.env.WEBSITE_AI_MODEL='fixture-local';process.env.WEBSITE_OLLAMA_TOKEN='fixture-remote-token';
 globalThis.fetch=async(input,init)=>{calls.push(String(input));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-remote-token');return Response.json(String(input).endsWith('/api/tags')?{models:[{name:'fixture-local'}]}:{details:{format:'gguf'},model_info:{architecture:'fixture'}});};
 try{const cap=await getWebsiteLocalCapability(true);assert.equal(cap.mode,'self-hosted');assert.equal(cap.execution,'remote');assert.equal(cap.configured,true);assert.ok(!JSON.stringify(cap).includes('owned-model.example.test'));globalThis.fetch=async()=>Response.json({details:{format:'gguf'},model_info:{},remote_host:'https://cloud.example'});await assert.rejects(()=>generateWebsiteModelJson(cap,{system:'',user:''},{type:'object'}),/Облачно препращане/);const before=calls.length;await assert.rejects(()=>generateWebsiteModelJson({...capability,provider:'openai'},{system:'',user:''},{}),/платени/);assert.equal(calls.length,before);}finally{globalThis.fetch=savedFetch;}
});
test('network failures and provider bodies never expose endpoint credentials',async()=>{
 const savedFetch=fetch;process.env.WEBSITE_OLLAMA_ORIGIN='https://owned-model.example.test';process.env.WEBSITE_OLLAMA_TOKEN='fixture-secret';globalThis.fetch=async()=>{throw new Error('https://owned-model.example.test fixture-secret');};
 try{const cap=await getWebsiteLocalCapability(true);assert.equal(cap.configured,false);assert.ok(!JSON.stringify(cap).includes('fixture-secret'));assert.ok(!JSON.stringify(cap).includes('owned-model.example.test'));}finally{globalThis.fetch=savedFetch;}
});
