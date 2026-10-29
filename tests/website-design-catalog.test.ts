import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMember,AppError} from '../lib/auth';
import {closeDb} from '../lib/db';
import {createWebsite,getWebsite,saveWebsite,uploadWebsiteAsset} from '../lib/website-store';
import sharp from 'sharp';
import {composeWebsite} from '../lib/website-composition';
import {WEBSITE_DESIGN_BASES,WEBSITE_DESIGN_RECIPE_COUNT,listWebsiteDesignSystems,selectWebsiteDesignSystem} from '../lib/website-design-catalog';
import {validateWebsiteDesign} from '../lib/website-design';
import {applyWebsiteDesignAction} from '../lib/website-design-actions';
import {renderWebsiteHtml} from '../lib/website-render';
const dir=mkdtempSync(join(tmpdir(),'website-catalog-'));process.env.COMMUNITY_DB_PATH=join(dir,'fixture.db');
after(()=>{closeDb();rmSync(dir,{recursive:true,force:true});});
const facts={name:'Север · вело ателие',offer:'Ремонт на велосипеди. Настройка на спирачки.',audience:'Градски велосипедисти.',contact:'atelier@example.test',brief:'',businessStage:'existing',style:'editorial'};
const user=()=>createMember({name:'Design fixture',email:`catalog-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),ageBand:'18+'});
test('41 authored directions expose 328 distinct structurally compatible recipes with validated saved metadata',()=>{
 assert.equal(WEBSITE_DESIGN_BASES.length,41);assert.equal(WEBSITE_DESIGN_RECIPE_COUNT,328);const ids=new Set<string>();
 for(const base of WEBSITE_DESIGN_BASES){const systems=['signature','journal','panorama','focus','immersive','showcase','atlas','essential'].map(v=>selectWebsiteDesignSystem({...facts,style:'editorial'},`${base.id}:${v}`));for(const system of systems){ids.add(system.id);assert.deepEqual(validateWebsiteDesign(system.design),system.design);const html=renderWebsiteHtml({name:base.name,document:{title:base.name,description:'',sections:[{id:'start',type:'hero',title:base.name,body:''}],...system}});assert.match(html,/prefers-reduced-motion/);}
 const fingerprints=new Set(systems.map(s=>JSON.stringify([s.design.layout,s.design.sectionStyle,s.design.imageTreatment,s.design.density,s.design.buttonStyle])));assert.equal(fingerprints.size,8);}
 assert.equal(ids.size,328);assert.throws(()=>selectWebsiteDesignSystem(facts as never,'dental:unknown'));
});
test('keyword routing distinguishes precise business needs and respects user light/dark preference',()=>{
 for(const [name,industry] of [['Автосервиз','automotive'],['ВиК услуги','plumbing'],['Дентална практика','dental'],['Езиково студио','language'],['Фотограф','photography'],['Вело ателие','bicycle']]){const selected=selectWebsiteDesignSystem({...facts,name,style:'editorial'});assert.equal(selected.industryId,industry);assert.equal(selected.theme,'light');assert.equal(selectWebsiteDesignSystem({...facts,name,style:'studio'}).theme,'dark');}
 assert.equal(listWebsiteDesignSystems(facts as never).length,8);
});
test('built-in designer applies real saved edits with no model call and preserves user facts',async()=>{
 const alice=await user(),site=createWebsite(alice,facts),{website}=await composeWebsite(alice,{id:site.id,revision:1,findPhotos:false});
 const original=fetch;globalThis.fetch=async()=>{throw new Error('No network allowed for design operations');};
 try{const dark=await applyWebsiteDesignAction(alice,{id:site.id,revision:website.revision,operation:'theme-dark'});assert.equal(dark.method,'built-in-designer');assert.equal(dark.website.document.theme,'dark');assert.deepEqual(dark.website.document.sections,website.document.sections);const columns=await applyWebsiteDesignAction(alice,{id:site.id,revision:dark.website.revision,operation:'service-columns'});assert.equal(columns.website.document.design?.serviceColumns,2);const chosen=await applyWebsiteDesignAction(alice,{id:site.id,revision:columns.website.revision,operation:'design-system',systemId:'bicycle:panorama'});assert.equal(chosen.website.document.design?.imageTreatment,'wide');assert.deepEqual(chosen.website.document.sections,website.document.sections);assert.equal(chosen.website.generation,null);}finally{globalThis.fetch=original;}
});
test('visual edits survive built-in palette changes and contact reordering in actual visual HTML',async()=>{
 const alice=await user(),site=createWebsite(alice,facts),{website}=await composeWebsite(alice,{id:site.id,revision:1,findPhotos:false});
 const html=renderWebsiteHtml(website),visual={html:'<div class="website-page">'+html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]+'</div>',css:html.match(/<style>([\s\S]*?)<\/style>/)![1].replace(/\bbody(?=[\s,{:.#>\[])/g,'.website-page')};
 const edited=saveWebsite(alice,{id:site.id,revision:website.revision,document:{...website.document,visual}});
 const changed=await applyWebsiteDesignAction(alice,{id:site.id,revision:edited.revision,operation:'theme-dark'});assert.equal(changed.website.document.visual?.html,edited.document.visual?.html);assert.ok(changed.website.document.visual?.designCss);assert.match(renderWebsiteHtml(changed.website),/body,\.website-page\{--bg:#12191d/);
 const moved=await applyWebsiteDesignAction(alice,{id:site.id,revision:changed.website.revision,operation:'contact-first'});assert.equal(moved.website.document.sections[1].type,'contact');assert.ok(moved.website.document.visual!.html.indexOf('id="contact"')<moved.website.document.visual!.html.indexOf('id="services"'));
});
test('unknown operations, stale writes and foreign ownership cannot overwrite saved work',async()=>{
 const alice=await user(),bob=await user(),site=createWebsite(alice,facts);
 await assert.rejects(()=>applyWebsiteDesignAction(alice,{id:site.id,revision:1,operation:'make-arbitrary-ai-code'}),error=>error instanceof AppError&&error.status===422);
 await assert.rejects(()=>applyWebsiteDesignAction(bob,{id:site.id,revision:1,operation:'theme-dark'}),error=>error instanceof AppError&&error.status===404);
 await assert.rejects(()=>applyWebsiteDesignAction(alice,{id:site.id,revision:0,operation:'theme-dark'}),error=>error instanceof AppError&&error.status===409);assert.equal(getWebsite(alice,site.id).revision,1);
});
test('photo refresh assigns owned licensed images to existing sections without regenerating copy, failure preserves revision',async()=>{
 const alice=await user(),site=createWebsite(alice,facts),{website}=await composeWebsite(alice,{id:site.id,revision:1,findPhotos:false});
 const assets=[];for(let i=0;i<3;i++)assets.push(await uploadWebsiteAsset(alice,{name:`explicit-fixture-${i}.png`,bytes:await sharp({create:{width:20,height:20,channels:3,background:['#aabbcc','#ccaabb','#bbccaa'][i]}}).png().toBuffer()}));
 const credits=assets.map(a=>({assetUrl:a.url,title:a.name,author:'Explicit synthetic fixture',sourceUrl:'https://commons.wikimedia.org/?curid=1',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'}));
 const refreshed=await applyWebsiteDesignAction(alice,{id:site.id,revision:website.revision,operation:'photos',keywords:'bicycle workshop'},{photos:async()=>credits});assert.equal(refreshed.photosAdded,3);assert.ok(refreshed.website.document.sections.filter(s=>s.image).length===3);assert.equal(refreshed.website.document.sections[0].title,website.document.sections[0].title);assert.equal(refreshed.website.document.photoCredits?.length,3);
 await assert.rejects(()=>applyWebsiteDesignAction(alice,{id:site.id,revision:refreshed.website.revision,operation:'photos',keywords:'fixture outage'},{photos:async()=>{throw new AppError('Explicit image outage',503);}}));assert.deepEqual(getWebsite(alice,site.id),refreshed.website);
});
