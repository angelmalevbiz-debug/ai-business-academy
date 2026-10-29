import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { getDb } from './db';
import type { AgeBand, Member, Profile } from './domain';

export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const SESSION_COOKIE = 'wv_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(32).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected || expected.length !== 128) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function textField(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new AppError(`${name}: въведи между ${min} и ${max} знака.`);
  }
  return value.trim();
}
export function emailField(value: unknown) {
  const email = textField(value, 'Имейл', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Въведи валиден имейл адрес.');
  return email;
}
export function ageField(value: unknown): AgeBand {
  if (value !== '14-17' && value !== '18+') throw new AppError('Избери възрастова група. Регистрацията е за хора на 14 или повече години.');
  return value;
}
export function publicMember(row: Record<string, unknown>): Member {
  return { id: row.id as string, name: row.name as string, email: row.email as string, role: row.role as Member['role'], ageBand: row.age_band as AgeBand, profile: row.profile ? JSON.parse(row.profile as string) as Profile : null };
}
export function memberById(id: string) {
  const row = getDb().prepare('SELECT * FROM members WHERE id = ?').get(id);
  return row ? publicMember(row) : null;
}
export function sessionMember(token?: string | null) {
  if (!token || token.length !== 64) return null;
  const row = getDb().prepare('SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now());
  return row ? publicMember(row) : null;
}
export function createSession(memberId: string) {
  const token = randomBytes(32).toString('hex');
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash,member_id,expires_at) VALUES (?,?,?)').run(digest(token), memberId, Date.now() + SESSION_SECONDS * 1000);
  return token;
}
export function revokeSession(token: string) { getDb().prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); }
export function rateLimit(key: string, limit: number, windowMs = 15 * 60 * 1000) {
  const db = getDb();
  const now = Date.now();
  db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').run(now);
  const hashed = digest(key);
  const row = db.prepare('SELECT count,expires_at FROM rate_limits WHERE key=?').get(hashed);
  if (row && Number(row.count) >= limit) {
    const minutes = Math.max(1, Math.ceil((Number(row.expires_at) - now) / 60000));
    throw new AppError(`Твърде много опити. Опитай отново след ${minutes} ${minutes === 1 ? 'минута' : 'минути'}.`, 429);
  }
  db.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(hashed, now + windowMs);
}
export async function createMember(input: { name: unknown; email: unknown; password: unknown; ageBand: unknown }, role: 'member' | 'admin' = 'member') {
  const name = textField(input.name, 'Име', 2, 80);
  const email = emailField(input.email);
  const password = textField(input.password, 'Парола', 12, 256);
  const ageBand = ageField(input.ageBand);
  if (role === 'admin' && ageBand !== '18+') throw new AppError('Администраторът трябва да е пълнолетен.');
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  try { getDb().prepare('INSERT INTO members (id,name,email,password_hash,role,age_band) VALUES (?,?,?,?,?,?)').run(id, name, email, passwordHash, role, ageBand); }
  catch (error) {
    if (String(error).includes('UNIQUE constraint')) throw new AppError('С този имейл вече има профил. Влез в него.');
    throw error;
  }
  return memberById(id)!;
}
export async function authenticate(emailInput: unknown, passwordInput: unknown) {
  const email = emailField(emailInput);
  const password = textField(passwordInput, 'Парола', 1, 256);
  rateLimit(`login:${email}`, 8);
  const row = getDb().prepare('SELECT * FROM members WHERE email=?').get(email);
  // The same KDF cost is paid for unknown accounts to reduce account-enumeration timing differences.
  const fallback = `${'0'.repeat(64)}:${'0'.repeat(128)}`;
  const valid = await verifyPassword(password, row ? row.password_hash as string : fallback);
  if (!row || !valid) throw new AppError('Имейлът или паролата не съвпадат. Провери ги и опитай отново.', 401);
  return publicMember(row);
}
