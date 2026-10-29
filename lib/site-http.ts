import { NextRequest, NextResponse } from 'next/server';
import { AppError } from './auth';

export function siteOrigin(request: NextRequest) {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    if (url.origin !== configured || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:'))) throw new AppError('APP_ORIGIN не е настроен правилно.', 503);
    return url.origin;
  }
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  if (process.env.NODE_ENV === 'production' || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) throw new AppError('Администраторът трябва да настрои адреса на приложението.', 503);
  return `${url.protocol}//${host}`;
}
export function siteJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export function siteError(error: unknown) { return siteJson({ error: error instanceof AppError ? error.message : 'Заявката не беше завършена. Опитай отново.' }, error instanceof AppError ? error.status : 500); }
export async function siteBody(request: NextRequest) {
  if (request.headers.get('origin') !== siteOrigin(request)) throw new AppError('Заявката трябва да е от този сайт.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Очаква се JSON заявка.', 415);
  if (!request.body) throw new AppError('Липсва заявка.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 12000) { await reader.cancel(); throw new AppError('Заявката е прекалено голяма.', 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data as Record<string, unknown>; }
  catch { throw new AppError('Невалидна заявка.'); }
}
