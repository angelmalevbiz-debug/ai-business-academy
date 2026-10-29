import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {NextRequest} from 'next/server';
import {AppError,createMember,createSession} from '../lib/auth';
import {closeDb,getDb,transaction} from '../lib/db';
import {claimWebsiteGeneration,cleanWebsiteAssetDeletions,createWebsite,exportWebsiteHtml,getWebsite,listWebsites,markWebsiteAssetsForDeletion,readWebsiteAsset,releaseWebsiteGeneration,saveWebsite,uploadWebsiteAsset,validateWebsiteDocument} from '../lib/website-store';
import {renderWebsiteHtml} from '../lib/website-render';
import {generateWebsite,refineGeneratedWebsiteLayout} from '../lib/website-generation';
import {POST} from '../app/api/websites/route';
import {GET as preview} from '../app/api/websites/[id]/preview/route';
import type {WorkflowCapability} from '../lib/workflow-domain';
const directory=mkdtempSync(join(tmpdir(),'academy-websites-'));process.env.COMMUNITY_DB_PATH=join(directory,'test.db');process.env.WEBSITE_ASSET_DIR=join(directory,'assets');process.env.APP_ORIGIN='http://localhost:3100';
const user=()=>createMember({name:'Website test',email:`website-${randomUUID()}@example.test`,password:'Website-isolated-test-password',ageBand:'18+'});
const input=()=>({name:'Вело ателие',offer:'Настройка на спирачки и скорости за градски велосипеди.',audience:'Хора с градски велосипед.',contact:'atelier@example.test',brief:'Без цени и срокове, защото не са предоставени.',businessStage:'existing',style:'editorial'});
const cap:WorkflowCapability={provider:'ollama',model:'explicit isolated test fixture',configured:true,status:'ready',message:'Fixture',networkChecked:false,publishing:false,editing:false};
after(()=>{closeDb();const path=resolve(directory);assert.ok(path.startsWith(resolve(tmpdir())+'\\')||path.startsWith(resolve(tmpdir())+'/'));rmSync(path,{recursive:true,force:true});});

