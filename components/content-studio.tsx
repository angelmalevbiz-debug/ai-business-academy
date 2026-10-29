"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  Plus,
  ClockCounterClockwise,
  Lock,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  Catalog,
  ContentRevision,
  LearningPath,
  Lesson,
  WorkspaceData,
} from "@/lib/domain";
import type { UniverseUnit } from "@/lib/universe-content";
import type { WorkspaceMutator } from "./contracts";
import styles from "./content-studio.module.css";
import { PathVisual } from './path-visual';

type Kind = ContentRevision["kind"];
type Document = LearningPath | Lesson | UniverseUnit;
const kindLabels: Record<Kind, string> = {
  path: "Пътеки",
  lesson: "Уроци",
  universe: "Успехология",
};

function documents(catalog: Catalog, kind: Kind): Document[] {
  return kind === "path"
    ? catalog.paths
    : kind === "lesson"
      ? catalog.lessons
      : catalog.universeUnits;
}
function publishedVersion(data: WorkspaceData, kind: Kind, id: string) {
  return Math.max(
    0,
    ...(data.contentRevisions || [])
      .filter(
        (r) => r.kind === kind && r.targetId === id && r.status === "published",
      )
      .map((r) => r.version),
  );
}
function makeEmpty(kind: Kind, catalog: Catalog): Document {
  if (kind === "path")
    return {
      id: "",
      title: "",
      description: "",
      category: "",
      level: "",
      minutes: 30,
      lessonIds: [],
      icon: "automation",
      tagline: "",
      color: "green",
    };
  if (kind === "lesson")
    return {
      id: "",
      pathId: catalog.paths[0]?.id || "",
      title: "",
      minutes: 15,
      summary: "",
      sections: [{ title: "", body: "" }],
      task: "",
      checklist: [""],
      adultOnly: false,
      resourceLinks: [],
    };
  return {
    id: "",
    title: "",
    summary: "",
    minutes: 10,
    theme: "",
    evidenceLevel: "research",
    sections: [{ title: "", body: "" }],
    exercise: "",
    reflectionPrompt: "",
    question: {
      prompt: "",
      options: ["", "", "", ""],
      answerIndex: 0,
      explanation: "",
    },
    sources: [{ title: "", url: "", kind: "primary" }],
  };
}
function clone<T>(value: T): T {
  return structuredClone(value);
}

