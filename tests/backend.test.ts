import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { AppError, authenticate, createMember, createSession, digest, hashPassword, rateLimit, revokeSession, sessionMember, verifyPassword } from '../lib/auth';
import { closeDb, getDb } from '../lib/db';
import { getWorkspace, mutateWorkspace } from '../lib/workspace';
import { GET, POST } from '../app/api/workspace/route';
import { DatabaseSync, backup } from 'node:sqlite';
import { getCatalog } from '../lib/catalog';
import { localDay } from '../lib/development';
import { deleteAccount, exportAccountData } from '../lib/privacy';

const directory = mkdtempSync(join(tmpdir(), 'webvision-backend-'));
process.env.COMMUNITY_DB_PATH = join(directory, 'test.db');
process.env.APP_ORIGIN = 'http://localhost:3000';
const password = 'a secure test password 2026';
const create = (name: string, ageBand: '14-17' | '18+' = '18+', role: 'member' | 'admin' = 'member') => createMember({ name, email: `${name.toLowerCase().replace(/\W/g, '')}@example.test`, password, ageBand }, role);
const worksheet = 'Учебен процес с измислени данни: вход, три стъпки, проверен изход и ясни ограничения на теста.';

after(() => {
  closeDb();
  const absolute = resolve(directory);
  if (!absolute.startsWith(resolve(tmpdir()) + '\\') && !absolute.startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe temporary cleanup target');
  rmSync(absolute, { recursive: true, force: true });
});

test('passwords are salted, verifiable and never stored as plaintext', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  const user = await create('PasswordMember');
  const row = getDb().prepare('SELECT password_hash FROM members WHERE id=?').get(user.id)!;
  assert.notEqual(row.password_hash, password);
  assert.equal((await authenticate(user.email.toUpperCase(), password)).id, user.id);
  await assert.rejects(authenticate(user.email, 'incorrect'), (error: unknown) => error instanceof AppError && error.status === 401);
});

test('sessions store only hashed tokens, expire and revoke correctly', async () => {
  const user = await create('SessionMember');
  const token = createSession(user.id);
  assert.equal(sessionMember(token)?.id, user.id);
  assert.equal(getDb().prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(token), undefined);
  assert.ok(getDb().prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(digest(token)));
  getDb().prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(Date.now() - 1, digest(token));
  assert.equal(sessionMember(token), null);
  const nextToken = createSession(user.id);
  revokeSession(nextToken);
  assert.equal(sessionMember(nextToken), null);
});

test('registration validates age, password and duplicate emails', async () => {
  await assert.rejects(createMember({ name: 'Too young', email: 'young@example.test', password, ageBand: 'under14' }), /14/);
  await assert.rejects(createMember({ name: 'Short pass', email: 'short@example.test', password: 'short', ageBand: '18+' }), /12/);
  const member = await create('DuplicateMember');
  await assert.rejects(createMember({ name: 'Another name', email: member.email.toUpperCase(), password, ageBand: '18+' }), /вече има профил/);
});

test('member work stays private and completion requires a submitted, sequential task', async () => {
  const alice = await create('PrivateAlice');
  const bob = await create('PrivateBob');
  assert.throws(() => mutateWorkspace(null, { action: 'submit', lessonId: 'process-map', text: worksheet }), (e: unknown) => e instanceof AppError && e.status === 401);
  assert.throws(() => mutateWorkspace(alice, { action: 'complete', lessonId: 'process-map' }), /Първо изпрати/);
  assert.throws(() => mutateWorkspace(alice, { action: 'submit', lessonId: 'made-up', text: worksheet }), /не съществува/);
  mutateWorkspace(alice, { action: 'submit', lessonId: 'first-prototype', text: worksheet });
  assert.throws(() => mutateWorkspace(alice, { action: 'complete', lessonId: 'first-prototype' }), /предходните/);
  mutateWorkspace(alice, { action: 'submit', lessonId: 'process-map', text: worksheet });
  const result = mutateWorkspace(alice, { action: 'complete', lessonId: 'process-map' });
  assert.deepEqual(result.completedLessonIds, ['process-map']);
  assert.equal(getWorkspace(bob).submissions.length, 0);
  assert.equal(getWorkspace(null).submissions.length, 0);
  assert.equal(getWorkspace(null).user, null);
  assert.equal(JSON.stringify(getWorkspace(null)).includes(alice.email), false);
  assert.equal(getWorkspace(bob).metrics, undefined);
});

