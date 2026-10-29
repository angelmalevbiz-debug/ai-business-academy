import { randomUUID } from 'node:crypto';
import { getDb, transaction } from './db';
import { AppError, ageField, memberById, rateLimit, textField } from './auth';
import { contentRevisions, getCatalog, mutateCatalog, publicCatalog } from './catalog';
import { DEVELOPMENT_ACTIONS, getDevelopment, mutateDevelopment, recordAction } from './development';
import type { Member, Post, Profile, Submission, ToolRequest, Workspace } from './domain';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const asSubmission = (row: Row): Submission => ({
  id: row.id as string, userId: row.member_id as string, authorName: row.name as string,
  lessonId: row.lesson_id as string, text: row.text as string, status: row.status as Submission['status'],
  feedback: row.feedback as string, createdAt: row.created_at as string,
  revision: Number(row.revision),
  history: getDb().prepare('SELECT * FROM submission_revisions WHERE submission_id=? ORDER BY revision DESC').all(row.id as string).map(version => ({ revision: Number(version.revision), text: version.text as string, status: version.status as string, feedback: version.feedback as string, createdAt: version.created_at as string, reviews: getDb().prepare('SELECT r.*,m.name FROM review_history r LEFT JOIN members m ON m.id=r.actor_id WHERE r.submission_id=? AND r.revision=? ORDER BY r.created_at').all(row.id as string, Number(version.revision)).map(review => ({ status: review.status as string, feedback: review.feedback as string, reviewer: review.name as string || 'Исторически преглед', createdAt: review.created_at as string })) })),
});

