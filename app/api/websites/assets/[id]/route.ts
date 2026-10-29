import {NextRequest} from 'next/server';
import {readWebsiteAsset} from '@/lib/website-store';
import {failure,member,privateHeaders} from '../../http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const user=member(request),{id}=await context.params,asset=readWebsiteAsset(user,id);return new Response(new Uint8Array(asset.bytes),{headers:{...privateHeaders,'Content-Type':asset.mime,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(error){return failure(error);}}
