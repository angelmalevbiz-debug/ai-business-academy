import sanitizeHtml from 'sanitize-html';
import postcss from 'postcss';
import {AppError} from './auth';
import type {WebsiteVisualDocument} from './website-domain';

const ASSET=/^\/api\/websites\/assets\/[a-f0-9-]{36}$/;
const ASSET_SEARCH=/\/api\/websites\/assets\/[a-f0-9-]{36}/g;
const MAX_HTML=64000,MAX_CSS=48000;
const text=(value:unknown,name:string,max:number)=>{if(typeof value!=='string'||value.length>max)throw new AppError(`${name}: съдържанието е прекалено голямо или не се разчита.`,413);return value;};

/** CSS is parsed, bounded and cannot fetch anything except an owned uploaded image. */
export function sanitizeWebsiteCss(value:unknown,inline=false):string{
 const css=text(value,'Стилове',MAX_CSS).replace(/\/\*[\s\S]*?\*\//g,'');
 // Escaped identifiers/comments can disguise URL or legacy executable functions.
 // The supported visual controls emit ordinary CSS and never need these escapes.
 if(/[\\<\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(css))throw new AppError('Стиловете съдържат неподдържан escape или HTML код.');
 let root:postcss.Root;try{root=postcss.parse(inline?`x{${css}}`:css);}catch{throw new AppError('Стиловете не се разчитат. Провери последната промяна.');}
 let nodes=0;root.walk(node=>{nodes++;if(nodes>3000)throw new AppError('Стиловете са прекалено сложни.',413);if(node.type==='comment')node.remove();});
 const clean=root.toString();
 if(/(?:expression|javascript|vbscript)\s*[:(]|(?:^|[;{])\s*(?:-moz-binding|behavior)\s*:|(?:image-set|-webkit-image-set|image|cross-fade|-webkit-cross-fade|paint|element|src)\s*\(/iu.test(clean))throw new AppError('Не се поддържат изпълним код или външни ресурси в стиловете.');
 root.walkAtRules(rule=>{if(inline||!['media','supports','container','layer','keyframes','-webkit-keyframes'].includes(rule.name.toLowerCase()))throw new AppError('Не се поддържат външни стилове, шрифтове или import правила.');});
 const urlPattern=/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/giu;
 const withoutUrls=clean.replace(urlPattern,(_all,a:string|undefined,b:string|undefined,c:string|undefined)=>{const url=(a??b??c??'').trim();if(!ASSET.test(url))throw new AppError('За фонове използвай само качени снимки от своя профил.');return '';});
 if(/url\s*\(/iu.test(withoutUrls))throw new AppError('Адресът на снимката в стиловете не се разчита.');
 if(inline){const first=root.first;if(!first||first.type!=='rule'||root.nodes.length!==1)throw new AppError('Невалиден стил на елемент.');return first.nodes?.map(node=>node.toString()).join(';')||'';}
 return clean;
}

/** Only inert page markup is persisted; never a GrapesJS script/project object. */
export function sanitizeWebsiteVisual(value:unknown):WebsiteVisualDocument{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Визуалният сайт не се разчита.');
 const input=value as Record<string,unknown>,html=text(input.html,'HTML',MAX_HTML),css=sanitizeWebsiteCss(input.css);
 let tags=0;
 const cleaned=sanitizeHtml(html,{
  allowedTags:['details','summary','main','section','div','header','footer','nav','article','aside','address','figure','figcaption','h1','h2','h3','h4','h5','h6','p','br','hr','strong','em','b','i','u','s','small','span','ul','ol','li','dl','dt','dd','blockquote','pre','code','table','thead','tbody','tfoot','tr','th','td','caption','a','img','svg','path','circle','rect','line','polyline','polygon','ellipse','g','title'],
  allowedAttributes:{'*':['id','class','title','role','aria-*','style','data-section-id'],a:['href','target','rel'],img:['src','alt','width','height','loading'],svg:['viewBox','width','height','fill','stroke','xmlns'],path:['d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','transform'],circle:['cx','cy','r','fill','stroke','stroke-width'],rect:['x','y','width','height','rx','ry','fill','stroke','stroke-width'],line:['x1','y1','x2','y2','stroke','stroke-width'],polyline:['points','fill','stroke','stroke-width'],polygon:['points','fill','stroke','stroke-width'],ellipse:['cx','cy','rx','ry','fill','stroke','stroke-width'],g:['transform','fill','stroke','stroke-width'],th:['scope','colspan','rowspan'],td:['colspan','rowspan']},
  allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,parseStyleAttributes:false,
  parser:{lowerCaseAttributeNames:false},
  transformTags:{'*':(tagName,attributes)=>{tags++;if(tags>1800)throw new AppError('Страницата има прекалено много елементи.',413);const attrs={...attributes};for(const key of Object.keys(attrs)){if(attrs[key].length>4000)throw new AppError('Атрибутът на елемента е прекалено голям.',413);}if(attrs.style)attrs.style=sanitizeWebsiteCss(attrs.style,true);if(tagName==='img'&&attrs.src&&!ASSET.test(attrs.src))throw new AppError('Използвай само качени снимки от своя профил.');if(tagName==='a'){if(attrs.href){const href=attrs.href;if(href.startsWith('#')){if(!/^#[a-zA-Z0-9_-]+$/.test(href))delete attrs.href;}else{try{const url=new URL(href);if(!['http:','https:','mailto:','tel:'].includes(url.protocol)||url.username||url.password)delete attrs.href;}catch{delete attrs.href;}}}if(attrs.target==='_blank')attrs.rel='noopener noreferrer';else delete attrs.target;}return {tagName,attribs:attrs};}},
 });
 if(!cleaned.trim()||!/<(?:h1|h2|p|section|main|div)(?:\s|>)/iu.test(cleaned))throw new AppError('Добави съдържание на страницата, преди да я запазиш.');
 const designCss=input.designCss===undefined?undefined:sanitizeWebsiteCss(input.designCss);
 if(css.length+(designCss?.length||0)>MAX_CSS)throw new AppError('Стиловете на страницата са прекалено големи.',413);
 return {html:cleaned,css,...(designCss?{designCss}:{})};
}

export function websiteVisualAssets(visual:WebsiteVisualDocument):string[]{return [...new Set((visual.html+'\n'+visual.css+'\n'+(visual.designCss||'')).match(ASSET_SEARCH)||[])];}
