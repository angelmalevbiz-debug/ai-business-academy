import { NextRequest, NextResponse } from 'next/server';
import { AppError, authenticate, createMember, createSession, emailField, rateLimit, revokeSession, SESSION_COOKIE, SESSION_SECONDS, sessionMember } from '@/lib/auth';
import { getWorkspace, mutateWorkspace } from '@/lib/workspace';
import { deleteAccount, exportAccountData } from '@/lib/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function expectedRequestOrigin(request: NextRequest) {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== configured) throw new Error('Expected an origin without a path.');
      return parsed.origin;
    } catch { throw new AppError('Сървърът няма валиден APP_ORIGIN. Свържи се с администратора.', 503); }
  }
  if (process.env.NODE_ENV === 'production') throw new AppError('Сървърът изисква настроен APP_ORIGIN. Свържи се с администратора.', 503);
  // Next can use localhost internally while the browser connects to 127.0.0.1.
  // Only loopback Host values may supply the development browser origin.
  const internal = new URL(request.url);
  const host = request.headers.get('host') || internal.host;
  if (!['http:', 'https:'].includes(internal.protocol) || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) {
    throw new AppError('За този адрес е необходим изрично настроен APP_ORIGIN.', 403);
  }
  try { return new URL(`${internal.protocol}//${host}`).origin; }
  catch { throw new AppError('Невалиден адрес на заявката.', 403); }
}
function sessionCookie(res: NextResponse, token: string, clear = false) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: clear ? 0 : SESSION_SECONDS });
}
async function readBoundedBody(request: NextRequest) {
  if (!request.body) throw new AppError('Невалидна заявка.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 32000) {
        await reader.cancel();
        throw new AppError('Заявката е прекалено голяма.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function GET(request: NextRequest) {
  try { return response(getWorkspace(sessionMember(request.cookies.get(SESSION_COOKIE)?.value))); }
  catch (error) { return handleError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const expectedOrigin = expectedRequestOrigin(request);
    if (!origin || origin !== expectedOrigin) throw new AppError('Заявката трябва да е от този сайт.', 403);
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('application/json')) throw new AppError('Очаква се JSON заявка.', 415);
    if (Number(request.headers.get('content-length')) > 32000) throw new AppError('Заявката е прекалено голяма.', 413);
    const raw = await readBoundedBody(request);
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
      data = parsed as Record<string, unknown>;
    } catch { throw new AppError('Невалидна заявка.'); }
    const currentToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (data.action === 'register' || data.action === 'login') {
      if (data.action === 'register') {
        const email = emailField(data.email);
        rateLimit(`register:${email}`, 3);
        // An additional trusted-proxy per-IP limit belongs at the deployment ingress.
        rateLimit('register:shared', 100);
      }
      const user = data.action === 'register'
        ? await createMember({ name: data.name, email: data.email, password: data.password, ageBand: data.ageBand })
        : await authenticate(data.email, data.password);
      if (currentToken) revokeSession(currentToken);
      const res = response(getWorkspace(user));
      sessionCookie(res, createSession(user.id));
      return res;
    }
    if (data.action === 'logout') {
      if (currentToken) revokeSession(currentToken);
      const res = response(getWorkspace(null));
      sessionCookie(res, '', true);
      return res;
    }
    if (data.action === 'exportData') return response(exportAccountData(sessionMember(currentToken)));
    if (data.action === 'deleteAccount') {
      await deleteAccount(sessionMember(currentToken), data,currentToken);
      const res = response(getWorkspace(null));
      sessionCookie(res, '', true);
      return res;
    }
    return response(mutateWorkspace(sessionMember(currentToken), data));
  } catch (error) { return handleError(error); }
}
function handleError(error: unknown) {
  if (error instanceof AppError) return response({ error: error.message }, error.status);
  console.error('Workspace request failed:', error instanceof Error ? error.message : 'Unknown error');
  return response({ error: 'Възникна проблем при запазването. Опитай отново.' }, 500);
}
