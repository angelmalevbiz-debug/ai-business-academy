import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { AppError, textField } from './auth';
import { PATHS, LESSONS } from './content';
import { UNIVERSE_UNITS, type UniverseUnit } from './universe-content';
import type { Catalog, ContentRevision, LearningPath, Lesson, Member, PublicCatalog } from './domain';

type Kind = ContentRevision['kind'];
const kinds: Kind[] = ['path', 'lesson', 'universe'];
const slug = (value: unknown) => {
  const id = textField(value, 'Идентификатор', 2, 80);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new AppError('Започни идентификатора с малка латинска буква. След нея използвай малки латински букви, цифри и тирета.');
  return id;
};
const obj = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Използвай JSON обект за съдържанието.');
  return value as Record<string, unknown>;
};
const arr = (value: unknown, min = 0, max = 30): unknown[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new AppError(`Използвай списък от ${min} до ${max} елемента.`);
  return value;
};
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new AppError('Стойността не е сред разрешените за това поле. Провери формата на съдържанието.');
  return value as T;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new AppError(`Въведи цяло число между ${min} и ${max}.`);
  return value;
}
function link(value: unknown) {
  const row = obj(value); const url = textField(row.url, 'URL', 8, 1000);
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid URL'); }
  catch { throw new AppError('Добави валиден HTTPS адрес за всеки източник, без потребителско име или парола в адреса.'); }
  return { title: textField(row.title, 'Източник', 2, 180), url };
}
function sections(value: unknown) {
  return arr(value, 1, 16).map(item => {
    const row = obj(item);
    return { title: textField(row.title, 'Заглавие на секция', 2, 180), body: textField(row.body, 'Текст', 10, 8000), ...(row.bullets !== undefined ? { bullets: arr(row.bullets, 0, 16).map(b => textField(b, 'Точка', 2, 1000)) } : {}) };
  });
}
export function validateContent(kind: Kind, targetId: string, value: unknown): LearningPath | Lesson | UniverseUnit {
  const row = obj(value);
  const id = slug(row.id);
  if (id !== targetId) throw new AppError('Полето id трябва да съвпада с идентификатора на избрания материал.');
  const title = textField(row.title, 'Заглавие', 3, 180);
  const minutes = number(row.minutes, 1, 10000);
  if (kind === 'path') {
    const lessonIds = arr(row.lessonIds, 0, 100).map(slug);
    if (new Set(lessonIds).size !== lessonIds.length) throw new AppError('Премахни повторения урок от списъка на учебния път.');
    return { id, title, minutes, description: textField(row.description, 'Описание', 10, 1000), category: textField(row.category, 'Категория', 2, 80), level: textField(row.level, 'Ниво', 2, 80), lessonIds, icon: choice(row.icon, ['automation', 'code', 'business']), tagline: textField(row.tagline, 'Кратко описание', 3, 180), color: choice(row.color, ['green', 'purple', 'orange']) };
  }
  const summary = textField(row.summary, 'Резюме', 10, 1500);
  if (kind === 'lesson') {
    return { id, title, minutes, summary, pathId: slug(row.pathId), sections: sections(row.sections), task: textField(row.task, 'Задача', 20, 3000), checklist: arr(row.checklist, 1, 16).map(item => textField(item, 'Критерий', 3, 600)), adultOnly: row.adultOnly === true, ...(row.resourceLinks ? { resourceLinks: arr(row.resourceLinks, 0, 12).map(link) } : {}) };
  }
  const question = obj(row.question);
  const options = arr(question.options, 2, 6).map(item => textField(item, 'Възможен отговор', 1, 1000));
  return { id, title, minutes, summary, theme: textField(row.theme, 'Тема', 2, 100), evidenceLevel: choice(row.evidenceLevel, ['research', 'philosophy', 'practice']), sections: sections(row.sections), exercise: textField(row.exercise, 'Упражнение', 20, 3000), reflectionPrompt: textField(row.reflectionPrompt, 'Въпрос за лична бележка', 10, 1500), question: { prompt: textField(question.prompt, 'Въпрос', 5, 1500), options, answerIndex: number(question.answerIndex, 0, options.length - 1), explanation: textField(question.explanation, 'Обяснение', 10, 3000) }, sources: arr(row.sources, 1, 12).map(item => ({ ...link(item), kind: choice(obj(item).kind, ['primary', 'author', 'official']) })) };
}

