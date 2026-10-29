import {isIP} from 'node:net';
import {AppError} from './auth';
import type {WorkflowCapability} from './workflow-domain';

const loopback=new Set(['localhost','127.0.0.1','[::1]']);
function privateAddress(hostname:string){
 const host=hostname.replace(/^\[|\]$/g,'');
 if(isIP(host)===4){const p=host.split('.').map(Number);return p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31;}
 return isIP(host)===6&&/^(?:fc|fd|fe[89ab])/i.test(host);
}

/** Operator-only configuration. No route accepts a model URL from a member. */
export function websiteModelTarget(){
 const explicit=process.env.WEBSITE_OLLAMA_ORIGIN?.trim(),raw=explicit||process.env.WORKFLOW_OLLAMA_ORIGIN||'http://127.0.0.1:11434';
 let url:URL;try{url=new URL(raw);}catch{throw new AppError('Адресът на AI сървъра не е валиден. Провери сървърната настройка.',503);}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol))throw new AppError('AI сървърът изисква origin без парола, път или параметри.',503);
 const local=loopback.has(url.hostname);
 // Workflow settings keep their historic loopback boundary. Only a separately
 // configured website endpoint can route to another self-hosted machine.
 if(!explicit&&!local)throw new AppError('За отдалечен AI настрой отделен WEBSITE_OLLAMA_ORIGIN.',503);
 if(!local&&url.protocol!=='https:'&&!(process.env.WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP==='true'&&privateAddress(url.hostname)))throw new AppError('Отдалеченият AI изисква HTTPS или изрично разрешена частна HTTP мрежа.',503);
 const token=process.env.WEBSITE_OLLAMA_TOKEN?.trim();
 if(token&&!/^[\x21-\x7e]{1,4096}$/.test(token))throw new AppError('Токенът за AI сървъра не е валиден.',503);
 const headers:Record<string,string>=token?{Authorization:`Bearer ${token}`} : {};
 return {origin:url.origin,execution:local?'local' as const:'remote' as const,headers};
}

async function boundedJson(response:Response,max:number){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new AppError('AI сървърът върна прекалено голям отговор.',502);}
 const reader=response.body?.getReader();if(!reader)throw new AppError('AI сървърът върна празен отговор.',502);
 let total=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new AppError('AI сървърът върна прекалено голям отговор.',502);}chunks.push(value);}}finally{reader.releaseLock();}
 let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('AI сървърът върна нечетим отговор.',502);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('AI сървърът върна невалиден отговор.',502);
 return value as Record<string,unknown>;
}

/** Fixed Ollama API paths only; credentials and raw network errors stay private. */
export async function websiteModelJson(path:'/api/tags'|'/api/show'|'/api/generate',body?:unknown,options?:{timeout?:number;maxBytes?:number}){
 const target=websiteModelTarget();let response:Response;
 try{response=await fetch(target.origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...target.headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(options?.timeout||5000),redirect:'error',cache:'no-store'});}catch{throw new AppError('AI сървърът не отговори. Дизайнът и визуалното редактиране остават достъпни.',503);}
 if(!response.ok){await response.body?.cancel();throw new AppError(response.status===401||response.status===403?'AI сървърът отказа достъп. Провери сървърния токен.':response.status===429?'AI сървърът достигна лимита си. Опитай отново след малко.':'AI сървърът не завърши заявката. Провери модела и връзката.',503);}
 return boundedJson(response,options?.maxBytes||2_000_000);
}

export function websiteModelHasLocalWeights(info:Record<string,unknown>){const details=info.details&&typeof info.details==='object'?info.details as Record<string,unknown>:{};return details.format==='gguf'&&!!info.model_info&&!info.remote_host&&!info.remote_model;}

/** Same generator contract as Workflow, with a separate self-hosted-only transport. */
export async function generateWebsiteModelJson(capability:WorkflowCapability,prompt:{system:string;user:string},schema:Record<string,unknown>,options?:{maxOutputTokens?:number}):Promise<Record<string,unknown>>{
 if(capability.provider!=='ollama')throw new AppError('Модулът за сайтове не разрешава платени AI доставчици.',503);
 if(!capability.configured||!capability.model)throw new AppError('Няма свързан AI модел. Дизайнът и визуалното редактиране остават достъпни.',503);
 if(process.env.WEBSITE_AI_PROVIDER&&process.env.WEBSITE_AI_PROVIDER!=='ollama')throw new AppError('AI моделът е изключен в сървърната настройка.',503);
 const info=await websiteModelJson('/api/show',{model:capability.model},{timeout:10000});
 if(!websiteModelHasLocalWeights(info))throw new AppError('Моделът няма потвърдени собствени тегла. Облачно препращане през Ollama не е разрешено.',503);
 const budget=Math.max(300,Math.min(6500,Math.floor(options?.maxOutputTokens||3000))),timeout=budget>3000?90000:65000;
 const payload=await websiteModelJson('/api/generate',{model:capability.model,system:prompt.system+' /no_think',prompt:prompt.user+' /no_think',stream:false,think:false,keep_alive:'2m',format:schema,options:{num_predict:budget,num_ctx:budget>3000?16384:8192,temperature:0.2}},{timeout,maxBytes:1_000_000});
 if(payload.done!==true||payload.done_reason==='length'||payload.done_reason==='error'||typeof payload.response!=='string')throw new AppError('AI моделът не върна завършен резултат.',502);
 let parsed:unknown;try{parsed=JSON.parse(payload.response);}catch{throw new AppError('AI моделът върна невалидна чернова. Опитай отново.',502);}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new AppError('AI моделът върна невалидна структура.',502);
 return parsed as Record<string,unknown>;
}
