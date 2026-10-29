import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {NextRequest} from 'next/server';
import {AppError,createMember,createSession} from '../lib/auth';
import {closeDb,getDb} from '../lib/db';
import {createWebsite,exportWebsiteHtml,getWebsite,saveWebsite,uploadWebsiteAsset} from '../lib/website-store';
import {sanitizeWebsiteCss,sanitizeWebsiteVisual} from '../lib/website-visual';
import {getWebsiteLocalCapability,refineWebsite} from '../lib/website-local-agent';
import {generateWebsite} from '../lib/website-generation';
import {renderWebsiteHtml} from '../lib/website-render';
import {GET,POST} from '../app/api/websites/route';
import type {WorkflowCapability} from '../lib/workflow-domain';

const directory=mkdtempSync(join(tmpdir(),'academy-local-builder-'));
process.env.COMMUNITY_DB_PATH=join(directory,'test.db');process.env.WEBSITE_ASSET_DIR=join(directory,'assets');process.env.APP_ORIGIN='http://localhost:3100';
const user=()=>createMember({name:'Local builder fixture',email:`local-${randomUUID()}@example.test`,password:'Local-builder-isolated-password',ageBand:'18+'});
const facts={name:'Вело ателие',offer:'Настройка на спирачки и скорости.',audience:'Градски велосипеди',contact:'atelier@example.test',brief:'Само предоставени факти.',businessStage:'existing',style:'editorial'};
const capability:WorkflowCapability={provider:'ollama',model:'isolated-test-local-model',configured:true,status:'ready',message:'Explicit test fixture',networkChecked:false,publishing:false,editing:false};
const before={...process.env};
after(()=>{closeDb();for(const key of ['WEBSITE_AI_MODEL','WEBSITE_AI_PROVIDER','WORKFLOW_AI_PROVIDER','WORKFLOW_AI_MODEL','WORKFLOW_AI_COPY_MODEL','WORKFLOW_OLLAMA_ORIGIN','OPENAI_API_KEY']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}const path=resolve(directory);assert.ok(path.startsWith(resolve(tmpdir())+'\\')||path.startsWith(resolve(tmpdir())+'/'));rmSync(path,{recursive:true,force:true});});

