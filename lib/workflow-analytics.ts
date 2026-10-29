export interface VideoObservation {title:string;views:number;likes:number|null;comments:number|null;url:string|null}
export interface VideoAnalysis {rows:number;medianViews:number;items:(VideoObservation&{relativeViews:number|null;engagementRate:number|null})[];summary:string}

function cells(line:string,separator:string){const output:string[]=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(char===separator&&!quoted){output.push(field.trim());field='';}else field+=char;}if(quoted)throw new Error('В CSV има незатворени кавички. Използвай по един ред за всяко видео.');output.push(field.trim());return output;}
const count=(value:string|undefined,label:string,optional=false)=>{if(optional&&!value?.trim())return null;const cleaned=value?.trim();if(!cleaned||!/^\d+$/.test(cleaned))throw new Error(`${label}: използвай цяло число без съкращения и разделители.`);const number=Number(cleaned);if(!Number.isSafeInteger(number)||number>1e12)throw new Error(`${label}: числото е прекалено голямо.`);return number;};

/** Calculations on explicitly supplied observations. No model, scraping or inferred performance data. */
export function analyzeVideoCsv(input:string):VideoAnalysis {
  if(input.length>100000)throw new Error('CSV е прекалено голям. Използвай до 200 видеа.');
  const lines=input.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());if(lines.length<4)throw new Error('Добави заглавен ред и поне 3 видеа за сравнение.');if(lines.length>201)throw new Error('Използвай до 200 видеа в едно сравнение.');
  const separator=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
  const aliases:Record<string,string>={title:'title','заглавие':'title',views:'views','гледания':'views',likes:'likes','харесвания':'likes',comments:'comments','коментари':'comments',url:'url','линк':'url'};
  const headings=cells(lines[0],separator).map(value=>aliases[value.toLocaleLowerCase('bg-BG')]);
  if(!headings.includes('title')||!headings.includes('views'))throw new Error('Заглавният ред трябва да съдържа title и views. Допълнително: likes, comments, url.');
  if(new Set(headings.filter(Boolean)).size!==headings.filter(Boolean).length)throw new Error('Една колона присъства повече от веднъж.');
  const read=(values:string[],name:string)=>values[headings.indexOf(name)];
  const rows=lines.slice(1).map((line,index)=>{
    const values=cells(line,separator);if(values.length!==headings.length)throw new Error(`Ред ${index+2} има различен брой колони. Постави заглавието в кавички, ако съдържа запетая.`);
    const title=read(values,'title')?.trim();if(!title||title.length>200)throw new Error(`Ред ${index+2}: заглавието трябва да е между 1 и 200 знака.`);
    const rawUrl=read(values,'url')?.trim();let url:string|null=null;if(rawUrl){try{const parsed=new URL(rawUrl);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error();url=parsed.toString();}catch{throw new Error(`Ред ${index+2}: линкът не е валиден HTTP адрес.`);}}
    return {title,views:count(read(values,'views'),`Ред ${index+2}, views`)! as number,likes:count(read(values,'likes'),`Ред ${index+2}, likes`,true),comments:count(read(values,'comments'),`Ред ${index+2}, comments`,true),url};
  });
  const sorted=rows.map(item=>item.views).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2),medianViews=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  const items=rows.map(item=>({...item,relativeViews:medianViews?item.views/medianViews:null,engagementRate:item.views&&item.likes!==null&&item.comments!==null?(item.likes+item.comments)/item.views:null})).sort((a,b)=>b.views-a.views);
  const top=items.slice(0,5);
  const summary=`ДАННИ, ПРЕДОСТАВЕНИ ОТ ПОТРЕБИТЕЛЯ (непроверен произход; няма live достъп до профили):\nИзвадка: ${rows.length} видеа. Медиана: ${medianViews} гледания. Сравнението важи само за тази извадка, без изравняване на възрастта на видеата.\n`+top.map(item=>`${item.title}: ${item.views} гледания; ${item.relativeViews===null?'няма ненулева база':`${item.relativeViews.toFixed(2)}× спрямо медианата`}; ${item.engagementRate===null?'липсват данни за ангажираност':`${(item.engagementRate*100).toFixed(2)}% (харесвания + коментари)/гледания`}${item.url?`; източник, подаден от потребителя: ${item.url}`:''}.`).join('\n')+'\nНе прави извод за причинност, бъдещ растеж или най-добър час за публикуване от тези числа.';
  return {rows:rows.length,medianViews,items,summary};
}
