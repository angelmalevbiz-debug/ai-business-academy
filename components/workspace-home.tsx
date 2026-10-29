'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, ArrowLeft, ArrowUpRight, Check, Circuitry, Code, Compass, Eye, Hand, Pause, Play, Question, CaretDown, X } from '@phosphor-icons/react';
import type { LearningPath, Lesson, WorkspaceData } from '@/lib/domain';
import styles from './workspace-home.module.css';
import {AcademyEntry,type EntryGoal} from './academy-entry';

const JourneyScene = dynamic(() => import('./journey-scene'), { ssr: false, loading: () => <div className={styles.sceneLoading} role="status">Подготвяме картата…</div> });
type Phase = 'arrival' | 'choose' | 'map';
type SavedJourney = { phase: Phase; pathId: string; selectedId?: string };
const choices: Record<string, { title:string; icon:typeof Circuitry; example?:[string,string,string] }> = {
  automation:{title:'Автоматизирай задача',icon:Circuitry,example:['Задача','AI чернова','Твоя проверка']},
  'ai-development':{title:'Направи AI продукт',icon:Code,example:['Идея','Прототип','Първи тест']},
  'ai-for-business':{title:'Подобри процес в бизнеса',icon:Compass,example:['Процес','Промяна','Резултат']},
};
function readJourney(key:string): SavedJourney | null {
  try { const value=JSON.parse(sessionStorage.getItem(key)||'null'); return value && ['arrival','choose','map'].includes(value.phase) && typeof value.pathId === 'string' ? value : null; } catch { return null; }
}