test('admin review permissions, revision state and audit trail are enforced', async () => {
  const member = await create('ReviewMember');
  const admin = await create('ReviewAdmin', '18+', 'admin');
  const submitted = mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet });
  const id = submitted.submissions[0].id;
  mutateWorkspace(member, { action: 'complete', lessonId: 'process-map' });
  assert.throws(() => mutateWorkspace(member, { action: 'review', submissionId: id, status: 'reviewed', feedback: 'Полезна работа.' }), (e: unknown) => e instanceof AppError && e.status === 403);
  mutateWorkspace(admin, { action: 'review', submissionId: id, expectedRevision: 1, status: 'needs_changes', feedback: 'Добави конкретен критерий за проверка на изхода.' });
  assert.equal(getWorkspace(member).submissions[0].status, 'needs_changes');
  assert.equal(getWorkspace(member).completedLessonIds.length, 0);
  assert.throws(() => mutateWorkspace(member, { action: 'complete', lessonId: 'process-map' }), /обратната връзка/);
  mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet + ' Проверявам категорията по предварително определено правило.' });
  assert.equal(getWorkspace(member).submissions[0].status, 'pending');
  mutateWorkspace(admin, { action: 'review', submissionId: id, expectedRevision: 2, status: 'reviewed', feedback: 'Критерият е ясен и може да бъде проверен.' });
  assert.equal(getWorkspace(member).submissions[0].status, 'reviewed');
  assert.ok(getWorkspace(admin).metrics!.members >= 2);
  assert.ok(Number(getDb().prepare("SELECT count(*) AS n FROM audit_events WHERE action='review' AND target_id=?").get(id)!.n) >= 2);
});

test('minor route cannot become commercial through profile update and skips adult-only prerequisites', async () => {
  const minor = await create('MinorMember', '14-17');
  assert.throws(() => mutateWorkspace(minor, { action: 'profile', level: 'beginner', goal: 'learn', hours: 2, ageBand: '18+' }), /възрастовата група/);
  assert.throws(() => mutateWorkspace(minor, { action: 'submit', lessonId: 'service-offer', text: worksheet }), (e: unknown) => e instanceof AppError && e.status === 403);
  for (const lessonId of ['process-map', 'first-prototype', 'test-workflow', 'document-case', 'next-iteration']) {
    mutateWorkspace(minor, { action: 'submit', lessonId, text: worksheet });
    mutateWorkspace(minor, { action: 'complete', lessonId });
  }
  assert.equal(getWorkspace(minor).completedLessonIds.length, 5);
});

test('public posts expose no email and moderation is administrator-only', async () => {
  const member = await create('CommunityMember');
  const admin = await create('CommunityAdmin', '18+', 'admin');
  const result = mutateWorkspace(member, { action: 'post', title: 'Как да проверя прототипа?', body: 'Използвам измислени данни и се затруднявам с проверката на двусмислен вход.', category: 'question' });
  const post = result.posts.find(p => p.authorName === member.name)!;
  assert.ok(post);
  mutateWorkspace(member, { action: 'reply', postId: post.id, body: 'Добавям и описание на очаквания изход.' });
  assert.equal(getWorkspace(null).posts.find(p => p.id === post.id)?.replies.length, 1);
  const replyId = getWorkspace(null).posts.find(p => p.id === post.id)!.replies[0].id;
  assert.throws(() => mutateWorkspace(member, { action: 'hideReply', replyId }), (e: unknown) => e instanceof AppError && e.status === 403);
  assert.throws(() => mutateWorkspace(admin, { action: 'hideReply', replyId: 'missing-reply' }), (e: unknown) => e instanceof AppError && e.status === 404);
  const moderated = mutateWorkspace(admin, { action: 'hideReply', replyId }).posts.find(p => p.id === post.id)!;
  assert.equal(moderated.replies.length, 0);
  assert.equal(moderated.replyCount, 0);
  assert.equal(moderated.hasMoreReplies, false);
  assert.equal(getWorkspace(null).posts.find(p => p.id === post.id)!.replies.length, 0);
  assert.ok(getDb().prepare("SELECT id FROM audit_events WHERE action='hideReply' AND target_id=?").get(replyId));
  assert.equal(JSON.stringify(getWorkspace(null)).includes(member.email), false);
  assert.throws(() => mutateWorkspace(member, { action: 'hidePost', postId: post.id }), (e: unknown) => e instanceof AppError && e.status === 403);
  mutateWorkspace(admin, { action: 'hidePost', postId: post.id });
  assert.equal(getWorkspace(null).posts.find(p => p.id === post.id), undefined);
});

test('login rate limits remain bounded across repeated requests', async () => {
  for (let i = 0; i < 3; i++) rateLimit('test-small-limit', 3);
  assert.throws(() => rateLimit('test-small-limit', 3), (e: unknown) => e instanceof AppError && e.status === 429);
});

