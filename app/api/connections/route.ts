import { NextRequest } from 'next/server';
import { AppError, SESSION_COOKIE, sessionMember } from '@/lib/auth';
import { beginSiteOAuth, connectionSummary, disconnectSiteProvider, OAUTH_COOKIE, type SiteProvider } from '@/lib/site-connections';
import { siteBody, siteError, siteJson, siteOrigin } from '@/lib/site-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  try { const token = request.cookies.get(SESSION_COOKIE)?.value; return siteJson(connectionSummary(sessionMember(token), token)); }
  catch (error) { return siteError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const data = await siteBody(request);
    const user = sessionMember(request.cookies.get(SESSION_COOKIE)?.value);
    const provider = data.action === 'google' ? 'google' : data.provider;
    if (!['google', 'vercel', 'github'].includes(String(provider))) throw new AppError('Избери услуга за свързване.');
    if (data.action === 'disconnect') {
      if (!user) throw new AppError('Влез в профила си.', 401);
      disconnectSiteProvider(user, provider as SiteProvider);
      return siteJson(connectionSummary(user));
    }
    if (data.action !== 'google' && data.action !== 'connect') throw new AppError('Непознато действие.');
    const result = beginSiteOAuth(provider as SiteProvider, user, data, siteOrigin(request));
    const response = siteJson({ url: result.url });
    response.cookies.set(OAUTH_COOKIE, result.binding, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/connections', maxAge: 600 });
    return response;
  } catch (error) { return siteError(error); }
}