export function ContentStudio({
  data,
  mutate,
  busy,
  onDirtyChange,
}: {
  data: WorkspaceData;
  mutate: WorkspaceMutator;
  busy: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const catalog = data.editorCatalog;
  const [kind, setKind] = useState<Kind>("path");
  const [editing, setEditing] = useState<Document | null>(null);
  const [originalId, setOriginalId] = useState("");
  const [baseVersion, setBaseVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [editorStage, setEditorStage] = useState<'details' | 'content' | 'preview'>('details');
  const [pickerOpen, setPickerOpen] = useState(true);
  const pickerId = useId();

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (data.user?.role !== "admin" || !catalog)
    return (
      <section className={styles.empty} role="status">
        <Lock size={26} />
        <h2>Достъп за редактори</h2>
        <p>Влез с администраторски профил, за да управляваш съдържанието.</p>
      </section>
    );

  const currentCatalog = catalog;
  const revisions = data.contentRevisions || [];
  const currentDocs = documents(currentCatalog, kind);
  const unpublishedDrafts = revisions
    .filter(
      (r) =>
        r.kind === kind &&
        r.status === "draft" &&
        !currentDocs.some((item) => item.id === r.targetId),
    )
    .filter(
      (revision, index, all) =>
        all.findIndex((other) => other.targetId === revision.targetId) ===
        index,
    );
  const matchingRevisions = revisions.filter(
    (r) => r.kind === kind && r.targetId === (originalId || editing?.id),
  );
  const publicVersion = editing ? publishedVersion(data, kind, editing.id) : 0;

  function canLeave() {
    return (
      !dirty ||
      window.confirm(
        "Имаш незапазени промени. Да ги отхвърлим ли и да отворим друг материал?",
      )
    );
  }
  function selectKind(next: Kind) {
    if (!canLeave()) return;
    setKind(next);
    setEditing(null);
    setOriginalId("");
    setDirty(false);
    setNotice("");
    setPickerOpen(true);
    setEditorStage('details');
  }
  function startNew() {
    if (!canLeave()) return;
    setEditing(makeEmpty(kind, currentCatalog));
    setOriginalId("");
    setBaseVersion(0);
    setDirty(false);
    setNotice("");
    setPickerOpen(false);
    setEditorStage('details');
  }
  function openDocument(document: Document) {
    if (!canLeave()) return;
    setEditing(clone(document));
    setOriginalId(document.id);
    setBaseVersion(publishedVersion(data, kind, document.id));
    setDirty(false);
    setNotice("");
    setPickerOpen(false);
    setEditorStage('details');
  }
  function openRevision(revision: ContentRevision) {
    if (!canLeave()) return;
    setEditing(clone(revision.payload));
    setOriginalId(revision.targetId);
    setBaseVersion(publishedVersion(data, revision.kind, revision.targetId));
    setDirty(false);
    setPickerOpen(false);
    setEditorStage('preview');
    setNotice(
      `Отворена е версия ${revision.version}. Записването ще създаде нова чернова.`,
    );
  }
  function change(
    update: Partial<LearningPath> | Partial<Lesson> | Partial<UniverseUnit>,
  ) {
    setEditing((current) =>
      current ? ({ ...current, ...update } as Document) : null,
    );
    setDirty(true);
    setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const invalid = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')).find(field => !field.validity.valid);
    if (invalid) {
      setEditorStage(invalid.closest('[data-editor-section]')?.getAttribute('data-editor-section') === 'content' ? 'content' : 'details');
      setNotice('Провери маркираното поле преди запис.');
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    const id = editing.id.trim();
    const payload = { ...editing, id };
    const success = await mutate(
      { action: "saveContent", kind, targetId: id, payload },
      "Черновата е запазена. Вижда се само от администратори.",
    );
    if (success) {
      setEditing(payload as Document);
      setOriginalId(id);
      setDirty(false);
      setNotice(
        "Черновата е запазена. Можеш да я публикуваш от списъка с версии.",
      );
    }
  }
  async function publish(revision: ContentRevision) {
    if (dirty) {
      setNotice("Първо запази или отмени незапазените промени.");
      return;
    }
    const expectedVersion =
      originalId === revision.targetId
        ? baseVersion
        : publishedVersion(data, revision.kind, revision.targetId);
    const success = await mutate(
      { action: "publishContent", revisionId: revision.id, expectedVersion },
      "Съдържанието е публикувано.",
    );
    if (success) {
      setEditing(clone(revision.payload));
      setOriginalId(revision.targetId);
      setBaseVersion(revision.version);
      setNotice(
        `Версия ${revision.version} е публикувана. Участниците ще я видят при следващо зареждане.`,
      );
    }
  }

  return (
    <div className={styles.studio}>
      <header className={styles.header}>
        <div>
          <h1>Редактор на съдържание</h1>
          <p>
            Редактирай път, урок или тема. Запази чернова за преглед, после я
            публикувай.
          </p>
        </div>
        <span className={styles.private}>
          <Lock size={16} />
          Само за екипа
        </span>
      </header>
      <div className={styles.tabs} role="group" aria-label="Вид съдържание">
        {(Object.keys(kindLabels) as Kind[]).map((item) => (
          <button
            type="button"
            key={item}
            className={kind === item ? styles.activeTab : ""}
            aria-pressed={kind === item}
            onClick={() => selectKind(item)}
          >
            {kindLabels[item]}
          </button>
        ))}
      </div>
      <div className={styles.layout}>
        <aside className={styles.list} data-open={pickerOpen} aria-label="Материали">
          <button type="button" className={styles.pickerToggle} aria-expanded={pickerOpen} aria-controls={pickerId} onClick={()=>setPickerOpen(value=>!value)}>{pickerOpen ? 'Скрий списъка' : 'Избери друг материал'}<span>{currentDocs.length}</span></button>
          <div id={pickerId} className={styles.pickerContent}>
          <div className={styles.listHeading}>
            <div>
              <h2>{kindLabels[kind]}</h2>
              <p>{currentDocs.length} публикувани материала</p>
            </div>
            <button
              type="button"
              className={styles.add}
              onClick={startNew}
              aria-label="Създай нов материал"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className={styles.items}>
            {currentDocs.map((document) => (
              <button
                type="button"
                key={document.id}
                className={`${styles.item} ${originalId === document.id ? styles.itemActive : ""}`}
                onClick={() => openDocument(document)}
              >
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.id}</small>
                </span>
              </button>
            ))}
          </div>
          {unpublishedDrafts.length > 0 && (
            <>
              <h3 className={styles.draftsHeading}>Непубликувани чернови</h3>
              <div className={styles.items}>
                {unpublishedDrafts.map((revision) => (
                  <button
                    type="button"
                    key={revision.id}
                    className={`${styles.item} ${originalId === revision.targetId ? styles.itemActive : ""}`}
                    onClick={() => openRevision(revision)}
                  >
                    <span>
                      <strong>{revision.title}</strong>
                      <small>
                        {revision.targetId} · версия {revision.version}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className={styles.listNote}>
            За нов път първо публикувай празния път. След това създай урок и го
            добави към него.
          </p>
          </div>
        </aside>
        <div className={styles.main}>
          {!editing ? (
            <div className={styles.empty}>
              <h2>Избери материал за редакция</h2>
              <p>Отвори съществуващ материал от списъка или създай нов.</p>
              <button
                type="button"
                className="button primary"
                onClick={startNew}
              >
                <Plus size={17} />
                Нов материал
              </button>
            </div>
          ) : (
            <>
              <form className={styles.editor} onSubmit={save} noValidate>
                <div className={styles.editorHeading}>
                  <div>
                    <h2>{editing.title || "Ново съдържание"}</h2>
                    <p>
                      {originalId
                        ? currentDocs.some(
                            (document) => document.id === originalId,
                          )
                          ? `Публикувана версия: ${publicVersion || "първоначална"}`
                          : "Този материал още не е публикуван."
                        : "Избери идентификатор, който няма да се променя."}
                    </p>
                  </div>
                  <span className={styles.editorStatus}>
                    {dirty ? "Незапазени промени" : "Няма незапазени промени"}
                  </span>
                </div>
                <div className={styles.editorTabs} role="group" aria-label="Части на редактора">{([{id:'details',label:'Данни'},{id:'content',label:'Материал'},{id:'preview',label:'Преглед'}] as const).map(item=><button type="button" key={item.id} aria-pressed={editorStage===item.id} onClick={()=>setEditorStage(item.id)}>{item.label}</button>)}</div>
                <div data-editor-section="details" hidden={editorStage!=='details'}><div className={styles.grid}>
                  <Field
                    label="Идентификатор"
                    hint="Малки латински букви, цифри и тирета, например first-workflow. След запис не може да се сменя."
                  >
                    <input
                      required
                      minLength={2}
                      maxLength={80}
                      pattern="[a-z][a-z0-9-]*"
                      value={editing.id}
                      readOnly={!!originalId}
                      onChange={(event) => change({ id: event.target.value })}
                    />
                  </Field>
                  <Field label="Заглавие">
                    <input
                      required
                      minLength={3}
                      maxLength={180}
                      value={editing.title}
                      onChange={(event) =>
                        change({ title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Продължителност в минути">
                    <input
                      type="number"
                      required
                      min={1}
                      max={10000}
                      value={editing.minutes}
                      onChange={(event) =>
                        change({ minutes: Number(event.target.value) })
                      }
                    />
                  </Field>
                </div>
                </div>
                <div data-editor-section="content" hidden={editorStage!=='content'}>
                {kind === "path" && (
                  <PathFields
                    document={editing as LearningPath}
                    catalog={currentCatalog}
                    change={change}
                  />
                )}
                {kind === "lesson" && (
                  <LessonFields
                    document={editing as Lesson}
                    catalog={currentCatalog}
                    change={change}
                  />
                )}
                {kind === "universe" && (
                  <UniverseFields
                    document={editing as UniverseUnit}
                    change={change}
                  />
                )}
                </div>
                {editorStage==='preview'&&<ContentPreview kind={kind} document={editing}/>}
                {editorStage==='details'&&<button type="button" className="button secondary" onClick={()=>setEditorStage('content')}>Към материала<ArrowRight size={17}/></button>}
                <div className={styles.saveBar}>
                  <span>
                    <Lock size={16} />
                    Черновата не се показва в общността.
                  </span>
                  <button
                    className="button primary"
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? "Записване…" : "Запази чернова"}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </form>
              {notice && (
                <p className={styles.notice} role="status">
                  <CheckCircle size={19} />
                  {notice}
                </p>
              )}
              {originalId && (
                <section className={styles.history}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>Версии на материала</h2>
                    </div>
                    <ClockCounterClockwise size={23} />
                  </div>
                  <p>
                    Публикувай запазена чернова. Ако друг редактор е публикувал
                    по-нова версия, първо сравни промените.
                  </p>
                  {matchingRevisions.length ? (
                    <ul>
                      {matchingRevisions.map((revision) => (
                        <li key={revision.id}>
                          <div>
                            <strong>Версия {revision.version}</strong>
                            <span
                              className={
                                revision.status === "published"
                                  ? styles.published
                                  : styles.draft
                              }
                            >
                              {revision.status === "published"
                                ? "Публикувана"
                                : "Чернова"}
                            </span>
                            <small>
                              {new Date(revision.createdAt).toLocaleString(
                                "bg-BG",
                                { timeZone: "Europe/Sofia" },
                              )}
                            </small>
                          </div>
                          <div className={styles.revisionActions}>
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => openRevision(revision)}
                            >
                              Прегледай
                            </button>
                            {revision.status === "draft" && (
                              <button
                                type="button"
                                className="button primary"
                                disabled={busy || dirty}
                                onClick={() => void publish(revision)}
                              >
                                Публикувай
                                <ArrowRight size={16} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Този материал още няма редакции.</p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <div className={styles.guidance}>
        <WarningCircle size={20} />
        <p>
          Провери фактите, източниците и възрастовата пригодност преди
          публикуване. Системата не прави правен или научен преглед.
        </p>
      </div>
    </div>
  );
}

function ContentPreview({ kind, document }: {kind: Kind; document: Document}) {
  const path = kind==='path' ? document as LearningPath : null;
  const lesson = kind==='lesson' ? document as Lesson : null;
  const universe = kind==='universe' ? document as UniverseUnit : null;
  const sections: {title:string;body:string;bullets?:string[]}[] = lesson?.sections || universe?.sections || [];
  return <section className={styles.preview} aria-label="Преглед на текста">
    <p className={styles.previewNote}>Преглед на текущия текст. Публикуването е отделно действие.</p>
    {path&&<div className={styles.previewArt}><PathVisual path={path}/></div>}
    <h3>{document.title || 'Добави заглавие'}</h3>
    <p>{path?.description || lesson?.summary || universe?.summary || 'Добави описание в материала.'}</p>
    <span className={styles.previewMinutes}>{document.minutes} мин</span>
    {sections.map((section,index)=><details key={index}><summary>{section.title || `Раздел ${index+1}`}</summary><p>{section.body}</p>{section.bullets&&<ul>{section.bullets.map((bullet,number)=><li key={number}>{bullet}</li>)}</ul>}</details>)}
    {lesson&&<><h4>Практическа задача</h4><p>{lesson.task}</p><ul>{lesson.checklist.map((item,index)=><li key={index}>{item}</li>)}</ul>{lesson.adultOnly&&<p>Задачата е само за пълнолетни.</p>}</>}
    {universe&&<><h4>Упражнение</h4><p>{universe.exercise}</p><h4>Проверка на разбирането</h4><p>{universe.question.prompt}</p><ol>{universe.question.options.map((answer,index)=><li key={index}>{answer}{index===universe.question.answerIndex&&<strong> · правилен отговор</strong>}</li>)}</ol><p>{universe.question.explanation}</p><h4>Източници</h4>{universe.sources.map((source,index)=><p key={index}>{source.title} <span className={styles.previewUrl}>{source.url}</span></p>)}</>}
    {path&&<><h4>Уроци</h4><p>{path.lessonIds.length ? `${path.lessonIds.length} включени урока. Редът се променя в „Материал“.` : 'Още няма включени уроци.'}</p></>}
  </section>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function FieldsHeading({ title, help }: { title: string; help?: string }) {
  return (
    <div className={styles.fieldsHeading}>
      <h3>{title}</h3>
      {help && <p>{help}</p>}
    </div>
  );
}
type Change = (
  update: Partial<LearningPath> | Partial<Lesson> | Partial<UniverseUnit>,
) => void;

function PathFields({
  document,
  catalog,
  change,
}: {
  document: LearningPath;
  catalog: Catalog;
  change: Change;
}) {
  const lessons = catalog.lessons.filter((l) => l.pathId === document.id);
  return (
    <>
      <FieldsHeading title="Описание на пътя" />
      <Field label="Описание">
        <textarea
          required
          minLength={10}
          maxLength={1000}
          rows={3}
          value={document.description}
          onChange={(e) => change({ description: e.target.value })}
        />
      </Field>
      <div className={styles.grid}>
        <Field label="Категория">
          <input
            required
            minLength={2}
            maxLength={80}
            value={document.category}
            onChange={(e) => change({ category: e.target.value })}
          />
        </Field>
        <Field label="Ниво">
          <input
            required
            minLength={2}
            maxLength={80}
            value={document.level}
            onChange={(e) => change({ level: e.target.value })}
          />
        </Field>
        <Field label="Кратко описание">
          <input
            required
            minLength={3}
            maxLength={180}
            value={document.tagline}
            onChange={(e) => change({ tagline: e.target.value })}
          />
        </Field>
        <Field label="Икона">
          <select
            value={document.icon}
            onChange={(e) =>
              change({ icon: e.target.value as LearningPath["icon"] })
            }
          >
            <option value="automation">Автоматизация</option>
            <option value="code">Софтуер</option>
            <option value="business">Бизнес</option>
          </select>
        </Field>
        <Field label="Цветова тема">
          <select
            value={document.color}
            onChange={(e) =>
              change({ color: e.target.value as LearningPath["color"] })
            }
          >
            <option value="green">Зелена</option>
            <option value="purple">Виолетова</option>
            <option value="orange">Пясъчна</option>
          </select>
        </Field>
      </div>
      <FieldsHeading
        title="Публикувани уроци"
        help="Избери уроците и ги подреди. Тук се показват само публикуваните уроци за този път."
      />
      {lessons.length ? (
        <div className={styles.checkList}>
          {lessons.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={document.lessonIds.includes(item.id)}
                onChange={(e) =>
                  change({
                    lessonIds: e.target.checked
                      ? [...document.lessonIds, item.id]
                      : document.lessonIds.filter((id) => id !== item.id),
                  })
                }
              />
              <span>
                {item.title}
                <small>{item.id}</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.emptyNote}>Този път още няма публикувани уроци.</p>
      )}
      {document.lessonIds.length > 0 && (
        <div className={styles.orderList} aria-label="Ред на уроците">
          {document.lessonIds.map((id, index) => (
            <div key={id}>
              <span>
                {index + 1}. {lessons.find((l) => l.id === id)?.title || id}
              </span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...document.lessonIds];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  change({ lessonIds: next });
                }}
              >
                Нагоре
              </button>
              <button
                type="button"
                disabled={index === document.lessonIds.length - 1}
                onClick={() => {
                  const next = [...document.lessonIds];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  change({ lessonIds: next });
                }}
              >
                Надолу
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function LessonFields({
  document,
  catalog,
  change,
}: {
  document: Lesson;
  catalog: Catalog;
  change: Change;
}) {
  return (
    <>
      <FieldsHeading title="Учебен материал" />
      <div className={styles.grid}>
        <Field label="Пътека">
          <select
            required
            value={document.pathId}
            onChange={(e) => change({ pathId: e.target.value })}
          >
            <option value="">Избери публикувана пътека</option>
            {catalog.paths.map((path) => (
              <option value={path.id} key={path.id}>
                {path.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Кратко резюме">
          <textarea
            required
            minLength={10}
            maxLength={1500}
            rows={3}
            value={document.summary}
            onChange={(e) => change({ summary: e.target.value })}
          />
        </Field>
      </div>
      <Sections
        value={document.sections}
        change={(sections) => change({ sections })}
      />
      <FieldsHeading title="Практическа задача" />
      <Field label="Инструкция за задачата">
        <textarea
          required
          minLength={20}
          maxLength={3000}
          rows={5}
          value={document.task}
          onChange={(e) => change({ task: e.target.value })}
        />
      </Field>
      <Field label="Критерии за изпълнение" hint="По един критерий на ред.">
        <textarea
          required
          rows={4}
          value={document.checklist.join("\n")}
          onChange={(e) => change({ checklist: e.target.value.split("\n") })}
        />
      </Field>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={!!document.adultOnly}
          onChange={(e) => change({ adultOnly: e.target.checked })}
        />
        Практическата задача е само за пълнолетни
      </label>
      <Links
        value={document.resourceLinks || []}
        change={(resourceLinks) => change({ resourceLinks })}
      />
    </>
  );
}
function UniverseFields({
  document,
  change,
}: {
  document: UniverseUnit;
  change: Change;
}) {
  const question = document.question;
  return (
    <>
      <FieldsHeading title="Съдържание и източници" />
      <div className={styles.grid}>
        <Field label="Тема">
          <input
            required
            minLength={2}
            maxLength={100}
            value={document.theme}
            onChange={(e) => change({ theme: e.target.value })}
          />
        </Field>
        <Field label="Характер на твърденията">
          <select
            value={document.evidenceLevel}
            onChange={(e) =>
              change({
                evidenceLevel: e.target.value as UniverseUnit["evidenceLevel"],
              })
            }
          >
            <option value="research">Научни данни и ограничения</option>
            <option value="philosophy">Философска рамка</option>
            <option value="practice">Практическо упражнение</option>
          </select>
        </Field>
      </div>
      <Field label="Резюме">
        <textarea
          required
          minLength={10}
          maxLength={1500}
          rows={3}
          value={document.summary}
          onChange={(e) => change({ summary: e.target.value })}
        />
      </Field>
      <Sections
        value={document.sections}
        change={(sections) => change({ sections })}
      />
      <FieldsHeading title="Упражнение и лична бележка" />
      <Field label="Практическа задача">
        <textarea
          required
          minLength={20}
          maxLength={3000}
          rows={5}
          value={document.exercise}
          onChange={(e) => change({ exercise: e.target.value })}
        />
      </Field>
      <Field label="Въпрос за лична бележка">
        <textarea
          required
          minLength={10}
          maxLength={1500}
          rows={3}
          value={document.reflectionPrompt}
          onChange={(e) => change({ reflectionPrompt: e.target.value })}
        />
      </Field>
      <FieldsHeading
        title="Проверка на разбирането"
        help="Избери верния отговор. Обяснението се показва след проверка, включително при грешка."
      />
      <Field label="Въпрос">
        <textarea
          required
          minLength={5}
          maxLength={1500}
          rows={3}
          value={question.prompt}
          onChange={(e) =>
            change({ question: { ...question, prompt: e.target.value } })
          }
        />
      </Field>
      {question.options.map((option, index) => (
        <Field label={`Отговор ${index + 1}`} key={index}>
          <input
            required
            maxLength={1000}
            value={option}
            onChange={(e) => {
              const options = [...question.options];
              options[index] = e.target.value;
              change({ question: { ...question, options } });
            }}
          />
        </Field>
      ))}
      <Field label="Правилен отговор">
        <select
          value={question.answerIndex}
          onChange={(e) =>
            change({
              question: { ...question, answerIndex: Number(e.target.value) },
            })
          }
        >
          {question.options.map((_, index) => (
            <option value={index} key={index}>
              Отговор {index + 1}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Обяснение">
        <textarea
          required
          minLength={10}
          maxLength={3000}
          rows={4}
          value={question.explanation}
          onChange={(e) =>
            change({ question: { ...question, explanation: e.target.value } })
          }
        />
      </Field>
      <SourceFields
        value={document.sources}
        change={(sources) => change({ sources })}
      />
    </>
  );
}
function Sections({
  value,
  change,
}: {
  value: { title: string; body: string; bullets?: string[] }[];
  change: (
    sections: { title: string; body: string; bullets?: string[] }[],
  ) => void;
}) {
  function patch(
    index: number,
    update: { title?: string; body?: string; bullets?: string[] },
  ) {
    change(
      value.map((section, i) =>
        i === index ? { ...section, ...update } : section,
      ),
    );
  }
  return (
    <>
      <FieldsHeading
        title="Секции"
        help="Обясни темата с пример и посочи ограниченията. Добави поне една секция."
      />
      {value.map((section, index) => (
        <div className={styles.repeater} key={index}>
          <div className={styles.repeatHeading}>
            <strong>Секция {index + 1}</strong>
            <button
              type="button"
              disabled={value.length === 1}
              onClick={() => change(value.filter((_, i) => i !== index))}
            >
              Премахни
            </button>
          </div>
          <Field label="Заглавие на секцията">
            <input
              required
              minLength={2}
              maxLength={180}
              value={section.title}
              onChange={(e) => patch(index, { title: e.target.value })}
            />
          </Field>
          <Field label="Текст">
            <textarea
              required
              minLength={10}
              maxLength={8000}
              rows={5}
              value={section.body}
              onChange={(e) => patch(index, { body: e.target.value })}
            />
          </Field>
          {section.bullets !== undefined && (
            <Field label="Точки" hint="По една точка на ред.">
              <textarea
                rows={3}
                value={section.bullets.join("\n")}
                onChange={(e) =>
                  patch(index, {
                    bullets: e.target.value ? e.target.value.split("\n") : [],
                  })
                }
              />
            </Field>
          )}
          <button
            type="button"
            className={styles.inlineLink}
            onClick={() =>
              patch(index, {
                bullets: section.bullets === undefined ? [] : undefined,
              })
            }
          >
            {section.bullets === undefined
              ? "Добави списък към секцията"
              : "Скрий списъка"}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={value.length >= 16}
        onClick={() => change([...value, { title: "", body: "" }])}
      >
        <Plus size={17} />
        Добави секция
      </button>
    </>
  );
}
function Links({
  value,
  change,
}: {
  value: { title: string; url: string }[];
  change: (links: { title: string; url: string }[]) => void;
}) {
  return (
    <>
      <FieldsHeading
        title="Външни източници"
        help="Свържи директно към източника и провери дали подкрепя текста. Адресът трябва да започва с https://."
      />
      {value.map((item, i) => (
        <div className={styles.repeater} key={i}>
          <div className={styles.repeatHeading}>
            <strong>Източник {i + 1}</strong>
            <button
              type="button"
              onClick={() => change(value.filter((_, j) => i !== j))}
            >
              Премахни
            </button>
          </div>
          <Field label="Име">
            <input
              required
              minLength={2}
              maxLength={180}
              value={item.title}
              onChange={(e) =>
                change(
                  value.map((link, j) =>
                    j === i ? { ...link, title: e.target.value } : link,
                  ),
                )
              }
            />
          </Field>
          <Field label="HTTPS адрес">
            <input
              type="url"
              pattern="https://.*"
              required
              maxLength={1000}
              value={item.url}
              onChange={(e) =>
                change(
                  value.map((link, j) =>
                    j === i ? { ...link, url: e.target.value } : link,
                  ),
                )
              }
            />
          </Field>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={value.length >= 12}
        onClick={() => change([...value, { title: "", url: "" }])}
      >
        <Plus size={17} />
        Добави източник
      </button>
    </>
  );
}
function SourceFields({
  value,
  change,
}: {
  value: UniverseUnit["sources"];
  change: (sources: UniverseUnit["sources"]) => void;
}) {
  return (
    <>
      <FieldsHeading
        title="Източници"
        help="Добави поне един източник. Разграничи авторска идея от резултат на изследване."
      />
      {value.map((item, i) => (
        <div className={styles.repeater} key={i}>
          <div className={styles.repeatHeading}>
            <strong>Източник {i + 1}</strong>
            <button
              type="button"
              disabled={value.length === 1}
              onClick={() => change(value.filter((_, j) => i !== j))}
            >
              Премахни
            </button>
          </div>
          <Field label="Име">
            <input
              required
              minLength={2}
              maxLength={180}
              value={item.title}
              onChange={(e) =>
                change(
                  value.map((source, j) =>
                    j === i ? { ...source, title: e.target.value } : source,
                  ),
                )
              }
            />
          </Field>
          <Field label="HTTPS адрес">
            <input
              type="url"
              pattern="https://.*"
              required
              maxLength={1000}
              value={item.url}
              onChange={(e) =>
                change(
                  value.map((source, j) =>
                    j === i ? { ...source, url: e.target.value } : source,
                  ),
                )
              }
            />
          </Field>
          <Field label="Тип източник">
            <select
              value={item.kind}
              onChange={(e) =>
                change(
                  value.map((source, j) =>
                    j === i
                      ? {
                          ...source,
                          kind: e.target
                            .value as UniverseUnit["sources"][number]["kind"],
                        }
                      : source,
                  ),
                )
              }
            >
              <option value="primary">Първоизточник</option>
              <option value="official">Официална институция</option>
              <option value="author">Авторска рамка</option>
            </select>
          </Field>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={value.length >= 12}
        onClick={() =>
          change([...value, { title: "", url: "", kind: "primary" }])
        }
      >
        <Plus size={17} />
        Добави източник
      </button>
    </>
  );
}
