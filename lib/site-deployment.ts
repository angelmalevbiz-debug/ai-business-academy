import { randomUUID } from 'node:crypto';
import { AppError, digest, rateLimit } from './auth';
import type { Member } from './domain';
import { connectionsDb, providerJson, siteProviderGrant, SiteProviderRejection } from './site-connections';
import { getWebsite, exportWebsiteHtml } from './website-store';

export type SiteDeployment = { id: string; siteId: string; revision: number; status: 'queued' | 'building' | 'ready' | 'error' | 'unknown'; url: string | null; error: string | null; createdAt: string };
function db() {
  const connection = connectionsDb();
  connection.exec(`CREATE TABLE IF NOT EXISTS site_deployments (id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,site_id TEXT NOT NULL REFERENCES website_projects(id) ON DELETE CASCADE,revision INTEGER NOT NULL,content_hash TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT,url TEXT,error TEXT,created_at TEXT NOT NULL,UNIQUE(member_id,site_id,revision));`);
  return connection;
}
function asDeployment(row: Record<string, unknown>): SiteDeployment { return { id: String(row.id), siteId: String(row.site_id), revision: Number(row.revision), status: row.status as SiteDeployment['status'], url: row.url ? String(row.url) : null, error: row.error ? String(row.error) : null, createdAt: String(row.created_at) }; }
export function deploymentState(value: unknown): SiteDeployment['status'] {
  return value === 'READY' ? 'ready' : value === 'ERROR' || value === 'CANCELED' ? 'error' : value === 'BUILDING' || value === 'INITIALIZING' ? 'building' : value === 'QUEUED' ? 'queued' : 'unknown';
}
function deploymentUrl(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]+\.vercel\.app$/.test(value)) return null;
  return `https://${value}`;
}
export async function createSiteDeployment(user: Member | null, input: Record<string, unknown>) {
  if (!user) throw new AppError('Влез в профила си.', 401);
  if (input.confirmPublish !== true) throw new AppError('Потвърди публикуването на сайта.');
  const grant = await siteProviderGrant(user, 'vercel');
  const site = getWebsite(user, input.siteId);
  if (!Number.isInteger(input.revision) || site.revision !== input.revision) throw new AppError('Сайтът е променен. Прегледай новата версия преди публикуване.', 409);
  const connection = db();
  const existing = connection.prepare('SELECT * FROM site_deployments WHERE member_id=? AND site_id=? AND revision=?').get(user.id, site.id, site.revision);
  if (existing && existing.status !== 'error') return asDeployment(existing);
  rateLimit(`site-deploy:${user.id}`, 10, 60 * 60 * 1000);
  const html = exportWebsiteHtml(user, site.id);
  if (Buffer.byteLength(html) > 4500000) throw new AppError('Снимките са прекалено големи за директно публикуване. Намали ги или изтегли сайта.', 413);
  const id = existing ? String(existing.id) : randomUUID(); const createdAt = new Date().toISOString();
  if (existing) connection.prepare('UPDATE site_deployments SET status=?,provider_id=NULL,url=NULL,error=NULL,created_at=? WHERE id=? AND member_id=?').run('unknown', createdAt, id, user.id);
  else connection.prepare('INSERT INTO site_deployments(id,member_id,site_id,revision,content_hash,status,created_at) VALUES(?,?,?,?,?,?,?)').run(id, user.id, site.id, site.revision, digest(html), 'unknown', createdAt);
  try {
    const query = grant.teamId ? `?teamId=${encodeURIComponent(grant.teamId)}` : '';
    const result = await providerJson(`https://api.vercel.com/v13/deployments${query}`, { method: 'POST', headers: { Authorization: `Bearer ${grant.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `academy-site-${site.id.replace(/[^a-z0-9]/gi, '').slice(0, 24).toLowerCase()}`, target: 'production', projectSettings: { framework: null }, files: [{ file: 'index.html', data: Buffer.from(html).toString('base64'), encoding: 'base64' }, { file: 'vercel.json', data: Buffer.from(JSON.stringify({ version: 2, cleanUrls: true })).toString('base64'), encoding: 'base64' }], meta: { academySiteId: site.id, academyRevision: String(site.revision), academyRequestId: id } }) });
    if (typeof result.id !== 'string' || !/^dpl_[a-zA-Z0-9]+$/.test(result.id)) throw new AppError('Vercel не върна номер на публикуването.', 502);
    connection.prepare('UPDATE site_deployments SET status=?,provider_id=?,url=?,error=? WHERE id=? AND member_id=?').run(deploymentState(result.readyState || result.status), result.id, deploymentUrl(result.url), result.readyState === 'ERROR' ? 'Vercel не успя да публикува сайта. Провери проекта във Vercel.' : null, id, user.id);
  } catch (error) {
    // The provider may have accepted the request before the connection was lost.
    // Never retry automatically or report an uncertain request as published.
    connection.prepare('UPDATE site_deployments SET status=?,error=? WHERE id=? AND member_id=?').run(error instanceof SiteProviderRejection ? 'error' : 'unknown', error instanceof AppError ? error.message : 'Няма потвърждение от Vercel. Провери проекта там преди нов опит.', id, user.id);
  }
  return asDeployment(connection.prepare('SELECT * FROM site_deployments WHERE id=? AND member_id=?').get(id, user.id)!);
}
export async function listSiteDeployments(user: Member | null, siteId: unknown) {
  if (!user) throw new AppError('Влез в профила си.', 401);
  const site = getWebsite(user, siteId);
  const connection = db();
  const rows = connection.prepare('SELECT * FROM site_deployments WHERE member_id=? AND site_id=? ORDER BY created_at DESC LIMIT 20').all(user.id, site.id);
  const active = rows.filter(row => row.provider_id && !['ready', 'error'].includes(String(row.status)));
  if (active.length) {
    const grant = await siteProviderGrant(user, 'vercel');
    for (const row of active.slice(0, 3)) {
      try {
        const query = grant.teamId ? `?teamId=${encodeURIComponent(grant.teamId)}` : '';
        const result = await providerJson(`https://api.vercel.com/v13/deployments/${encodeURIComponent(String(row.provider_id))}${query}`, { headers: { Authorization: `Bearer ${grant.accessToken}` } });
        if (result.id !== row.provider_id) continue;
        row.status = deploymentState(result.readyState || result.status); row.url = deploymentUrl(result.url);
        row.error = row.status === 'error' ? 'Vercel не успя да публикува сайта. Провери проекта във Vercel.' : null;
        connection.prepare('UPDATE site_deployments SET status=?,url=?,error=? WHERE id=? AND member_id=?').run(row.status as string, row.url as string | null, row.error as string | null, String(row.id), user.id);
      } catch { /* Retain the last confirmed provider state. */ }
    }
  }
  return rows.map(asDeployment);
}
