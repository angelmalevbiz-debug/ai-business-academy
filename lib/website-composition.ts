import {AppError,rateLimit} from './auth';
import type {Member} from './domain';
import {claimWebsiteGeneration,createWebsite,releaseWebsiteGeneration,rollbackNewWebsite,saveWebsite} from './website-store';
import {websiteDesignForBusiness} from './website-design';
import {importWebsitePhotos} from './website-photos';
import {buildWebsiteBlueprint} from './website-business-blueprint';
import {getDb,transaction} from './db';
import type {WebsiteDocument,WebsitePhotoCredit} from './website-domain';

type Dependencies={photos?:typeof importWebsitePhotos};
/** Complete factual structure first; images enrich the structure, never replace it. */
export async function composeWebsite(user:Member|null,input:Record<string,unknown>,dependencies?:Dependencies){
 if(!user)throw new AppError('Влез в профила си.',401);rateLimit(`website-compose:${user.id}`,10,3600000);const {site,lease}=claimWebsiteGeneration(user,input.id,input.revision);
 try{
  const blueprint=buildWebsiteBlueprint(site),{design,accent,theme}=websiteDesignForBusiness(site);
  const custom=typeof input.keywords==='string'?input.keywords.trim().slice(0,150):'';
  const electronics=blueprint.kind==='retail'&&/техник|електрон|компют|electronic|computer/iu.test(site.offer+' '+site.name);
  const defaults=electronics?['computer shop','laptop computer','smartphone headphones']:blueprint.photoQueries;
  const isLegacyRaw=custom===site.offer||custom===site.document.design?.keywords&&!site.document.design?.systemId;
  const queries=[...new Set([...(custom&&!isLegacyRaw?[custom]:[]),...defaults])];design.keywords=queries[0]||design.keywords;
  let photos:WebsitePhotoCredit[]=[],warning:string|null=null;
  if(input.findPhotos!==false){try{photos=await(dependencies?.photos||importWebsitePhotos)(user,design.keywords,blueprint.kind==='retail'?5:3,queries.slice(1));if(!photos.length)warning='Не намерихме подходящи снимки. Цялата структура е запазена; избери друга тема или качи свои.';}catch{warning='Снимките не се заредиха. Цялата структура е запазена; можеш да опиташ отново.';}}
  const photosAdded=photos.length;
  const oldImages=[...new Set(site.document.sections.flatMap(section=>[...(section.image?[section.image]:[]),...(section.tiles||[]).flatMap(t=>t.image?[t.image]:[])]))];
  if(!photos.length)photos=(site.document.photoCredits||[]).filter(p=>oldImages.includes(p.assetUrl));
  const images=photos.length?photos.map(p=>p.assetUrl):oldImages;
  const sections=blueprint.sections;
  if(images[0])sections[0].image=images[0];
  const offering=sections.find(section=>section.id==='services');
  if(offering&&blueprint.categoryIdeas.length){
   delete offering.items;offering.tiles=blueprint.categoryIdeas.map((idea,index)=>({title:idea.label,body:idea.description,...(images.length?{image:images[(index+1)%images.length]}:{}),...(site.contact?{buttonLabel:blueprint.kind==='retail'?'Попитай за модел':'Уточни подробностите',buttonUrl:'#contact'}:{})}));
  }
  const about=sections.find(s=>s.type==='about');if(about&&images[1])about.image=images[1];
  if(images[2]&&sections.length<10)sections.splice(Math.min(4,sections.length-1),0,{id:'perspective',type:'gallery',title:blueprint.kind==='retail'?'Технологии в ежедневието.':'Поглед отблизо.',body:'Илюстративни снимки · източници и лицензи в края на страницата.',image:images[2]});
  const document:WebsiteDocument={title:site.name,description:site.offer.slice(0,350),accent,theme,sections,design,photoCredits:photos,businessKind:blueprint.kind,compositionVersion:2};
  const website=transaction(()=>{
   if(input.complete===true)getDb().prepare('INSERT OR IGNORE INTO website_build_backups(site_id,member_id,revision,snapshot,created_at) VALUES(?,?,?,?,?)').run(site.id,user.id,site.revision,JSON.stringify(site),new Date().toISOString());
   return saveWebsite(user,{id:site.id,revision:site.revision,document},null);
  });
  return {website,photosAdded,warning,method:'design-composition' as const,readiness:{structure:true,sections:sections.length,images:images.length,level:images.length?'complete':'needs-images'}};
 }finally{releaseWebsiteGeneration(site.id,lease);}
}

/** The browser receives only the finished document, never the intermediate stub. */
export async function createCompleteWebsite(user:Member|null,input:Record<string,unknown>,dependencies?:Dependencies&{compose?:typeof composeWebsite}){
 const site=createWebsite(user,input);
 try{return await(dependencies?.compose||composeWebsite)(user,{id:site.id,revision:site.revision,keywords:input.keywords,findPhotos:input.findPhotos},dependencies);}catch(error){rollbackNewWebsite(user,site.id);throw error;}
}