test('sites persist only for their owner and stale editor versions cannot overwrite',async()=>{
 const alice=await user(),bob=await user(),site=createWebsite(alice,input());assert.equal(site.revision,1);assert.equal(site.generation,null);assert.equal(listWebsites(bob).length,0);
 assert.throws(()=>getWebsite(bob,site.id),error=>error instanceof AppError&&error.status===404);assert.throws(()=>getWebsite(null,site.id),error=>error instanceof AppError&&error.status===401);
 const saved=saveWebsite(alice,{id:site.id,revision:1,document:{...site.document,description:'Запазено описание.'}});assert.equal(saved.revision,2);
 assert.throws(()=>saveWebsite(alice,{id:site.id,revision:1,document:site.document}),error=>error instanceof AppError&&error.status===409);assert.equal(getWebsite(alice,site.id).document.description,'Запазено описание.');
});
test('document validation and renderer contain executable content and dangerous URLs',async()=>{
 const alice=await user(),site=createWebsite(alice,input());const document=structuredClone(site.document);document.sections[0].title='<script>alert(1)</script>';document.sections[0].body='<img src=x onerror=alert(1)>';document.description='"><script>x</script>';
 const saved=saveWebsite(alice,{id:site.id,revision:1,document}),html=renderWebsiteHtml(saved);assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
 for(const url of ['javascript:alert(1)','data:text/html,hello','file:///etc/passwd','https://name:secret@example.com']){document.sections[0].buttonUrl=url;assert.throws(()=>validateWebsiteDocument(document));}
 document.sections[0].buttonUrl='#contact';document.sections[0].image='https://internal.example/image.png';assert.throws(()=>validateWebsiteDocument(document));
});
test('real image decode/re-encode strips metadata and tenant images cannot be stolen; export is self-contained',async()=>{
 const alice=await user(),bob=await user(),bytes=await sharp({create:{width:30,height:20,channels:3,background:'#2266aa'}}).png().toBuffer();const asset=await uploadWebsiteAsset(alice,{name:'actual-input.png',bytes});assert.equal(asset.mime,'image/webp');assert.equal(asset.width,30);assert.equal((await sharp(readWebsiteAsset(alice,asset.id).bytes).metadata()).format,'webp');
 assert.throws(()=>readWebsiteAsset(bob,asset.id),error=>error instanceof AppError&&error.status===404);
 const site=createWebsite(alice,input());site.document.sections[0].image=asset.url;const saved=saveWebsite(alice,{id:site.id,revision:site.revision,document:site.document});const html=exportWebsiteHtml(alice,saved.id);assert.ok(html.includes('data:image/webp;base64,'));assert.ok(!html.includes('src="/api/websites/assets/'));
 const other=createWebsite(bob,input());other.document.sections[0].image=asset.url;assert.throws(()=>saveWebsite(bob,{id:other.id,revision:1,document:other.document}),error=>error instanceof AppError&&error.status===404);
 for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),Buffer.from('not an image')])await assert.rejects(()=>uploadWebsiteAsset(alice,{name:'untrusted.png',bytes}),/не се разчита/);
});
test('AI generation stores actual supplied generator output and provenance, no placeholder success',async()=>{
 const alice=await user(),site=createWebsite(alice,input());let calls=0;
 const generated=await generateWebsite(alice,{id:site.id,revision:1},{capability:cap,generate:async(_cap,prompt)=>{calls++;assert.ok(prompt.user.includes(site.offer));return {...site.document,title:'Настройка за твоя градски велосипед',sections:[{...site.document.sections[0],title:'Настройка на спирачки и скорости'},site.document.sections[1]]};}});
 assert.equal(calls,1);assert.equal(generated.revision,2);assert.equal(generated.generation?.model,cap.model);assert.equal(generated.document.title,'Настройка за твоя градски велосипед');
 const before=getWebsite(alice,site.id);await assert.rejects(()=>generateWebsite(alice,{id:site.id,revision:2},{capability:cap,generate:async()=>{throw new AppError('Explicit fixture failure',502);}}),/Explicit fixture failure/);assert.deepEqual(getWebsite(alice,site.id),before);assert.equal(getDb().prepare('SELECT generation_until FROM website_projects WHERE id=?').get(site.id)!.generation_until,0);
});
test('AI external image/URL invention rejected and a concurrent save wins over generation',async()=>{
 const alice=await user(),site=createWebsite(alice,input());await assert.rejects(()=>generateWebsite(alice,{id:site.id,revision:1},{capability:cap,generate:async()=>({...site.document,sections:[{...site.document.sections[0],buttonUrl:'https://unprovided.example'},site.document.sections[1]]})}),/непредоставен адрес/);
 await assert.rejects(()=>generateWebsite(alice,{id:site.id,revision:1},{capability:cap,generate:async()=>{saveWebsite(alice,{id:site.id,revision:1,document:{...site.document,title:'Промяната на човека'}});return site.document as unknown as Record<string,unknown>;}}),error=>error instanceof AppError&&error.status===409);assert.equal(getWebsite(alice,site.id).document.title,'Промяната на човека');
});
test('generation leases stop duplicated work and global local-model load is bounded',async()=>{
 const alice=await user(),sites=[createWebsite(alice,input()),createWebsite(alice,input()),createWebsite(alice,input())];const first=claimWebsiteGeneration(alice,sites[0].id,1);assert.throws(()=>claimWebsiteGeneration(alice,sites[0].id,1),error=>error instanceof AppError&&error.status===409);const second=claimWebsiteGeneration(alice,sites[1].id,1);assert.throws(()=>claimWebsiteGeneration(alice,sites[2].id,1),error=>error instanceof AppError&&error.status===429);releaseWebsiteGeneration(sites[0].id,first.lease);releaseWebsiteGeneration(sites[1].id,second.lease);
});
test('invalid first hero structure gets exactly one model repair and functional contact labels',async()=>{
 const alice=await user(),site=createWebsite(alice,input());let calls=0;
 const saved=await generateWebsite(alice,{id:site.id,revision:1},{capability:cap,generate:async(_cap,prompt)=>{calls++;if(calls===2)assert.match(prompt.user,/validationError/);return {...site.document,sections:[{...site.document.sections[0],type:calls===1?'services':'hero',buttonUrl:`mailto:${site.contact}`,buttonLabel:'Посети ни'},site.document.sections[1]]};}});
 assert.equal(calls,2);assert.equal(saved.document.sections[0].buttonLabel,'Пиши ни');assert.equal(saved.document.sections[0].type,'hero');
});
test('observed invented replacement service and internal restrictions cannot become saved visitor copy',async()=>{
 for(const text of ['Ремонтираме гумите и ги заменяме при необходимост.','Не предоставяме цени, срокове или адрес.','Професионална настройка за всеки велосипед.']){
  const alice=await user(),site=createWebsite(alice,input());let calls=0;
  await assert.rejects(()=>generateWebsite(alice,{id:site.id,revision:1},{capability:cap,generate:async()=>{calls++;return {...site.document,sections:[{...site.document.sections[0],body:text},site.document.sections[1]]};}}),error=>error instanceof AppError&&error.status===502);
  assert.equal(calls,2);assert.equal(getWebsite(alice,site.id).revision,1);assert.equal(getWebsite(alice,site.id).generation,null);
 }
});
test('generated layout removes observed repeated facts without adding or rewriting business claims',async()=>{
 const alice=await user(),site=createWebsite(alice,input()),facts=site.offer.split(/(?<=[.!?])\s+/u),document=structuredClone(site.document);document.sections=[{id:'hero',type:'hero',title:site.offer,body:site.offer,items:facts},{id:'services',type:'services',title:'Услуги',body:site.offer,items:facts}];const refined=refineGeneratedWebsiteLayout(document,site.offer,site.audience);assert.deepEqual(refined.sections[0].items,[]);assert.equal(refined.sections[0].title,facts[0]);assert.equal(refined.sections[0].body,facts.slice(1).join(' '));assert.equal(refined.sections[1].body,'');assert.deepEqual(refined.sections[1].items,facts);assert.deepEqual(document.sections[0].items,facts);document.sections[1].body=facts[0];assert.equal(refineGeneratedWebsiteLayout(document,site.offer,site.audience).sections[1].body,'');
});
test('API enforces origin and cookie ownership, private preview has strict sandbox CSP',async()=>{
 const alice=await user(),site=createWebsite(alice,input()),token=createSession(alice.id),cookie=`wv_session=${token}`;
 const rejected=await POST(new NextRequest('http://localhost:3100/api/websites',{method:'POST',headers:{origin:'https://wrong.example','content-type':'application/json',cookie},body:JSON.stringify({action:'create',...input()})}));assert.equal(rejected.status,403);
 const missing=await POST(new NextRequest('http://localhost:3100/api/websites',{method:'POST',headers:{origin:'http://localhost:3100','content-type':'application/json'},body:JSON.stringify({action:'create',...input()})}));assert.equal(missing.status,401);
 const response=await preview(new NextRequest('http://localhost:3100/api/websites/'+site.id+'/preview',{headers:{cookie}}),{params:Promise.resolve({id:site.id})});assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy')!,/default-src 'none'.*sandbox/);assert.ok(!response.headers.get('Content-Security-Policy')!.includes('allow-scripts'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('account deletion purge keeps private file cleanup outside transaction and export metadata scoped',async()=>{
 const alice=await user();await uploadWebsiteAsset(alice,{name:'delete.png',bytes:await sharp({create:{width:10,height:10,channels:3,background:'#000'}}).png().toBuffer()});
 const filesBefore=readdirSync(process.env.WEBSITE_ASSET_DIR!).length;transaction(()=>{markWebsiteAssetsForDeletion(alice.id);getDb().prepare('DELETE FROM members WHERE id=?').run(alice.id);});assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM website_assets WHERE member_id=?').get(alice.id)!.n,0);cleanWebsiteAssetDeletions();assert.equal(readdirSync(process.env.WEBSITE_ASSET_DIR!).length,filesBefore-1);assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM website_asset_purge').get()!.n,0);
});
