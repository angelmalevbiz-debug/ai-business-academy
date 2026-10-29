'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,ArrowClockwise,Brain,FilmSlate,Books,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import type {WorkflowState} from '@/lib/workflow-domain';
import styles from './admin-control-desk.module.css';

type MediaStatus={capability:{render:boolean;worker:boolean;message:string};jobs:{status:string}[]};
export function AdminControlDesk({openWorkflow,openMedia,openStudio,pending}:{openWorkflow:()=>void;openMedia:()=>void;openStudio:()=>void;pending:number}){
 const [work,setWork]=useState<WorkflowState|null>(null),[media,setMedia]=useState<MediaStatus|null>(null),[loading,setLoading]=useState(true),[errors,setErrors]=useState<string[]>([]),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();
  const read=async(url:string)=>{const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('Състоянието не се зареди. Опитай отново.');return response.json();};
  void Promise.allSettled([read('/api/workflow'),read('/api/workflow/media')]).then(results=>{if(controller.signal.aborted)return;const failures:string[]=[];if(results[0].status==='fulfilled')setWork(results[0].value);else{setWork(null);failures.push('AI услугата не се провери.');}if(results[1].status==='fulfilled')setMedia(results[1].value);else{setMedia(null);failures.push('Видео услугата не се провери.');}setErrors(failures);setLoading(false);});
  return()=>controller.abort();
 },[revision]);
 const connected=work?.capability.status==='ready'&&Boolean(work.capability.worker?.available);
 return <section className={styles.desk} aria-label="Управление на платформата">
  <div className={styles.review}><h2>{pending?`${pending} ${pending===1?'задача чака':'задачи чакат'} преглед.`:'Работното ти пространство.'}</h2><p>{pending?'Предадената работа е под този панел.':'Създавай материали и проверявай реалната работа на AI.'}</p><div className={styles.actions}><button onClick={openWorkflow}><Brain size={25}/><span>AI задачи<small>Чернови и одобрения</small></span><ArrowRight size={21}/></button><button onClick={openMedia}><FilmSlate size={25}/><span>Видео студио<small>Качи и обработи клип</small></span><ArrowRight size={21}/></button><button onClick={openStudio}><Books size={25}/><span>Съдържание<small>Редактирай и публикувай</small></span><ArrowRight size={21}/></button></div></div>
  <aside className={styles.status}><header><h2>Системата сега</h2><button aria-label="Провери услугите отново" disabled={loading} onClick={()=>{setLoading(true);setErrors([]);setRevision(value=>value+1);}}><ArrowClockwise size={20}/></button></header>
   <div><span>{connected?<CheckCircle size={21}/>:<WarningCircle size={21}/>}AI екип</span><strong>{loading?'Проверка…':connected?'На линия':work?.capability.configured?'Провери връзката':'Не е свързан'}</strong></div>
   {work?.capability.model?<p>{work.capability.model} · {work.capability.provider}</p>:null}
   {work?.capability.copyModel&&work.capability.copyModel!==work.capability.model?<p>Текстове · {work.capability.copyModel}</p>:null}
   <div><span>{media?.capability.render?<CheckCircle size={21}/>:<WarningCircle size={21}/>}Видео обработка</span><strong>{loading?'Проверка…':media?.capability.render?'На линия':'Не е налична'}</strong></div>
   <p>Външно публикуване: {work?.capability.publishing?'свързано':'няма свързан канал'}.</p>
   {errors.length?<p role="alert">{errors.join(' ')} Натисни проверката за нов опит.</p>:null}
  </aside>
 </section>;
}
