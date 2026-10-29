import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const connections = new Map<string, DatabaseSync>();
export const SCHEMA_VERSION = 12;

export function getDb() {
  if (typeof window !== 'undefined') throw new Error('Database access is server-only.');
  const location = process.env.COMMUNITY_DB_PATH || resolve(process.cwd(), '.data', 'community.db');
  let db = connections.get(location);
  if (db) return db;
  if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true });
  db = new DatabaseSync(location, { timeout: 5000 });
  const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if (version > SCHEMA_VERSION) { db.close(); throw new Error(`Database schema ${version} is newer than supported ${SCHEMA_VERSION}. No migration performed.`); }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
      age_band TEXT NOT NULL CHECK(age_band IN ('14-17','18+')), profile TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_member ON sessions(member_id);
    CREATE TABLE IF NOT EXISTS progress (
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL, completed_at TEXT NOT NULL,
      PRIMARY KEY(member_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL, text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','needs_changes')),
      feedback TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      UNIQUE(member_id,lesson_id)
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('question','progress','resource')),
      created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      path_id TEXT NOT NULL, PRIMARY KEY(member_id,path_id)
    );
    CREATE TABLE IF NOT EXISTS tool_requests (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      problem TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
      action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL
    );
  `);
  if (version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('PRAGMA table_info(submissions)').all().some(row => row.name === 'revision')) db.exec('ALTER TABLE submissions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
      db.exec(`
        CREATE TABLE IF NOT EXISTS content_revisions (
          id TEXT PRIMARY KEY,kind TEXT NOT NULL,target_id TEXT NOT NULL,version INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('draft','published')),title TEXT NOT NULL,payload TEXT NOT NULL,
          actor_id TEXT REFERENCES members(id) ON DELETE SET NULL,created_at TEXT NOT NULL,
          UNIQUE(kind,target_id,version)
        );
        CREATE TABLE IF NOT EXISTS submission_revisions (
          submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,revision INTEGER NOT NULL,
          text TEXT NOT NULL,status TEXT NOT NULL,feedback TEXT NOT NULL,created_at TEXT NOT NULL,
          PRIMARY KEY(submission_id,revision)
        );
        INSERT OR IGNORE INTO submission_revisions SELECT id,revision,text,status,feedback,created_at FROM submissions;
        CREATE TABLE IF NOT EXISTS review_history (
          id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,status TEXT NOT NULL,feedback TEXT NOT NULL,
          actor_id TEXT REFERENCES members(id) ON DELETE SET NULL,created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS development_settings (
          member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,goal TEXT,intro_seen INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS unit_progress (
          member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,unit_id TEXT NOT NULL,
          completed_at TEXT NOT NULL,review_due_at TEXT NOT NULL,review_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(member_id,unit_id)
        );
        CREATE TABLE IF NOT EXISTS reflections (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          unit_id TEXT NOT NULL,text TEXT NOT NULL,created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS daily_actions (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,reference_id TEXT NOT NULL,day TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,
          UNIQUE(member_id,kind,reference_id,day)
        );
        CREATE TABLE IF NOT EXISTS lesson_drafts (
          member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,lesson_id TEXT NOT NULL,
          text TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(member_id,lesson_id)
        );
        CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at);
        CREATE INDEX IF NOT EXISTS replies_post_created ON replies(post_id,created_at);
        CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);
        CREATE INDEX IF NOT EXISTS audit_member_created ON audit_events(member_id,created_at);
        CREATE INDEX IF NOT EXISTS reflections_member ON reflections(member_id,created_at);
        CREATE INDEX IF NOT EXISTS actions_member_day ON daily_actions(member_id,day);
        PRAGMA user_version = 2;
      `);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_brains (
          member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
          id TEXT NOT NULL UNIQUE,version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflow_brain_versions (
          member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,version INTEGER NOT NULL,
          payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(member_id,version)
        );
        CREATE TABLE IF NOT EXISTS workflow_projects (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          template_id TEXT NOT NULL,title TEXT NOT NULL,brief TEXT NOT NULL,request_id TEXT NOT NULL,
          request_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
          UNIQUE(member_id,request_id),UNIQUE(id,member_id)
        );
        CREATE TABLE IF NOT EXISTS workflow_runs (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,template_id TEXT NOT NULL,status TEXT NOT NULL,
          current_step INTEGER NOT NULL,total_steps INTEGER NOT NULL,brain_version INTEGER NOT NULL,
          brain_snapshot TEXT NOT NULL,error TEXT,lease_token TEXT,lease_expires_at INTEGER,
          created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(id,member_id),
          FOREIGN KEY(project_id,member_id) REFERENCES workflow_projects(id,member_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workflow_artifacts (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,run_id TEXT NOT NULL,step_index INTEGER NOT NULL,role TEXT NOT NULL,
          title TEXT NOT NULL,content TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,
          feedback TEXT NOT NULL,provenance TEXT NOT NULL,provider TEXT,model TEXT,source_id TEXT,
          created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(run_id,step_index),
          FOREIGN KEY(project_id,member_id) REFERENCES workflow_projects(id,member_id) ON DELETE CASCADE,
          FOREIGN KEY(run_id,member_id) REFERENCES workflow_runs(id,member_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workflow_artifact_revisions (
          artifact_id TEXT NOT NULL REFERENCES workflow_artifacts(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,
          PRIMARY KEY(artifact_id,revision)
        );
        CREATE TABLE IF NOT EXISTS workflow_events (
          id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,run_id TEXT,kind TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,
          FOREIGN KEY(project_id,member_id) REFERENCES workflow_projects(id,member_id) ON DELETE CASCADE,
          FOREIGN KEY(run_id,member_id) REFERENCES workflow_runs(id,member_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS workflow_step_requests (
          member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,request_id TEXT NOT NULL,
          run_id TEXT NOT NULL,step_index INTEGER NOT NULL,created_at TEXT NOT NULL,
          PRIMARY KEY(member_id,request_id),
          FOREIGN KEY(run_id,member_id) REFERENCES workflow_runs(id,member_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS workflow_projects_owner ON workflow_projects(member_id,updated_at);
        CREATE INDEX IF NOT EXISTS workflow_runs_owner ON workflow_runs(member_id,updated_at);
        CREATE INDEX IF NOT EXISTS workflow_artifacts_owner ON workflow_artifacts(member_id,updated_at);
        CREATE INDEX IF NOT EXISTS workflow_events_owner ON workflow_events(member_id,created_at);
        PRAGMA user_version = 3;
      `);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if(version<4){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_bundle_approvals (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL,manifest TEXT NOT NULL,manifest_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,revoked_at TEXT,
        FOREIGN KEY(run_id,member_id) REFERENCES workflow_runs(id,member_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS workflow_auto_runs (
        run_id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('queued','running','paused','completed','failed')),
        error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        FOREIGN KEY(run_id,member_id) REFERENCES workflow_runs(id,member_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS workflow_auto_status ON workflow_auto_runs(status,updated_at);
      CREATE INDEX IF NOT EXISTS workflow_bundle_owner ON workflow_bundle_approvals(member_id,created_at);
      PRAGMA user_version=4;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<5){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`
      ALTER TABLE workflow_projects ADD COLUMN recipe_id TEXT;
      CREATE VIRTUAL TABLE workflow_memory_index USING fts5(member_id UNINDEXED,kind UNINDEXED,source_id UNINDEXED,title,body,revision UNINDEXED,updated_at UNINDEXED,project_id UNINDEXED,tokenize='unicode61');
      INSERT INTO workflow_memory_index(member_id,kind,source_id,title,body,revision,updated_at,project_id)
        SELECT member_id,'artifact',id,title,content,revision,updated_at,project_id FROM workflow_artifacts WHERE status!='rejected';
      INSERT INTO workflow_memory_index(member_id,kind,source_id,title,body,revision,updated_at,project_id)
        SELECT member_id,'brain',id,json_extract(payload,'$.name'),json_extract(payload,'$.audience')||char(10)||json_extract(payload,'$.voice')||char(10)||json_extract(payload,'$.offer')||char(10)||json_extract(payload,'$.notes')||char(10)||json_extract(payload,'$.guardrails'),version,updated_at,NULL FROM workflow_brains;
      CREATE TRIGGER workflow_memory_artifact_insert AFTER INSERT ON workflow_artifacts WHEN NEW.status!='rejected' BEGIN
        INSERT INTO workflow_memory_index VALUES(NEW.member_id,'artifact',NEW.id,NEW.title,NEW.content,NEW.revision,NEW.updated_at,NEW.project_id);
      END;
      CREATE TRIGGER workflow_memory_artifact_update AFTER UPDATE ON workflow_artifacts BEGIN
        DELETE FROM workflow_memory_index WHERE source_id=OLD.id AND member_id=OLD.member_id AND kind='artifact';
        INSERT INTO workflow_memory_index SELECT NEW.member_id,'artifact',NEW.id,NEW.title,NEW.content,NEW.revision,NEW.updated_at,NEW.project_id WHERE NEW.status!='rejected';
      END;
      CREATE TRIGGER workflow_memory_artifact_delete AFTER DELETE ON workflow_artifacts BEGIN DELETE FROM workflow_memory_index WHERE source_id=OLD.id AND member_id=OLD.member_id AND kind='artifact'; END;
      CREATE TRIGGER workflow_memory_brain_insert AFTER INSERT ON workflow_brains BEGIN
        INSERT INTO workflow_memory_index VALUES(NEW.member_id,'brain',NEW.id,json_extract(NEW.payload,'$.name'),json_extract(NEW.payload,'$.audience')||char(10)||json_extract(NEW.payload,'$.voice')||char(10)||json_extract(NEW.payload,'$.offer')||char(10)||json_extract(NEW.payload,'$.notes')||char(10)||json_extract(NEW.payload,'$.guardrails'),NEW.version,NEW.updated_at,NULL);
      END;
      CREATE TRIGGER workflow_memory_brain_update AFTER UPDATE ON workflow_brains BEGIN
        DELETE FROM workflow_memory_index WHERE source_id=OLD.id AND member_id=OLD.member_id AND kind='brain';
        INSERT INTO workflow_memory_index VALUES(NEW.member_id,'brain',NEW.id,json_extract(NEW.payload,'$.name'),json_extract(NEW.payload,'$.audience')||char(10)||json_extract(NEW.payload,'$.voice')||char(10)||json_extract(NEW.payload,'$.offer')||char(10)||json_extract(NEW.payload,'$.notes')||char(10)||json_extract(NEW.payload,'$.guardrails'),NEW.version,NEW.updated_at,NULL);
      END;
      CREATE TRIGGER workflow_memory_brain_delete AFTER DELETE ON workflow_brains BEGIN DELETE FROM workflow_memory_index WHERE source_id=OLD.id AND member_id=OLD.member_id AND kind='brain'; END;
      PRAGMA user_version=5;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<6){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`
      CREATE TABLE workflow_plan_items (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,day TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('film','review')),
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done')),version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id,member_id) REFERENCES workflow_projects(id,member_id) ON DELETE CASCADE,
        UNIQUE(member_id,project_id,day,phase)
      );
      CREATE INDEX workflow_plan_owner_day ON workflow_plan_items(member_id,day);
      PRAGMA user_version=6;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<7){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`
      CREATE TABLE workflow_media_assets (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,
        duration REAL NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,UNIQUE(id,member_id)
      );
      CREATE TABLE workflow_media_jobs (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed','cancelled')),
        progress INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,parameters TEXT NOT NULL,
        output_key TEXT,output_bytes INTEGER,output_sha256 TEXT,output_width INTEGER,output_height INTEGER,
        output_duration REAL,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_expires INTEGER,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        FOREIGN KEY(asset_id,member_id) REFERENCES workflow_media_assets(id,member_id) ON DELETE CASCADE,
        UNIQUE(member_id,request_id)
      );
      CREATE INDEX workflow_media_owner ON workflow_media_assets(member_id,created_at);
      CREATE INDEX workflow_media_queue ON workflow_media_jobs(status,created_at);
      CREATE TABLE workflow_media_purge (member_key TEXT PRIMARY KEY,created_at TEXT NOT NULL);
      PRAGMA user_version=7;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<8){
    db.exec('BEGIN IMMEDIATE');try{db.exec(`
      CREATE TABLE workflow_company_plans (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,objective TEXT NOT NULL,summary TEXT NOT NULL,tasks TEXT NOT NULL,
        brain_version INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('proposed','dispatching','active','failed','rejected')),
        version INTEGER NOT NULL DEFAULT 1,provider TEXT NOT NULL,model TEXT NOT NULL,error TEXT,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(member_id,request_id)
      );
      PRAGMA user_version=8;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<9){
    db.exec('BEGIN IMMEDIATE');try{db.exec(`
      CREATE TABLE workflow_company_schedules (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES workflow_company_plans(id) ON DELETE CASCADE,
        interval_hours INTEGER NOT NULL CHECK(interval_hours IN (24,168)),enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        status TEXT NOT NULL CHECK(status IN ('scheduled','waiting','paused')),version INTEGER NOT NULL DEFAULT 1,
        brain_version INTEGER NOT NULL,brain_snapshot TEXT NOT NULL,task_specs TEXT NOT NULL,
        next_run_at TEXT NOT NULL,last_run_at TEXT,last_cycle_id TEXT,cycle_count INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL,last_checked_ms INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        UNIQUE(member_id,plan_id)
      );
      CREATE INDEX workflow_company_schedule_due ON workflow_company_schedules(enabled,next_run_at,last_checked_ms);
      CREATE TABLE workflow_company_cycles (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        schedule_id TEXT NOT NULL REFERENCES workflow_company_schedules(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,tasks TEXT NOT NULL,brain_version INTEGER NOT NULL,created_at TEXT NOT NULL,
        UNIQUE(schedule_id,due_at)
      );
      PRAGMA user_version=9;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<10){
    db.exec('BEGIN IMMEDIATE');try{db.exec(`
      CREATE TABLE workflow_positioning_products (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('product','service','software')),
        payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        UNIQUE(member_id,request_id)
      );
      CREATE TABLE workflow_positioning_strategies (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES workflow_positioning_products(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,product_version INTEGER NOT NULL,brain_version INTEGER NOT NULL,
        product_snapshot TEXT NOT NULL,payload TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,
        claim_review_required INTEGER NOT NULL CHECK(claim_review_required IN (0,1)),created_at TEXT NOT NULL,
        UNIQUE(member_id,request_id)
      );
      CREATE INDEX workflow_positioning_owner_product ON workflow_positioning_strategies(member_id,product_id,created_at);
      CREATE TABLE workflow_positioning_materials (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        strategy_id TEXT NOT NULL REFERENCES workflow_positioning_strategies(id) ON DELETE CASCADE,
        angle_id TEXT NOT NULL,format TEXT NOT NULL CHECK(format IN ('ad','video','email')),
        content TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(member_id,strategy_id,angle_id,format)
      );
      PRAGMA user_version=10;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<11){
    db.exec('BEGIN IMMEDIATE');try{db.exec(`
      CREATE TABLE website_projects (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        name TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
        generation_lease TEXT,generation_until INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE INDEX website_owner ON website_projects(member_id,updated_at);
      CREATE TABLE website_assets (
        id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,
        width INTEGER NOT NULL,height INTEGER NOT NULL,created_at TEXT NOT NULL
      );
      CREATE INDEX website_assets_owner ON website_assets(member_id,created_at);
      CREATE TABLE website_asset_purge(storage_key TEXT PRIMARY KEY,created_at TEXT NOT NULL);
      PRAGMA user_version=11;
    `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<12){db.exec('BEGIN IMMEDIATE');try{db.exec(`
    CREATE TABLE website_build_backups (
      site_id TEXT NOT NULL REFERENCES website_projects(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(site_id,revision)
    );
    CREATE INDEX website_backups_owner ON website_build_backups(member_id,site_id);
    PRAGMA user_version=12;
  `);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}}
  db.prepare('INSERT OR IGNORE INTO posts (id,title,body,category,created_at) VALUES (?,?,?,?,?)').run(
    'editorial-welcome', 'Започни с един малък, реален проблем',
    'Това е пространство за работа и обратна връзка. Избери учебен път, изпълни първата задача и сподели какво те затруднява. Работи с измислени или анонимизирани данни. Публикацията е редакционен материал на екипа, а не история на участник.',
    'resource', '2026-10-26T08:00:00.000Z',
  );
  db.prepare('INSERT OR IGNORE INTO posts (id,title,body,category,created_at) VALUES (?,?,?,?,?)').run(
    'editorial-feedback', 'Как да поискаш полезна обратна връзка',
    'Покажи целта, какво опита, какъв резултат очакваше и какво получи. Добави конкретен въпрос. Не публикувай API ключове, пароли, клиентски имена или имейли. Това е редакционен шаблон, който можеш да използваш за собствен въпрос.',
    'resource', '2026-10-26T08:05:00.000Z',
  );
  connections.set(location, db);
  return db;
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function closeDb() {
  for (const db of connections.values()) db.close();
  connections.clear();
}
