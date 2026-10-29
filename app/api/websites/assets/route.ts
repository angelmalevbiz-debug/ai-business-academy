import {NextRequest} from 'next/server';
import {AppError,rateLimit} from '@/lib/auth';
import {uploadWebsiteAsset} from '@/lib/website-store';
import {boundedBytes,failure,json,member,origin} from '../http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{origin(request);const user=member(request);rateLimit(`website-upload:${user.id}`,40);const type=request.headers.get('content-type')||'';if(type.startsWith('multipart/form-data')){const bytes=await boundedBytes(request,6*1024*1024+20000);const form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();const file=form.get('file');if(!(file instanceof File))throw new AppError('Избери снимка.');return json({asset:await uploadWebsiteAsset(user,{name:file.name,bytes:Buffer.from(await file.arrayBuffer())})},201);}if(!/^image\/(jpeg|png|webp)(;|$)/.test(type))throw new AppError('Избери JPG, PNG или WebP.',415);let name='photo';try{name=decodeURIComponent(request.headers.get('x-file-name')||'photo');}catch{}return json({asset:await uploadWebsiteAsset(user,{name,bytes:await boundedBytes(request,6*1024*1024)})},201);}catch(error){return failure(error);}}
