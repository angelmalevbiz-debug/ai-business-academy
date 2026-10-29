import { AppError } from './auth';
import type { Member } from './domain';

type Operator = Pick<Member, 'role'> | null | undefined;
export interface PublisherDraft {
  id: string;
  title: string;
  content: string;
  updatedAt?: string;
  status?: string;
}
export interface PublisherStatus {
  available: boolean;
  configured: boolean;
  message: string;
  origin?: string;
  studioUrl?: string;
  canImport?: boolean;
  workerMode?: 'all' | 'academy';
  bridgeMode?: 'read-only' | 'studio';
  generation?: { text: string; image: string; runtimeVerified: false };
}

const ORIGINS = new Set(['http://127.0.0.1:8878', 'http://127.0.0.1:8881']);
const MAX_BYTES = 2_000_000;
const DRAFT_ID = /^[a-f0-9]{32}$/;
const STATES = new Set(['DRAFT', 'DRAFTING', 'NEEDS_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'BLOCKED']);
const PROVIDER_STATES = new Set(['manual', 'configured_unverified', 'missing_model', 'missing_api_key', 'paid_disabled', 'unsupported_provider', 'unsupported_model', 'workflow_adapter_not_configured', 'available', 'unavailable', 'ready', 'missing_runtime', 'missing_weights']);

function requireOperator(actor: Operator) {
  if (!actor || actor.role !== 'admin') throw new AppError('Локалното студио е достъпно само за администратора.', 403);
}
function origin(): string | null {
  const configured = process.env.WORKFLOW_PUBLISHER_ORIGIN?.trim();
  if (!configured) return null;
  let value: URL;
  try { value = new URL(configured); } catch { throw new AppError('Задай локален Cutroom адрес на порт 8878 или 8881.', 503); }
  if (!ORIGINS.has(value.origin) || value.username || value.password || value.pathname !== '/' || value.search || value.hash) {
    throw new AppError('Задай локален Cutroom адрес на порт 8878 или 8881.', 503);
  }
  return value.origin;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

// This bridge deliberately has no write/queue/publish operation. The loopback
// studio is a single-operator service, not an Academy tenant-aware backend.
async function readJson(base: string, path: '/api/bootstrap' | '/api/academy' | `/api/academy/drafts/${string}`): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(base + path, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5_000), headers: { Accept: 'application/json' } });
  } catch { throw new AppError('Локалното студио не отговаря. Стартирай Cutroom и опитай пак.', 503); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(response.status === 404 ? 'Този материал или Cutroom API не е наличен.' : 'Локалното студио върна грешка. Отвори го, за да провериш състоянието.', response.status === 404 ? 404 : 502);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) { await response.body?.cancel(); throw new AppError('Адресът не върна Cutroom данни.', 502); }
  if (Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) { await response.body?.cancel(); throw new AppError('Отговорът от студиото е твърде голям или празен.', 502); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new AppError('Отговорът от студиото е твърде голям.', 502); }
      chunks.push(chunk.value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Unsupported payload');
    return record(data);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Локалното студио върна нечетими данни. Опитай отново.', 502);
  } finally { reader.releaseLock(); }
}

async function context(actor: Operator) {
  requireOperator(actor);
  const base = origin();
  if (!base) throw new AppError('Локалното студио още не е свързано. Задай WORKFLOW_PUBLISHER_ORIGIN на сървъра.', 503);
  const bootstrap = await readJson(base, '/api/bootstrap');
  if (bootstrap.name !== 'Cutroom' || !/^\d+\.\d+\.\d+$/.test(text(bootstrap.version, 30)) || (bootstrap.worker_mode !== 'academy' && bootstrap.worker_mode !== 'all')) {
    throw new AppError('На този адрес не е разпознато Cutroom студио.', 502);
  }
  // csrf_token from bootstrap is never returned or persisted. GET-only reads
  // need no mutation token; the original studio owns its approval controls.
  return {base, workerMode: bootstrap.worker_mode as 'academy' | 'all', bridgeMode: bootstrap.bridge_mode === 'read_only' ? 'read-only' as const : 'studio' as const};
}

