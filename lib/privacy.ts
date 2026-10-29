import { AppError, rateLimit, textField, verifyPassword } from './auth';
import { getDb, transaction } from './db';
import { getWorkspace } from './workspace';
import type { Member } from './domain';
import {markWorkflowMediaForDeletion,cleanWorkflowMediaDeletions,readWorkflowMediaExport} from './workflow-media';
import {getPositioningState} from './workflow-positioning';
import {cleanWebsiteAssetDeletions,markWebsiteAssetsForDeletion,readWebsiteAccountData} from './website-store';
import {hasRecentGoogleSessionAuthentication,readSiteConnectionAccountData} from './site-connections';

function requireMember(user: Member | null): Member {
  if (!user) throw new AppError('Влез в профила си, за да управляваш данните си.', 401);
  return user;
}

/** Export only the current member's data, never the admin workspace/other members' work. */
export function exportAccountData(current: Member | null) {
  const user = requireMember(current);
  rateLimit(`export:${user.id}`, 5, 60 * 60 * 1000);
  return transaction(() => {
    const db = getDb();
    const member = db.prepare('SELECT id,name,email,role,age_band,profile,created_at FROM members WHERE id=?').get(user.id);
    if (!member) throw new AppError('Профилът вече не е достъпен. Влез отново.', 401);
    // A member-scoped view prevents an administrator exporting the review queue.
    const own = getWorkspace({ ...user, role: 'member' });
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      account: { id: member.id, name: member.name, email: member.email, role: member.role, ageBand: member.age_band, profile: member.profile ? JSON.parse(member.profile as string) : null, createdAt: member.created_at },
      websites: readWebsiteAccountData(user),
      connectedServices: readSiteConnectionAccountData(user),
      learning: {
        completedLessons: db.prepare('SELECT lesson_id,completed_at FROM progress WHERE member_id=? ORDER BY completed_at').all(user.id),
        submissions: own.submissions,
        bookmarkedPathIds: own.bookmarkedPathIds,
        toolRequests: db.prepare('SELECT id,problem,created_at FROM tool_requests WHERE member_id=? ORDER BY created_at').all(user.id),
      },
      development: {
        settings: db.prepare('SELECT goal,intro_seen FROM development_settings WHERE member_id=?').all(user.id).map(row => ({ goal: row.goal ? JSON.parse(row.goal as string) : null, introSeen: Boolean(row.intro_seen) })),
        unitProgress: db.prepare('SELECT unit_id,completed_at,review_due_at,review_count FROM unit_progress WHERE member_id=? ORDER BY completed_at').all(user.id),
        reflections: db.prepare('SELECT id,unit_id,text,created_at FROM reflections WHERE member_id=? ORDER BY created_at').all(user.id),
        dailyActions: db.prepare('SELECT id,kind,reference_id,day,note,created_at FROM daily_actions WHERE member_id=? ORDER BY created_at').all(user.id),
        drafts: db.prepare('SELECT lesson_id,text,updated_at FROM lesson_drafts WHERE member_id=? ORDER BY updated_at').all(user.id),
      },
      community: {
        posts: db.prepare('SELECT id,title,body,category,created_at,hidden FROM posts WHERE member_id=? ORDER BY created_at').all(user.id),
        replies: db.prepare('SELECT id,post_id,body,created_at,hidden FROM replies WHERE member_id=? ORDER BY created_at').all(user.id),
      },
      editorial: {
        contentRevisions: db.prepare('SELECT id,kind,target_id,version,status,title,payload,created_at FROM content_revisions WHERE actor_id=? ORDER BY created_at').all(user.id).map(row => ({ ...row, payload: JSON.parse(row.payload as string) })),
        authoredReviews: db.prepare('SELECT id,submission_id,revision,status,feedback,created_at FROM review_history WHERE actor_id=? ORDER BY created_at').all(user.id),
      },
      workflow: {
        companyPlans:db.prepare('SELECT id,objective,summary,tasks,brain_version,status,version,provider,model,error,created_at,updated_at FROM workflow_company_plans WHERE member_id=? ORDER BY created_at').all(user.id).map(row=>({...row,tasks:JSON.parse(String(row.tasks))})),
        companySchedules:db.prepare('SELECT id,plan_id,interval_hours,enabled,status,version,brain_version,brain_snapshot,task_specs,next_run_at,last_run_at,last_cycle_id,cycle_count,message,created_at,updated_at FROM workflow_company_schedules WHERE member_id=? ORDER BY created_at').all(user.id).map(row=>({...row,brain_snapshot:JSON.parse(String(row.brain_snapshot)),task_specs:JSON.parse(String(row.task_specs))})),
        companyCycles:db.prepare('SELECT id,schedule_id,due_at,tasks,brain_version,created_at FROM workflow_company_cycles WHERE member_id=? ORDER BY created_at').all(user.id).map(row=>({...row,tasks:JSON.parse(String(row.tasks))})),
        media:readWorkflowMediaExport(user.id),
        positioning:getPositioningState(user),
        brain: db.prepare('SELECT payload FROM workflow_brains WHERE member_id=?').all(user.id).map(row=>JSON.parse(String(row.payload))),
        brainVersions: db.prepare('SELECT version,payload,created_at FROM workflow_brain_versions WHERE member_id=? ORDER BY version').all(user.id).map(row=>({...row,payload:JSON.parse(String(row.payload))})),
        projects: db.prepare('SELECT id,template_id,recipe_id,title,brief,created_at,updated_at FROM workflow_projects WHERE member_id=? ORDER BY created_at').all(user.id),
        runs: db.prepare('SELECT id,project_id,template_id,status,current_step,total_steps,brain_version,brain_snapshot,error,created_at,updated_at FROM workflow_runs WHERE member_id=? ORDER BY created_at').all(user.id).map(row=>({...row,brain_snapshot:JSON.parse(String(row.brain_snapshot))})),
        artifacts: db.prepare('SELECT id,project_id,run_id,step_index,role,title,content,revision,status,feedback,provenance,provider,model,source_id,created_at,updated_at FROM workflow_artifacts WHERE member_id=? ORDER BY created_at').all(user.id),
        artifactRevisions: db.prepare('SELECT r.artifact_id,r.revision,r.payload,r.created_at FROM workflow_artifact_revisions r JOIN workflow_artifacts a ON a.id=r.artifact_id WHERE a.member_id=? ORDER BY r.created_at').all(user.id).map(row=>({...row,payload:JSON.parse(String(row.payload))})),
        events: db.prepare('SELECT id,project_id,run_id,kind,message,created_at FROM workflow_events WHERE member_id=? ORDER BY created_at').all(user.id),
        automaticRuns: db.prepare('SELECT run_id,status,error,created_at,updated_at FROM workflow_auto_runs WHERE member_id=? ORDER BY created_at').all(user.id),
        approvalReceipts: db.prepare('SELECT id,run_id,manifest,manifest_hash,created_at,revoked_at FROM workflow_bundle_approvals WHERE member_id=? ORDER BY created_at').all(user.id).map(row=>({...row,manifest:JSON.parse(String(row.manifest))})),
        productionPlan:db.prepare('SELECT id,project_id,day,phase,status,version,created_at,updated_at FROM workflow_plan_items WHERE member_id=? ORDER BY day').all(user.id),
      },
      auditEvents: db.prepare('SELECT id,action,target_id,created_at FROM audit_events WHERE member_id=? ORDER BY created_at').all(user.id),
    };
  });
}

