import { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionMember } from '@/lib/auth';
import { createSiteDeployment, listSiteDeployments } from '@/lib/site-deployment';
import { siteBody, siteError, siteJson } from '@/lib/site-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { return siteJson({ deployments: await listSiteDeployments(sessionMember(request.cookies.get(SESSION_COOKIE)?.value), request.nextUrl.searchParams.get('siteId')) }); }
  catch (error) { return siteError(error); }
}
export async function POST(request: NextRequest) {
  try { const input = await siteBody(request); return siteJson({ deployment: await createSiteDeployment(sessionMember(request.cookies.get(SESSION_COOKIE)?.value), input) }); }
  catch (error) { return siteError(error); }
}
