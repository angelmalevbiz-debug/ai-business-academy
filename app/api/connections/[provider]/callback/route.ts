import { NextRequest, NextResponse } from 'next/server';
import { createSession, revokeSession, SESSION_COOKIE, SESSION_SECONDS, sessionMember } from '@/lib/auth';
import { completeSiteOAuth, consumeSiteOAuth, markGoogleSessionAuthentication, OAUTH_COOKIE, type SiteProvider } from '@/lib/site-connections';
import { siteOrigin } from '@/lib/site-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  let returnTo = '/?view=websites';
  let origin: string;
  try { origin = siteOrigin(request); } catch { return new NextResponse('Адресът на приложението не е настроен.', { status: 503 }); }
  try {
    const { provider } = await context.params;
    if (!['google', 'vercel', 'github'].includes(provider)) throw new Error('Invalid provider');
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const state = consumeSiteOAuth(provider as SiteProvider, request.nextUrl.searchParams.get('state'), request.cookies.get(OAUTH_COOKIE)?.value, sessionMember(token));
    returnTo = state.returnTo;
    if (state.origin !== origin || request.nextUrl.searchParams.has('error')) throw new Error('Authorization canceled');
    const result = await completeSiteOAuth(provider as SiteProvider, request.nextUrl.searchParams.get('code') || '', state);
    const target = new URL(result.returnTo, origin); target.searchParams.set('connection', provider);
    const response = NextResponse.redirect(target, 303);
    if (provider === 'google') {
      if (token) revokeSession(token);
      const googleSession = createSession(result.user.id);
      markGoogleSessionAuthentication(result.user, googleSession);
      response.cookies.set(SESSION_COOKIE, googleSession, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_SECONDS });
    }
    response.cookies.set(OAUTH_COOKIE, '', { path: '/api/connections', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    const target = new URL(returnTo, origin); target.searchParams.set('connectionError', 'authorization_failed');
    const response = NextResponse.redirect(target, 303);
    response.cookies.set(OAUTH_COOKIE, '', { path: '/api/connections', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
}
