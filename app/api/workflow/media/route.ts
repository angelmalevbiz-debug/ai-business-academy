import {NextRequest,NextResponse} from 'next/server';
import {AppError,SESSION_COOKIE,rateLimit,sessionMember} from '@/lib/auth';
import {assertMediaOrigin} from '@/lib/workflow-media-http';
import {changeWorkflowMediaJob,createWorkflowMediaJob,getWorkflowMediaState,uploadWorkflowVideo} from '@/lib/workflow-media';
import {workflowMember} from '@/lib/workflow-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const failure=(error:unknown)=>NextResponse.json({error:error instanceof AppError?error.message:'Видео действието не завърши. Опитай отново.'},{status:error instanceof AppError?error.status:500,headers});
export async function GET(request:NextRequest){try{return NextResponse.json(await getWorkflowMediaState(sessionMember(request.cookies.get(SESSION_COOKIE)?.value)),{headers});}catch(error){return failure(error);}}
export async function PUT(request:NextRequest){try{
  assertMediaOrigin(request);const user=workflowMember(sessionMember(request.cookies.get(SESSION_COOKIE)?.value));
  const capability=(await getWorkflowMediaState(user)).capability;if(!capability.upload)throw new AppError(capability.message,503);
  let name:string;try{name=decodeURIComponent(request.headers.get('x-file-name')||'video.mp4');}catch{throw new AppError('Името на файла не се разчита.');}
  await uploadWorkflowVideo(user,{name,type:(request.headers.get('content-type')||'').split(';')[0],length:request.headers.has('content-length')?Number(request.headers.get('content-length')):null,body:request.body,signal:request.signal});
  return NextResponse.json(await getWorkflowMediaState(user),{headers});
}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{
  assertMediaOrigin(request);const user=workflowMember(sessionMember(request.cookies.get(SESSION_COOKIE)?.value));rateLimit(`media-write:${user.id}`,60);
  if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length'))>8000)throw new AppError('Невалидна видео заявка.',413);
  const reader=request.body?.getReader();if(!reader)throw new AppError('Липсват настройки.');const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8000){await reader.cancel();throw new AppError('Настройките са прекалено големи.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  let data:Record<string,unknown>;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();}catch{throw new AppError('Настройките не се разчитат.');}
  if(data.action==='render'){const capability=(await getWorkflowMediaState(user)).capability;if(!capability.render)throw new AppError(capability.message,503);createWorkflowMediaJob(user,data);}
  else if(data.action==='cancel'||data.action==='retry')changeWorkflowMediaJob(user,data,data.action);
  else throw new AppError('Избери обработка, повторение или спиране.');
  return NextResponse.json(await getWorkflowMediaState(user),{headers});
}catch(error){return failure(error);}}
