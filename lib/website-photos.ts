import {AppError,rateLimit,textField} from './auth';
import type {Member} from './domain';
import type {WebsitePhotoCredit} from './website-domain';
import {uploadWebsiteAsset,websiteMember} from './website-store';

type Photo={id:number;title:string;author:string;sourceUrl:string;license:string;licenseUrl:string;url:string};
const headers={'User-Agent':'AIBusinessAcademy/1.0 (licensed business website illustrations; https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)'};
async function bounded(response:Response,max:number){if(!response.ok){await response.body?.cancel();throw new AppError('Библиотеката със снимки не отговори. Опитай отново.',502);}if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new AppError('Снимката е прекалено голяма.',413);}const reader=response.body?.getReader();if(!reader)throw new AppError('Празна снимка.',502);const chunks:Uint8Array[]=[];let total=0;try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new AppError('Снимката е прекалено голяма.',413);}chunks.push(value);}}finally{reader.releaseLock();}return Buffer.concat(chunks);}
const plain=(value:unknown,max=250)=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/&(?:quot|amp|lt|gt|#\d+);/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
function photo(row:Record<string,unknown>):Photo|null{
 const infos=row.imageinfo;if(!Array.isArray(infos)||!infos[0]||typeof infos[0]!=='object')return null;const i=infos[0] as Record<string,unknown>,m=i.extmetadata as Record<string,{value?:unknown}>|undefined;
 const license=plain(m?.LicenseShortName?.value,100),author=plain(m?.Artist?.value,300)||plain(m?.Credit?.value,300)||'Авторът е посочен в източника';
 if(!/^(?:CC BY(?:-SA)? [1-4]\.0|CC0|Public domain)$/i.test(license)||plain(m?.Restrictions?.value)||Number(i.width)<700||Number(i.height)<500||!['image/jpeg','image/png','image/webp'].includes(String(i.mime)))return null;
 const rawUrl=String(i.thumburl||i.url||'');let url:URL;try{url=new URL(rawUrl);}catch{return null;}if(url.protocol!=='https:'||url.username||url.password||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)||!url.pathname.startsWith('/wikipedia/commons/'))return null;url.search='';
 const id=Number(row.pageid);if(!Number.isSafeInteger(id)||id<1)return null;
 const licenseUrl=license==='Public domain'?'https://creativecommons.org/publicdomain/mark/1.0/':license==='CC0'?'https://creativecommons.org/publicdomain/zero/1.0/':String(m?.LicenseUrl?.value||'');
 try{const u=new URL(licenseUrl);if(u.protocol!=='https:'||u.hostname!=='creativecommons.org')return null;}catch{return null;}
 return {id,title:plain(row.title,250).replace(/^File:/,''),author,sourceUrl:`https://commons.wikimedia.org/?curid=${id}`,license,licenseUrl,url:url.href};
}
export async function findWebsitePhotos(queryInput:unknown):Promise<Photo[]>{
 const query=textField(queryInput,'Ключови думи',2,150).replace(/[|{}<>\[\]]/g,' '),url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:`${query} filetype:bitmap -diagram -logo -map`,gsrnamespace:'6',gsrlimit:'14',prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'1400',format:'json',formatversion:'2'}).toString();
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});const data=JSON.parse((await bounded(response,1200000)).toString()) as {query?:{pages?:Record<string,unknown>[]}};
 // The generator returns pages by ID, not by search relevance. Preserve its
 // explicit search index so old, low-ranked files do not win accidentally.
 return (data.query?.pages||[]).sort((a,b)=>Number(a.index||999)-Number(b.index||999)).map(photo).filter((item):item is Photo=>!!item).slice(0,8);
}
export async function importWebsitePhotos(userInput:Member|null,query:string,limit=3,fallbackQueries:string[]=[]):Promise<WebsitePhotoCredit[]>{
 const user=websiteMember(userInput);rateLimit(`website-photo-search:${user.id}`,12,3600000);if(process.env.WEBSITE_IMAGE_SEARCH==='none')throw new AppError('Търсенето на снимки е изключено в тази среда.',503);
 const credits:WebsitePhotoCredit[]=[],seen=new Set<number>(),queries=[...new Set([query,...fallbackQueries])].slice(0,3);limit=Math.max(1,Math.min(6,limit));
 for(const search of queries){if(credits.length>=limit)break;let candidates:Photo[];try{candidates=await findWebsitePhotos(search);}catch{continue;}
 for(const candidate of candidates.slice(0,Math.min(8,limit+2))){if(credits.length>=limit)break;if(seen.has(candidate.id))continue;seen.add(candidate.id);try{const response=await fetch(candidate.url,{headers,signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});if(!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();continue;}const asset=await uploadWebsiteAsset(user,{name:candidate.title,bytes:await bounded(response,6*1024*1024)});const {url:sourceImageUrl,id:pageId,...metadata}=candidate;void sourceImageUrl;void pageId;credits.push({assetUrl:asset.url,...metadata});}catch{/* Try the next licensed result, never an unverified fallback host. */}}
 }
 return credits;
}
