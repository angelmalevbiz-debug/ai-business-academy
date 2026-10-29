'use client';

import Image from 'next/image';
import {ArrowRight,ArrowUpRight,FileText,FlowArrow,Clock} from '@phosphor-icons/react';
import type {WorkspaceData,Lesson} from '@/lib/domain';
import styles from './academy-entry.module.css';
import {useWorkflowResume} from './use-workflow-resume';

export type EntryGoal='content'|'business'|'automation';
const destinations=[
 {id:'content',title:'Съдържание за моя бизнес',short:'Съдържание',benefit:'Идеи, текстове и сценарии.',recipe:'content-content-week'},
 {id:'business',title:'Развитие на бизнес',short:'Бизнес',benefit:'Започни или развий своя бизнес.',recipe:'sales-offer-one-page'},
 {id:'automation',title:'По-малко ръчна работа',short:'По-малко рутина',benefit:'Подреди повтарящата се работа.',recipe:'operations-process-map'},
 {id:'focus',title:'Фокус и ясни решения',short:'Фокус и навици',benefit:'Една задача. По-ясно решение.',recipe:null},
] as const;

export function AcademyEntry({data,nextLesson,openWorkflow,openBusiness,openWork,openUniverse,openLesson,openLibrary,openCommunity}:{data:WorkspaceData|null;nextLesson:Lesson;openWorkflow:(goal:EntryGoal,recipe?:string)=>void;openBusiness:()=>void;openWork:(id:string)=>void;openUniverse:()=>void;openLesson:(id:string)=>void;openLibrary:()=>void;openCommunity:()=>void}){
 const work=useWorkflowResume(data?.user?.id);
 const ownDraft=data?.development.drafts.find(item=>item.text.trim());
 const revision=data?.submissions.find(item=>item.userId===data.user?.id&&item.status==='needs_changes');
 const resume=data?.catalog.lessons.find(item=>item.id===(revision?.lessonId||ownDraft?.lessonId));
 return <section className={styles.entry} aria-label="Избери какво искаш да направиш">
  <header className={styles.heading}><h1>Какво искаш да направиш?</h1><p>Отвори направо това, което ти трябва.</p></header>
  <div className={styles.launch}>
   <nav className={styles.destinations} aria-label="Какво искаш да постигнеш">
    {destinations.map(item=><button key={item.id} className={styles.destination} data-kind={item.id} aria-label={item.title} onClick={()=>item.id==='focus'?openUniverse():item.id==='business'?openBusiness():openWorkflow(item.id,item.recipe)}>
      <span className={styles.copy}><strong>{item.short}</strong><span>{item.benefit}</span></span>
      <span className={styles.art} aria-hidden="true"><DestinationArt kind={item.id}/></span>
      <ArrowUpRight className={styles.arrow} size={26} aria-hidden="true"/>
    </button>)}
   </nav>
   <aside className={styles.resume} aria-busy={work.loading}>
    <div><Clock size={24}/><h2>{work.project||resume?'Продължи работата си.':work.loading?'Запазената ти работа.':'Пробвай един пример.'}</h2></div>
    {work.project?<><div className={styles.resumeWork}><FileText size={55} weight="thin"/><strong>{work.project.title}</strong><p>{work.run?.status==='awaiting_approval'?'Текстът е готов за твоя преглед.':work.run?.autoStatus==='queued'||work.run?.autoStatus==='running'?'Екипът работи по задачата.':work.run?.status==='failed'?'Задачата е запазена. Нужно е повторение.':'Твоята запазена AI задача.'}</p></div><button className={styles.primary} onClick={()=>openWork(work.project!.id)}>{work.run?.status==='awaiting_approval'?'Прегледай резултата':'Продължи задачата'}<ArrowRight size={21}/></button></>:resume?<><div className={styles.resumeWork}><FileText size={55} weight="thin"/><strong>{resume.title}</strong><p>{revision?'Има обратна връзка за преглед.':'Твоята запазена чернова.'}</p></div><button className={styles.primary} onClick={()=>openLesson(resume.id)}>Продължи черновата<ArrowRight size={21}/></button></>:work.loading?<div className={styles.resumeWork} role="status"><FileText size={55} weight="thin"/><p>Зареждаме последната ти задача…</p></div>:<><div className={styles.resumeWork}><div className={styles.sampleFlow} aria-hidden="true"><FileText size={27}/><ArrowRight size={20}/><FlowArrow size={31}/></div><strong>{nextLesson.title}</strong><p>Готова ситуация. Ти избираш какво да се случи.</p></div><button className={styles.primary} onClick={()=>openLesson(nextLesson.id)}>Виж един готов пример<ArrowRight size={21}/></button></>}
    {work.failed?<div className={styles.resumeError}><p>Запазените AI задачи не се заредиха.</p><button onClick={work.retry}>Опитай отново<ArrowRight size={17}/></button></div>:null}
   </aside>
  </div>
  <footer className={styles.footer}><button onClick={openLibrary}>Всички примери<ArrowUpRight size={18}/></button><button onClick={openCommunity}>Попитай общността<ArrowUpRight size={18}/></button></footer>
 </section>;
}
function DestinationArt({kind}:{kind:'content'|'business'|'automation'|'focus'}){
 return <Image src={`/reference-20261028/nav-${kind}.webp`} alt="" fill sizes="(max-width:370px) 75px, (max-width:760px) 96px, (max-width:1250px) 150px, 190px" className={styles.destinationImage} loading="eager"/>;
}

