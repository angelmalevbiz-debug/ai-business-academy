import {NextRequest} from 'next/server';
import {exportWebsiteHtml} from '@/lib/website-store';
import {failure,member,privateHeaders} from '../../http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){try{const user=member(request),{id}=await context.params;return new Response(exportWebsiteHtml(user,id),{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="website.html"','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"}});}catch(error){return failure(error);}}
