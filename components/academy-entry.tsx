'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,FileText} from '@phosphor-icons/react';
import type {WorkspaceData,Lesson} from '@/lib/domain';
import styles from './academy-entry.module.css';
import {useWorkflowResume} from './use-workflow-resume';

export type EntryGoal='content'|'business'|'automation';
const destinations=[
 {id:'content',title:'Съдържание за моя бизнес',short:'Съдържание',benefit:'От идея до текст и сценарий.',recipe:'content-content-week'},
 {id:'business',title:'Развитие на бизнес',short:'Моят бизнес',benefit:'Сайт, оферта или ясен план.',recipe:'sales-offer-one-page'},
 {id:'automation',title:'По-малко ръчна работа',short:'По-малко рутина',benefit:'Подреди повтарящата се работа.',recipe:'operations-process-map'},
 {id:'focus',title:'Фокус и ясни решения',short:'Фокус и навици',benefit:'Освободи място за важната задача.',recipe:null},
] as const;
type Goal=typeof destinations[number]['id'];

export function AcademyEntry({data,nextLesson,openWorkflow,openBusiness,openWork,openUniverse,openLesson,openLibrary,openCommunity}:{data:WorkspaceData|null;nextLesson:Lesson;openWorkflow:(goal:EntryGoal,recipe?:string)=>void;openBusiness:()=>void;openWork:(id:string)=>void;openUniverse:()=>void;openLesson:(id:string)=>void;openLibrary:()=>void;openCommunity:()=>void}){
 const work=useWorkflowResume(data?.user?.id);
 const [preview,setPreview]=useState<Goal>('content');
 const ownDraft=data?.development.drafts.find(item=>item.text.trim());
 const revision=data?.submissions.find(item=>item.userId===data.user?.id&&item.status==='needs_changes');
 const resume=data?.catalog.lessons.find(item=>item.id===(revision?.lessonId||ownDraft?.lessonId));
 const status=work.run?.status==='awaiting_approval'?'Готово за твоя преглед':work.run?.autoStatus==='queued'||work.run?.autoStatus==='running'?'Екипът работи':work.run?.status==='failed'?'Нужно е повторение':'Запазена задача';
 return <section className={styles.entry} aria-label="Избери какво искаш да направиш">
  <header className={styles.heading}><h1>С какво започваме?</h1></header>
  {(work.project||resume)?<aside className={styles.resume} aria-label="Продължи работата си">
   <FileText size={21} aria-hidden="true"/><span><strong>{work.project?.title||resume?.title}</strong><small>{work.project?status:revision?'Има обратна връзка':'Запазена чернова'}</small></span>
   <button onClick={()=>work.project?openWork(work.project.id):resume&&openLesson(resume.id)}>Продължи<ArrowRight size={19}/></button>
  </aside>:work.loading?<div className={styles.loading} role="status">Зареждаме запазената работа…</div>:null}
  <div className={styles.launch}>
   <nav className={styles.destinations} aria-label="Какво искаш да постигнеш">
    {destinations.map(item=><button key={item.id} className={styles.destination} data-preview={preview===item.id} onPointerEnter={event=>{if(event.pointerType!=='touch')setPreview(item.id);}} onFocus={()=>setPreview(item.id)} onClick={()=>item.id==='focus'?openUniverse():item.id==='business'?openBusiness():openWorkflow(item.id,item.recipe)}>
     <span className={styles.copy}><strong>{item.short}</strong><span>{item.benefit}</span></span><span className={styles.mobilePreview} aria-hidden="true"><OutcomePreview kind={item.id}/></span><ArrowUpRight className={styles.arrow} size={23} aria-hidden="true"/>
    </button>)}
   </nav>
   <OutcomeStage kind={preview}/>
  </div>
  {work.failed?<div className={styles.resumeError}><p>Запазените задачи не се заредиха.</p><button onClick={work.retry}>Опитай отново<ArrowRight size={17}/></button></div>:null}
  <footer className={styles.footer}><button className={styles.example} onClick={()=>openLesson(nextLesson.id)}>Пробвай с готов пример<ArrowRight size={18}/></button><div><button onClick={openLibrary}>Всички примери<ArrowUpRight size={16}/></button><button onClick={openCommunity}>Попитай общността<ArrowUpRight size={16}/></button></div></footer>
 </section>;
}

function OutcomeStage({kind}:{kind:Goal}){
 const ref=useRef<HTMLDivElement>(null);
 const [playing,setPlaying]=useState(false);
 useEffect(()=>{
  const node=ref.current;
  if(!node||!('IntersectionObserver' in window))return;
  let visible=false;
  const sync=()=>setPlaying(visible&&!document.hidden);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.2});
  observer.observe(node);
  document.addEventListener('visibilitychange',sync);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);};
 },[]);
 return <div ref={ref} className={styles.preview} data-playing={playing} aria-hidden="true"><OutcomePreview key={kind} kind={kind}/></div>;
}

function OutcomePreview({kind}:{kind:Goal}){
 return <div className={styles.previewScene} data-kind={kind}>
  {kind==='content'?<div className={styles.contentArt}><div className={styles.scriptSheet}><div className={styles.sheetHead}><span>Твоята публикация</span><FileText size={18}/></div><p>Покажи<br/><strong>как работиш.</strong></p><div className={styles.copyLines}><i/><i/><i/></div><div className={styles.sheetFoot}><span>Идея</span><ArrowRight size={15}/><span>Сценарий</span><ArrowRight size={15}/><span>Кадри</span></div></div><span className={styles.caption}>Виж идеята, преди да снимаш.</span></div>:
   kind==='business'?<div className={styles.businessArt}><div className={styles.siteSheet}><div className={styles.browserChrome}><i/><i/><i/></div><div className={styles.siteNav}><strong>Твоят бизнес</strong><span>Услуги&nbsp;&nbsp; Контакт</span></div><div className={styles.siteHero}><strong>Това, което<br/>правиш.<br/><em>Вече онлайн.</em></strong><div className={styles.siteShape}><span>Твоята<br/>марка.</span><ArrowUpRight size={24}/></div></div><div className={styles.siteBottom}><span>Твоята оферта</span><span className={styles.siteAction}>Свържи се<ArrowUpRight size={13}/></span></div></div><span className={styles.caption}>Дай форма на своя бизнес.</span></div>:
   kind==='automation'?<div className={styles.processArt}><div className={styles.processStep}><span className={styles.processDot}/><strong>Ново запитване</strong></div><div className={styles.processConnector}/><div className={styles.processStep}><span className={styles.processingDot}/><strong>Подготвен отговор</strong></div><div className={styles.processConnector}/><div className={styles.processStep}><Check size={20}/><strong>Твоята проверка</strong></div><span className={styles.caption}>Пример: по-лесен път до отговора.</span></div>:
   <div className={styles.focusArt}><div className={styles.focusDial}><svg className={styles.focusOrbit} viewBox="0 0 220 220" fill="none"><circle cx="110" cy="110" r="98" pathLength="100"/></svg><span>05<small>минути</small></span></div><strong>Една задача.<br/>Цялото ти внимание.</strong></div>}
 </div>;
}
