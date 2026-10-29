import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {NextRequest,NextResponse} from 'next/server';
import {AppError,SESSION_COOKIE,sessionMember} from '@/lib/auth';
import {workflowMediaFile} from '@/lib/workflow-media';
import {parseMediaRange} from '@/lib/workflow-media-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function serve(request:NextRequest,context:{params:Promise<{id:string}>},head:boolean){
  let size=0;try{
    const {id}=await context.params,file=await workflowMediaFile(sessionMember(request.cookies.get(SESSION_COOKIE)?.value),id,request.nextUrl.searchParams.get('kind')||'source');size=file.size;
    const range=parseMediaRange(request.headers.get('range'),size),start=range?.start||0,end=range?.end??size-1;
    const headers:Record<string,string>={'Content-Type':file.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; media-src 'self'; sandbox"};
    if(range)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    if(request.nextUrl.searchParams.get('download')==='1')headers['Content-Disposition']=`attachment; filename="academy-video.${file.mime==='video/webm'?'webm':'mp4'}"; filename*=UTF-8''${encodeURIComponent(file.name)}`;
    return new Response(head?null:Readable.toWeb(createReadStream(file.path,{start,end})) as ReadableStream<Uint8Array>,{status:range?206:200,headers});
  }catch(error){const status=error instanceof AppError?error.status:500;return NextResponse.json({error:error instanceof AppError?error.message:'Файлът не се отвори.'},{status,headers:{'Cache-Control':'private, no-store',...(status===416?{'Content-Range':`bytes */${size}`}:{})}});}
}
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){return serve(request,context,false);}
export async function HEAD(request:NextRequest,context:{params:Promise<{id:string}>}){return serve(request,context,true);}
