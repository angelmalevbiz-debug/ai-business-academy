import {AppError,rateLimit,textField} from './auth';
import type {Member} from './domain';
import type {WorkflowCapability} from './workflow-domain';
import {generateWebsiteModelJson,websiteModelHasLocalWeights,websiteModelJson,websiteModelTarget} from './website-model-transport';
import {claimWebsiteGeneration,releaseWebsiteGeneration,saveWebsite,websiteMember} from './website-store';
import {renderWebsiteHtml} from './website-render';
import {sanitizeWebsiteVisual,websiteVisualAssets} from './website-visual';
import {buildOpenUILocalPrompt} from './vendor/openui-local/prompt';

export interface WebsiteLocalCapability extends WorkflowCapability{provider:'ollama';mode:'local-only'|'self-hosted';execution:'local'|'remote';apiBilling:false;availableModels:string[]}
export type LocalWebsiteGenerator=typeof generateWebsiteModelJson;
const defaults={provider:'ollama' as const,mode:'local-only' as const,execution:'local' as const,apiBilling:false as const,publishing:false as const,editing:false as const,networkChecked:true};
let cached:{signature:string;at:number;value:WebsiteLocalCapability}|null=null;

/** This capability never reads an API key and never probes a paid provider. */
export async function getWebsiteLocalCapability(refresh=false):Promise<WebsiteLocalCapability>{
 const signature=JSON.stringify([process.env.WEBSITE_AI_PROVIDER,process.env.WEBSITE_AI_MODEL,process.env.WORKFLOW_AI_COPY_MODEL,process.env.WORKFLOW_AI_PROVIDER,process.env.WORKFLOW_AI_MODEL,process.env.WORKFLOW_OLLAMA_ORIGIN,process.env.WEBSITE_OLLAMA_ORIGIN,process.env.WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP,process.env.WEBSITE_OLLAMA_TOKEN]);
 if(!refresh&&cached?.signature===signature&&Date.now()-cached.at<15000)return cached.value;
 let result:WebsiteLocalCapability,connection:{mode:'local-only'|'self-hosted';execution:'local'|'remote'}={mode:'local-only',execution:'local'};
 try{
  if(process.env.WEBSITE_AI_PROVIDER&&process.env.WEBSITE_AI_PROVIDER!=='ollama')throw new AppError(process.env.WEBSITE_AI_PROVIDER==='none'?'AI за сайта не е достъпен. Локалният модел е изключен в настройката.':'Модулът за сайтове разрешава само локален Ollama модел, без платени API.',503);
  const target=websiteModelTarget();connection={mode:target.execution==='remote'?'self-hosted':'local-only',execution:target.execution};
  const tags=await websiteModelJson('/api/tags'),availableModels=Array.isArray(tags.models)?tags.models.map(row=>row&&typeof row==='object'?(row as Record<string,unknown>).name:null).filter((name):name is string=>typeof name==='string'&&name.length<=180).slice(0,100):[];
  const requested=process.env.WEBSITE_AI_MODEL?.trim()||process.env.WORKFLOW_AI_COPY_MODEL?.trim()||(process.env.WORKFLOW_AI_PROVIDER==='ollama'?process.env.WORKFLOW_AI_MODEL?.trim():undefined);
  const model=requested||availableModels.find(name=>!name.endsWith(':cloud'))||null;
  if(!model||!availableModels.includes(model))result={...defaults,...connection,model,configured:false,status:'needs_setup',availableModels,message:'Добави локален модел в Ollama или избери наличен WEBSITE_AI_MODEL. Няма платен API резервен маршрут.'};
  else{
   const info=await websiteModelJson('/api/show',{model});
   const local=websiteModelHasLocalWeights(info);
   result={...defaults,...connection,model,configured:local,status:local?'ready':'unavailable',availableModels,message:local?(target.execution==='remote'?'Свързан собствен AI сървър. Без платени моделни API заявки.':'Свързан AI на тази машина. Без платени API заявки.'):'Избраният модел няма потвърдени локални тегла. Облачно изпълнение не е разрешено.'};
  }
 }catch(error){result={...defaults,...connection,model:process.env.WEBSITE_AI_MODEL?.trim()||null,configured:false,status:'unavailable',availableModels:[],message:error instanceof AppError?error.message:'AI сървърът не е достъпен. Създаването на дизайн и визуалният редактор работят самостоятелно.'};}
 cached={signature,at:Date.now(),value:result};return result;
}
export function requireLocalWebsiteCapability(capability:WorkflowCapability):WorkflowCapability&{provider:'ollama';model:string;configured:true}{if(capability.provider!=='ollama')throw new AppError('Модулът за сайтове използва само локален AI. Платени API заявки не са разрешени.',503);if(!capability.configured||!capability.model)throw new AppError(capability.message||'Локалният AI не е достъпен.',503);return capability as WorkflowCapability&{provider:'ollama';model:string;configured:true};}

