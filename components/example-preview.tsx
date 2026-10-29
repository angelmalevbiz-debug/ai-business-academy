'use client';

import {useState} from 'react';
import {ArrowRight,Check,EnvelopeSimple,Hand,ShieldCheck,Cpu,ChatCircleText} from '@phosphor-icons/react';
import styles from './example-preview.module.css';

type PreviewKind='automation'|'development'|'business'|'generic';
type Props={kind:PreviewKind;title:string;tagline:string};

/** Preview switches explain a decision; they never run an AI job or record progress. */
export function ExamplePreview({kind,title,tagline}:Props){
 const [alternative,setAlternative]=useState(false);
 const [interacted,setInteracted]=useState(false);
 function choose(value:boolean){setAlternative(value);setInteracted(true);}
 const controls=(first:string,second:string)=><div className={styles.controls} role="group" aria-label="Смени учебния пример"><button type="button" aria-pressed={!alternative} onClick={()=>choose(false)}>{first}</button><button type="button" aria-pressed={alternative} onClick={()=>choose(true)}>{second}</button></div>;
 if(kind==='automation')return <div className={`${styles.preview} ${styles.automation}`} role="group" aria-label={`Учебна визуализация: ${title}`} data-preview-kind={kind} data-interacted={interacted}>
  <span className={styles.exampleLabel}>Пример · клиентско съобщение</span>
  <div className={styles.routeScene}>
   <div className={styles.envelope} key={`message-${alternative}`}><EnvelopeSimple size={27} aria-hidden="true"/><span>{alternative?'„Променете цената.“':'„Искам оферта.“'}</span><i/><i/></div>
   <div className={styles.connector} aria-hidden="true"><ArrowRight size={24}/></div>
   <div className={styles.gate} data-sensitive={alternative} aria-hidden="true"><Cpu size={44} weight="light"/><span>Проверка</span></div>
   <div className={styles.connector} aria-hidden="true"><ArrowRight size={24}/></div>
   <div className={styles.autoStatus} data-sensitive={alternative} role="status" aria-live={interacted?'polite':'off'} aria-atomic="true"><span key={`route-${alternative}`}>{alternative?<Hand size={31} weight="light" aria-hidden="true"/>:<Check size={31} aria-hidden="true"/>}<strong>{alternative?'За човек':'За обработка'}</strong><small>{alternative?'Ти одобряваш промяната.':'Подготвя се чернова.'}</small></span></div>
  </div>
  {controls('Ново запитване','Смяна на цена')}
 </div>;
 if(kind==='development')return <div className={`${styles.preview} ${styles.development}`} role="group" aria-label={`Учебна визуализация: ${title}`} data-preview-kind={kind} data-interacted={interacted}>
  <span className={styles.exampleLabel}>Пример · проверка на идея</span>
  <div className={styles.conversation} data-concrete={alternative}>
   <div className={styles.quoteCard}><ChatCircleText size={25} aria-hidden="true"/><p className={styles.devQuote} key={`quote-${alternative}`}>{alternative?'Как направи последната оферта?':'Звучи супер!'}</p></div>
   <div className={styles.devFinding} role="status" aria-live={interacted?'polite':'off'} aria-atomic="true"><span key={`finding-${alternative}`}>{alternative?<><Check size={19} aria-hidden="true"/>Търсим конкретен случай.</>:<><Hand size={19} aria-hidden="true"/>Похвалата не е използване.</>}</span></div>
  </div>
  {controls('Похвала','Реална нужда')}
 </div>;
 if(kind==='business')return <div className={`${styles.preview} ${styles.business}`} role="group" aria-label={`Учебна визуализация: ${title}`} data-preview-kind={kind} data-interacted={interacted}>
  <span className={styles.exampleLabel}>Пример · бизнес решение</span>
  <div className={styles.businessScene} data-sensitive={alternative}>
   <div className={styles.businessInput}><span aria-hidden="true">{alternative?<ShieldCheck size={28}/>:<EnvelopeSimple size={28}/>}</span><strong>{alternative?'Плащане':'Запитвания'}</strong></div>
   <div className={styles.businessRoute} aria-hidden="true"><ArrowRight size={24}/></div>
   <div className={styles.businessDecision} role="status" aria-live={interacted?'polite':'off'} aria-atomic="true"><span key={`decision-${alternative}`}>{alternative?<><Hand size={25} aria-hidden="true"/>Човекът одобрява</>:<><Check size={25} aria-hidden="true"/>Малка проба</>}</span></div>
  </div>
  {controls('Запитвания','Плащания')}
 </div>;
 return <div className={`${styles.preview} ${styles.generic}`} role="group" aria-label={`Преглед: ${title}`} data-preview-kind="generic"><span className={styles.exampleLabel}>Пример</span><div className={styles.genericPaper}><Cpu size={38} weight="light" aria-hidden="true"/><strong>{title}</strong><p>{tagline}</p></div></div>;
}
