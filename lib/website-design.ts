import {AppError,textField} from './auth';
import type {Website,WebsiteDesign,WebsitePhotoCredit} from './website-domain';

import {selectWebsiteDesignSystem} from './website-design-catalog';
export function websiteDesignForBusiness(site:Pick<Website,'name'|'offer'|'style'>):{design:WebsiteDesign;accent:string;theme:'dark'|'light'}{return selectWebsiteDesignSystem(site);}
export function validateWebsiteDesign(value:unknown):WebsiteDesign|undefined{
 if(value==null)return undefined;if(typeof value!=='object'||Array.isArray(value))throw new AppError('Дизайн системата не се разчита.');const d=value as Record<string,unknown>;
 if(!['split','immersive','editorial'].includes(String(d.layout))||!['modern','editorial','geometric'].includes(String(d.font))||!['subtle','none'].includes(String(d.motion))||!Number.isInteger(d.radius)||Number(d.radius)<0||Number(d.radius)>80)throw new AppError('Избери валидна композиция на сайта.');
 for(const key of ['background','ink','surface'])if(typeof d[key]!=='string'||!/^#[a-fA-F0-9]{6}$/.test(String(d[key])))throw new AppError('Дизайнът изисква валидни цветове.');
 const metadata:Partial<WebsiteDesign>={};
 for(const [key,allowed] of Object.entries({sectionStyle:['cards','rows','bands','editorial'],imageTreatment:['rounded','arch','framed','wide'],density:['airy','balanced','compact'],buttonStyle:['pill','soft','square']})){if(d[key]!==undefined){if(!allowed.includes(String(d[key])))throw new AppError('Невалидна настройка на дизайна.');Object.assign(metadata,{[key]:d[key]});}}
 if(d.systemId!==undefined){metadata.systemId=textField(d.systemId,'Дизайн',1,100);if(!/^[a-z0-9-]+:[a-z0-9-]+$/.test(metadata.systemId))throw new AppError('Невалиден дизайн.');}
 if(d.systemName!==undefined)metadata.systemName=textField(d.systemName,'Име на дизайна',1,160);
 if(d.serviceColumns!==undefined){if(![1,2,3].includes(Number(d.serviceColumns)))throw new AppError('Избери от една до три колони.');metadata.serviceColumns=Number(d.serviceColumns) as 1|2|3;}
 return {...metadata,layout:d.layout as WebsiteDesign['layout'],font:d.font as WebsiteDesign['font'],motion:d.motion as WebsiteDesign['motion'],radius:Number(d.radius),background:String(d.background),ink:String(d.ink),surface:String(d.surface),keywords:textField(d.keywords,'Ключови думи',0,150)};
}
export function validateWebsitePhotoCredits(value:unknown):WebsitePhotoCredit[]|undefined{
 if(value==null)return undefined;if(!Array.isArray(value)||value.length>20)throw new AppError('Невалидни източници на снимки.');return value.map(raw=>{if(!raw||typeof raw!=='object')throw new AppError('Невалиден източник на снимка.');const c=raw as Record<string,unknown>;if(typeof c.assetUrl!=='string'||!/^\/api\/websites\/assets\/[a-f0-9-]{36}$/.test(c.assetUrl))throw new AppError('Невалидна снимка.');for(const key of ['sourceUrl','licenseUrl']){let u:URL;try{u=new URL(String(c[key]));}catch{throw new AppError('Невалиден източник на снимка.');}if(u.protocol!=='https:'||!['commons.wikimedia.org','creativecommons.org'].includes(u.hostname)||u.username||u.password)throw new AppError('Невалиден източник на снимка.');}return {assetUrl:c.assetUrl,title:textField(c.title,'Име на снимката',1,250),author:textField(c.author,'Автор',1,300),sourceUrl:String(c.sourceUrl),license:textField(c.license,'Лиценз',1,100),licenseUrl:String(c.licenseUrl)};});
}