function draft(value: unknown): PublisherDraft | null {
  const item = record(value);
  if (typeof item.id !== 'string' || !DRAFT_ID.test(item.id)) return null;
  const title = text(item.title, 180) || 'Чернова от Cutroom';
  const parts = [text(item.caption, 5_000)];
  if (Array.isArray(item.slides)) {
    for (const raw of item.slides.slice(0, 20)) {
      const slide = record(raw);
      const headline = text(slide.headline, 300) || text(slide.title, 300);
      const body = text(slide.body, 1_400) || text(slide.text, 1_400);
      const bullets = Array.isArray(slide.bullets) ? slide.bullets.slice(0, 8).map(value => text(value, 300)).filter(Boolean).join('\n') : '';
      const copy = [headline, body, bullets].filter(Boolean).join('\n');
      if (copy) parts.push(copy);
    }
  }
  const content = parts.filter(Boolean).join('\n\n').slice(0, 18_000);
  if (!content) return null;
  const updatedAt = text(item.updated_at, 50);
  const status = text(item.status, 30);
  return {id: item.id, title, content, ...(updatedAt && Number.isFinite(Date.parse(updatedAt)) ? {updatedAt} : {}), ...(STATES.has(status) ? {status} : {})};
}

export async function getPublisherStatus(actor: Operator): Promise<PublisherStatus> {
  requireOperator(actor);
  let base: string | null;
  try { base = origin(); } catch (error) { return {available:false, configured:false, message:error instanceof AppError ? error.message : 'Провери локалния адрес на Cutroom.'}; }
  if (!base) return {available:false, configured:false, message:'Свържи локалното Cutroom студио чрез WORKFLOW_PUBLISHER_ORIGIN на сървъра.'};
  try {
    const current = await context(actor);
    const academy = await readJson(base, '/api/academy');
    const providers = record(academy.providers);
    const providerState = (value: unknown) => { const status = text(record(value).status, 60); return PROVIDER_STATES.has(status) ? status : 'unknown'; };
    return {available:true, configured:true, message:current.bridgeMode === 'read-only' ? 'Свързано за четене и копиране на чернови. Монтажът и публикуващите процеси са спрени.' : 'Cutroom е свързано. Избери чернова за копиране или отвори студиото за монтаж и одобрение.', origin:base, ...(current.bridgeMode === 'studio' ? {studioUrl:base+'/#academy'} : {}), canImport:Array.isArray(academy.drafts), workerMode:current.workerMode, bridgeMode:current.bridgeMode, generation:{text:providerState(providers.text), image:providerState(providers.image), runtimeVerified:false}};
  } catch (error) {
    return {available:false, configured:true, origin:base, studioUrl:base+'/#academy', message:error instanceof AppError ? error.message : 'Cutroom не е достъпно. Провери локалното студио.'};
  }
}

export async function listPublisherDrafts(actor: Operator): Promise<PublisherDraft[]> {
  const {base} = await context(actor);
  const academy = await readJson(base, '/api/academy');
  if (!Array.isArray(academy.drafts)) throw new AppError('Cutroom не върна списък с чернови.', 502);
  const unique = new Map<string, PublisherDraft>();
  for (const value of academy.drafts.slice(0, 100)) {
    const item = draft(value);
    if (item && !unique.has(item.id)) unique.set(item.id, item);
    if (unique.size >= 40) break;
  }
  return [...unique.values()];
}

export async function readPublisherDraft(actor: Operator, id: unknown): Promise<PublisherDraft> {
  requireOperator(actor);
  if (typeof id !== 'string' || !DRAFT_ID.test(id)) throw new AppError('Избери валидна Cutroom чернова.', 400);
  const {base} = await context(actor);
  const value = draft(await readJson(base, `/api/academy/drafts/${id}`));
  if (!value || value.id !== id) throw new AppError('Черновата няма подходящ текст за копиране.', 502);
  return value;
}
