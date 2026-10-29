'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Clock,Pause,Play,Target,ArrowClockwise,Notebook} from '@phosphor-icons/react';
import type {WorkspaceData} from '@/lib/domain';
import type {WorkspaceMutator} from './contracts';
import styles from './mind-tools.module.css';

type Focus={version:1;phase:'setup'|'running'|'paused'|'finished';duration:number;remaining:number;endAt:number|null;task:string};
const emptyFocus=():Focus=>({version:1,phase:'setup',duration:300,remaining:300,endAt:null,task:'Довърши една малка задача.'});
function readFocus(key:string):Focus{try{const value=JSON.parse(sessionStorage.getItem(key)||'null') as Focus;if(!value||value.version!==1||!['setup','running','paused','finished'].includes(value.phase)||![300,900,1500].includes(value.duration)||!Number.isFinite(value.remaining)||value.remaining<0||value.remaining>value.duration||typeof value.task!=='string'||value.task.length>180)return emptyFocus();if(value.phase==='running'){if(!Number.isFinite(value.endAt)||Number(value.endAt)>Date.now()+value.duration*1000)return emptyFocus();if(Number(value.endAt)<=Date.now())return {...value,phase:'finished',remaining:0,endAt:null};}return value;}catch{return emptyFocus();}}
const problems=[
  {id:'attention-and-evidence',title:'Правя прибързани изводи.',diagram:'fact',result:'Отдели факта от предположението.'},
  {id:'values-and-control',title:'Опитвам да контролирам всичко.',diagram:'control',result:'Виж върху какво можеш да действаш.'},
  {id:'environment-and-habits',title:'Повтарям същия лош навик.',diagram:'habit',result:'Промени едно условие около него.'},
  {id:'universe-and-metaphor',title:'Не знам на кои твърдения да вярвам.',diagram:'universe',result:'Разграничи наука, метафора и лична вяра.'},
];
export function MindTools({data,mutate,busy,signIn,onChoose}:{data:WorkspaceData;mutate:WorkspaceMutator;busy:boolean;signIn:()=>void;onChoose:(id:string)=>void}){
  const key=`academy:focus:${data.user?.id||'guest'}`;
  const [focus,setFocus]=useState<Focus>(()=>typeof window==='undefined'?emptyFocus():readFocus(key));
  const [mode,setMode]=useState<'choose'|'focus'>(()=>typeof window!=='undefined'&&readFocus(key).phase==='running'?'focus':'choose');
  const [now,setNow]=useState(()=>Date.now()),[saved,setSaved]=useState(false),[saveError,setSaveError]=useState('');
  useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(focus));}catch{}},[focus,key]);
  useEffect(()=>{if(focus.phase!=='running'||!focus.endAt)return;const timer=setInterval(()=>{const current=Date.now();setNow(current);if(current>=Number(focus.endAt))setFocus(value=>value.phase==='running'&&value.endAt===focus.endAt?{...value,phase:'finished',remaining:0,endAt:null}:value);},1000);return()=>clearInterval(timer);},[focus.phase,focus.endAt]);
  const remaining=focus.phase==='running'?Math.max(0,Math.ceil((Number(focus.endAt)-now)/1000)):focus.remaining;
  const hasActiveTimer=focus.phase==='running'||focus.phase==='paused';
  const minutes=String(Math.floor(remaining/60)).padStart(2,'0'),seconds=String(remaining%60).padStart(2,'0');
  function start(){const time=Date.now();setNow(time);setSaved(false);setSaveError('');setFocus(value=>({...value,phase:'running',endAt:time+value.remaining*1000}));}
  function pause(){const time=Date.now();setNow(time);setFocus(value=>({...value,phase:'paused',remaining:Math.max(0,Math.ceil((Number(value.endAt)-time)/1000)),endAt:null}));}
  function reset(){setFocus(emptyFocus());setSaved(false);setSaveError('');}
  async function save(){if(!data.user){signIn();return;}setSaveError('');const text=`Таймерът ми за ${focus.duration/60} минути завърши. Избраната задача беше: „${focus.task}“. Това е бележка за моя опит, а не потвърждение, че задачата е изпълнена или че съм усвоил материала.`;if(await mutate({action:'reflect',unitId:'goal-obstacle-plan',text},'Бележката е запазена.'))setSaved(true);else setSaveError('Бележката не се запази. Можеш да опиташ отново.');}
  return <section className={styles.tools} aria-label="Лично пространство за фокус и решения">
    {mode==='choose'?<>
      <header className={styles.heading}><h1>Какво те спира днес?</h1><p>Избери нещо, с което искаш да се справиш.</p></header>
      <button className={styles.focusEntry} onClick={()=>setMode('focus')}><span><strong>{hasActiveTimer?<>Имаш започната<br/>задача.</>:<>Трудно ми е<br/>да започна.</>}</strong><small>{hasActiveTimer?'Върни се към своя таймер.':'Избери една задача. Дай ѝ пет минути.'}</small></span><span className={styles.miniClock} aria-hidden="true"><Clock size={37}/><b>{hasActiveTimer?`${minutes}:${seconds}`:'05:00'}</b></span><span className={styles.entryAction}>{hasActiveTimer?'Към таймера':'Отвори таймера'}<ArrowRight size={22}/></span></button>
      <div className={styles.problems}>{problems.filter(item=>data.catalog.universeUnits.some(unit=>unit.id===item.id)).map(item=><button key={item.id} onClick={()=>onChoose(item.id)} data-diagram={item.diagram}><span className={styles.problemDiagram} aria-hidden="true">{item.diagram==='fact'?<><i/><i/><b/></>:item.diagram==='control'?<><Target size={34}/><i/></>:item.diagram==='habit'?<ArrowClockwise size={36}/>:<><i/><i/><i/></>}</span><span><strong>{item.title}</strong><small>{item.result}</small></span><ArrowRight size={20}/></button>)}</div>
    </>:<>
      <button className={styles.back} onClick={()=>setMode('choose')}><ArrowLeft size={18}/>Към фокуса и решенията</button>
      <div className={styles.focusDesk}>
        <div className={styles.focusTask}><h1>{focus.phase==='finished'?'Времето изтече.':'Работи по едно нещо.'}</h1>{focus.phase==='setup'?<><fieldset><legend>Какво ще направиш?</legend>{['Довърши една малка задача.','Напиши първото изречение.','Подготви един кадър.','Задай един конкретен въпрос.'].map(task=><button key={task} aria-pressed={focus.task===task} onClick={()=>setFocus(value=>({...value,task}))}>{task}{focus.task===task?<Check size={16}/>:null}</button>)}</fieldset><details className={styles.custom}><summary>Или посочи своя задача</summary><label htmlFor="focus-own-task">Моята задача<input id="focus-own-task" value={focus.task} maxLength={180} onChange={event=>setFocus(value=>({...value,task:event.target.value}))}/></label></details><fieldset className={styles.duration}><legend>Колко време?</legend>{[300,900,1500].map(duration=><button key={duration} aria-pressed={focus.duration===duration} onClick={()=>setFocus(value=>({...value,duration,remaining:duration}))}>{duration/60} мин</button>)}</fieldset></>:<><p className={styles.taskName}>{focus.task}</p><p className={styles.taskNote}>{focus.phase==='finished'?'Таймерът приключи. Само ти знаеш докъде стигна.':focus.phase==='paused'?'Таймерът е спрян. Продължи, когато си готов.':'Остани с тази задача. Можеш да спреш по всяко време.'}</p></>}</div>
        <div className={styles.timer} data-phase={focus.phase}>
          <span className={styles.clockFace} role="timer" aria-label={`Оставащо време ${minutes} минути и ${seconds} секунди`}><span>{minutes}</span><i>:</i><span>{seconds}</span></span>
          {focus.phase==='running'?<button className={styles.primary} onClick={pause}><Pause size={19}/>Пауза</button>:focus.phase==='finished'?<><button className={styles.primary} onClick={reset}><ArrowClockwise size={19}/>Друга задача</button>{data.user?<button className={styles.save} disabled={busy||saved} onClick={()=>void save()}>{saved?<Check size={18}/>:<Notebook size={18}/>} {saved?'Бележката е запазена':'Запази бележка за сесията'}</button>:null}{saveError?<p role="alert">{saveError}</p>:null}</>:<button className={styles.primary} disabled={focus.task.trim().length<3} onClick={start}><Play size={19} weight="fill"/>{focus.phase==='paused'?'Продължи':'Започни'}</button>}
          {focus.phase==='paused'?<button className={styles.save} onClick={reset}><ArrowClockwise size={17}/>Избери друга задача</button>:null}
        </div>
      </div>
    </>}
  </section>;
}