test('HTTP API enforces same-origin JSON writes and HttpOnly cookie sessions', async () => {
  const request = (body: string, origin?: string, cookie?: string) => new NextRequest('http://localhost:3000/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) }, body });
  assert.equal((await POST(request('{}'))).status, 403);
  assert.equal((await POST(request('{}', 'https://attacker.example'))).status, 403);
  assert.equal((await POST(request('{', 'http://localhost:3000'))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ action: 'post', body: 'x'.repeat(32001) }), 'http://localhost:3000'))).status, 413);
  assert.equal((await POST(request('[]', 'http://localhost:3000'))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ action: 'bookmark', pathId: 'automation' }), 'http://localhost:3000'))).status, 401);
  const registered = await POST(request(JSON.stringify({ action: 'register', name: 'HTTP Member', email: 'http-member@example.test', password, ageBand: '18+' }), 'http://localhost:3000'));
  assert.equal(registered.status, 200);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  const setCookie = registered.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  const cookie = setCookie.split(';')[0];
  const read = await GET(new NextRequest('http://localhost:3000/api/workspace', { headers: { cookie } }));
  assert.equal((await read.json()).user.email, 'http-member@example.test');
  const saved = await POST(request(JSON.stringify({ action: 'bookmark', pathId: 'automation' }), 'http://localhost:3000', cookie));
  assert.deepEqual((await saved.json()).bookmarkedPathIds, ['automation']);
  const logout = await POST(request(JSON.stringify({ action: 'logout' }), 'http://localhost:3000', cookie));
  assert.equal(logout.status, 200);
  const stale = await GET(new NextRequest('http://localhost:3000/api/workspace', { headers: { cookie } }));
  assert.equal((await stale.json()).user, null);
});

test('development CSRF uses the loopback browser Host when Next internally uses localhost', async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousOrigin = env.APP_ORIGIN;
  const previousMode = env.NODE_ENV;
  delete env.APP_ORIGIN;
  env.NODE_ENV = 'development';
  const request = (host: string, origin?: string) => new NextRequest('http://localhost:3000/api/workspace', {
    method: 'POST', headers: { host, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ action: 'logout' }),
  });
  try {
    assert.equal((await POST(request('127.0.0.1:3000', 'http://127.0.0.1:3000'))).status, 200);
    assert.equal((await POST(request('localhost:3000', 'http://localhost:3000'))).status, 200);
    assert.equal((await POST(request('[::1]:3000', 'http://[::1]:3000'))).status, 200);
    assert.equal((await POST(request('127.0.0.1:3000', 'http://localhost:3000'))).status, 403);
    assert.equal((await POST(request('127.0.0.1:3000'))).status, 403);
    assert.equal((await POST(request('attacker.example', 'http://attacker.example'))).status, 403);
    assert.equal((await POST(request('attacker.example@localhost:3000', 'http://localhost:3000'))).status, 403);
    env.NODE_ENV = 'production';
    assert.equal((await POST(request('localhost:3000', 'http://localhost:3000'))).status, 503);
    env.APP_ORIGIN = 'https://academy.example/path';
    assert.equal((await POST(request('academy.example', 'https://academy.example'))).status, 503);
    env.APP_ORIGIN = 'https://academy.example';
    assert.equal((await POST(request('localhost:3000', 'https://academy.example'))).status, 200);
    assert.equal((await POST(request('localhost:3000', 'https://attacker.example'))).status, 403);
  } finally {
    if (previousOrigin === undefined) delete env.APP_ORIGIN; else env.APP_ORIGIN = previousOrigin;
    if (previousMode === undefined) delete env.NODE_ENV; else env.NODE_ENV = previousMode;
  }
});

test('database state survives reconnects', async () => {
  const user = await create('DurableMember');
  mutateWorkspace(user, { action: 'bookmark', pathId: 'ai-development' });
  closeDb();
  assert.equal(getWorkspace(user).bookmarkedPathIds[0], 'ai-development');
});

