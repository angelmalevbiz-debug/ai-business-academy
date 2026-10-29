import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, createMember, createSession, memberById, revokeSession } from '../lib/auth';
import { closeDb } from '../lib/db';
import { beginSiteOAuth, connectionConfigured, connectionSummary, connectionsDb, consumeSiteOAuth, decryptConnection, disconnectSiteProvider, encryptConnection, hasRecentGoogleSessionAuthentication, markGoogleSessionAuthentication, safeSiteReturn, siteProviderGrant, storeSiteGrant, validateGoogleClaims } from '../lib/site-connections';
import { createSiteDeployment, deploymentState, listSiteDeployments } from '../lib/site-deployment';
import { createWebsite } from '../lib/website-store';
import { deleteAccount } from '../lib/privacy';

const directory = mkdtempSync(join(tmpdir(), 'academy-connections-test-'));
process.env.COMMUNITY_DB_PATH = join(directory, 'isolated.db');
process.env.SITE_CONNECTION_ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.GOOGLE_CLIENT_ID = 'unit-google-client'; process.env.GOOGLE_CLIENT_SECRET = 'unit-google-secret';
process.env.VERCEL_INTEGRATION_CLIENT_ID = 'unit-vercel-client'; process.env.VERCEL_INTEGRATION_CLIENT_SECRET = 'unit-vercel-secret'; process.env.VERCEL_INTEGRATION_SLUG = 'unit-academy';
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; closeDb(); rmSync(directory, { recursive: true, force: true }); });
const member = () => createMember({ name: 'Connection test', email: `${randomUUID()}@example.test`, password: 'Unit-test-password-isolated', ageBand: '18+' });