type WorkspaceHomeProps={
  data:WorkspaceData|null;path:LearningPath;lessons:Lesson[];nextLesson:Lesson;pathDone:boolean;
  openLesson:(id:string)=>void;openPath:()=>void;openDaily:()=>void;openLibrary:()=>void;openCommunity:()=>void;openUniverse:()=>void;openBusiness:()=>void;openWorkflow:(goal:EntryGoal,recipe?:string)=>void;openWork:(id:string)=>void;openPost:(id:string)=>void;setup:()=>void;shareProgress:()=>void;initialPhase?:Phase;
};
export function WorkspaceHome(props:WorkspaceHomeProps){
  return props.initialPhase?<LearningMapHome {...props}/>:<AcademyEntry data={props.data} nextLesson={props.nextLesson} openWorkflow={props.openWorkflow} openBusiness={props.openBusiness} openWork={props.openWork} openUniverse={props.openUniverse} openLesson={props.openLesson} openLibrary={props.openLibrary} openCommunity={props.openCommunity}/>;
}
function LearningMapHome({ data, path, lessons, nextLesson, openLesson, openLibrary, openCommunity, setup, shareProgress, initialPhase }: WorkspaceHomeProps) {
  const user=data?.user;
  const sessionKey=`academy:journey:${user?.id||'guest'}`;
  const [saved]=useState(()=> typeof window==='undefined' ? null : readJourney(sessionKey));
  const [phase,setPhase]=useState<Phase>(initialPhase || (user?.profile ? 'map' : saved?.phase || 'arrival'));
  const [pathId,setPathId]=useState(saved?.pathId || path.id);
  const paths=(data?.catalog.paths||[path]).filter(item=>item.lessonIds.length);
  const activePath=paths.find(item=>item.id===pathId)||path;
  const units=activePath.lessonIds.map(id=>lessons.find(item=>item.id===id)).filter((item):item is Lesson=>!!item && (user?.ageBand!=='14-17'||!item.adultOnly));
  const completed=data?.completedLessonIds||[];
  const revision=data?.submissions.find(item=>item.userId===user?.id && item.status==='needs_changes' && units.some(unit=>unit.id===item.lessonId));
  const draft=data?.development.drafts.find(item=>item.text.trim()&&units.some(unit=>unit.id===item.lessonId));
  const suggestedId=revision?.lessonId || draft?.lessonId || units.find(item=>!completed.includes(item.id))?.id || units[0]?.id || nextLesson.id;
  const [selectedId,setSelectedId]=useState(saved?.selectedId && units.some(item=>item.id===saved.selectedId) ? saved.selectedId : suggestedId);
  const selected=Math.max(0,units.findIndex(item=>item.id===selectedId));
  const lesson=units[selected]||nextLesson;
  const [overview,setOverview]=useState(phase!=='map');
  const [paused,setPaused]=useState(false);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [listOpen,setListOpen]=useState(false);
  const [guide,setGuide]=useState<number|null>(null);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const guideRef=useRef<HTMLDialogElement>(null);
  const guideOpen=guide!==null;
  const mapListRef=useRef<HTMLDetailsElement>(null);

  useEffect(()=>{ try { sessionStorage.setItem(sessionKey,JSON.stringify({phase,pathId,selectedId})); } catch {} },[sessionKey,phase,pathId,selectedId]);
  useEffect(()=>{ const preference=matchMedia('(prefers-reduced-motion: reduce)'); const update=()=>setReducedMotion(preference.matches); update();preference.addEventListener('change',update);return()=>preference.removeEventListener('change',update); },[]);
  useEffect(()=>{if(!guideOpen)return;const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;const dialog=guideRef.current;dialog?.showModal();return()=>{dialog?.close();if(opener?.isConnected)requestAnimationFrame(()=>opener.focus());};},[guideOpen]);
  function changePhase(value:Phase){setPhase(value);setGuide(null);setOverview(value!=='map');requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:"instant"});headingRef.current?.focus({preventScroll:true});});}
  function choosePath(id:string){setPathId(id);const chosen=paths.find(item=>item.id===id);const first=chosen?.lessonIds.find(key=>user?.ageBand!=='14-17'||!lessons.find(item=>item.id===key)?.adultOnly);if(first)setSelectedId(first);}
  function selectLevel(index:number){const item=units[index];if(item){setSelectedId(item.id);setOverview(false);if(window.innerHeight<=780)requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"instant"}));}}
  const sceneNodes=units.map(item=>({id:item.id,label:item.title,done:completed.includes(item.id)}));
  function selectSceneLevel(index:number){if(phase==='map')selectLevel(index);}
  useEffect(()=>{if(!listOpen)return;const close=(event:PointerEvent)=>{if(!mapListRef.current?.contains(event.target as Node)){if(mapListRef.current)mapListRef.current.open=false;}};const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();if(mapListRef.current){mapListRef.current.open=false;mapListRef.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[listOpen]);
  const doneCount=units.filter(item=>completed.includes(item.id)).length;
  const allDone=units.length>0&&doneCount===units.length;
  const guidance=[
    {title:'Пусни готовия пример.',text:'Гледай какво става или направи един избор. Не е нужно да попълваш нищо.',icon:Compass},
    {title:'Виж последицата.',text:'Сравни различни решения. Свой случай можеш да пробваш отделно, когато поискаш.',icon:Circuitry},
    {title:'Показваш и трудностите.',text:'Хората следят пътя, не съвършенството. Сподели какво пробва и къде се затрудни.',icon:Hand},
  ];
  const GuideIcon=guidance[guide||0].icon;

  return <section className={styles.experience} data-phase={phase} data-overview={overview} data-motion={paused||reducedMotion?'static':'animated'} aria-label="Твоето пространство за учене">
    <div className={styles.scene} inert={phase!=='map'} aria-hidden={phase!=='map'}><JourneyScene key={activePath.id} nodes={sceneNodes} selected={selected} onSelect={selectSceneLevel} overview={phase!=='map'||overview} reducedMotion={reducedMotion} paused={paused||guide!==null} /></div>
    <div className={styles.scrim} aria-hidden="true" />
    {phase==='map'&&<nav className={styles.pathContext} aria-label="Посока на обучението"><button onClick={()=>changePhase('choose')} aria-label="Промени посоката"><span>{activePath.title}</span><CaretDown size={15}/></button></nav>}
    <div className={styles.content}>
      {phase==='arrival' && <div className={styles.arrival} key="arrival"><h1 ref={headingRef} tabIndex={-1}>Виж как става.<br/><em>После решаваш.</em></h1><button className={styles.primary} onClick={()=>openLesson(suggestedId)}>Пусни първия пример<Play size={20} weight="fill"/></button><button className={styles.arrivalExplore} onClick={()=>changePhase('choose')}>Или избери друга посока<ArrowRight size={17}/></button></div>}
      {phase==='choose' && <div className={styles.choiceScreen} key="choose"><button className={styles.back} onClick={()=>changePhase('arrival')}><ArrowLeft size={17}/>Назад</button><h1 ref={headingRef} tabIndex={-1}>Какво искаш<br/><em>да направиш?</em></h1><fieldset className={styles.choices}><legend className="sr-only">Посока за първия ти проект</legend>{paths.map(item=>{const choice=choices[item.id]||{title:item.title,icon:Compass};return <label key={item.id} className={`${styles.choice} ${activePath.id===item.id?styles.chosen:''}`}><input name="journey-direction" type="radio" value={item.id} checked={activePath.id===item.id} onChange={()=>choosePath(item.id)}/><choice.icon size={26} weight="duotone"/><span><strong>{choice.title}</strong></span><Check className={styles.choiceCheck} size={19}/>{activePath.id===item.id&&choice.example&&<span className={styles.resultFlow} aria-label="Пътят на проекта">{choice.example.map((step,index)=><span key={step}>{index>0&&<ArrowRight size={13} aria-hidden="true"/>}<span>{step}</span></span>)}</span>}</label>;})}</fieldset><button className={styles.primary} onClick={()=>changePhase('map')}>Влез в картата<ArrowRight size={21}/></button></div>}
      {phase==='map' && !overview && <div className={styles.levelScreen} key={`level-${lesson.id}`}>
        <h1 ref={headingRef} tabIndex={-1}>{lesson.title}</h1><p className={styles.lessonContext}>{lesson.id==='process-map'?'Избери една повтаряща се задача. Покажи как я вършиш сега.':lesson.summary}</p>
        <div className={styles.lessonFacts}><span>Интерактивен пример</span>{completed.includes(lesson.id)&&<span className={styles.done}><Check size={16}/>Има запазена работа</span>}{lesson.adultOnly&&<span>18+</span>}</div>
        <button className={styles.primary} onClick={()=>openLesson(lesson.id)}>Пусни примера<Play size={20} weight="fill"/></button>
        <p className={styles.fallbackNote}>3D картата не е налична. Можеш да избереш същите уроци от опростения изглед.</p><button className={styles.mapOverview} onClick={()=>setOverview(value=>!value)} aria-pressed={overview}><Eye size={18}/>{overview?'Приближи избрания урок':'Виж цялата карта'}</button>
        {revision?.lessonId===lesson.id&&<p className={styles.savedNote}>Има обратна връзка. Можеш да предадеш нова версия.</p>}{draft?.lessonId===lesson.id&&<p className={styles.savedNote}>Черновата ти е запазена. Продължи от нея.</p>}
        {allDone&&<div className={styles.finish}><p>Всички уроци са отбелязани. Покажи как се получи проектът.</p><button className={styles.textButton} onClick={shareProgress}>Сподели опит<ArrowUpRight size={17}/></button><button className={styles.textButton} onClick={()=>changePhase('choose')}>Избери следваща посока<ArrowRight size={17}/></button></div>}
      </div>}
      {phase==='map' && overview && <div className={styles.mapSummary}><h1 ref={headingRef} tabIndex={-1}>Свържи картината.</h1><p>Всяко място показва различна част от един проект.</p><button className={styles.textButton} onClick={()=>setOverview(false)}>Към избрания пример<ArrowRight size={17}/></button></div>}
    </div>
    {phase==='arrival'&&<div className={styles.arrivalArt} aria-hidden="true"><div className={styles.arrivalStages}><span><i/>01&nbsp; ИДЕЯ</span><b/><span><i/>02&nbsp; ОПИТ</span><b/><span className={styles.lastStage}><i/>03&nbsp; ПРОЕКТ</span></div></div>}
    <footer className={styles.footer}>
    {phase==='map'&&<div className={styles.mapDock} aria-label="Навигация между уроците"><button onClick={()=>selectLevel(selected-1)} disabled={selected===0} aria-label="Предишно ниво"><ArrowLeft size={19}/></button><span aria-live="polite"><small>Урок</small><strong>{String(selected+1).padStart(2,'0')}</strong><i/><small>{String(units.length).padStart(2,'0')}</small></span><button onClick={()=>selectLevel(selected+1)} disabled={selected>=units.length-1} aria-label="Следващо ниво"><ArrowRight size={19}/></button></div>}
    <div className={styles.utilities}><button onClick={()=>setGuide(0)}><Question size={18}/>Как работи?</button><button onClick={()=>setPaused(value=>!value)} aria-label={paused?'Пусни движението':'Спри движението'} aria-pressed={paused}>{paused?<Play size={17}/>:<Pause size={17}/>}<span>{paused?'Пусни движението':'Спри движението'}</span></button></div>{phase==='map'&&<details ref={mapListRef} className={styles.levelList} onToggle={event=>setListOpen(event.currentTarget.open)}><summary>Всички уроци</summary><div className={styles.levelListPanel}><h2>{activePath.title}</h2><p>{doneCount} от {units.length} завършени</p><ol>{units.map((item,index)=><li key={item.id}><button onClick={()=>{selectLevel(index);if(mapListRef.current)mapListRef.current.open=false;}} aria-current={index===selected?'step':undefined}><span>{completed.includes(item.id)?<Check size={16}/>:index+1}</span><strong>{item.title}</strong><small>{item.minutes} мин</small></button></li>)}</ol><button className={styles.textButton} onClick={setup}>{user?.profile?'Промени плана':'Запази своя план'}<ArrowUpRight size={16}/></button><button className={styles.textButton} onClick={openLibrary}>Библиотека<ArrowUpRight size={16}/></button></div></details>}
    {phase==='arrival'&&<button className={styles.explore} onClick={openLibrary}>Предпочиташ сам да разгледаш?<ArrowUpRight size={15}/></button>}
    </footer>
    {guide!==null&&<dialog ref={guideRef} className={styles.guideShade} aria-labelledby="journey-guide-title" onCancel={()=>setGuide(null)} onClick={event=>{if(event.target===event.currentTarget)setGuide(null);}}><section className={styles.guide}><button className={styles.guideClose} aria-label="Затвори упътването" onClick={()=>setGuide(null)}><X size={22}/></button><div className={styles.guideVisual} key={guide}><GuideIcon size={76} weight="duotone"/><span>{guide+1}/3</span></div><h2 id="journey-guide-title">{guidance[guide].title}</h2><p>{guidance[guide].text}</p><div className={styles.guideActions}>{guide>0&&<button className={styles.textButton} onClick={()=>setGuide(guide-1)}>Назад</button>}<button className={styles.primary} onClick={()=>guide<2?setGuide(guide+1):setGuide(null)}>{guide<2?'Продължи':'Разбрах'}<ArrowRight size={18}/></button></div><button className={styles.textButton} onClick={()=>{setGuide(null);openCommunity();}}>Имам въпрос<ArrowUpRight size={16}/></button></section></dialog>}
  </section>;
}
