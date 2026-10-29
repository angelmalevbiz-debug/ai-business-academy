"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Pause,
  Play,
  Check,
  CheckCircle,
  Stop,
  ArrowSquareOut,
  CaretRight,
  CaretDown,
  ArrowLeft,
} from "@phosphor-icons/react";
import type { PublicUniverseUnit, WorkspaceData } from "@/lib/domain";
import { ATTENTION_PRACTICE_SCRIPT as practiceScript } from "@/lib/practice-script";
import type { WorkspaceMutator } from "./contracts";
import { CosmicField } from "./cosmic-field";
import { InteractiveScenario } from './interactive-scenario';
import {MindTools} from './mind-tools';

const evidenceLabels = {
  research: "Научни данни и ограничения",
  philosophy: "Философска идея",
  practice: "Авторско упражнение",
};
type UniverseProps = {
  data: WorkspaceData;
  mutate: WorkspaceMutator;
  busy: boolean;
  signIn: () => void;
  openDaily: () => void;
};

export function Universe({
  data,
  mutate,
  busy,
  signIn,
  openDaily,
}: UniverseProps) {
  const units = data.catalog.universeUnits;
  const done = data.development.unitProgress;
  const next =
    units.find(
      (item) => !done.some((progress) => progress.unitId === item.id),
    ) || units[0];
  const [selected, setSelected] = useState<string | null>(()=>{
    if(typeof window==='undefined')return null;
    const topic=new URLSearchParams(window.location.search).get('topic');
    return units.some(item=>item.id===topic)?topic:null;
  });
  const [paused, setPaused] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const selectedIndex = units.findIndex((unit) => unit.id === selected);
  const unit = units[selectedIndex];
  function selectUnit(id: string) {
    setSelected(id);
    setMapOpen(false);
    const url=new URL(window.location.href);url.searchParams.set('topic',id);window.history.replaceState({},'',url);
      requestAnimationFrame(() => {
        const study = document.getElementById("universe-study");
        study?.scrollIntoView({
          behavior:
            paused || matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          block: "start",
        });
        study?.focus({ preventScroll: true });
      });
  }
  function moveToNextTopic() {
    if (selectedIndex >= 0 && selectedIndex < units.length - 1) {
      selectUnit(units[selectedIndex + 1].id);
      return;
    }
    setMapOpen(true);
    requestAnimationFrame(() => {
      const target =
        window.innerWidth < 900
          ? document.querySelector<HTMLElement>(".universe-map-toggle")
          : document.querySelector<HTMLElement>(".universe-map li button.selected");
      target?.focus();
      target?.scrollIntoView({ block: "center" });
    });
  }
  return (
    <section className="universe-view">
      {selected?<header className="universe-situation-bar">
        <div><button className="universe-link" onClick={()=>{setSelected(null);setMapOpen(false);const url=new URL(window.location.href);url.searchParams.delete('topic');window.history.replaceState({},'',url);window.scrollTo({top:0,behavior:'instant'});}}><ArrowLeft size={17}/>Към фокуса и решенията</button><h1>{unit?.title||'Избрана ситуация'}</h1></div>
        <div className="universe-field-wrap">
          <CosmicField focus={selectedIndex} paused={paused} />
          <button
            className="universe-motion"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused}
            aria-label={paused ? "Движението е спряно" : "Спри движението"}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            <span>{paused ? "Пусни движението" : "Спри движението"}</span>
          </button>
        </div>
      </header>:<MindTools data={data} mutate={mutate} busy={busy} signIn={signIn} onChoose={selectUnit}/>}

      <div className="universe-workspace">
        <aside className="universe-map" data-open={mapOpen}>
          <button
            className="universe-map-toggle"
            type="button"
            aria-expanded={mapOpen}
            aria-controls="universe-topic-list"
            onClick={() => setMapOpen((value) => !value)}
          >
            <span>{mapOpen ? "Скрий ситуациите и източниците" : "Други ситуации и източници"}</span>
            <CaretRight size={18} />
          </button>
          <div className="universe-map-content" id="universe-topic-list">
            <div className="universe-map-heading">
              <h2>Разгледай конкретен въпрос</h2>
              <span>{units.length} общо</span>
            </div>
            <ol>
              {units.map((item) => {
                const progress = done.find((entry) => entry.unitId === item.id);
                return (
                  <li key={item.id}>
                    <button
                      className={item.id === selected ? "selected" : ""}
                      onClick={() => selectUnit(item.id)}
                      aria-current={item.id === selected ? "step" : undefined}
                    >
                      <span className="universe-node">
                        {progress ? <Check size={16} /> : <ArrowRight size={14}/>}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.theme}
                        </small>
                      </span>
                      <CaretRight size={14} />
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              className="universe-link map-daily-link"
              onClick={openDaily}
            >
              Към плана за днес
              <ArrowRight size={16} />
            </button>
          </div>
        </aside>
        <div id="universe-study" className="universe-study" tabIndex={-1} hidden={!unit}>
          {unit ? (
            <UniverseUnitView
              key={unit.id}
              unit={unit}
              data={data}
              mutate={mutate}
              busy={busy}
              signIn={signIn}
              next={moveToNextTopic}
              openDaily={openDaily}
            />
          ) : (
            <div className="universe-empty">
              <h2>Избери тема</h2>
              <p>
                Можеш да четеш по ред или да започнеш с въпрос, който те
                занимава в момента.
              </p>
              <button
                className="universe-primary"
                disabled={!next}
                onClick={() => next && selectUnit(next.id)}
              >
                Отвори първата тема
                <ArrowRight size={17} />
              </button>
              <dl className="evidence-key">
                <div>
                  <dt>Научни данни</dt>
                  <dd>Изследвания с посочени ограничения.</dd>
                </div>
                <div>
                  <dt>Философски идеи</dt>
                  <dd>
                    Рамки за обсъждане, които не се представят като научни
                    факти.
                  </dd>
                </div>
                <div>
                  <dt>Упражнения</dt>
                  <dd>Авторски задачи за лична проверка.</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
      <details className="universe-purpose universe-purpose-bottom">
        <summary>
          За материалите и източниците
          <CaretDown size={17} aria-hidden="true" />
        </summary>
        <p>
          „Научни данни“ сочи изследвания и ограниченията им. „Философска идея“
          е рамка за размисъл. „Упражнение“ е лична проба, не доказателство.
        </p>
        <p>Направлението „Как работят успехологията и Вселената, за да постигнеш своите резултати“ разглежда мислене, навици и действия. Материалите са авторски; идеите на Sage се обсъждат като философски възгледи. Нямаме предоставен пълен български текст на книгите му. Използваме посочените публични материали и не ги представяме като прочетени изцяло книги или научни доказателства.</p>
      </details>
      <footer className="universe-footer">
        <p>
          Образователни материали, без диагностика или терапия. При здравен
          проблем се обърни към квалифициран специалист. Не обещаваме финансов
          резултат.
        </p>
      </footer>
    </section>
  );
}

function UniverseUnitView({
  unit,
  data,
  mutate,
  busy,
  signIn,
  next,
  openDaily,
}: {
  unit: PublicUniverseUnit;
  data: WorkspaceData;
  mutate: WorkspaceMutator;
  busy: boolean;
  signIn: () => void;
  next: () => void;
  openDaily: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [stage, setStage] = useState<'understand' | 'check' | 'try'>('understand');
  const [deepOpen,setDeepOpen]=useState(false);
  const reference=useRef<HTMLDetailsElement>(null);
  function changeStage(value: 'understand' | 'check' | 'try') {
    setStage(value);
    requestAnimationFrame(() => document.getElementById(`unit-stage-${unit.id}`)?.focus({preventScroll: true}));
  }
  const [reflection, setReflection] = useState("");
  const feedback =
    data.development.quizFeedback?.unitId === unit.id
      ? data.development.quizFeedback
      : null;
  const progress = data.development.unitProgress.find(
    (entry) => entry.unitId === unit.id,
  );
  const ownReflections = data.development.reflections.filter(
    (entry) => entry.unitId === unit.id,
  );
  async function answer() {
    if (!data.user) {
      signIn();
      return;
    }
    if (choice !== null)
      await mutate({
        action: "answerUnit",
        unitId: unit.id,
        answerIndex: choice,
      });
  }
  return (
    <article className="universe-unit">
      <InteractiveScenario key={`${data.user?.id||'guest'}:${unit.id}`} scenarioId={unit.id} scope={data.user?.id||'guest'} title={unit.title} summary={unit.summary} next={next} practice={()=>{if(reference.current)reference.current.open=true;setDeepOpen(true);changeStage('try');requestAnimationFrame(()=>reference.current?.scrollIntoView({block:'start',behavior:'instant'}));}}/>
      <details className="scene-reference" ref={reference} onToggle={event=>setDeepOpen(event.currentTarget.open)}>
      <summary>Обяснение, източници и лични бележки<CaretDown size={18}/></summary>
      <div className="scene-reference-body">
      <header>
        <div className="unit-labels">
          <span className="evidence-badge">
            {evidenceLabels[unit.evidenceLevel]}
          </span>
          <span>{unit.minutes} мин четене + упражнение</span>
        </div>
        <h2>{unit.title}</h2>
        <p>{unit.summary}</p>
      </header>
      <div className="universe-stage-tabs" role="group" aria-label="Части на темата">
        {([{id:'understand',label:'Разбери'},{id:'check',label:'Провери'},{id:'try',label:'Изпробвай'}] as const).map((item,index)=><button key={item.id} aria-pressed={stage===item.id} aria-controls={`unit-stage-${unit.id}`} onClick={()=>changeStage(item.id)}><span>{String(index+1).padStart(2,'0')}</span>{item.label}{item.id==='check'&&progress&&<Check size={15} aria-label="Отговорено"/>}</button>)}
      </div>
      <div id={`unit-stage-${unit.id}`} className="universe-stage-content" tabIndex={-1}>
      <div hidden={stage!=='understand'}>
      {unit.sections.map((section, index) => (
        <details className="universe-prose" key={section.title}>
          <summary>
            <span className="universe-section-index">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{section.title}</strong>
              <small>{index === 0 ? "Основната идея" : "Още по темата"}</small>
            </span>
            <CaretRight size={17} aria-hidden="true" />
          </summary>
          <p>{section.body}</p>
        </details>
      ))}
      <button className="universe-secondary universe-stage-next" onClick={()=>changeStage('check')}>Провери разбирането си<ArrowRight size={17}/></button>
      </div>
      <section hidden={stage!=='check'} className="universe-question" aria-labelledby="question-heading">
        <h3 id="question-heading">{unit.question.prompt}</h3>
        <fieldset>
          <legend className="sr-only">Избери отговор</legend>
          {unit.question.options.map((option, index) => (
            <label key={option} className={choice === index ? "picked" : ""}>
              <input
                type="radio"
                name={`question-${unit.id}`}
                value={index}
                checked={choice === index}
                onChange={() => setChoice(index)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
        <button
          className="universe-primary"
          disabled={choice === null || busy}
          onClick={() => void answer()}
        >
          {busy ? "Проверка…" : "Провери отговора"}
          <ArrowRight size={17} />
        </button>
        {feedback && (
          <div
            className={`question-feedback ${feedback.correct ? "correct" : ""}`}
            role="status"
          >
            <strong>{feedback.correct ? "Правилно." : "Опитай отново."}</strong>
            <p>{feedback.explanation}</p>
          </div>
        )}
        {progress && (
          <p className="review-due">
            <CheckCircle size={16} />
            Следващ преговор:{" "}
            {new Date(progress.reviewDueAt).toLocaleDateString("bg-BG")}
          </p>
        )}
        <button className="universe-link universe-stage-next" onClick={()=>changeStage('try')}>Към упражнението<ArrowRight size={17}/></button>
      </section>
      <section hidden={stage!=='try'} className="universe-exercise">
        <h3>Упражнение</h3>
        <p>{unit.exercise}</p>
        {unit.id === "attention-to-action" && stage === 'try' && deepOpen && (
          <AttentionPractice
            data={data}
            mutate={mutate}
            busy={busy}
            signIn={signIn}
          />
        )}
        <details className="reflection-capture">
          <summary>
            Запиши си извод
            <span>по желание</span>
            <CaretDown size={16} aria-hidden="true" />
          </summary>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!data.user) {
                signIn();
                return;
              }
              if (
                await mutate(
                  { action: "reflect", unitId: unit.id, text: reflection },
                  "Бележката е запазена.",
                )
              )
                setReflection("");
            }}
          >
            <label htmlFor="reflection">{unit.reflectionPrompt}</label>
            <textarea
              id="reflection"
              minLength={30}
              maxLength={3000}
              rows={3}
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="Напиши какво искаш да запомниш."
              required
            />
            <small>
              Виждаш бележката само ти. Не добавяй здравни или чужди лични данни.
            </small>
            <button className="universe-secondary" disabled={busy}>
              {busy ? "Записване…" : "Запази бележката"}
              <Check size={17} />
            </button>
          </form>
        </details>
        {ownReflections.length > 0 && (
          <details className="reflection-history">
            <summary>Моите бележки ({ownReflections.length})</summary>
            {ownReflections.map((item) => (
              <div key={item.id}>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString("bg-BG")}
                </time>
                <p>{item.text}</p>
              </div>
            ))}
          </details>
        )}
      </section>
      </div>
      <details className="universe-sources universe-source-disclosure">
        <summary>Източници и ограничения <span>{unit.sources.length}</span><CaretDown size={16}/></summary>
        {unit.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              {source.title}
              <small>
                {source.kind === "primary"
                  ? "Първоизточник"
                  : source.kind === "official"
                    ? "Официална институция"
                    : "Авторска идея"}
              </small>
            </span>
            <ArrowSquareOut size={17} />
          </a>
        ))}
      </details>
      </div>
      </details>
      <div className="universe-unit-bottom">
        <button className="universe-link" onClick={openDaily}>
          Към дневния план
          <ArrowUpRight size={17} />
        </button>
        <button className="universe-secondary" onClick={next}>
          Следваща тема
          <ArrowRight size={17} />
        </button>
      </div>
    </article>
  );
}

function AttentionPractice({
  data,
  mutate,
  busy,
  signIn,
}: {
  data: WorkspaceData;
  mutate: WorkspaceMutator;
  busy: boolean;
  signIn: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [message, setMessage] = useState("");
  const speechSession = useRef(0);
  useEffect(
    () => () => {
      speechSession.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );
  function stop() {
    speechSession.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setSpeechPaused(false);
  }
  function speak() {
    if (!("speechSynthesis" in window)) {
      setMessage(
        "Този браузър не поддържа четене на глас. Можеш да прочетеш практиката по-долу.",
      );
      return;
    }
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith("bg"));
    if (!voice) {
      setMessage(
        "Няма наличен български глас. Можеш да прочетеш практиката или да добавиш глас от настройките на устройството.",
      );
      return;
    }
    const session = ++speechSession.current;
    window.speechSynthesis.cancel();
    setMessage("");
    setSpeaking(true);
    setSpeechPaused(false);
    practiceScript.forEach((text, index) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "bg-BG";
      utterance.voice = voice;
      utterance.rate = 0.92;
      utterance.onend = () => {
        if (session !== speechSession.current) return;
        if (index === practiceScript.length - 1) setSpeaking(false);
      };
      utterance.onerror = () => {
        if (session !== speechSession.current) return;
        setSpeaking(false);
        setMessage("Четенето спря. Можеш да продължиш с текста.");
      };
      window.speechSynthesis.speak(utterance);
    });
  }
  if (!data.user)
    return (
      <div className="practice-gate">
        <p>
          Практиката е достъпна за пълнолетни участници. Можеш да продължиш
          обучението и без нея.
        </p>
        <button className="universe-secondary" onClick={signIn}>
          Вход за практика
        </button>
      </div>
    );
  if (data.user.ageBand !== "18+")
    return (
      <div className="practice-gate">
        <p>
          Тази практика е за пълнолетни. Вместо нея запиши кога и къде ще
          изпълниш следващата учебна задача. Това няма да намали напредъка ти.
        </p>
      </div>
    );
  return (
    <div className="attention-practice">
      <h4>Кратка пауза за внимание</h4>
      <p>
        Доброволно упражнение, без хипноза или терапия. Използвай го на
        безопасно място, не при шофиране или работа с техника. При дискомфорт
        спри.
      </p>
      <label className="practice-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (!event.target.checked) stop();
          }}
        />
        Избирам доброволно и съм на безопасно място.
      </label>
      <details>
        <summary>Прочети практиката</summary>
        {practiceScript.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </details>
      <div className="practice-controls">
        <button
          className="universe-secondary"
          disabled={!consent || speaking}
          onClick={speak}
        >
          <Play size={16} />
          Прочети на глас
        </button>
        <button
          className="universe-secondary"
          disabled={!speaking}
          onClick={() => {
            if (speechPaused) window.speechSynthesis.resume();
            else window.speechSynthesis.pause();
            setSpeechPaused((value) => !value);
          }}
        >
          {speechPaused ? <Play size={16} /> : <Pause size={16} />}
          {speechPaused ? "Продължи" : "Пауза"}
        </button>
        <button
          className="universe-secondary"
          disabled={!speaking}
          onClick={stop}
        >
          <Stop size={16} />
          Стоп
        </button>
      </div>
      <small>
        Четенето използва българския глас на устройството, ако има такъв. Няма
        предварително записано аудио.
      </small>
      {message && <p role="status">{message}</p>}
      <button
        className="universe-link"
        disabled={!consent || busy}
        onClick={() =>
          void mutate(
            {
              action: "recordPractice",
              unitId: "attention-to-action",
              consent: true,
            },
            "Практиката е отбелязана.",
          )
        }
      >
        <CheckCircle size={17} />
        Отбележи практиката
      </button>
    </div>
  );
}
