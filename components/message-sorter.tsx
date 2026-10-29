'use client';

import { useId, useState } from 'react';
import { ArrowRight, EnvelopeSimple, Eye, Check } from '@phosphor-icons/react';
import styles from './message-sorter.module.css';

export type MessageSortResult = {
  category: 'Оферта' | 'За проверка';
  matchedWord: 'оферта' | null;
  needsHumanReview: true;
};

/** The same intentionally limited rule as first-workflow.md. No model or network call. */
export function categorizeMessage(message: string): MessageSortResult {
  const matches = message.toLocaleLowerCase('bg-BG').includes('оферта');
  return {category: matches ? 'Оферта' : 'За проверка', matchedWord: matches ? 'оферта' : null, needsHumanReview: true};
}

const examples = [
  {id:'direct',label:'Иска оферта',text:'Искам оферта за сайт.',expected:'Оферта',note:'Думата е намерена. Човек проверява дали категорията има смисъл.'},
  {id:'synonym',label:'Пита за цена',text:'Колко струва сайт?',expected:'Оферта',note:'Пропуск: това е въпрос за цена, но думата „оферта“ липсва.'},
  {id:'refusal',label:'Отказва оферта',text:'Не искам оферта. Имам друг въпрос.',expected:'За проверка',note:'Грешка: правилото вижда „оферта“, но не разбира отказа.'},
] as const;

export function MessageSorter({primary=false}: {primary?:boolean}) {
  const id = useId();
  const [message,setMessage] = useState<string>(examples[0].text);
  const [result,setResult] = useState<(MessageSortResult & {text: string; run: number}) | null>(null);
  const [runs,setRuns] = useState(0);
  const selected = examples.find(example=>example.text===message);
  const processedExample = result ? examples.find(example=>example.text===result.text) : undefined;
  const mismatch = result && processedExample && result.category!==processedExample.expected;
  const Heading=primary?'h1':'h2';
  function changeMessage(value: string) {setMessage(value);setResult(null);}
  function processMessage() {
    const run = runs+1;
    setRuns(run);
    setResult({...categorizeMessage(message),text:message,run});
  }
  return <section className={styles.sorter} aria-labelledby={`${id}-title`}>
    <header className={styles.heading}>
      <Heading id={`${id}-title`}>Хвани грешката на автоматизацията.</Heading>
      <span className={styles.ruleLabel}>Правило, не AI модел</span>
    </header>
    <div className={styles.examples} role="group" aria-label="Избери измислено запитване">
      {examples.map(example=><button key={example.id} type="button" aria-pressed={selected?.id===example.id} onClick={()=>changeMessage(example.text)}><EnvelopeSimple size={17} aria-hidden="true"/><span>{example.label}</span>{selected?.id===example.id&&<Check size={15} aria-hidden="true"/>}</button>)}
    </div>
    <div className={styles.workspace}>
      <div className={styles.message}>
        <div className={styles.messageHeading}><EnvelopeSimple size={20} aria-hidden="true"/><span>Измислено запитване</span></div>
        <blockquote>{message.trim() || <span className={styles.emptyText}>Празно съобщение</span>}</blockquote>
        <button type="button" className={styles.process} onClick={processMessage}>Обработи<ArrowRight size={19} aria-hidden="true"/></button>
        <details className={styles.customText}>
          <summary>Пробвай друг текст</summary>
          <label htmlFor={`${id}-message`}>Използвай измислен текст.</label>
          <textarea id={`${id}-message`} maxLength={500} rows={3} value={message} onChange={event=>changeMessage(event.target.value)} />
          <small>Остава в този браузър.</small>
        </details>
      </div>
      <div className={styles.connection} aria-hidden="true"><ArrowRight size={24}/></div>
      <div className={`${styles.output} ${result ? styles.hasResult : ''}`} role="status" aria-label="Резултат от правилото" aria-live="polite" aria-atomic="true">
        {result ? <div className={styles.result} key={result.run}>
          <span className={styles.outputLabel}>Получена категория</span>
          <strong className={styles.category}>{result.category}</strong>
          <span className={styles.review}><Eye size={17} aria-hidden="true"/>Изчаква човек</span>
          <p className={mismatch ? styles.mismatch : styles.note}>{processedExample?.note || (!result.text.trim() ? 'Няма текст за категоризиране.' : result.matchedWord ? 'Намерена е думата „оферта“. Смисълът още не е проверен.' : 'Думата „оферта“ липсва. Човек трябва да избере категория.')}</p>
        </div> : <div className={styles.pending}><span className={styles.questionMark} aria-hidden="true">?</span><p>Къде ще попадне?</p></div>}
      </div>
    </div>
    <div className={styles.actions}>
      <details className={styles.rule}>
        <summary>Виж правилото</summary>
        <code>текстът съдържа „оферта“ → Оферта<br/>иначе → За проверка</code>
        <p>Търси дума. Не разбира намерение.</p>
      </details>
    </div>
  </section>;
}