export function getWorkspace(user: Member | null): Workspace {
  const db = getDb();
  const catalog = getCatalog();
  const postRows = db.prepare('SELECT p.*,m.name,m.role FROM posts p LEFT JOIN members m ON p.member_id=m.id WHERE p.hidden=0 ORDER BY p.created_at DESC LIMIT 100').all();
  const posts: Post[] = postRows.map(row => ({
    id: row.id as string, authorName: (row.name || 'Екип WebVision') as string,
    authorRole: row.member_id ? row.role as Post['authorRole'] : 'team', title: row.title as string,
    body: row.body as string, category: row.category as Post['category'], createdAt: row.created_at as string,
    replies: db.prepare('SELECT r.*,m.name FROM replies r JOIN members m ON r.member_id=m.id WHERE r.post_id=? AND r.hidden=0 ORDER BY r.created_at DESC,r.id DESC LIMIT 100').all(row.id as string).reverse().map(reply => ({ id: reply.id as string, authorName: reply.name as string, body: reply.body as string, createdAt: reply.created_at as string })),
    replyCount: Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE post_id=? AND hidden=0').get(row.id as string)!.n),
    hasMoreReplies: Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE post_id=? AND hidden=0').get(row.id as string)!.n) > 100,
  }));
  if (!user) return { user: null, posts, completedLessonIds: [], submissions: [], bookmarkedPathIds: [], tools: [], catalog: publicCatalog(catalog), development: getDevelopment(null) };
  const submissions = user.role === 'admin'
    ? db.prepare('SELECT s.*,m.name FROM submissions s JOIN members m ON s.member_id=m.id ORDER BY s.created_at DESC LIMIT 500').all()
    : db.prepare('SELECT s.*,m.name FROM submissions s JOIN members m ON s.member_id=m.id WHERE s.member_id=? ORDER BY s.created_at DESC').all(user.id);
  const tools = user.role === 'admin'
    ? db.prepare('SELECT * FROM tool_requests ORDER BY created_at DESC LIMIT 500').all()
    : db.prepare('SELECT * FROM tool_requests WHERE member_id=? ORDER BY created_at DESC LIMIT 100').all(user.id);
  const workspace: Workspace = {
    user, posts, submissions: submissions.map(asSubmission), catalog: publicCatalog(catalog), development: getDevelopment(user),
    completedLessonIds: db.prepare('SELECT lesson_id FROM progress WHERE member_id=? ORDER BY completed_at').all(user.id).map(row => row.lesson_id as string),
    bookmarkedPathIds: db.prepare('SELECT path_id FROM bookmarks WHERE member_id=?').all(user.id).map(row => row.path_id as string),
    tools: tools.map((row): ToolRequest => ({ id: row.id as string, problem: row.problem as string, createdAt: row.created_at as string })),
  };
  if (user.role === 'admin') {
    const count = (table: string, filter = '') => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${filter}`).get()!.n);
    workspace.metrics = { members: count('members'), submissions: count('submissions'), pendingReviews: count('submissions', "WHERE status='pending'"), completedLessons: count('progress'), toolRequests: count('tool_requests') };
    workspace.contentRevisions = contentRevisions();
    workspace.editorCatalog = catalog;
  }
  return workspace;
}

function validateLesson(value: unknown, user: Member) {
  const id = textField(value, 'Урок', 1, 100);
  const catalog = getCatalog();
  const lesson = catalog.lessons.find(item => item.id === id);
  if (!lesson) throw new AppError('Урокът не съществува. Зареди учебния път отново.', 404);
  if (!catalog.paths.some(path => path.id === lesson.pathId && path.lessonIds.includes(id))) throw new AppError('Урокът още не е публикуван в учебен път. Избери друг урок.', 409);
  if (lesson.adultOnly && user.ageBand !== '18+') throw new AppError('Тази задача е за пълнолетни. Продължи с учебния прототип и следващото подобрение.', 403);
  return lesson;
}

export function mutateWorkspace(user: Member | null, data: Record<string, unknown>): Workspace {
  if (!user) throw new AppError('Влез в профила си, за да запазиш действието.', 401);
  const action = textField(data.action, 'Действие', 1, 40);
  const db = getDb();
  // Draft autosaves have their own budget so editing does not exhaust the
  // quota for publishing a finished task, asking a question, or signing out.
  if (action === 'saveDraft') rateLimit(`draft:${user.id}`, 360);
  else rateLimit(`write:${user.id}`, 80);
  let quizFeedback;
  transaction(() => {
    let targetId: string | null = null;
    if (action === 'saveContent' || action === 'publishContent') {
      targetId = mutateCatalog(user, data);
    } else if ((DEVELOPMENT_ACTIONS as readonly string[]).includes(action)) {
      quizFeedback = mutateDevelopment(user, data);
    } else if (action === 'profile') {
      const ageBand = ageField(data.ageBand);
      if (ageBand !== user.ageBand) throw new AppError('Използвай възрастовата група от регистрацията.');
      if (data.level !== 'beginner' && data.level !== 'practitioner') throw new AppError('Избери ниво.');
      if (!['learn', 'service', 'business'].includes(data.goal as string)) throw new AppError('Избери цел.');
      if (![2, 5, 10].includes(data.hours as number)) throw new AppError('Избери 2, 5 или 10 часа седмично.');
      const profile: Profile = { level: data.level, goal: data.goal as Profile['goal'], hours: data.hours as Profile['hours'], ageBand };
      db.prepare('UPDATE members SET profile=? WHERE id=?').run(JSON.stringify(profile), user.id);
    } else if (action === 'submit') {
      const lesson = validateLesson(data.lessonId, user);
      const text = textField(data.text, 'Решение', 30, 6000);
      const existing = db.prepare('SELECT id,revision FROM submissions WHERE member_id=? AND lesson_id=?').get(user.id, lesson.id);
      targetId = existing ? existing.id as string : randomUUID();
      const revision = existing ? Number(existing.revision) + 1 : 1;
      const timestamp = now();
      db.prepare("INSERT INTO submissions (id,member_id,lesson_id,text,created_at,revision) VALUES (?,?,?,?,?,?) ON CONFLICT(member_id,lesson_id) DO UPDATE SET text=excluded.text,status='pending',feedback='',revision=excluded.revision,created_at=excluded.created_at").run(targetId, user.id, lesson.id, text, timestamp, revision);
      db.prepare("INSERT INTO submission_revisions(submission_id,revision,text,status,feedback,created_at) VALUES(?,?,?,'pending','',?)").run(targetId, revision, text, timestamp);
      invalidateProgress(user.id, lesson.id);
      db.prepare('DELETE FROM lesson_drafts WHERE member_id=? AND lesson_id=?').run(user.id, lesson.id);
      recordAction(user.id, 'lesson', lesson.id);
    } else if (action === 'complete') {
      const lesson = validateLesson(data.lessonId, user);
      const submission = db.prepare('SELECT status FROM submissions WHERE member_id=? AND lesson_id=?').get(user.id, lesson.id);
      if (!submission) throw new AppError('Първо изпрати практическата задача към урока.');
      if (submission.status === 'needs_changes') throw new AppError('Отрази обратната връзка и изпрати задачата отново.');
      const catalog = getCatalog();
      const path = catalog.paths.find(item => item.id === lesson.pathId)!;
      const preceding = path.lessonIds.slice(0, path.lessonIds.indexOf(lesson.id)).filter(id => user.ageBand === '18+' || !catalog.lessons.find(item => item.id === id)?.adultOnly);
      const completed = new Set(db.prepare('SELECT lesson_id FROM progress WHERE member_id=?').all(user.id).map(row => row.lesson_id as string));
      if (preceding.some(id => !completed.has(id))) throw new AppError('Завърши предходните практически стъпки в този път.');
      db.prepare('INSERT OR IGNORE INTO progress (member_id,lesson_id,completed_at) VALUES (?,?,?)').run(user.id, lesson.id, now());
      targetId = lesson.id;
    } else if (action === 'post') {
      const title = textField(data.title, 'Заглавие', 5, 140);
      const body = textField(data.body, 'Публикация', 20, 6000);
      if (!['question', 'progress', 'resource'].includes(data.category as string)) throw new AppError('Избери категория: въпрос, напредък или ресурс.');
      rateLimit(`post:${user.id}`, 10);
      targetId = randomUUID();
      db.prepare('INSERT INTO posts (id,member_id,title,body,category,created_at) VALUES (?,?,?,?,?,?)').run(targetId, user.id, title, body, data.category as string, now());
    } else if (action === 'reply') {
      const postId = textField(data.postId, 'Публикация', 1, 100);
      if (!db.prepare('SELECT id FROM posts WHERE id=? AND hidden=0').get(postId)) throw new AppError('Публикацията не съществува или е скрита. Зареди общността отново.', 404);
      const body = textField(data.body, 'Отговор', 3, 3000);
      targetId = randomUUID();
      db.prepare('INSERT INTO replies (id,post_id,member_id,body,created_at) VALUES (?,?,?,?,?)').run(targetId, postId, user.id, body, now());
    } else if (action === 'bookmark') {
      const pathId = textField(data.pathId, 'Път', 1, 100);
      if (!getCatalog().paths.some(item => item.id === pathId)) throw new AppError('Учебният път не съществува. Зареди списъка с пътища отново.', 404);
      const existing = db.prepare('SELECT path_id FROM bookmarks WHERE member_id=? AND path_id=?').get(user.id, pathId);
      if (existing) db.prepare('DELETE FROM bookmarks WHERE member_id=? AND path_id=?').run(user.id, pathId);
      else db.prepare('INSERT INTO bookmarks (member_id,path_id) VALUES (?,?)').run(user.id, pathId);
      targetId = pathId;
    } else if (action === 'requestTool') {
      const problem = textField(data.problem, 'Проблем', 30, 3000);
      rateLimit(`tool:${user.id}`, 5);
      targetId = randomUUID();
      db.prepare('INSERT INTO tool_requests (id,member_id,problem,created_at) VALUES (?,?,?,?)').run(targetId, user.id, problem, now());
    } else if (action === 'review') {
      if (user.role !== 'admin') throw new AppError('Необходим е администраторски достъп.', 403);
      const submissionId = textField(data.submissionId, 'Задача', 1, 100);
      if (data.status !== 'reviewed' && data.status !== 'needs_changes') throw new AppError('Отбележи задачата като прегледана или я върни за доработка.');
      const feedback = textField(data.feedback, 'Обратна връзка', 10, 3000);
      const submission = db.prepare('SELECT * FROM submissions WHERE id=?').get(submissionId);
      if (!submission) throw new AppError('Задачата не съществува. Зареди списъка за преглед отново.', 404);
      if (data.expectedRevision !== Number(submission.revision)) throw new AppError('Задачата има по-нова версия. Зареди я и прегледай актуалния текст.', 409);
      db.prepare('UPDATE submissions SET status=?,feedback=? WHERE id=?').run(data.status, feedback, submissionId);
      db.prepare('UPDATE submission_revisions SET status=?,feedback=? WHERE submission_id=? AND revision=?').run(data.status, feedback, submissionId, Number(submission.revision));
      db.prepare('INSERT INTO review_history(id,submission_id,revision,status,feedback,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), submissionId, Number(submission.revision), data.status, feedback, user.id, now());
      if (data.status === 'needs_changes') invalidateProgress(submission.member_id as string, submission.lesson_id as string);
      targetId = submissionId;
    } else if (action === 'hidePost') {
      if (user.role !== 'admin') throw new AppError('Необходим е администраторски достъп.', 403);
      const id = textField(data.postId, 'Публикация', 1, 100);
      if (!db.prepare('SELECT id FROM posts WHERE id=?').get(id)) throw new AppError('Публикацията не съществува. Зареди общността отново.', 404);
      db.prepare('UPDATE posts SET hidden=1 WHERE id=?').run(id);
      targetId = id;
    } else if (action === 'hideReply') {
      if (user.role !== 'admin') throw new AppError('Необходим е администраторски достъп.', 403);
      const id = textField(data.replyId, 'Отговор', 1, 100);
      if (!db.prepare('SELECT id FROM replies WHERE id=?').get(id)) throw new AppError('Отговорът не съществува. Зареди дискусията отново.', 404);
      db.prepare('UPDATE replies SET hidden=1 WHERE id=?').run(id);
      targetId = id;
    } else {
      throw new AppError('Действието не е разпознато. Зареди страницата отново и опитай пак.');
    }
    db.prepare('INSERT INTO audit_events (id,member_id,action,target_id,created_at) VALUES (?,?,?,?,?)').run(randomUUID(), user.id, action, targetId, now());
  });
  const result = getWorkspace(memberById(user.id));
  if (quizFeedback) result.development.quizFeedback = quizFeedback;
  return result;
}

function invalidateProgress(memberId: string, lessonId: string) {
  const catalog = getCatalog();
  const lesson = catalog.lessons.find(item => item.id === lessonId);
  const path = catalog.paths.find(item => item.id === lesson?.pathId);
  const index = path?.lessonIds.indexOf(lessonId) ?? -1;
  const ids = path && index >= 0 ? path.lessonIds.slice(index) : [lessonId];
  for (const id of ids) getDb().prepare('DELETE FROM progress WHERE member_id=? AND lesson_id=?').run(memberId, id);
}
