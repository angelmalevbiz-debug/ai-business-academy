'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,Article,Browser,Check,FileText,ListChecks,Target} from '@phosphor-icons/react';
import type {WorkspaceData,Lesson} from '@/lib/domain';
import {useWorkflowResume} from './use-workflow-resume';
import styles from './academy-entry.module.css';

export type EntryGoal='content'|'business'|'automation';
const destinations=[
 {id:'content',short:'Съдържание',benefit:'Публикации, сценарии и идеи.',recipe:'content-content-week',icon:Article},
 {id:'business',short:'Моят бизнес',benefit:'Сайт, оферта или ясен план.',recipe:'sales-offer-one-page',icon:Browser},
 {id:'automation',short:'По-малко рутина',benefit:'Подреди повтарящите се задачи.',recipe:'operations-process-map',icon:ListChecks},
 {id:'focus',short:'Фокус и навици',benefit:'Отдели време за важната задача.',recipe:null,icon:Target},
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
   <button onClick={()=>work.project?openWork(work.project.id):resume&&openLesson(resume.id)}>Продължи<ArrowRight size={19} aria-hidden="true"/></button>
  </aside>:work.loading?<div className={styles.loading} role="status">Зареждаме запазената работа…</div>:null}
  <div className={styles.launch}>
   <nav className={styles.destinations} aria-label="Какво искаш да постигнеш">
    {destinations.map(item=><button key={item.id} className={styles.destination} data-goal={item.id} data-preview={preview===item.id} onPointerEnter={event=>{if(event.pointerType!=='touch')setPreview(item.id);}} onFocus={()=>setPreview(item.id)} onClick={()=>item.id==='focus'?openUniverse():item.id==='business'?openBusiness():openWorkflow(item.id,item.recipe)}>
     <span className={styles.copy}><strong>{item.short}</strong><span>{item.benefit}</span></span><item.icon className={styles.mobileSymbol} size={31} weight="regular" aria-hidden="true"/><ArrowUpRight className={styles.arrow} size={23} aria-hidden="true"/>
    </button>)}
   </nav>
   <OutcomeStage kind={preview}/>
  </div>
  {work.failed?<div className={styles.resumeError}><p>Запазените задачи не се заредиха.</p><button onClick={work.retry}>Опитай отново<ArrowRight size={17} aria-hidden="true"/></button></div>:null}
  <footer className={styles.footer}><button className={styles.example} onClick={()=>openLesson(nextLesson.id)}>Пробвай с готов пример<ArrowRight size={18} aria-hidden="true"/></button><div><button onClick={openLibrary}>Всички примери<ArrowUpRight size={16} aria-hidden="true"/></button><button onClick={openCommunity}>Попитай общността<ArrowUpRight size={16} aria-hidden="true"/></button></div></footer>
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
  observer.observe(node);document.addEventListener('visibilitychange',sync);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);};
 },[]);
 return <div ref={ref} className={styles.preview} data-playing={playing} aria-hidden="true"><OutcomePreview key={kind} kind={kind}/></div>;
}

function OutcomePreview({kind}:{kind:Goal}){
 return <div className={styles.previewScene} data-kind={kind}>
  {kind==='content'?<div className={styles.contentPreview}>
   <div className={styles.publication}><div className={styles.publicationHeader}><span className={styles.brandMonogram}>A</span><span>AI Business Academy</span></div><div className={styles.publicationVisual}><Article size={27} weight="regular"/><p>Покажи<br/><strong>как работиш.</strong></p><span className={styles.editorRule}/></div><div className={styles.publicationCaption}>Как започна. Какво пробва. Какво промени.</div></div>
   <span className={styles.caption}>Примерна публикация</span>
  </div>:kind==='business'?<div className={styles.businessPreview}>
   <div className={styles.website}><div className={styles.browserBar}><span className={styles.browserDots}><i/><i/><i/></span><span>Твоят сайт</span><Browser size={13}/></div><div className={styles.websiteBody}><div className={styles.websiteNav}><strong>Твоят бизнес</strong><span>Услуги&nbsp;&nbsp; Контакт</span></div><div className={styles.websiteHero}><h2>Услугите ти.<br/>На едно място.</h2><span className={styles.websiteAction}>Изпрати запитване<ArrowUpRight size={13}/></span></div><div className={styles.websiteServices}><span>Услуги</span><span>Цени</span><span>Контакт</span></div></div></div>
   <span className={styles.caption}>Примерна страница за услуги</span>
  </div>:kind==='automation'?<div className={styles.automationPreview}>
   <div className={styles.inquiry}><span className={styles.inquiryLabel}>Ново запитване</span><p>Здравейте, каква е цената?</p></div><div className={styles.replyConnector}><ArrowRight size={19}/></div><div className={styles.reply}><div><Check size={18}/><strong>Подготвен отговор</strong></div><p>Здравейте! Изпращам услугите и цените ни.</p><span>Преглеждаш преди изпращане.</span></div>
   <span className={styles.caption}>Пример за повтаряща се задача</span>
  </div>:<div className={styles.focusPreview}>
   <div className={styles.focusSheet}><div className={styles.focusTime}>05<span>минути за една задача</span></div><div className={styles.focusTask}><span/><strong>Завърши първата чернова.</strong></div><div className={styles.focusRest}><i/><span>Останалото може да изчака.</span></div></div>
   <span className={styles.caption}>Примерен фокус за деня</span>
  </div>}
 </div>;
}
