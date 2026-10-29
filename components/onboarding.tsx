"use client";

import { useState } from "react";
import { ArrowRight, ChartLine, Circuitry, Code } from "@phosphor-icons/react";
import type { Profile, AgeBand } from "@/lib/domain";
import { ModalFrame } from "./ui";

export function Onboarding({
  close,
  save,
  busy,
  error,
  profile,
  ageBand,
}: {
  close: () => void;
  save: (values: Record<string, unknown>) => Promise<void>;
  busy: boolean;
  error: string;
  profile: Profile | null | undefined;
  ageBand: AgeBand;
}) {
  const [goal, setGoal] = useState(profile?.goal || "learn");
  const [level, setLevel] = useState(profile?.level || "beginner");
  const [hours, setHours] = useState<number>(profile?.hours || 5);
  const choices = [
    { id: "learn" as const, title: "AI за работа и лични проекти", text: "Решавам една задача за себе си.", icon: Circuitry },
    { id: "service" as const, title: "Автоматизации като услуга", text: "Подобрявам процес за клиент.", icon: Code },
    { id: "business" as const, title: "AI в собствения бизнес", text: "Тествам промяна в екипа.", icon: ChartLine },
  ];
  return (
    <ModalFrame
      close={close}
      title="Какво искаш да направиш?"
      description="Избери посока. Първия урок ще намериш на картата."
    >
      <fieldset className="choice-list onboarding-choices">
        <legend className="sr-only">Избери учебна посока</legend>
        {choices.map((item) => {
          const GoalIcon = item.icon;
          return (
            <label className={`choice onboarding-goal-choice ${goal === item.id ? "chosen" : ""}`} key={item.id}>
              <input type="radio" name="onboarding-goal" value={item.id} checked={goal === item.id} onChange={() => setGoal(item.id)} />
              <GoalIcon size={22} weight="duotone" aria-hidden="true" />
              <span><strong>{item.title}</strong><small>{item.text}</small></span>
            </label>
          );
        })}
      </fieldset>
      <p className="onboarding-defaults">{level === "beginner" ? "Започваме от основите" : "Продължаваме с практика"} · {hours} {hours === 1 ? "час" : "часа"} седмично</p>
      <details className="onboarding-more">
        <summary>Настройки за учебния ти ритъм</summary>
        <fieldset className="choice-list onboarding-choices onboarding-level-choices">
          <legend>Опит с AI</legend>
          {[{ id: "beginner" as const, title: "Започвам сега" }, { id: "practitioner" as const, title: "Вече правя проекти" }].map(item => (
            <label className={`choice ${level === item.id ? "chosen" : ""}`} key={item.id}>
              <input type="radio" name="onboarding-level" value={item.id} checked={level === item.id} onChange={() => setLevel(item.id)} />
              <span><strong>{item.title}</strong></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="onboarding-time">
          <legend>Време за учене</legend>
          <div className="hours-choices">
            {[2, 5, 10].map((value) => (
              <label key={value} className={hours === value ? "chosen" : ""}>
                <input type="radio" name="onboarding-hours" value={value} checked={hours === value} onChange={() => setHours(value)} />
                <strong>{value}</strong><span>часа</span>
              </label>
            ))}
          </div>
        </fieldset>
      </details>
      {ageBand === "14-17" && (
        <p className="form-note onboarding-safety-note">
          В учебен режим работиш с примерни данни. Търговските задачи са достъпни само за пълнолетни.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding-controls">
        <button
          disabled={busy}
          className="button primary"
          onClick={() => void save({ goal, level, hours, ageBand })}
        >
          {busy ? "Записване…" : "Към моя път"}
          <ArrowRight size={17} />
        </button>
      </div>
    </ModalFrame>
  );
}