export function getCatalog(): Catalog {
  const maps = { path: new Map(PATHS.map(item => [item.id, item])), lesson: new Map(LESSONS.map(item => [item.id, item])), universe: new Map(UNIVERSE_UNITS.map(item => [item.id, item])) };
  const rows = getDb().prepare("SELECT kind,target_id,payload FROM content_revisions WHERE status='published' ORDER BY version ASC").all();
  for (const row of rows) {
    const kind = row.kind as Kind;
    if (kind === 'path') maps.path.set(row.target_id as string, JSON.parse(row.payload as string) as LearningPath);
    if (kind === 'lesson') maps.lesson.set(row.target_id as string, JSON.parse(row.payload as string) as Lesson);
    if (kind === 'universe') maps.universe.set(row.target_id as string, JSON.parse(row.payload as string) as UniverseUnit);
  }
  return { paths: [...maps.path.values()], lessons: [...maps.lesson.values()], universeUnits: [...maps.universe.values()] };
}
export function publicCatalog(catalog = getCatalog()): PublicCatalog {
  return { ...catalog, universeUnits: catalog.universeUnits.map(unit => ({ ...unit, question: { prompt: unit.question.prompt, options: unit.question.options, explanation: unit.question.explanation } })) };
}
export function contentRevisions(): ContentRevision[] {
  return getDb().prepare('SELECT * FROM content_revisions ORDER BY created_at DESC,version DESC LIMIT 300').all().map(row => ({ id: row.id as string, kind: row.kind as Kind, targetId: row.target_id as string, version: Number(row.version), status: row.status as ContentRevision['status'], title: row.title as string, payload: JSON.parse(row.payload as string), createdAt: row.created_at as string }));
}
export function mutateCatalog(user: Member, data: Record<string, unknown>) {
  if (user.role !== 'admin') throw new AppError('Необходим е администраторски достъп.', 403);
  const db = getDb();
  if (data.action === 'saveContent') {
    const kind = choice(data.kind, kinds); const targetId = slug(data.targetId);
    const payload = validateContent(kind, targetId, data.payload);
    const version = Number(db.prepare('SELECT COALESCE(MAX(version),0)+1 AS version FROM content_revisions WHERE kind=? AND target_id=?').get(kind, targetId)!.version);
    const id = randomUUID();
    db.prepare("INSERT INTO content_revisions(id,kind,target_id,version,status,title,payload,actor_id,created_at) VALUES(?,?,?,?,'draft',?,?,?,?)").run(id, kind, targetId, version, payload.title, JSON.stringify(payload), user.id, new Date().toISOString());
    return id;
  }
  const id = textField(data.revisionId, 'Версия', 1, 100);
  const revision = db.prepare('SELECT * FROM content_revisions WHERE id=?').get(id);
  if (!revision) throw new AppError('Версията не е намерена. Зареди списъка с версии отново.', 404);
  const current = Number(db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM content_revisions WHERE kind=? AND target_id=? AND status='published'").get(revision.kind as string, revision.target_id as string)!.version);
  if (data.expectedVersion !== current || Number(revision.version) <= current || revision.status !== 'draft') throw new AppError('Тази чернова вече не може да се публикува. Зареди текущата версия, сравни промените и запази нова чернова.', 409);
  const kind = revision.kind as Kind;
  const payload = validateContent(kind, revision.target_id as string, JSON.parse(revision.payload as string));
  const catalog = getCatalog();
  if (kind === 'path') {
    const path = payload as LearningPath;
    if (path.lessonIds.some(lessonId => !catalog.lessons.some(lesson => lesson.id === lessonId && lesson.pathId === path.id))) throw new AppError('Първо публикувай всеки урок от списъка и провери дали неговото поле pathId сочи към този път.');
    const previous = catalog.paths.find(item => item.id === path.id);
    if (previous) {
      const oldOrder = previous.lessonIds;
      const retained = path.lessonIds.filter(id => oldOrder.includes(id));
      const removed = oldOrder.filter(id => !path.lessonIds.includes(id));
      const oldRetained = oldOrder.filter(id => path.lessonIds.includes(id));
      const changedOrder = retained.some((id, index) => oldRetained[index] !== id);
      // A recorded submission is tied to the sequence the member followed.
      // Until versioned enrollment exists, do not silently change that sequence.
      if ((removed.length || changedOrder) && oldOrder.some(id => db.prepare('SELECT 1 FROM submissions WHERE lesson_id=? LIMIT 1').get(id))) {
        throw new AppError('По този път има предадени задачи. Запази съществуващите уроци и техния ред. Премахването и пренареждането още не се поддържат за такива пътища.', 409);
      }
      const firstNew = path.lessonIds.findIndex(id => !oldOrder.includes(id));
      if (firstNew !== -1 && path.lessonIds.slice(firstNew + 1).some(id => oldOrder.includes(id)) && oldOrder.some(id => db.prepare('SELECT 1 FROM submissions WHERE lesson_id=? LIMIT 1').get(id))) {
        throw new AppError('По този път има предадени задачи. Добави новите уроци след съществуващите.', 409);
      }
    }
  }
  if (kind === 'lesson') {
    const lesson = payload as Lesson;
    if (!catalog.paths.some(path => path.id === lesson.pathId)) throw new AppError('Първо публикувай учебния път, посочен в pathId.');
    if (catalog.paths.some(path => path.id !== lesson.pathId && path.lessonIds.includes(lesson.id))) throw new AppError('Урокът е включен в друг учебен път. Провери списъците с уроци, преди да смениш pathId.');
  }
  db.prepare("UPDATE content_revisions SET status='published' WHERE id=?").run(id);
  return id;
}