export async function refineWebsite(userInput:Member|null,data:Record<string,unknown>,dependencies?:{capability?:WorkflowCapability;generate?:LocalWebsiteGenerator}){
 const user=websiteMember(userInput),instruction=textField(data.instruction,'Какво да променим',5,2000);rateLimit(`website-refine:${user.id}`,10,3600000);
 const {site,lease}=claimWebsiteGeneration(user,data.id,data.revision);
 try{
  const capability=requireLocalWebsiteCapability(dependencies?.capability||await getWebsiteLocalCapability());
  const fullHtml=renderWebsiteHtml(site),html=site.document.visual?.html||fullHtml.match(/<body>([\s\S]*)<\/body>/i)?.[1]?.replace(/<aside class="photo-credits"[\s\S]*?<\/aside>/g,'')||'',css=site.document.visual?.css||fullHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1]||'';
  if(html.length+css.length>32000)throw new AppError('Този сайт е прекалено голям за локалния AI контекст. Продължи във визуалния редактор.',413);
  const assets=new Set([...site.document.sections.flatMap(section=>[...(section.image?[section.image]:[]),...(section.tiles||[]).flatMap(tile=>tile.image?[tile.image]:[])]),...(site.document.visual?websiteVisualAssets(site.document.visual):[])]);
  const prompt=buildOpenUILocalPrompt({html,css,instruction,facts:{name:site.name,offer:site.offer,audience:site.audience,contact:site.contact,businessDetails:site.businessDetails,allowedImages:[...assets]}});
  const schema={type:'object',additionalProperties:false,required:['html','css'],properties:{html:{type:'string'},css:{type:'string'}}};
  const generate=dependencies?.generate||generateWebsiteModelJson;
  const validate=(raw:Record<string,unknown>)=>{try{const visual=sanitizeWebsiteVisual(raw);for(const image of websiteVisualAssets(visual))if(!assets.has(image))throw new AppError('AI добави непредоставена снимка. Използвай само снимките в текущия сайт.',502);return visual;}catch(error){if(error instanceof AppError)throw new AppError(error.message,error.status===413?413:502);throw error;}};
  let raw=await generate(capability,prompt,schema,{maxOutputTokens:6000}),visual;
  try{visual=validate(raw);}catch(error){if(!(error instanceof AppError)||error.status!==502)throw error;raw=await generate(capability,{system:prompt.system+' Поправи само посочения проблем. Върни пълен JSON {html,css} без скриптове и външни ресурси.',user:JSON.stringify({originalInput:prompt.user,previousOutput:raw,validationError:error.message})},schema,{maxOutputTokens:6000});visual=validate(raw);}
  return saveWebsite(user,{id:site.id,revision:site.revision,document:{...site.document,visual}},{provider:'ollama',model:capability.model,at:new Date().toISOString()});
 }finally{releaseWebsiteGeneration(site.id,lease);}
}
