import {parseDocument,DomUtils} from 'htmlparser2';
import {AppError,rateLimit} from './auth';
import type {Member} from './domain';
import type {WebsiteDocument} from './website-domain';
import {getWebsite,saveWebsite,websiteMember} from './website-store';
import {selectWebsiteDesignSystem} from './website-design-catalog';
import {applyWebsiteTheme,websiteDesignCss} from './website-design-render';
import {importWebsitePhotos} from './website-photos';
import {websiteBusinessCss} from './website-business-render';

export const WEBSITE_DESIGN_ACTIONS=['theme-dark','theme-light','contact-first','service-columns','accent-red','more-space','no-motion','design-system','photos'] as const;
type Operation=typeof WEBSITE_DESIGN_ACTIONS[number];
function visualContactFirst(document:WebsiteDocument){
 if(!document.visual)return;
 const dom=parseDocument(document.visual.html),contactId=document.sections.find(s=>s.type==='contact')?.id;
 const heroId=document.sections[0]?.id;
 const find=(id?:string)=>id?DomUtils.findOne(node=>node.attribs.id===id,dom.children,true):null;
 const hero=find(heroId),contact=find(contactId);
 if(!hero||!contact||!hero.parent||hero.parent!==contact.parent)throw new AppError('В свободния дизайн контактът не е отделна секция до началото. Премести го във визуалния редактор.',422);
 DomUtils.removeElement(contact);DomUtils.append(hero,contact);document.visual.html=DomUtils.getOuterHTML(dom);
}
function updateVisualDesign(document:WebsiteDocument){
 if(document.visual)document.visual.designCss=(websiteDesignCss(document)+(document.businessKind?websiteBusinessCss(document):'')).replace(/\bbody(?=[\s,{:.#>\[])/g,'body,.website-page');
}
/** Explicit design operations. This does not simulate a model or rewrite facts. */
export async function applyWebsiteDesignAction(userInput:Member|null,input:Record<string,unknown>,dependencies?:{photos?:typeof importWebsitePhotos}){
 const user=websiteMember(userInput);rateLimit(`website-design-action:${user.id}`,60);
 const site=getWebsite(user,input.id);if(site.revision!==input.revision)throw new AppError('Зареди последната версия на сайта.',409);
 if(!WEBSITE_DESIGN_ACTIONS.includes(input.operation as Operation))throw new AppError('Избери готова промяна или използвай свързан AI за свободно описание.',422);
 const op=input.operation as Operation,document=structuredClone(site.document),base=selectWebsiteDesignSystem(site);document.design||=base.design;
 let message='',photosAdded=0;
 if(op==='design-system'){
  if(typeof input.systemId!=='string')throw new AppError('Избери дизайн.');
  const selected=selectWebsiteDesignSystem(site,input.systemId);Object.assign(document,{design:{...selected.design,keywords:document.design.keywords},accent:selected.accent,theme:selected.theme});message='Новият дизайн е приложен. Текстовете и снимките са запазени.';
 }else if(op==='theme-dark'||op==='theme-light'){
  Object.assign(document,applyWebsiteTheme(document,op==='theme-dark'?'dark':'light'));message=op==='theme-dark'?'Приложена е тъмна визия.':'Приложена е светла визия.';
 }else if(op==='contact-first'){
  const index=document.sections.findIndex(s=>s.type==='contact');if(index<0)throw new AppError('Добави контактна секция, за да я преместиш.',422);
  visualContactFirst(document);const [contact]=document.sections.splice(index,1);document.sections.splice(1,0,contact);message='Контактът е непосредствено след началото.';
 }else if(op==='service-columns'){
  document.design.serviceColumns=2;message='Предложенията са в две колони на компютър и една на телефон.';
 }else if(op==='accent-red'){
  document.accent=document.theme==='dark'?'#ffb3a4':'#b83927';message='Приложен е червен акцент с четим текст.';
 }else if(op==='more-space'){
  document.design.density='airy';message='Добавено е повече пространство между секциите.';
 }else if(op==='no-motion'){
  document.design.motion='none';message='Анимациите са изключени.';
 }else if(op==='photos'){
  const keywords=typeof input.keywords==='string'?input.keywords.trim():document.design.keywords;if(keywords.length<2||keywords.length>150)throw new AppError('Добави от 2 до 150 знака за търсенето на снимки.');
  const photos=await(dependencies?.photos||importWebsitePhotos)(user,keywords,3);if(!photos.length)throw new AppError('Няма подходящи снимки с проверим лиценз. Пробвай други ключови думи; старите снимки са запазени.',422);
  const replacements=new Map<string,string>();let index=0;
  for(const section of document.sections){if(index>=photos.length)break;if(section.image||['hero','about','gallery'].includes(section.type)){if(section.image)replacements.set(section.image,photos[index].assetUrl);section.image=photos[index++].assetUrl;}}
  if(index<photos.length&&document.sections.length<10&&!document.visual)document.sections.push({id:`photos-${site.revision}`,type:'gallery',title:'В детайл',body:'Илюстративни снимки с посочен източник.',image:photos[index++].assetUrl});
  if(document.visual){
   const dom=parseDocument(document.visual.html);let visible=0;
   for(const section of document.sections.filter(s=>s.image)){
    const element=DomUtils.findOne(node=>node.attribs.id===section.id,dom.children,true);if(!element)continue;
    const image=DomUtils.findOne(node=>node.name==='img',element.children,true);
    if(image)image.attribs.src=section.image!;else DomUtils.appendChild(element,parseDocument(`<figure><img src="${section.image}" alt="Илюстративна снимка" width="1200" height="900" loading="lazy"/></figure>`).children[0]);visible++;
   }
   if(!visible)throw new AppError('Свободният дизайн няма разпознаваеми секции за снимки. Добави ги през визуалния редактор; сайтът не е променен.',422);
   for(const [old,next] of replacements){document.visual.css=document.visual.css.split(old).join(next);if(document.visual.designCss)document.visual.designCss=document.visual.designCss.split(old).join(next);}
   document.visual.html=DomUtils.getOuterHTML(dom);
  }
  document.design.keywords=keywords;const used=new Set(document.sections.flatMap(s=>s.image?[s.image]:[])),old=document.photoCredits||[];document.photoCredits=[...old.filter(c=>!replacements.has(c.assetUrl)),...photos.filter(p=>used.has(p.assetUrl))].slice(-20);photosAdded=photos.filter(p=>used.has(p.assetUrl)).length;message=`Добавени са ${photosAdded} илюстративни снимки с посочен източник.`;
 }
 // Do not append endless CSS copies; a separate bounded override is replaced.
 if(op!=='photos'&&op!=='contact-first')updateVisualDesign(document);
 const website=saveWebsite(user,{id:site.id,revision:site.revision,document});
 return {website,message,photosAdded,method:'built-in-designer' as const};
}
