import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

async function main() {
  const source = resolve(process.env.COMMUNITY_DB_PATH || '.data/community.db');
  if (!existsSync(source)) throw new Error('Source database does not exist. No backup or migration was performed.');
  const destination = resolve(process.env.BACKUP_PATH || `.data/backups/community-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  if (source === destination || existsSync(destination)) throw new Error('Backup target must be a new file different from the source.');
  mkdirSync(dirname(destination), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
    console.log(`Verified backup: ${destination}`);
  } finally { copy.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup failed.'); process.exitCode = 1; });