export async function deleteAccount(current: Member | null, data: Record<string, unknown>, sessionToken?: string) {
  const user = requireMember(current);
  rateLimit(`delete-account:${user.id}`, 5);
  if (data.confirmation !== 'DELETE') throw new AppError('Потвърди изтриването на профила.');
  if (data.authentication === 'google') {
    if (!sessionToken || !hasRecentGoogleSessionAuthentication(user, sessionToken)) throw new AppError('Влез отново с Google, преди да изтриеш профила. Потвърждението важи 10 минути.', 401);
  } else {
    const password = textField(data.password, 'Текуща парола', 1, 256);
    const row = getDb().prepare('SELECT password_hash FROM members WHERE id=?').get(user.id);
    if (!row || !await verifyPassword(password, row.password_hash as string)) throw new AppError('Паролата не съвпада. Профилът не е изтрит.', 401);
  }
  transaction(() => {
    const db = getDb();
    const active = db.prepare('SELECT role FROM members WHERE id=?').get(user.id);
    if (!active) throw new AppError('Профилът вече не е достъпен.', 401);
    if (active.role === 'admin' && Number(db.prepare("SELECT COUNT(*) AS n FROM members WHERE role='admin'").get()!.n) <= 1) {
      throw new AppError('Първо създай друг администратор, за да остане кой да управлява общността.', 409);
    }
    markWorkflowMediaForDeletion(user.id);
    markWebsiteAssetsForDeletion(user.id);
    db.prepare('DELETE FROM audit_events WHERE member_id=?').run(user.id);
    db.prepare("DELETE FROM content_revisions WHERE actor_id=? AND status='draft'").run(user.id);
    // Foreign keys remove owned private data, posts/replies, work and every session.
    // Published academy material and reviews of other learners retain their history
    // with actor_id set to NULL, so removing an editor cannot erase the curriculum.
    db.prepare('DELETE FROM members WHERE id=?').run(user.id);
  });
  await cleanWorkflowMediaDeletions();
  cleanWebsiteAssetDeletions();
}