test('v1 migration preserves members, tasks, sessions and a verified backup; newer schemas fail closed', async () => {
  const mainPath = process.env.COMMUNITY_DB_PATH;
  const legacyPath = join(directory, 'legacy-v1.db');
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec(`CREATE TABLE members(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',age_band TEXT NOT NULL,profile TEXT,created_at TEXT NOT NULL);
    CREATE TABLE submissions(id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),lesson_id TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',feedback TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(member_id,lesson_id));
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),expires_at INTEGER NOT NULL);
    INSERT INTO members VALUES('legacy-owner','Legacy Member','legacy@example.test','preserved-hash','member','18+',NULL,'2026-01-01T00:00:00Z');
    INSERT INTO submissions VALUES('legacy-work','legacy-owner','process-map','Original legacy work that must survive the update.','reviewed','Original legacy feedback.','2026-01-02T00:00:00Z');
    INSERT INTO sessions VALUES('legacy-token','legacy-owner',9999999999999); PRAGMA user_version=1;`);
  const backupPath = join(directory, 'legacy-backup.db');
  await backup(legacy, backupPath); legacy.close();
  const preserved = new DatabaseSync(backupPath, { readOnly: true });
  assert.equal(preserved.prepare('PRAGMA user_version').get()!.user_version, 1);
  assert.equal(preserved.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok'); preserved.close();
  try {
    process.env.COMMUNITY_DB_PATH = legacyPath;
    assert.equal(getDb().prepare('PRAGMA user_version').get()!.user_version, 12);
    assert.equal(getDb().prepare('SELECT password_hash FROM members WHERE id=?').get('legacy-owner')!.password_hash, 'preserved-hash');
    assert.equal(getDb().prepare('SELECT token_hash FROM sessions').get()!.token_hash, 'legacy-token');
    assert.equal(getDb().prepare('SELECT text FROM submission_revisions').get()!.text, 'Original legacy work that must survive the update.');
    closeDb();
    assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM submission_revisions').get()!.n, 1);
    getDb().exec('PRAGMA user_version=13'); closeDb();
    assert.throws(() => getDb(), /newer than supported/);
    const future = new DatabaseSync(legacyPath, { readOnly: true });
    assert.equal(future.prepare('PRAGMA user_version').get()!.user_version, 13);
    assert.equal(future.prepare('SELECT COUNT(*) AS n FROM members').get()!.n, 1); future.close();
  } finally { closeDb(); process.env.COMMUNITY_DB_PATH = mainPath; }
});

test('revision history survives resubmission, stale reviews fail and downstream completion is invalidated', async () => {
  const member = await create('VersionedMember'); const admin = await create('VersionedAdmin', '18+', 'admin');
  for (const lessonId of ['process-map', 'first-prototype']) { mutateWorkspace(member, { action: 'submit', lessonId, text: worksheet }); mutateWorkspace(member, { action: 'complete', lessonId }); }
  const first = getWorkspace(member).submissions.find(item => item.lessonId === 'process-map')!;
  mutateWorkspace(admin, { action: 'review', submissionId: first.id, expectedRevision: 1, status: 'reviewed', feedback: 'Исторически преглед на първата версия.' });
  mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet + ' Изменена версия.' });
  assert.deepEqual(getWorkspace(member).completedLessonIds, []);
  assert.throws(() => mutateWorkspace(admin, { action: 'review', submissionId: first.id, expectedRevision: 1, status: 'reviewed', feedback: 'Това е остарял преглед и не трябва да успее.' }), (error: unknown) => error instanceof AppError && error.status === 409);
  const current = getWorkspace(member).submissions.find(item => item.id === first.id)!;
  assert.equal(current.revision, 2); assert.equal(current.status, 'pending');
  assert.equal(current.history!.length, 2);
  assert.equal(current.history![1].reviews[0].feedback, 'Исторически преглед на първата версия.');
  assert.equal(current.history![1].reviews[0].reviewer, admin.name);
});

test('resubmitting old work updates its current date and weekly tasks count real revisions once', async () => {
  const member = await create('WeeklyRevisionMember');
  const initial = mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet }).submissions[0];
  getDb().prepare('UPDATE submissions SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', initial.id);
  getDb().prepare('UPDATE submission_revisions SET created_at=? WHERE submission_id=?').run('2020-01-01T00:00:00.000Z', initial.id);
  assert.equal(getWorkspace(member).development.weekly.submittedTasks, 0);
  const next = mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet + ' Нова проверка.' });
  assert.equal(localDay(new Date(next.submissions[0].createdAt)), localDay());
  assert.equal(next.development.weekly.submittedTasks, 1);
  const third = mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet + ' Трета проверка.' });
  assert.equal(third.development.weekly.submittedTasks, 1);
  assert.equal(third.submissions[0].history!.at(-1)!.createdAt, '2020-01-01T00:00:00.000Z');
});

test('account export includes all owned records without secrets or the administrator review queue', async () => {
  const owner = await create('ExportOwner', '18+', 'admin');
  const other = await create('ExportOther');
  mutateWorkspace(owner, { action: 'submit', lessonId: 'process-map', text: worksheet + ' OWN_EXPORT_MARKER' });
  mutateWorkspace(other, { action: 'submit', lessonId: 'process-map', text: worksheet + ' OTHER_PRIVATE_MARKER' });
  mutateWorkspace(owner, { action: 'saveDraft', lessonId: 'first-prototype', text: 'OWN_DRAFT_MARKER' });
  mutateWorkspace(owner, { action: 'post', category: 'progress', title: 'Моят документиран опит', body: worksheet + ' OWN_POST_MARKER' });
  for (let i = 0; i < 105; i++) getDb().prepare('INSERT INTO reflections(id,member_id,unit_id,text,created_at) VALUES(?,?,?,?,?)').run(`export-reflection-${i}`, owner.id, 'attention-to-action', `Лична бележка ${i}`, new Date().toISOString());
  const exported = exportAccountData(owner);
  const serialized = JSON.stringify(exported);
  assert.equal(exported.account.id, owner.id);
  assert.equal(exported.learning.submissions.length, 1);
  assert.equal(exported.development.reflections.length, 105);
  assert.match(serialized, /OWN_EXPORT_MARKER/);
  assert.match(serialized, /OWN_DRAFT_MARKER/);
  assert.match(serialized, /OWN_POST_MARKER/);
  assert.doesNotMatch(serialized, /OTHER_PRIVATE_MARKER|password_hash|token_hash/);
  assert.equal(serialized.includes(other.email), false);
  assert.throws(() => exportAccountData(null), (error: unknown) => error instanceof AppError && error.status === 401);
});

