"use client";

import {
  ArrowRight,
  Calculator,
  ChartLine,
  ChatsCircle,
  Check,
  Circuitry,
  Code,
  Cube,
  FlowArrow,
  Handshake,
  ListChecks,
  MagnifyingGlass,
  MapTrifold,
  Notebook,
  RocketLaunch,
  TestTube,
  Wrench,
} from "@phosphor-icons/react";
import type { AgeBand, LearningPath, Lesson } from "@/lib/domain";
import styles from "./learning-journey.module.css";

const lessonIcons: Record<string, typeof FlowArrow> = {
  "process-map": MapTrifold,
  "first-prototype": Circuitry,
  "test-workflow": TestTube,
  "document-case": Notebook,
  "service-offer": Handshake,
  "next-iteration": Wrench,
  "product-problem": MagnifyingGlass,
  "product-scope": Cube,
  "product-prototype": Code,
  "product-feedback": ChatsCircle,
  "business-audit": ListChecks,
  "business-value": Calculator,
  "business-pilot": RocketLaunch,
  "business-decision": ChartLine,
};

interface LearningJourneyProps {
  path: LearningPath;
  lessons: readonly Lesson[];
  completed: readonly string[];
  ageBand?: AgeBand;
  onLesson: (lessonId: string) => void;
}

export function LearningJourney({ path, lessons, completed, ageBand, onLesson }: LearningJourneyProps) {
  const ordered = path.lessonIds
    .map(id => lessons.find(lesson => lesson.id === id))
    .filter((lesson): lesson is Lesson => lesson !== undefined)
    .filter(lesson => ageBand !== "14-17" || !lesson.adultOnly);
  const currentId = ordered.find(lesson => !completed.includes(lesson.id))?.id;

  if (!ordered.length) {
    return <p className={styles.empty}>В този път още няма публикувани уроци.</p>;
  }

  return (
    <div className={styles.journey}>
      <ol className={styles.trail} aria-label={`Уроци в ${path.title}`}>
        {ordered.map((lesson, index) => {
          const done = completed.includes(lesson.id);
          const current = lesson.id === currentId;
          const LessonIcon = lessonIcons[lesson.id] || FlowArrow;
          return (
            <li className={styles.stop} key={lesson.id}>
              {index < ordered.length - 1 && (
                <svg className={`${styles.connector} ${done ? styles.travelled : ""}`} viewBox="0 0 44 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={index % 2 === 0 ? "M1 0 C1 48 43 52 43 100" : "M43 0 C43 48 1 52 1 100"} />
                </svg>
              )}
              <button
                type="button"
                className={`lesson-row ${styles.step} ${done ? styles.done : ""} ${current ? styles.current : ""}`}
                aria-current={current ? "step" : undefined}
                onClick={() => onLesson(lesson.id)}
              >
                <span className={styles.node} aria-hidden="true">
                  {done ? <Check size={29} weight="bold" /> : <LessonIcon size={31} weight="duotone" />}
                  <span className={styles.number}>{index + 1}</span>
                </span>
                <span className={styles.copy}>
                  <span className={styles.meta}>
                    {done ? "Завършен" : current ? "Продължи оттук" : `Урок ${index + 1}`}
                    <span aria-hidden="true">·</span>
                    <span>{lesson.minutes} мин{lesson.adultOnly ? " · 18+" : ""}</span>
                  </span>
                  <strong className={styles.title}>{lesson.title}</strong>
                  {current && <span className={styles.summary}>{lesson.summary}</span>}
                  {current && <span className={styles.open}>Отвори урока <ArrowRight size={18} weight="bold" aria-hidden="true" /></span>}
                </span>
                {!current && <ArrowRight className={styles.nextArrow} size={19} aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
