import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { AppError, ageField, createMember, digest, memberById, rateLimit } from './auth';
import { getDb } from './db';
import type { Member } from './domain';

export type SiteProvider = 'google' | 'vercel' | 'github';
type OAuthState = { provider: SiteProvider; memberId: string | null; nonce: string; verifier: string; returnTo: string; origin: string; ageBand?: '14-17' | '18+'; consentAt?: string };
type Grant = { accessToken: string; refreshToken?: string; expiresAt?: number; accountId: string; accountName: string; teamId?: string };
export const OAUTH_COOKIE = 'wv_site_oauth';
export class SiteProviderRejection extends AppError {}
const TTL = 10 * 60 * 1000;

export function connectionsDb() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS site_oauth_states (state_hash TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS site_connections (member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,provider TEXT NOT NULL,account_id TEXT NOT NULL,account_name TEXT NOT NULL,grant_cipher TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(member_id,provider),UNIQUE(provider,account_id));
    CREATE TABLE IF NOT EXISTS site_google_identities (subject TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,consent_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS site_google_session_auth (session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,authenticated_at INTEGER NOT NULL);`);
  return db;
}
function encryptionKey() {
  const value = process.env.SITE_CONNECTION_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new AppError('Свързването на профили още не е настроено от администратора.', 503);
  return Buffer.from(value, 'hex');
}
export function encryptConnection(value: unknown, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
}
export function decryptConnection<T>(value: string, context: string): T {
  const [iv, tag, data] = value.split('.').map(value => Buffer.from(value, 'base64url'));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !data) throw new AppError('Невалидна връзка. Свържи профила отново.', 409);
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')) as T;
}
export function safeSiteReturn(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/?') || value.length > 500 || /[\\\r\n]/.test(value)) return '/?view=websites';
  const parsed = new URL(value, 'https://academy.invalid');
  return parsed.origin === 'https://academy.invalid' && parsed.pathname === '/' ? parsed.pathname + parsed.search : '/?view=websites';
}
export function connectionConfigured(provider: SiteProvider) {
  const names = provider === 'google' ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] : provider === 'vercel' ? ['VERCEL_INTEGRATION_CLIENT_ID', 'VERCEL_INTEGRATION_CLIENT_SECRET', 'VERCEL_INTEGRATION_SLUG'] : ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
  return /^[a-fA-F0-9]{64}$/.test(process.env.SITE_CONNECTION_ENCRYPTION_KEY || '') && names.every(name => Boolean(process.env[name]));
}
export function connectionSummary(user: Member | null, sessionToken?: string) {
  const db = connectionsDb();
  return { google: { configured: connectionConfigured('google'), connected: Boolean(user && db.prepare('SELECT 1 FROM site_google_identities WHERE member_id=?').get(user.id)), recentlyAuthenticated: Boolean(user && sessionToken && hasRecentGoogleSessionAuthentication(user, sessionToken)) }, providers: (['vercel', 'github'] as const).map(provider => {
    const row = user ? db.prepare('SELECT account_name FROM site_connections WHERE member_id=? AND provider=?').get(user.id, provider) : null;
    return { provider, configured: connectionConfigured(provider), connected: Boolean(row), accountName: row?.account_name || null,
      deploymentEnabled: provider === 'vercel' && connectionConfigured(provider),
      reason: !connectionConfigured(provider) ? 'Администраторът още не е настроил връзката.' : null };
  }) };
}
export function beginSiteOAuth(provider: SiteProvider, user: Member | null, input: Record<string, unknown>, origin: string) {
  if (!connectionConfigured(provider)) throw new AppError('Тази връзка още не е настроена от администратора.', 503);
  if (provider !== 'google' && !user) throw new AppError('Влез в профила си, за да го свържеш.', 401);
  if (input.consent !== true) throw new AppError('Потвърди, че искаш да свържеш избрания профил.');
  // The deployment ingress should additionally enforce a trusted per-IP limit.
  // Guests share this budget, so it must not lock a busy signup page after twenty visitors.
  rateLimit(`site-oauth:${user?.id || 'guest-shared'}:${provider}`, user ? 20 : 2000);
  const state = randomBytes(32).toString('base64url');
  const binding = randomBytes(32).toString('base64url');
  const payload: OAuthState = { provider, memberId: user?.id || null, nonce: randomBytes(32).toString('base64url'), verifier: randomBytes(48).toString('base64url'), returnTo: safeSiteReturn(input.returnTo), origin };
  if (provider === 'google') { payload.ageBand = ageField(input.ageBand); payload.consentAt = new Date().toISOString(); }
  const db = connectionsDb();
  db.prepare('DELETE FROM site_oauth_states WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO site_oauth_states VALUES (?,?,?,?)').run(digest(state), digest(binding), encryptConnection(payload, `oauth:${digest(state)}`), Date.now() + TTL);
  const redirectUri = `${origin}/api/connections/${provider}/callback`;
  const challenge = createHash('sha256').update(payload.verifier).digest('base64url');
  const slug = process.env.VERCEL_INTEGRATION_SLUG || '';
  if (provider === 'vercel' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AppError('Vercel интеграцията не е настроена правилно.', 503);
  const url = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : provider === 'vercel' ? `https://vercel.com/integrations/${slug}/new` : 'https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: process.env[provider === 'google' ? 'GOOGLE_CLIENT_ID' : provider === 'vercel' ? 'VERCEL_INTEGRATION_CLIENT_ID' : 'GITHUB_CLIENT_ID']!, redirect_uri: redirectUri, response_type: 'code', state,
    scope: provider === 'google' ? 'openid email profile' : provider === 'vercel' ? 'openid profile offline_access' : 'read:user',
    code_challenge: challenge, code_challenge_method: 'S256', ...(provider === 'google' || provider === 'vercel' ? { nonce: payload.nonce } : {}) }).toString();
  if (provider === 'vercel') url.search = new URLSearchParams({ state, source: 'external' }).toString();
  return { url: url.href, binding };
}
export function consumeSiteOAuth(provider: SiteProvider, state: string | null, binding: string | undefined, currentUser: Member | null): OAuthState {
  if (!state || state.length > 100 || !binding) throw new AppError('Връзката за вход е изтекла. Опитай отново.', 403);
  const db = connectionsDb();
  const row = db.prepare('SELECT * FROM site_oauth_states WHERE state_hash=? AND binding_hash=? AND expires_at>?').get(digest(state), digest(binding), Date.now());
  if (!row) throw new AppError('Връзката за вход е изтекла. Опитай отново.', 403);
  const payload = decryptConnection<OAuthState>(String(row.payload), `oauth:${digest(state)}`);
  if (payload.provider !== provider || (payload.memberId || null) !== (currentUser?.id || null)) throw new AppError('Профилът за тази връзка се е променил. Започни отново.', 403);
  db.prepare('DELETE FROM site_oauth_states WHERE state_hash=?').run(digest(state));
  return payload;
}
export async function providerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store', headers: { Accept: 'application/json', ...init.headers } });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403 ? 'Достъпът е отказан. Свържи профила отново и провери разрешенията.' : 'Услугата не отговори успешно. Опитай отново по-късно.';
    // A 5xx or HTTP timeout may happen after the provider accepted a write.
    // Only a definite client-side refusal allows a deliberate retry.
    if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new SiteProviderRejection(message, 502);
    throw new AppError(message, 502);
  }
  const text = await response.text();
  if (text.length > 250000) throw new AppError('Услугата върна неочакван отговор.', 502);
  return JSON.parse(text) as Record<string, unknown>;
}
export function validateGoogleClaims(claims: Record<string, unknown>, audience: string, nonce: string, now = Date.now()) {
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(String(claims.iss)) || claims.aud !== audience || claims.nonce !== nonce || typeof claims.exp !== 'number' || claims.exp * 1000 <= now || typeof claims.iat !== 'number' || claims.iat * 1000 > now + 60000 || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || claims.email_verified !== true || typeof claims.email !== 'string') throw new AppError('Google не потвърди самоличността. Опитай отново.', 403);
  return claims as { sub: string; email: string; name?: string };
}
async function verifyGoogleToken(token: unknown, state: OAuthState) {
  if (typeof token !== 'string' || token.length > 20000 || token.split('.').length !== 3) throw new AppError('Невалиден отговор от Google.', 403);
  const [head, body, signature] = token.split('.');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new AppError('Невалиден подпис от Google.', 403);
  const jwks = await providerJson('https://www.googleapis.com/oauth2/v3/certs');
  const key = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig') : null;
  if (!key || !verify('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw new AppError('Невалиден подпис от Google.', 403);
  return validateGoogleClaims(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')), process.env.GOOGLE_CLIENT_ID!, state.nonce);
}
export function storeSiteGrant(user: Member, provider: 'vercel' | 'github', grant: Grant) {
  const db = connectionsDb();
  const existing = db.prepare('SELECT member_id FROM site_connections WHERE provider=? AND account_id=?').get(provider, grant.accountId);
  if (existing && existing.member_id !== user.id) throw new AppError('Този външен профил вече е свързан с друг профил в Академията.', 409);
  db.prepare('INSERT INTO site_connections VALUES (?,?,?,?,?,?) ON CONFLICT(member_id,provider) DO UPDATE SET account_id=excluded.account_id,account_name=excluded.account_name,grant_cipher=excluded.grant_cipher,updated_at=excluded.updated_at').run(user.id, provider, grant.accountId, grant.accountName, encryptConnection(grant, `${user.id}:${provider}`), new Date().toISOString());
}
export async function completeSiteOAuth(provider: SiteProvider, code: string, state: OAuthState) {
  if (!code || code.length > 4096) throw new AppError('Липсва код за свързване.');
  const prefix = provider === 'google' ? 'GOOGLE' : provider === 'vercel' ? 'VERCEL_INTEGRATION' : 'GITHUB';
  const tokenData = await providerJson(provider === 'google' ? 'https://oauth2.googleapis.com/token' : provider === 'vercel' ? 'https://api.vercel.com/v2/oauth/access_token' : 'https://github.com/login/oauth/access_token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env[`${prefix}_CLIENT_ID`]!, client_secret: process.env[`${prefix}_CLIENT_SECRET`]!, redirect_uri: `${state.origin}/api/connections/${provider}/callback`, code_verifier: state.verifier }) });
  if (typeof tokenData.access_token !== 'string' || tokenData.error) throw new AppError('Свързването не беше завършено.', 403);
  if (provider === 'google') {
    const claims = await verifyGoogleToken(tokenData.id_token, state);
    const db = connectionsDb();
    const identity = db.prepare('SELECT member_id FROM site_google_identities WHERE subject=?').get(claims.sub);
    if (identity) {
      if (state.memberId && identity.member_id !== state.memberId) throw new AppError('Този Google профил е свързан с друг профил.', 409);
      return { user: memberById(String(identity.member_id))!, returnTo: state.returnTo };
    }
    let user = state.memberId ? memberById(state.memberId) : null;
    if (!user) {
      if (db.prepare('SELECT id FROM members WHERE email=?').get(claims.email.toLowerCase())) throw new AppError('Този имейл вече има профил. Влез с паролата си, преди да свържеш Google.', 409);
      user = await createMember({ name: claims.name?.slice(0, 80) || claims.email.split('@')[0].padEnd(2, '.'), email: claims.email, password: randomBytes(48).toString('base64url'), ageBand: state.ageBand });
    }
    db.prepare('INSERT INTO site_google_identities VALUES (?,?,?)').run(claims.sub, user.id, state.consentAt!);
    return { user, returnTo: state.returnTo };
  }
  const user = state.memberId ? memberById(state.memberId) : null;
  if (!user) throw new AppError('Влез отново в профила си.', 401);
  const identity = await providerJson(provider === 'vercel' ? 'https://api.vercel.com/v2/user' : 'https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenData.access_token}`, ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'AI-Business-Academy' } : {}) } });
  const account = provider === 'vercel' ? identity.user as Record<string, unknown> : identity;
  if (!account || !account.id || typeof account.username !== 'string' && typeof account.login !== 'string') throw new AppError('Услугата не потвърди профила.', 502);
  const teamId = provider === 'vercel' && typeof tokenData.team_id === 'string' ? tokenData.team_id : undefined;
  storeSiteGrant(user, provider, { accessToken: tokenData.access_token, refreshToken: typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : undefined, expiresAt: typeof tokenData.expires_in === 'number' ? Date.now() + tokenData.expires_in * 1000 : undefined, accountId: teamId || String(account.id), accountName: String(account.username || account.login) + (teamId ? ' · екип' : ''), teamId });
  return { user, returnTo: state.returnTo };
}
export function disconnectSiteProvider(user: Member, provider: SiteProvider) {
  if (provider === 'google') throw new AppError('Google се използва за вход. Разкачването му още не е налично; то може да прекъсне достъпа до профила.', 409);
  // This removes Academy's stored access. Provider-side revocation remains available in that provider's settings.
  connectionsDb().prepare('DELETE FROM site_connections WHERE member_id=? AND provider=?').run(user.id, provider);
}
export function markGoogleSessionAuthentication(user: Member, sessionToken: string) {
  const db = connectionsDb();
  if (!db.prepare('SELECT 1 FROM site_google_identities WHERE member_id=?').get(user.id)) throw new AppError('Google профилът не е свързан.', 409);
  const sessionHash = digest(sessionToken);
  if (!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND member_id=? AND expires_at>?').get(sessionHash, user.id, Date.now())) throw new AppError('Сесията е изтекла.', 401);
  db.prepare('INSERT INTO site_google_session_auth VALUES (?,?,?) ON CONFLICT(session_hash) DO UPDATE SET authenticated_at=excluded.authenticated_at').run(sessionHash, user.id, Date.now());
}
export function hasRecentGoogleSessionAuthentication(user: Member, sessionToken: string) {
  return Boolean(connectionsDb().prepare('SELECT 1 FROM site_google_session_auth g JOIN sessions s ON s.token_hash=g.session_hash JOIN site_google_identities i ON i.member_id=g.member_id WHERE g.session_hash=? AND g.member_id=? AND s.member_id=? AND s.expires_at>? AND g.authenticated_at>?').get(digest(sessionToken), user.id, user.id, Date.now(), Date.now() - TTL));
}
export function readSiteConnectionAccountData(user: Member) {
  const db = connectionsDb();
  return { connectedAccounts: db.prepare('SELECT provider,account_name,updated_at FROM site_connections WHERE member_id=?').all(user.id), googleIdentities: db.prepare('SELECT subject,consent_at FROM site_google_identities WHERE member_id=?').all(user.id) };
}
export async function siteProviderGrant(user: Member, provider: 'vercel' | 'github') {
  const row = connectionsDb().prepare('SELECT grant_cipher FROM site_connections WHERE member_id=? AND provider=?').get(user.id, provider);
  if (!row) throw new AppError(`Първо свържи ${provider === 'vercel' ? 'Vercel' : 'GitHub'} профила си.`, 409);
  const grant = decryptConnection<Grant>(String(row.grant_cipher), `${user.id}:${provider}`);
  if (grant.expiresAt && grant.expiresAt < Date.now() + 30000) {
    throw new AppError('Достъпът е изтекъл. Свържи профила отново.', 409);
  }
  return grant;
}