test('account deletion verifies current credentials, removes owned data and revokes every session', async () => {
  const owner = await create('DeleteOwner');
  const survivor = await create('DeleteSurvivor');
  const tokenOne = createSession(owner.id);
  const tokenTwo = createSession(owner.id);
  mutateWorkspace(owner, { action: 'submit', lessonId: 'process-map', text: worksheet });
  mutateWorkspace(owner, { action: 'saveDraft', lessonId: 'first-prototype', text: worksheet });
  mutateWorkspace(owner, { action: 'bookmark', pathId: 'automation' });
  const post = mutateWorkspace(owner, { action: 'post', category: 'question', title: 'Въпрос преди изтриване', body: worksheet }).posts.find(item => item.authorName === owner.name)!;
  mutateWorkspace(survivor, { action: 'reply', postId: post.id, body: 'Отговорът е част от изтритата дискусия.' });
  const remaining = mutateWorkspace(survivor, { action: 'post', category: 'progress', title: 'Другият профил остава', body: worksheet }).posts.find(item => item.authorName === survivor.name)!;
  mutateWorkspace(owner, { action: 'reply', postId: remaining.id, body: 'Моят отговор ще се изтрие с профила.' });
  await assert.rejects(deleteAccount(owner, { password: 'incorrect', confirmation: 'DELETE' }), (error: unknown) => error instanceof AppError && error.status === 401);
  await assert.rejects(deleteAccount(owner, { password, confirmation: 'no' }), /Потвърди/);
  assert.equal(sessionMember(tokenOne)?.id, owner.id);
  await deleteAccount(owner, { password, confirmation: 'DELETE', memberId: survivor.id });
  assert.equal(sessionMember(tokenOne), null);
  assert.equal(sessionMember(tokenTwo), null);
  for (const table of ['members', 'sessions', 'progress', 'submissions', 'lesson_drafts', 'bookmarks', 'posts', 'replies', 'audit_events']) {
    const key = table === 'members' ? 'id' : 'member_id';
    assert.equal(Number(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${key}=?`).get(owner.id)!.n), 0, table);
  }
  assert.equal(getDb().prepare('SELECT id FROM replies WHERE post_id=?').get(post.id), undefined);
  assert.ok(getDb().prepare('SELECT id FROM members WHERE id=?').get(survivor.id));
  assert.ok(getWorkspace(survivor).posts.find(item => item.id === remaining.id));
  await assert.rejects(deleteAccount(null, { password, confirmation: 'DELETE' }), (error: unknown) => error instanceof AppError && error.status === 401);
});

test('privacy HTTP actions require an active session and deletion clears its cookie', async () => {
  const user = await create('PrivacyHttp');
  const token = createSession(user.id);
  const request = (action: string, cookie?: string, extras = {}) => new NextRequest('http://localhost:3000/api/workspace', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ action, ...extras }) });
  assert.equal((await POST(request('exportData'))).status, 401);
  assert.equal((await POST(request('deleteAccount', undefined, { password, confirmation: 'DELETE' }))).status, 401);
  const cookie = `wv_session=${token}`;
  const exported = await POST(request('exportData', cookie));
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  assert.equal((await exported.json()).account.id, user.id);
  const deleted = await POST(request('deleteAccount', cookie, { password, confirmation: 'DELETE' }));
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).user, null);
  assert.match(deleted.headers.get('set-cookie')!, /Max-Age=0/i);
  assert.equal((await POST(request('exportData', cookie))).status, 401);
});

test('deletion preserves anonymized published editorial history and protects the sole administrator', async () => {
  const previous = process.env.COMMUNITY_DB_PATH;
  process.env.COMMUNITY_DB_PATH = join(directory, 'privacy-admin.db');
  try {
    const admin = await create('PrivacyOnlyAdmin', '18+', 'admin');
    const payload = { ...getCatalog().lessons[0], title: 'История на редакционния материал' };
    const draft = mutateWorkspace(admin, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload }).contentRevisions!.find(row => row.targetId === payload.id)!;
    mutateWorkspace(admin, { action: 'publishContent', revisionId: draft.id, expectedVersion: 0 });
    mutateWorkspace(admin, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload: { ...payload, title: 'Непубликувана лична чернова' } });
    await assert.rejects(deleteAccount(admin, { password, confirmation: 'DELETE' }), (error: unknown) => error instanceof AppError && error.status === 409);
    const otherAdmin = await create('PrivacyNextAdmin', '18+', 'admin');
    await deleteAccount(admin, { password, confirmation: 'DELETE' });
    assert.equal(getCatalog().lessons.find(item => item.id === payload.id)!.title, payload.title);
    assert.equal(getDb().prepare('SELECT actor_id FROM content_revisions WHERE id=?').get(draft.id)!.actor_id, null);
    assert.equal(Number(getDb().prepare("SELECT COUNT(*) AS n FROM content_revisions WHERE status='draft'").get()!.n), 0);
    assert.ok(getDb().prepare('SELECT id FROM members WHERE id=?').get(otherAdmin.id));
  } finally { process.env.COMMUNITY_DB_PATH = previous; }
});

test('newest replies remain visible after the first hundred and metadata states the limit', async () => {
  const member = await create('ManyReplies'); const db = getDb();
  const id = 'many-replies-test';
  db.prepare('INSERT INTO posts(id,member_id,title,body,category,created_at) VALUES(?,?,?,?,?,?)').run(id, member.id, 'Много учебни отговори', worksheet, 'question', '2030-01-01T00:00:00Z');
  for (let i = 0; i < 101; i++) db.prepare('INSERT INTO replies(id,post_id,member_id,body,created_at) VALUES(?,?,?,?,?)').run(`many-${i}`, id, member.id, `Учебен отговор ${i}`, new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString());
  const post = getWorkspace(member).posts.find(item => item.id === id)!;
  assert.equal(post.replyCount, 101); assert.equal(post.hasMoreReplies, true); assert.equal(post.replies.length, 100); assert.equal(post.replies.at(-1)!.id, 'many-100');
});

test('CMS drafts are admin-only, publishing persists, and optimistic publish rejects stale versions', async () => {
  const member = await create('CmsMember'); const admin = await create('CmsAdmin', '18+', 'admin');
  const payload = { ...getCatalog().lessons[0], title: 'Публикуван редакторски урок' };
  assert.throws(() => mutateWorkspace(member, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload }), (e: unknown) => e instanceof AppError && e.status === 403);
  const draft = mutateWorkspace(admin, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload }).contentRevisions!.find(row => row.targetId === payload.id)!;
  assert.notEqual(getWorkspace(member).catalog.lessons[0].title, payload.title);
  assert.equal(getWorkspace(member).editorCatalog, undefined); assert.equal(getWorkspace(null).contentRevisions, undefined);
  mutateWorkspace(admin, { action: 'publishContent', revisionId: draft.id, expectedVersion: 0 });
  closeDb(); assert.equal(getWorkspace(member).catalog.lessons[0].title, payload.title);
  const next = mutateWorkspace(admin, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload: { ...payload, title: 'Следваща редакторска версия' } }).contentRevisions!.find(row => row.targetId === payload.id && row.status === 'draft')!;
  assert.throws(() => mutateWorkspace(admin, { action: 'publishContent', revisionId: next.id, expectedVersion: 0 }), (e: unknown) => e instanceof AppError && e.status === 409);
  mutateWorkspace(admin, { action: 'publishContent', revisionId: next.id, expectedVersion: draft.version });
  assert.throws(() => mutateWorkspace(admin, { action: 'saveContent', kind: 'lesson', targetId: payload.id, payload: { ...payload, resourceLinks: [{ title: 'Unsafe URL', url: 'javascript:alert(1)' }] } }), /HTTPS/);
  assert.equal('answerIndex' in getWorkspace(member).catalog.universeUnits[0].question, false);
  assert.equal(typeof getWorkspace(admin).editorCatalog!.universeUnits[0].question.answerIndex, 'number');
});

test('CMS can add a direction and lesson without code changes; submissions use the published catalog', async () => {
  const admin = await create('NewDirectionAdmin', '18+', 'admin'); const member = await create('NewDirectionMember');
  const path = { ...getCatalog().paths[0], id: 'new-practical-direction', title: 'Ново практическо направление', lessonIds: [] as string[] };
  const save = <T extends { id: string }>(kind: string, payload: T) => mutateWorkspace(admin, { action: 'saveContent', kind, targetId: payload.id, payload }).contentRevisions!.find(row => row.targetId === payload.id && row.status === 'draft')!;
  const pathDraft = save('path', path); mutateWorkspace(admin, { action: 'publishContent', revisionId: pathDraft.id, expectedVersion: 0 });
  const lesson = { ...getCatalog().lessons[0], id: 'new-practical-lesson', pathId: path.id, title: 'Нов приложим урок' };
  const lessonDraft = save('lesson', lesson); mutateWorkspace(admin, { action: 'publishContent', revisionId: lessonDraft.id, expectedVersion: 0 });
  const linked = save('path', { ...path, lessonIds: [lesson.id] }); mutateWorkspace(admin, { action: 'publishContent', revisionId: linked.id, expectedVersion: pathDraft.version });
  const work = mutateWorkspace(member, { action: 'submit', lessonId: lesson.id, text: worksheet });
  assert.equal(work.submissions[0].lessonId, lesson.id);
  assert.ok(getWorkspace(null).catalog.paths.find(item => item.id === path.id)!.lessonIds.includes(lesson.id));
});

test('goals, reflections and per-lesson drafts are owner-only even against administrators', async () => {
  const alice = await create('DevelopmentAlice'); const bob = await create('DevelopmentBob'); const admin = await create('DevelopmentAdmin', '18+', 'admin');
  const goal = { title: 'Моя лична учебна цел', why: 'Искам последователно да уча и прилагам.', nextAction: 'Ще опиша един примерен тестов вход.', obstacle: 'Разсейване', ifThen: 'Ако се разсея, ще запиша първата малка стъпка.', minutes: 5, daysPerWeek: 3, reminderEnabled: true, reminderHour: 18 };
  mutateWorkspace(alice, { action: 'saveGoal', ...goal }); mutateWorkspace(alice, { action: 'markUniverseIntro' });
  const reflection = 'Лична рефлексия, която не е учебно предаване за администратор или общността.';
  mutateWorkspace(alice, { action: 'reflect', unitId: 'attention-and-evidence', text: reflection });
  mutateWorkspace(alice, { action: 'saveDraft', lessonId: 'process-map', text: 'Чернова само за първия урок.' });
  mutateWorkspace(alice, { action: 'saveDraft', lessonId: 'first-prototype', text: 'Отделна чернова за втория урок.' });
  closeDb(); const own = getWorkspace(alice).development;
  assert.equal(own.goal!.title, goal.title); assert.equal(own.introSeen, true); assert.equal(own.drafts.length, 2); assert.equal(own.reflections[0].text, reflection);
  for (const viewer of [bob, admin, null]) { const view = getWorkspace(viewer); assert.equal(view.development.goal, null); assert.equal(view.development.reflections.length, 0); assert.equal(view.development.drafts.length, 0); assert.equal(JSON.stringify(view).includes(reflection), false); }
  assert.throws(() => mutateWorkspace(alice, { action: 'saveDraft', lessonId: 'nonexistent', text: 'No' }), /не съществува/);
  assert.throws(() => mutateWorkspace(alice, { action: 'completeAction', kind: 'lesson', referenceId: 'arbitrary', note: worksheet }), /Неподдържано/);
  const action = { action: 'completeAction', kind: 'practice', referenceId: 'goal-next-action', note: 'Описах реален тестов вход и го проверих ръчно.' };
  mutateWorkspace(alice, action); mutateWorkspace(alice, action);
  assert.equal(getWorkspace(alice).development.dailyActions.filter(item => item.referenceId === 'goal-next-action').length, 1);
  assert.equal(getWorkspace(alice).development.dailyActions.find(item => item.referenceId === 'goal-next-action')!.note, action.note);
  assert.equal(JSON.stringify(getWorkspace(admin).development).includes(action.note), false);
});

test('unlinked lessons are not actionable and published paths with work cannot silently reorder prior progress', async () => {
  const admin = await create('SequenceEditor', '18+', 'admin');
  const member = await create('SequenceLearner');
  const save = <T extends { id: string }>(kind: string, payload: T) => mutateWorkspace(admin, { action: 'saveContent', kind, targetId: payload.id, payload }).contentRevisions!.find(row => row.targetId === payload.id && row.status === 'draft')!;
  const path = { ...getCatalog().paths[0], id: 'sequence-test-path', title: 'Учебен път за последователност', lessonIds: [] as string[] };
  const pathDraft = save('path', path);
  mutateWorkspace(admin, { action: 'publishContent', revisionId: pathDraft.id, expectedVersion: 0 });
  const original = getCatalog().lessons[0];
  const first = { ...original, id: 'sequence-first', pathId: path.id };
  const second = { ...original, id: 'sequence-second', pathId: path.id };
  const addition = { ...original, id: 'sequence-new', pathId: path.id };
  for (const lesson of [first, second, addition]) {
    const draft = save('lesson', lesson);
    mutateWorkspace(admin, { action: 'publishContent', revisionId: draft.id, expectedVersion: 0 });
  }
  assert.throws(() => mutateWorkspace(member, { action: 'submit', lessonId: first.id, text: worksheet }), (e: unknown) => e instanceof AppError && e.status === 409);
  assert.throws(() => mutateWorkspace(member, { action: 'saveDraft', lessonId: first.id, text: 'Private draft' }), (e: unknown) => e instanceof AppError && e.status === 409);
  const linked = save('path', { ...path, lessonIds: [first.id, second.id] });
  mutateWorkspace(admin, { action: 'publishContent', revisionId: linked.id, expectedVersion: pathDraft.version });
  mutateWorkspace(member, { action: 'submit', lessonId: first.id, text: worksheet });
  mutateWorkspace(member, { action: 'complete', lessonId: first.id });
  for (const ids of [[second.id, first.id], [second.id], [first.id, addition.id, second.id]]) {
    const changed = save('path', { ...path, lessonIds: ids });
    assert.throws(() => mutateWorkspace(admin, { action: 'publishContent', revisionId: changed.id, expectedVersion: linked.version }), (e: unknown) => e instanceof AppError && e.status === 409);
  }
  const appended = save('path', { ...path, lessonIds: [first.id, second.id, addition.id] });
  mutateWorkspace(admin, { action: 'publishContent', revisionId: appended.id, expectedVersion: linked.version });
  assert.ok(getWorkspace(member).completedLessonIds.includes(first.id));
});

test('draft autosave has its own rate budget and cannot exhaust task writes', async () => {
  const member = await create('DraftBudget');
  for (let index = 0; index < 90; index++) mutateWorkspace(member, { action: 'saveDraft', lessonId: 'process-map', text: `Draft ${index}` });
  const result = mutateWorkspace(member, { action: 'submit', lessonId: 'process-map', text: worksheet });
  assert.equal(result.submissions[0].lessonId, 'process-map');
  assert.equal(result.development.drafts.length, 0);
});

test('quizzes are scored on the server, repetitions do not farm progress and due reviews follow 1/3/7 days', async () => {
  const member = await create('QuizMember'); const unit = getCatalog().universeUnits[0];
  let result = mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: (unit.question.answerIndex + 1) % unit.question.options.length });
  assert.equal(result.development.quizFeedback!.correct, false); assert.equal(result.development.unitProgress.length, 0);
  result = mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: unit.question.answerIndex });
  assert.equal(result.development.quizFeedback!.correct, true); assert.equal(result.development.unitProgress[0].reviewCount, 0);
  const firstDue = result.development.unitProgress[0].reviewDueAt;
  assert.ok(Date.parse(firstDue) - Date.now() > 23 * 3600000);
  mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: unit.question.answerIndex });
  assert.equal(getWorkspace(member).development.dailyActions.length, 1); assert.equal(getWorkspace(member).development.unitProgress[0].reviewDueAt, firstDue);
  getDb().prepare('UPDATE unit_progress SET review_due_at=? WHERE member_id=?').run('2020-01-01T00:00:00Z', member.id);
  result = mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: unit.question.answerIndex });
  assert.equal(result.development.unitProgress[0].reviewCount, 1); assert.ok(Date.parse(result.development.unitProgress[0].reviewDueAt) - Date.now() > 71 * 3600000);
  getDb().prepare('UPDATE unit_progress SET review_due_at=? WHERE member_id=?').run('2020-01-01T00:00:00Z', member.id);
  result = mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: unit.question.answerIndex });
  assert.equal(result.development.unitProgress[0].reviewCount, 2); assert.ok(Date.parse(result.development.unitProgress[0].reviewDueAt) - Date.now() > 167 * 3600000);
  assert.equal(localDay(new Date('2026-10-26T22:30:00Z')), '2026-10-27');
  assert.throws(() => mutateWorkspace(member, { action: 'answerUnit', unitId: unit.id, answerIndex: 999 }), /валиден отговор/);
});

test('optional adult practice requires explicit consent and cannot be completed by minors', async () => {
  const adult = await create('PracticeAdult'); const minor = await create('PracticeMinor', '14-17');
  assert.throws(() => mutateWorkspace(minor, { action: 'recordPractice', unitId: 'attention-to-action', consent: true }), (error: unknown) => error instanceof AppError && error.status === 403);
  assert.throws(() => mutateWorkspace(adult, { action: 'recordPractice', unitId: 'attention-to-action', consent: false }), /съгласие/);
  mutateWorkspace(adult, { action: 'recordPractice', unitId: 'attention-to-action', consent: true });
  mutateWorkspace(adult, { action: 'recordPractice', unitId: 'attention-to-action', consent: true });
  assert.equal(getWorkspace(adult).development.dailyActions.length, 1);
  assert.equal(getWorkspace(minor).development.dailyActions.length, 0);
});
