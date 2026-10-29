import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { AppError, textField } from './auth';
import { getCatalog } from './catalog';
import { UNIVERSE_ADULT_PRACTICE_IDS } from './universe-content';
import type { Development, Member, PersonalGoal } from './domain';

export function localDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`;
}
export const emptyDevelopment = (): Development => ({ goal: null, introSeen: false, unitProgress: [], reflections: [], dailyActions: [], drafts: [], weekly: { actions: 0, activeDays: 0, submittedTasks: 0, reviewedTasks: 0 }, mentorHints: [] });
export function recordAction(userId: string, kind: string, referenceId: string, note = '') {
  getDb().prepare('INSERT OR IGNORE INTO daily_actions(id,member_id,kind,reference_id,day,note,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), userId, kind, referenceId, localDay(), note, new Date().toISOString());
}
export function getDevelopment(user: Member | null): Development {
  const result = emptyDevelopment();
  if (!user) return result;
  const db = getDb();
  const settings = db.prepare('SELECT * FROM development_settings WHERE member_id=?').get(user.id);
  result.goal = settings?.goal ? JSON.parse(settings.goal as string) as PersonalGoal : null;
  result.introSeen = Boolean(settings?.intro_seen);
  result.unitProgress = db.prepare('SELECT * FROM unit_progress WHERE member_id=? ORDER BY completed_at').all(user.id).map(row => ({ unitId: row.unit_id as string, completedAt: row.completed_at as string, reviewDueAt: row.review_due_at as string, reviewCount: Number(row.review_count) }));
  result.reflections = db.prepare('SELECT * FROM reflections WHERE member_id=? ORDER BY created_at DESC LIMIT 100').all(user.id).map(row => ({ id: row.id as string, unitId: row.unit_id as string, text: row.text as string, createdAt: row.created_at as string }));
  result.dailyActions = db.prepare('SELECT * FROM daily_actions WHERE member_id=? ORDER BY day DESC,created_at DESC LIMIT 300').all(user.id).map(row => ({ id: row.id as string, kind: row.kind as Development['dailyActions'][number]['kind'], referenceId: row.reference_id as string, day: row.day as string, note: row.note as string, createdAt: row.created_at as string }));
  result.drafts = db.prepare('SELECT * FROM lesson_drafts WHERE member_id=? ORDER BY updated_at DESC').all(user.id).map(row => ({ lessonId: row.lesson_id as string, text: row.text as string, updatedAt: row.updated_at as string }));
  const weekStart = new Date(`${localDay()}T12:00:00Z`); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const firstDay = localDay(weekStart);
  const actions = db.prepare('SELECT COUNT(*) AS actions,COUNT(DISTINCT day) AS days FROM daily_actions WHERE member_id=? AND day>=?').get(user.id, firstDay)!;
  const tasks = db.prepare('SELECT r.submission_id,r.created_at FROM submission_revisions r JOIN submissions s ON s.id=r.submission_id WHERE s.member_id=?').all(user.id);
  const reviews = db.prepare("SELECT r.submission_id,r.created_at FROM review_history r JOIN submissions s ON s.id=r.submission_id WHERE s.member_id=? AND r.status='reviewed'").all(user.id);
  result.weekly = { actions: Number(actions.actions), activeDays: Number(actions.days), submittedTasks: new Set(tasks.filter(row => localDay(new Date(row.created_at as string)) >= firstDay).map(row => row.submission_id)).size, reviewedTasks: new Set(reviews.filter(row => localDay(new Date(row.created_at as string)) >= firstDay).map(row => row.submission_id)).size };
  if (db.prepare("SELECT id FROM submissions WHERE member_id=? AND status='needs_changes' LIMIT 1").get(user.id)) result.mentorHints.push('Прегледай коментарите по задачата за доработка и избери първата поправка.');
  if (result.unitProgress.some(item => item.reviewDueAt <= new Date().toISOString())) result.mentorHints.push('Имаш тема за преговор. Опитай да обясниш основната идея, после я сравни с материала.');
  if (!result.goal) result.mentorHints.push('Запиши целта си и едно действие, с което можеш да започнеш за пет минути.');
  else result.mentorHints.push(`Запазеното ти следващо действие: ${result.goal.nextAction}`);
  if (!result.weekly.actions) result.mentorHints.push('Отвори последната задача и запиши откъде ще продължиш.');
  return result;
}

function getUnit(user: Member, value: unknown) {
  const id = textField(value, 'Тема', 2, 100);
  const unit = getCatalog().universeUnits.find(item => item.id === id);
  if (!unit) throw new AppError('Темата не е намерена. Зареди списъка отново и избери друга тема.', 404);
  if ((UNIVERSE_ADULT_PRACTICE_IDS as readonly string[]).includes(id) && user.ageBand !== '18+') throw new AppError('Тази доброволна практика е само за пълнолетни.', 403);
  return unit;
}
export const DEVELOPMENT_ACTIONS = ['saveGoal', 'markUniverseIntro', 'answerUnit', 'reflect', 'recordPractice', 'saveDraft', 'completeAction'] as const;
export function mutateDevelopment(user: Member, data: Record<string, unknown>): Development['quizFeedback'] {
  const db = getDb();
  const now = new Date().toISOString();
  if (data.action === 'saveGoal') {
    const source = data.goal && typeof data.goal === 'object' ? data.goal as Record<string, unknown> : data;
    if (![5, 15, 30].includes(source.minutes as number) || !Number.isInteger(source.daysPerWeek) || Number(source.daysPerWeek) < 1 || Number(source.daysPerWeek) > 7 || typeof source.reminderEnabled !== 'boolean' || !Number.isInteger(source.reminderHour) || Number(source.reminderHour) < 0 || Number(source.reminderHour) > 23) throw new AppError('Провери минутите, дните в седмицата и часа за напомняне.');
    const goal: PersonalGoal = { title: textField(source.title, 'Цел', 5, 180), why: textField(source.why ?? '', 'Защо', 0, 1000), nextAction: textField(source.nextAction, 'Следващо действие', 10, 500), obstacle: textField(source.obstacle ?? '', 'Пречка', 0, 500), ifThen: textField(source.ifThen ?? '', 'План „ако, тогава“', 0, 700), minutes: source.minutes as PersonalGoal['minutes'], daysPerWeek: Number(source.daysPerWeek), reminderEnabled: source.reminderEnabled, reminderHour: Number(source.reminderHour) };
    db.prepare('INSERT INTO development_settings(member_id,goal) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET goal=excluded.goal').run(user.id, JSON.stringify(goal));
  } else if (data.action === 'markUniverseIntro') {
    db.prepare('INSERT INTO development_settings(member_id,intro_seen) VALUES(?,1) ON CONFLICT(member_id) DO UPDATE SET intro_seen=1').run(user.id);
  } else if (data.action === 'saveDraft') {
    const lessonId = textField(data.lessonId, 'Урок', 2, 100);
    const catalog = getCatalog();
    const lesson = catalog.lessons.find(item => item.id === lessonId);
    if (!lesson) throw new AppError('Урокът не съществува. Зареди учебния път отново.', 404);
    if (!catalog.paths.some(path => path.id === lesson.pathId && path.lessonIds.includes(lessonId))) throw new AppError('Урокът още не е публикуван в учебен път. Избери друг урок.', 409);
    if (lesson.adultOnly && user.ageBand !== '18+') throw new AppError('Задачата е за пълнолетни.', 403);
    if (typeof data.text !== 'string' || data.text.length > 6000) throw new AppError('Използвай текст до 6000 знака за черновата.');
    db.prepare('INSERT INTO lesson_drafts(member_id,lesson_id,text,updated_at) VALUES(?,?,?,?) ON CONFLICT(member_id,lesson_id) DO UPDATE SET text=excluded.text,updated_at=excluded.updated_at').run(user.id, lessonId, data.text, now);
  } else if (data.action === 'completeAction') {
    if (data.kind !== 'practice' || data.referenceId !== 'goal-next-action') throw new AppError('Неподдържано действие. Отвори целта си отново и опитай пак.');
    if (!db.prepare('SELECT goal FROM development_settings WHERE member_id=? AND goal IS NOT NULL').get(user.id)) throw new AppError('Първо запази личната си цел.');
    recordAction(user.id, 'practice', 'goal-next-action', textField(data.note, 'Бележка', 0, 1000));
  } else {
    const unit = getUnit(user, data.unitId);
    if (data.action === 'answerUnit') {
      if (!Number.isInteger(data.answerIndex) || Number(data.answerIndex) < 0 || Number(data.answerIndex) >= unit.question.options.length) throw new AppError('Избери валиден отговор от показаните възможности.');
      const correct = data.answerIndex === unit.question.answerIndex;
      if (correct) {
        const previous = db.prepare('SELECT * FROM unit_progress WHERE member_id=? AND unit_id=?').get(user.id, unit.id);
        if (!previous) {
          db.prepare('INSERT INTO unit_progress(member_id,unit_id,completed_at,review_due_at,review_count) VALUES(?,?,?,?,0)').run(user.id, unit.id, now, new Date(Date.now() + 86400000).toISOString());
          recordAction(user.id, 'lesson', unit.id);
        } else if ((previous.review_due_at as string) <= now) {
          const count = Number(previous.review_count) + 1;
          const days = count === 1 ? 3 : 7;
          db.prepare('UPDATE unit_progress SET review_due_at=?,review_count=? WHERE member_id=? AND unit_id=?').run(new Date(Date.now() + days * 86400000).toISOString(), count, user.id, unit.id);
          recordAction(user.id, 'review', unit.id);
        }
      }
      return { unitId: unit.id, correct, explanation: unit.question.explanation };
    }
    if (data.action === 'reflect') {
      const text = textField(data.text, 'Лична бележка', 30, 3000);
      db.prepare('INSERT INTO reflections(id,member_id,unit_id,text,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), user.id, unit.id, text, now);
      recordAction(user.id, 'reflection', unit.id);
    } else if (data.action === 'recordPractice') {
      if (user.ageBand !== '18+') throw new AppError('Практиката е само за пълнолетни.', 403);
      if (unit.id !== 'attention-to-action' || data.consent !== true) throw new AppError('За тази доброволна практика е нужно съгласие. Можеш и да я пропуснеш.');
      recordAction(user.id, 'practice', unit.id);
    } else throw new AppError('Действието не е разпознато. Зареди страницата отново и опитай пак.');
  }
}
