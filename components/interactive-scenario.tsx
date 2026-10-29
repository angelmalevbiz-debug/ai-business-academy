'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowCounterClockwise, Check, EnvelopeSimple, Play, Pause, CaretDown } from '@phosphor-icons/react';
import { SCENARIOS } from '@/lib/interactive-scenarios';
import styles from './interactive-scenario.module.css';
import {PositioningCandle} from './positioning-candle';

type SavedScene = {index:number;selected:number|null;finished:boolean};
function readScene(key:string, sizes:number[]):SavedScene {
  try { const saved=JSON.parse(sessionStorage.getItem(key)||'null'); if(saved&&Number.isInteger(saved.index)&&saved.index>=0&&saved.index<sizes.length&&(saved.selected===null||(Number.isInteger(saved.selected)&&saved.selected>=0&&saved.selected<sizes[saved.index]))&&typeof saved.finished==='boolean')return saved; } catch {}
  return {index:0,selected:null,finished:false};
}
function reveal(element:HTMLElement|null) {
  if(!element)return;
  element.focus({preventScroll:true});
  const bounds=element.getBoundingClientRect();
  if(bounds.top<85||bounds.bottom>window.innerHeight-25)element.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}

export function InteractiveScenario({ scenarioId, scope='guest', next, practice, title, summary, primary=false, restricted=false }: {
  scenarioId:string;scope?:string;next?:()=>void;practice?:()=>void;title?:string;summary?:string;primary?:boolean;restricted?:boolean;
}) {
  const scenario=SCENARIOS[scenarioId];
  const signature=scenario?.steps.map(step=>step.id).join('|')||'';
  const storageKey=`academy:scene:v1:${scope}:${scenarioId}:${signature}`;
  const [state,setState]=useState<SavedScene>(()=>typeof window==='undefined'?{index:0,selected:null,finished:false}:readScene(storageKey,scenario?.steps.map(item=>item.options.length)||[]));
  const [watching,setWatching]=useState(false);
  const [details,setDetails]=useState(false);
  const resultRef=useRef<HTMLDivElement>(null);
  const titleRef=useRef<HTMLHeadingElement>(null);
  const panelId=useId();
  const step=scenario?.steps[state.index];
  const selected=state.selected===null?null:step?.options[state.selected];
  useEffect(()=>{try {sessionStorage.setItem(storageKey,JSON.stringify(state));}catch{}},[state,storageKey]);
  useEffect(()=>{
    if(!watching||!scenario||!step||state.finished)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer=setTimeout(()=>{
      if(state.selected===null){const index=step.options.findIndex(option=>option.correct);setState(current=>({...current,selected:index<0?0:index}));}
      else if(state.index<scenario.steps.length-1){setState(current=>({index:current.index+1,selected:null,finished:false}));setDetails(false);}
      else {setState(current=>({...current,finished:true}));setWatching(false);}
    },state.selected===null?(reduced?1600:1800):3400);
    return ()=>clearTimeout(timer);
  },[watching,scenario,step,state]);
  useEffect(()=>{
    const stop=()=>{if(document.hidden)setWatching(false);};
    document.addEventListener('visibilitychange',stop);
    return()=>document.removeEventListener('visibilitychange',stop);
  },[]);
  const Heading=primary?'h1':'h2';
  if(restricted)return <section className={styles.experience}><div className={styles.finish}><Heading>Този пример е за пълнолетни.</Heading><p>Продължи с учебен случай без търговски отношения.</p>{next&&<button className={styles.action} onClick={next}>Към друг пример<ArrowRight size={20}/></button>}</div></section>;
  if(!scenario||!step)return <section className={styles.experience}><div className={styles.finish}><Heading>{title||'Нов материал'}</Heading>{summary&&<p>{summary}</p>}<p>За този материал още няма интерактивна ситуация.</p>{practice&&<button className={styles.action} onClick={practice}>Отвори материала<ArrowRight size={20}/></button>}</div></section>;
  const visual=selected?.visual||step.visual;
  const light=['inbox','compare','evidence','scope'].includes(visual.kind);
  function choose(index:number){setWatching(false);setState(current=>({...current,selected:index}));setDetails(false);requestAnimationFrame(()=>reveal(resultRef.current));}
  function advance(){setDetails(false);if(state.index<scenario.steps.length-1)setState(current=>({index:current.index+1,selected:null,finished:false}));else{setState(current=>({...current,finished:true}));setWatching(false);}requestAnimationFrame(()=>reveal(titleRef.current));}
  function restart(){setWatching(false);setDetails(false);setState({index:0,selected:null,finished:false});requestAnimationFrame(()=>reveal(titleRef.current));}
  return <section className={styles.experience} data-scenario={scenarioId} data-state={state.finished?'finished':selected?'result':'choice'} aria-label="Интерактивен пример">
    <header className={styles.header}>
      <span className={styles.simulation}>Примерни данни</span>
      <button type="button" className={styles.watch} aria-pressed={watching} onClick={()=>{if(state.finished){restart();setWatching(true);}else setWatching(value=>!value);}}>{watching?<Pause size={16}/>:<Play size={16} weight="fill"/>}{watching?'Пауза':'Гледай примера'}</button>
    </header>
    {state.finished?<div className={styles.finish}>
      <div className={styles.finishMark} aria-hidden="true"><Check size={34}/></div><Heading ref={titleRef} tabIndex={-1}>{scenario.finish}</Heading>
      <p>Видя пример. Своя работа можеш да запазиш отделно.</p>
      <div className={styles.finishActions}>{next&&<button type="button" className={styles.action} onClick={next}>Пусни друг пример<ArrowRight size={20}/></button>}{practice&&<button type="button" className={styles.secondary} onClick={practice}>Искам да пробвам със свой случай<ArrowRight size={18}/></button>}<button type="button" className={styles.replay} onClick={restart}><ArrowCounterClockwise size={16}/>Отначало</button></div>
    </div>:<>
      <div className={styles.sceneHeading}><Heading ref={titleRef} tabIndex={-1}>{state.index===0?scenario.hook:step.title}</Heading></div>
      <div className={styles.board} id={panelId} data-light={light} data-kind={visual.kind} data-result={selected?'shown':'hidden'}>
        <span className={styles.sceneLabel}>{scenario.sceneLabel}</span>
        {scenarioId==='product-problem'&&step.id==='change-context'?<PositioningCandle/>:null}
        <div className={styles.visual} key={`${step.id}-${state.selected??'context'}`}>
          {visual.items.map((item,index)=><div key={`${step.id}-${index}`} className={styles.object} data-tone={item.tone||'neutral'}>
            {visual.kind==='inbox'&&<EnvelopeSimple size={22} aria-hidden="true"/>}
            <span className={styles.objectText}><strong>{item.label}</strong>{item.value&&<span>{item.value}</span>}</span>
            {index<visual.items.length-1&&visual.kind==='flow'&&<ArrowRight className={styles.connector} size={24} aria-hidden="true"/>}
          </div>)}
        </div>
        {selected&&<div className={styles.consequence} ref={resultRef} tabIndex={-1} role="status"><span className={styles.branchChoice}>{selected.label}</span><ArrowRight className={styles.resultPointer} size={24} aria-hidden="true"/><strong>{selected.outcome}</strong></div>}
      </div>
      {!selected?<div className={styles.decision}><h3>{step.prompt}</h3><div className={styles.options}>{step.options.map((option,index)=><button type="button" key={option.label} onClick={()=>choose(index)} aria-controls={panelId}><span>{option.label}</span><ArrowRight size={20}/></button>)}</div></div>:<div className={styles.reaction}>
        <p className={styles.takeaway}>{step.takeaway}</p>
        <details open={details} onToggle={event=>setDetails(event.currentTarget.open)}><summary>Защо се получава така?<CaretDown size={15}/></summary><p>{selected.explanation}</p></details>
        <div className={styles.reactionActions}><button type="button" className={styles.action} onClick={advance}>{state.index<scenario.steps.length-1?'Виж следващия случай':'Събери картината'}<ArrowRight size={20}/></button><button type="button" className={styles.replay} onClick={()=>{setWatching(false);setState(current=>({...current,selected:null}));requestAnimationFrame(()=>reveal(titleRef.current));}}><ArrowCounterClockwise size={16}/>Пробвай друг избор</button></div>
      </div>}
    </>}
    <div className={styles.position} role="group" aria-label="Сцени в примера">{scenario.steps.map((item,index)=><button type="button" key={item.id} aria-label={`Сцена ${index+1}: ${item.title}`} aria-pressed={state.index===index&&!state.finished} onClick={()=>{setWatching(false);setDetails(false);setState({index,selected:null,finished:false});requestAnimationFrame(()=>reveal(titleRef.current));}}><i data-active={state.index>=index}/></button>)}</div>
    <div className={styles.liveStatus} role="status" aria-live="polite">{watching?'Примерът върви. Можеш да го спреш по всяко време.':''}</div>
  </section>;
}
