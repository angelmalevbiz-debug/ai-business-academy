import {test,after} from 'node:test';
import type {WebsitePhotoCredit} from '../lib/website-domain';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createMember,AppError} from '../lib/auth';
import {closeDb,getDb} from '../lib/db';
import {createWebsite,getWebsite,listWebsites,restoreWebsiteBuild,saveWebsite,uploadWebsiteAsset,exportWebsiteHtml} from '../lib/website-store';
import {createCompleteWebsite,composeWebsite} from '../lib/website-composition';
import {selectWebsiteDesignSystem} from '../lib/website-design-catalog';
const dir=mkdtempSync(join(tmpdir(),'website-completion-'));process.env.COMMUNITY_DB_PATH=join(dir,'fixture.db');
after(()=>{closeDb();rmSync(dir,{recursive:true,force:true});});
const facts={name:'Техно · тестов магазин',offer:'Онлайн магазин за всякаква техника.',audience:'Хора, които търсят техника.',contact:'shop@example.test',brief:'',businessStage:'existing',style:'editorial'};
const user=()=>createMember({name:'Completion fixture',email:`complete-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),ageBand:'18+'});
test('single complete creation returns all content, semantic retail structure and inquiry categories with AI off',async()=>{
 const alice=await user();const original=fetch;globalThis.fetch=async()=>{throw new Error('No model/network required');};
 try{const result=await createCompleteWebsite(alice,{...facts,findPhotos:false});assert.equal(result.website.document.compositionVersion,2);assert.equal(result.website.document.businessKind,'retail');assert.ok(result.website.document.sections.length>=7);assert.equal(result.website.document.sections.find(s=>s.type==='products')?.tiles?.length,4);assert.equal(result.readiness.structure,true);assert.equal(result.readiness.level,'needs-images');assert.equal(listWebsites(alice).length,1);assert.equal(result.website.generation,null);assert.equal(result.website.document.sections[0].title,'Техника за твоя ден.');const html=exportWebsiteHtml(alice,result.website.id);assert.match(html,/class="visual-tile"/);assert.match(html,/class="mobile-menu"/);assert.doesNotMatch(html,/купете сега|в наличност|най-ниски|безплатна доставка/iu);}finally{globalThis.fetch=original;}
});
test('composition failure never leaves a new one-section saved stub behind',async()=>{
 const alice=await user();await assert.rejects(()=>createCompleteWebsite(alice,{...facts,findPhotos:false},{compose:async()=>{throw new AppError('Explicit fixture failure',503);}}),/Explicit fixture failure/);assert.equal(listWebsites(alice).length,0);
});
test('legacy completion keeps a restorable owner-only snapshot and rejects stale restore',async()=>{
 const alice=await user(),bob=await user(),site=createWebsite(alice,facts);const original=structuredClone(site.document);
 const result=await composeWebsite(alice,{id:site.id,revision:1,findPhotos:false,complete:true});assert.equal(result.website.previousBuildRevision,1);assert.equal(getDb().prepare('SELECT COUNT(*) n FROM website_build_backups WHERE site_id=?').get(site.id)!.n,1);assert.ok(result.website.document.sections.length>original.sections.length);
 assert.throws(()=>restoreWebsiteBuild(bob,{id:site.id,revision:2}),error=>error instanceof AppError&&error.status===404);assert.throws(()=>restoreWebsiteBuild(alice,{id:site.id,revision:1}),error=>error instanceof AppError&&error.status===409);const restored=restoreWebsiteBuild(alice,{id:site.id,revision:2});assert.deepEqual(restored.document,original);assert.equal(restored.revision,3);
});
test('tile images enforce ownership and self-contained export, including all source credits',async()=>{
 const alice=await user(),bob=await user();const credits:WebsitePhotoCredit[]=[];
 for(let i=0;i<5;i++){const a=await uploadWebsiteAsset(alice,{name:`explicit-fixture-${i}.png`,bytes:await sharp({create:{width:30,height:20,channels:3,background:'#abcdef'}}).png().toBuffer()});credits.push({assetUrl:a.url,title:a.name,author:'Explicit synthetic fixture',sourceUrl:`https://commons.wikimedia.org/?curid=${i+1}`,license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'});}
 const result=await createCompleteWebsite(alice,facts,{photos:async(_user,query,limit)=>{assert.equal(query,'computer shop');assert.equal(limit,5);return credits;}});assert.equal(result.photosAdded,5);const tiles=result.website.document.sections.find(s=>s.tiles)?.tiles||[];assert.equal(new Set(tiles.map(t=>t.image)).size,4);const html=exportWebsiteHtml(alice,result.website.id);assert.ok((html.match(/data:image\/webp;base64,/g)||[]).length>=5);assert.equal((html.match(/crop|оразмерена/g)||[]).length,5);
 const foreign=createWebsite(bob,facts);assert.throws(()=>saveWebsite(bob,{id:foreign.id,revision:1,document:{...result.website.document,sections:result.website.document.sections}}),error=>error instanceof AppError&&error.status===404);assert.equal(getWebsite(bob,foreign.id).revision,1);
});
test('electronics and electrician use different imagery subjects',()=>{assert.equal(selectWebsiteDesignSystem(facts as never).industryId,'electronics');assert.equal(selectWebsiteDesignSystem({...facts,name:'Електро услуги',offer:'Монтаж на електрически табла.'} as never).industryId,'electric');});