test('encryption authenticates user/provider context and rejects tampered data', () => {
  const cipher = encryptConnection({ accessToken: 'synthetic-only-token' }, 'member-1:vercel');
  assert.ok(!cipher.includes('synthetic-only-token'));
  assert.deepEqual(decryptConnection(cipher, 'member-1:vercel'), { accessToken: 'synthetic-only-token' });
  assert.throws(() => decryptConnection(cipher, 'member-2:vercel'));
  assert.throws(() => decryptConnection(cipher.slice(0, -5) + 'AAAAA', 'member-1:vercel'));
});
test('return destinations never escape the Academy origin or enter arbitrary routes', () => {
  for (const destination of ['//evil.test/', 'https://evil.test/', '/\\evil.test/', '/api/connections?evil=true', '/?view=websites\nLocation: evil']) assert.equal(safeSiteReturn(destination), '/?view=websites');
  assert.equal(safeSiteReturn('/?view=websites&site=abc'), '/?view=websites&site=abc');
});
test('Google requires age and explicit consent, hides unconfigured providers', () => {
  assert.throws(() => beginSiteOAuth('google', null, { ageBand: '18+' }, 'http://127.0.0.1:3100'), AppError);
  assert.throws(() => beginSiteOAuth('google', null, { consent: true, ageBand: '13' }, 'http://127.0.0.1:3100'), AppError);
  assert.equal(connectionConfigured('github'), false);
  assert.throws(() => beginSiteOAuth('github', null, { consent: true }, 'http://127.0.0.1:3100'), AppError);
});
test('OAuth state is encrypted, browser-bound, provider-bound and single-use', async () => {
  const user = await member();
  const begun = beginSiteOAuth('vercel', user, { consent: true }, 'http://127.0.0.1:3100');
  const url = new URL(begun.url); const state = url.searchParams.get('state');
  assert.equal(url.origin, 'https://vercel.com'); assert.equal(url.pathname, '/integrations/unit-academy/new');
  assert.equal(url.searchParams.get('source'), 'external');
  assert.throws(() => consumeSiteOAuth('vercel', state, 'wrong-binding', user), AppError);
  assert.throws(() => consumeSiteOAuth('google', state, begun.binding, user), AppError);
  const stateData = consumeSiteOAuth('vercel', state, begun.binding, user);
  assert.equal(stateData.memberId, user.id);
  assert.throws(() => consumeSiteOAuth('vercel', state, begun.binding, user), AppError);
});
test('OAuth callback refuses an account switch and expired state', async () => {
  const user = await member(); const other = await member();
  const begun = beginSiteOAuth('vercel', user, { consent: true }, 'http://127.0.0.1:3100');
  const state = new URL(begun.url).searchParams.get('state');
  assert.throws(() => consumeSiteOAuth('vercel', state, begun.binding, other), AppError);
  connectionsDb().prepare('UPDATE site_oauth_states SET expires_at=0').run();
  assert.throws(() => consumeSiteOAuth('vercel', state, begun.binding, user), AppError);
});
test('Google claims reject wrong issuer, audience, nonce, expiry and unverified email', () => {
  const now = Date.now(); const claims = { iss: 'https://accounts.google.com', aud: 'unit-google-client', nonce: 'nonce-1', exp: now / 1000 + 600, iat: now / 1000, sub: 'google-subject', email: 'unit@example.test', email_verified: true };
  assert.equal(validateGoogleClaims(claims, 'unit-google-client', 'nonce-1', now).sub, 'google-subject');
  for (const changed of [{ iss: 'https://evil.test' }, { aud: 'other-client' }, { nonce: 'wrong' }, { exp: now / 1000 - 1 }, { iat: now / 1000 + 10000 }, { email_verified: false }]) assert.throws(() => validateGoogleClaims({ ...claims, ...changed }, 'unit-google-client', 'nonce-1', now), AppError);
});
test('provider tokens remain owner-scoped and a provider account cannot link to two members', async () => {
  const user = await member(); const other = await member();
  const grant = { accessToken: 'synthetic-token-owned-by-one-user', accountId: randomUUID(), accountName: 'Synthetic Vercel account' };
  storeSiteGrant(user, 'vercel', grant);
  assert.equal((await siteProviderGrant(user, 'vercel')).accessToken, grant.accessToken);
  await assert.rejects(() => siteProviderGrant(other, 'vercel'), AppError);
  assert.throws(() => storeSiteGrant(other, 'vercel', grant), AppError);
  const row = connectionsDb().prepare('SELECT grant_cipher FROM site_connections WHERE member_id=?').get(user.id)!;
  assert.ok(!String(row.grant_cipher).includes(grant.accessToken));
});
test('deployment requires owner, current revision and confirmation; provider receipt is idempotent', async () => {
  const user = await member(); const other = await member();
  const site = createWebsite(user, { name: 'Isolated Test Studio', offer: 'Реална фотографска услуга за тестовия сайт.', businessStage: 'existing', style: 'editorial' });
  storeSiteGrant(user, 'vercel', { accessToken: 'synthetic-deployment-token', accountId: randomUUID(), accountName: 'Synthetic user' });
  storeSiteGrant(other, 'vercel', { accessToken: 'synthetic-other-token', accountId: randomUUID(), accountName: 'Other synthetic user' });
  await assert.rejects(() => createSiteDeployment(user, { siteId: site.id, revision: site.revision }), AppError);
  await assert.rejects(() => createSiteDeployment(user, { siteId: site.id, revision: site.revision + 1, confirmPublish: true }), AppError);
  await assert.rejects(() => createSiteDeployment(other, { siteId: site.id, revision: site.revision, confirmPublish: true }), AppError);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://api.vercel.com/v13/deployments');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.meta.academyRevision, String(site.revision));
    assert.ok(Buffer.from(body.files[0].data, 'base64').toString().includes('Isolated Test Studio'));
    return new Response(JSON.stringify({ id: 'dpl_SYNTHETIC1', readyState: 'READY', url: 'synthetic-academy-test.vercel.app' }), { status: 200 });
  };
  try {
    const input = { siteId: site.id, revision: site.revision, confirmPublish: true };
    const deployed = await createSiteDeployment(user, input);
    assert.equal(deployed.status, 'ready'); assert.equal(deployed.url, 'https://synthetic-academy-test.vercel.app');
    assert.deepEqual(await createSiteDeployment(user, input), deployed); assert.equal(calls, 1);
    assert.equal((await listSiteDeployments(user, site.id)).length, 1);
    await assert.rejects(() => listSiteDeployments(other, site.id), AppError);
  } finally { globalThis.fetch = originalFetch; }
});
test('unknown provider states never appear as successful deployments', () => {
  assert.equal(deploymentState('READY'), 'ready'); assert.equal(deploymentState('BUILDING'), 'building'); assert.equal(deploymentState('ERROR'), 'error'); assert.equal(deploymentState('SOMETHING_NEW'), 'unknown');
});
test('missing encryption or provider configuration never offers a fake OAuth connection', async () => {
  const key = process.env.SITE_CONNECTION_ENCRYPTION_KEY; const client = process.env.GOOGLE_CLIENT_ID;
  try {
    delete process.env.SITE_CONNECTION_ENCRYPTION_KEY;
    assert.equal(connectionSummary(null).google.configured, false);
    assert.equal(connectionSummary(null).providers.find(provider => provider.provider === 'vercel')?.deploymentEnabled, false);
    assert.throws(() => beginSiteOAuth('google', null, { consent: true, ageBand: '18+' }, 'http://127.0.0.1:3100'), error => error instanceof AppError && error.status === 503);
    process.env.SITE_CONNECTION_ENCRYPTION_KEY = key;
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal(connectionConfigured('google'), false);
    assert.throws(() => beginSiteOAuth('google', null, { consent: true, ageBand: '18+' }, 'http://127.0.0.1:3100'), error => error instanceof AppError && error.status === 503);
  } finally { process.env.SITE_CONNECTION_ENCRYPTION_KEY = key; process.env.GOOGLE_CLIENT_ID = client; }
});
test('Google identity disconnect is explicitly rejected instead of falsely succeeding', async () => {
  const user = await member();
  connectionsDb().prepare('INSERT INTO site_google_identities VALUES(?,?,?)').run(randomUUID(), user.id, new Date().toISOString());
  assert.throws(() => disconnectSiteProvider(user, 'google'), error => error instanceof AppError && error.status === 409);
  assert.equal(connectionSummary(user).google.connected, true);
});
test('recent Google reauthentication belongs to the exact authenticated session and expires', async () => {
  const user = await member(); const other = await member();
  const token = createSession(user.id); const passwordSession = createSession(user.id); const otherToken = createSession(other.id);
  connectionsDb().prepare('INSERT INTO site_google_identities VALUES(?,?,?)').run(randomUUID(), user.id, new Date().toISOString());
  assert.equal(hasRecentGoogleSessionAuthentication(user, token), false);
  markGoogleSessionAuthentication(user, token);
  assert.equal(hasRecentGoogleSessionAuthentication(user, token), true);
  assert.equal(hasRecentGoogleSessionAuthentication(user, passwordSession), false);
  assert.equal(hasRecentGoogleSessionAuthentication(other, token), false);
  assert.throws(() => markGoogleSessionAuthentication(user, otherToken), AppError);
  connectionsDb().prepare('UPDATE site_google_session_auth SET authenticated_at=0 WHERE member_id=?').run(user.id);
  assert.equal(hasRecentGoogleSessionAuthentication(user, token), false);
  markGoogleSessionAuthentication(user, token); revokeSession(token);
  assert.equal(hasRecentGoogleSessionAuthentication(user, token), false);
});
test('Google-only member can delete with explicit confirmation and recent Google authentication, never by client flag alone', async () => {
  const user = await member(); const token = createSession(user.id);
  connectionsDb().prepare('INSERT INTO site_google_identities VALUES(?,?,?)').run(randomUUID(), user.id, new Date().toISOString());
  await assert.rejects(() => deleteAccount(user, { confirmation: 'DELETE', authentication: 'google' }, token), AppError);
  markGoogleSessionAuthentication(user, token);
  await assert.rejects(() => deleteAccount(user, { authentication: 'google' }, token), AppError);
  assert.ok(memberById(user.id));
  await deleteAccount(user, { confirmation: 'DELETE', authentication: 'google' }, token);
  assert.equal(memberById(user.id), null);
  assert.equal(hasRecentGoogleSessionAuthentication(user, token), false);
});
test('provider 5xx and network loss remain uncertain and cannot be blindly reissued', async () => {
  const user = await member(); const site = createWebsite(user, { name: 'Uncertain Synthetic', offer: 'Синтетичен тест на публикуване.', businessStage: 'new', style: 'editorial' });
  storeSiteGrant(user, 'vercel', { accessToken: 'unit-uncertain-token', accountId: randomUUID(), accountName: 'Unit synthetic user' });
  let calls = 0; globalThis.fetch = async () => { calls++; return new Response('Provider unavailable', { status: 503 }); };
  try {
    const input = { siteId: site.id, revision: site.revision, confirmPublish: true };
    const uncertain = await createSiteDeployment(user, input);
    assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.url, null);
    assert.equal((await createSiteDeployment(user, input)).id, uncertain.id); assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test('confirmed provider refusal permits one deliberate retry, while success remains idempotent', async () => {
  const user = await member(); const site = createWebsite(user, { name: 'Retry Synthetic', offer: 'Синтетичен тест на отказ.', businessStage: 'new', style: 'editorial' });
  storeSiteGrant(user, 'vercel', { accessToken: 'unit-refused-token', accountId: randomUUID(), accountName: 'Unit refused user' });
  let calls = 0; globalThis.fetch = async () => {
    calls++;
    return calls === 1 ? new Response('Permission denied', { status: 403 }) : new Response(JSON.stringify({ id: 'dpl_SYNTHETICRETRY', readyState: 'READY', url: 'synthetic-retry.vercel.app' }), { status: 200 });
  };
  try {
    const input = { siteId: site.id, revision: site.revision, confirmPublish: true };
    const refused = await createSiteDeployment(user, input); assert.equal(refused.status, 'error');
    const retried = await createSiteDeployment(user, input); assert.equal(retried.status, 'ready'); assert.equal(retried.id, refused.id);
    await createSiteDeployment(user, input); assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
test('recent Google authentication cannot delete the last administrator', async () => {
  const user = await createMember({ name: 'Only test administrator', email: `${randomUUID()}@example.test`, password: 'Only-admin-synthetic-password', ageBand: '18+' }, 'admin');
  connectionsDb().prepare('INSERT INTO site_google_identities VALUES(?,?,?)').run(randomUUID(), user.id, new Date().toISOString());
  const token = createSession(user.id); markGoogleSessionAuthentication(user, token);
  await assert.rejects(() => deleteAccount(user, { confirmation: 'DELETE', authentication: 'google' }, token), error => error instanceof AppError && error.status === 409);
  assert.ok(memberById(user.id));
});