test('visual markup strips scripts, handlers, forms, frames and executable links',()=>{
 const visual=sanitizeWebsiteVisual({html:'<main><h1 onclick="alert(1)">Страница</h1><script>alert(1)</script><iframe src="https://bad.example"></iframe><form action="https://bad.example"><input name="password"></form><a href="javascript:alert(1)" target="_blank">Линк</a><p>Текст</p></main>',css:'body{background:#fff;color:#111}'});
 assert.match(visual.html,/<h1>Страница<\/h1>/);for(const forbidden of ['<script','onclick','<iframe','<form','<input','javascript:'])assert.ok(!visual.html.includes(forbidden));assert.ok(visual.html.includes('rel="noopener noreferrer"'));
 assert.throws(()=>sanitizeWebsiteVisual({html:'<h1>Page</h1><img src="https://bad.example/pixel">',css:''}),/качени снимки/);
});
test('CSS parser refuses imports, external and disguised resources, executable styles and style breakouts',()=>{
 for(const css of ['@import "https://bad.example/style.css";','@font-face{font-family:a;src:url(https://bad.example/font)}','body{background:url(https://bad.example/pixel)}','body{background:image-set("https://bad.example/pixel" 1x)}','body{background:u\\72l(https://bad.example)}','body{background:u/**/rl(https://bad.example)}','body{width:expression(alert(1))}','body{behavior:url(x)}','body{color:red}</style><script>x</script>'])assert.throws(()=>sanitizeWebsiteCss(css));
 assert.match(sanitizeWebsiteCss('@media(max-width:600px){.hero{display:grid;gap:20px;padding:30px;color:rgb(12,24,36)}}'),/display:grid/);
 assert.match(sanitizeWebsiteCss('html{scroll-behavior:smooth}.section > p{color:#14243d}'),/scroll-behavior:smooth/);
 assert.throws(()=>sanitizeWebsiteVisual({html:'<h1 style="background:url(https://bad.example)">x</h1>',css:''}));
});
test('visual source is bounded; the server never stores arbitrary project scripts',()=>{
 assert.throws(()=>sanitizeWebsiteVisual({html:'a'.repeat(64001),css:''}),error=>error instanceof AppError&&error.status===413);
 const result=sanitizeWebsiteVisual({html:'<h1>Сайт</h1><p>Текст</p>',css:'',project:{script:'bad'},javascript:'bad'});assert.deepEqual(Object.keys(result).sort(),['css','html']);
});
test('owned visual HTML and CSS images are inlined in export; other members cannot attach them',async()=>{
 const alice=await user(),bob=await user(),image=await uploadWebsiteAsset(alice,{name:'fixture.png',bytes:await sharp({create:{width:2,height:2,channels:3,background:'#2266aa'}}).png().toBuffer()});
 const site=createWebsite(alice,facts),visual={html:`<h1>Снимка</h1><img src="${image.url}" alt="Предоставена снимка">`,css:`.hero{background-image:url("${image.url}")}`};
 const saved=saveWebsite(alice,{id:site.id,revision:1,document:{...site.document,visual}}),html=exportWebsiteHtml(alice,site.id);
 assert.equal(saved.revision,2);assert.match(html,/data:image\/webp;base64,/);assert.ok(!html.includes('/api/websites/assets/'));assert.match(html,/Content-Security-Policy/);assert.match(html,/script-src 'none'/);
 const other=createWebsite(bob,facts);assert.throws(()=>saveWebsite(bob,{id:other.id,revision:1,document:{...other.document,visual}}),error=>error instanceof AppError&&error.status===404);
 assert.throws(()=>getWebsite(bob,site.id),error=>error instanceof AppError&&error.status===404);
});
test('existing structured sites remain byte-identical until explicitly entering visual mode',async()=>{
 const alice=await user(),site=createWebsite(alice,facts),before=renderWebsiteHtml(site),saved=saveWebsite(alice,{id:site.id,revision:1,document:site.document});assert.equal(renderWebsiteHtml(saved),before);
 const customized=saveWebsite(alice,{id:site.id,revision:2,document:{...site.document,visual:{html:'<main><h1>Визуална страница</h1><p>Съдържание</p></main>',css:'h1{color:#2169d9}'}}});assert.match(renderWebsiteHtml(customized),/Визуална страница/);
 const cleared=saveWebsite(alice,{id:site.id,revision:3,document:{...site.document,visual:null}});assert.equal(renderWebsiteHtml(cleared),before);
});
test('local capability ignores global paid-provider settings and does not send a paid API request',async()=>{
 const original=globalThis.fetch,urls:string[]=[];process.env.WORKFLOW_AI_PROVIDER='openai';process.env.WORKFLOW_AI_MODEL='paid-cloud-model';process.env.OPENAI_API_KEY='explicit-test-sentinel-never-sent';delete process.env.WORKFLOW_AI_COPY_MODEL;delete process.env.WEBSITE_AI_MODEL;delete process.env.WEBSITE_AI_PROVIDER;
 globalThis.fetch=async(input,init)=>{const url=String(input);urls.push(url);assert.ok(!JSON.stringify(init?.headers||{}).includes('explicit-test-sentinel'));return Response.json(url.endsWith('/api/tags')?{models:[{name:'fixture-local'}]}:{details:{format:'gguf'},model_info:{architecture:'fixture'}});};
 try{const actual=await getWebsiteLocalCapability(true);assert.equal(actual.provider,'ollama');assert.equal(actual.model,'fixture-local');assert.equal(actual.apiBilling,false);assert.equal(actual.mode,'local-only');assert.ok(actual.configured);assert.deepEqual(urls,['http://127.0.0.1:11434/api/tags','http://127.0.0.1:11434/api/show']);}finally{globalThis.fetch=original;delete process.env.OPENAI_API_KEY;}
});
test('missing, cloud-backed or remote-localhost settings never trigger a paid fallback',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  process.env.WEBSITE_AI_PROVIDER='none';globalThis.fetch=async()=>{calls++;throw new Error('Must not fetch');};assert.equal((await getWebsiteLocalCapability(true)).configured,false);assert.equal(calls,0);
  delete process.env.WEBSITE_AI_PROVIDER;process.env.WORKFLOW_OLLAMA_ORIGIN='https://cloud.example';assert.equal((await getWebsiteLocalCapability(true)).configured,false);assert.equal(calls,0);
  delete process.env.WORKFLOW_OLLAMA_ORIGIN;globalThis.fetch=async(input)=>{calls++;return Response.json(String(input).endsWith('/api/tags')?{models:[{name:'cloud-backed'}]}:{details:{format:'gguf'},model_info:{architecture:'fixture'},remote_host:'https://remote.example'});};assert.equal((await getWebsiteLocalCapability(true)).configured,false);assert.equal(calls,2);
 }finally{globalThis.fetch=original;delete process.env.WEBSITE_AI_PROVIDER;delete process.env.WORKFLOW_OLLAMA_ORIGIN;}
});
test('initial generation and refinement both reject a paid capability before their generator runs',async()=>{
 const alice=await user(),site=createWebsite(alice,facts);let calls=0;const deps={capability:{...capability,provider:'openai' as const},generate:async()=>{calls++;return {};}};
 await assert.rejects(()=>generateWebsite(alice,{id:site.id,revision:1},deps),/Платени API/);await assert.rejects(()=>refineWebsite(alice,{id:site.id,revision:1,instruction:'Направи по-голямо заглавие.'},deps),/Платени API/);assert.equal(calls,0);assert.equal(getWebsite(alice,site.id).revision,1);assert.equal(getDb().prepare('SELECT generation_until FROM website_projects WHERE id=?').get(site.id)!.generation_until,0);
});
test('real refinement path saves explicit generator output with provenance; failure preserves the previous version',async()=>{
 const alice=await user(),site=createWebsite(alice,facts);let calls=0;
 const saved=await refineWebsite(alice,{id:site.id,revision:1,instruction:'По-голямо заглавие и по-малко празно място.'},{capability,generate:async(_cap,prompt)=>{calls++;assert.match(prompt.user,/Настройка на спирачки/);assert.match(prompt.user,/По-голямо заглавие/);return {html:'<main><h1>Вело ателие</h1><p>Настройка на спирачки и скорости.</p></main>',css:'h1{font-size:52px}'};}});
 assert.equal(calls,1);assert.equal(saved.revision,2);assert.equal(saved.generation?.provider,'ollama');assert.match(saved.document.visual!.css,/52px/);assert.deepEqual(saved.document.sections,site.document.sections);
 await assert.rejects(()=>refineWebsite(alice,{id:site.id,revision:2,instruction:'Промени заглавието.'},{capability,generate:async()=>{throw new AppError('Explicit model failure',502);}}),/Explicit model failure/);assert.deepEqual(getWebsite(alice,site.id),saved);
});
test('unsafe model output gets one real repair, while stale or repeatedly invalid output cannot overwrite work',async()=>{
 const alice=await user(),site=createWebsite(alice,facts);let calls=0;const saved=await refineWebsite(alice,{id:site.id,revision:1,instruction:'Подреди услугите по-ясно.'},{capability,generate:async(_cap,prompt)=>{calls++;if(calls===1)return {html:'<h1>Сайт</h1>',css:'@import "https://bad.example";'};assert.match(prompt.user,/validationError/);return {html:'<h1>Вело ателие</h1><p>Настройка на спирачки и скорости.</p>',css:'h1{color:#2169d9}'};}});assert.equal(calls,2);
 calls=0;await assert.rejects(()=>refineWebsite(alice,{id:site.id,revision:2,instruction:'Пробвай невалиден стил.'},{capability,generate:async()=>{calls++;return {html:'<h1>Сайт</h1>',css:'body{background:url(https://bad.example)}'};}}));assert.equal(calls,2);assert.deepEqual(getWebsite(alice,site.id),saved);
 await assert.rejects(()=>refineWebsite(alice,{id:site.id,revision:2,instruction:'Стара локална заявка.'},{capability,generate:async()=>{saveWebsite(alice,{id:site.id,revision:2,document:{...site.document,title:'По-нова човешка промяна'}});return {html:'<h1>Вело ателие</h1>',css:''};}}),error=>error instanceof AppError&&error.status===409);assert.equal(getWebsite(alice,site.id).document.title,'По-нова човешка промяна');
});
test('visual API enforces owner sessions and request origin before any model execution',async()=>{
 const alice=await user(),site=createWebsite(alice,facts),cookie=`wv_session=${createSession(alice.id)}`;
 const make=(headers:Record<string,string>)=>new NextRequest('http://localhost:3100/api/websites',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action:'refine',id:site.id,revision:1,instruction:'Направи голямо заглавие.'})});
 assert.equal((await POST(make({origin:'http://localhost:3100'}))).status,401);assert.equal((await POST(make({origin:'https://bad.example',cookie}))).status,403);assert.equal((await GET(new NextRequest('http://localhost:3100/api/websites?capability=1'))).status,401);
 process.env.WEBSITE_AI_PROVIDER='none';const response=await GET(new NextRequest('http://localhost:3100/api/websites?capability=1&refresh=1',{headers:{cookie}}));const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.capability.provider,'ollama');assert.equal(payload.capability.apiBilling,false);assert.equal(payload.capability.configured,false);delete process.env.WEBSITE_AI_PROVIDER;
});
