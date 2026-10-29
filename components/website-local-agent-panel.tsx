'use client';

import {useState} from 'react';
import {ArrowRight,ArrowClockwise,Check,Sparkle} from '@phosphor-icons/react';
import type {WebsiteDesign} from '@/lib/website-domain';
import styles from './website-local-agent-panel.module.css';

export type LocalWebsiteCapability={provider:'ollama';mode:'local-only'|'self-hosted';execution?:'local'|'remote';apiBilling:false;configured:boolean;model:string|null;availableModels:string[];message:string};
export type DesignChoice={id:string;name:string;design:WebsiteDesign;accent:string;theme:'dark'|'light'};
const actions=[{id:'theme-dark',name:'Тъмен дизайн'},{id:'theme-light',name:'Светъл дизайн'},{id:'contact-first',name:'Контактът по-горе'},{id:'service-columns',name:'Услуги в колони'},{id:'accent-red',name:'Червен акцент'},{id:'more-space',name:'Повече пространство'},{id:'no-motion',name:'Без анимации'}];
export function WebsiteLocalAgentPanel({capability,value,onChange,onRun,onRefresh,onDesign,choices,activeDesignId,keywords,onKeywords,busy,designError}:{capability:LocalWebsiteCapability|null;value:string;onChange:(value:string)=>void;onRun:()=>void;onRefresh:()=>void;onDesign:(operation:string,systemId?:string)=>void;choices:DesignChoice[];activeDesignId?:string;keywords:string;onKeywords:(value:string)=>void;busy:boolean;designError?:string}){
 const [mode,setMode]=useState<'designer'|'ai'>('designer'),[allDesigns,setAllDesigns]=useState(false);
 return <section className={styles.panel} aria-label="Дизайнер на сайта">
  <div className={styles.heading}><h2>Как да изглежда сайтът?</h2><span className={styles.local}>Без платен AI API</span></div>
  <nav className={styles.tabs} aria-label="Начин на промяна"><button aria-pressed={mode==='designer'} onClick={()=>setMode('designer')}>Готов дизайнер</button><button aria-pressed={mode==='ai'} onClick={()=>setMode('ai')}>Свободна промяна с AI</button></nav>
  {mode==='designer'?<>
   <p className={styles.lead}>Избери визия или промяна. Прилага се веднага, без AI сървър.</p>
   {designError&&<p role="alert" className={styles.designError}>{designError}</p>}
   <div className={styles.designs} aria-label="Дизайни за твоя бизнес">{choices.slice(0,allDesigns?choices.length:4).map(choice=><button key={choice.id} className={styles.designChoice} disabled={busy} onClick={()=>onDesign('design-system',choice.id)} aria-pressed={activeDesignId===choice.id}>
    <svg viewBox="0 0 220 130" aria-hidden="true" style={{background:choice.design.background}}><rect x="15" y="12" width="45" height="4" rx="2" fill={choice.design.ink}/><path d="M161 14h39" stroke={choice.design.ink} strokeOpacity=".4"/>{choice.design.imageTreatment==='wide'?<><rect x="15" y="27" width="120" height="7" rx="2" fill={choice.design.ink}/><rect x="15" y="39" width="95" height="7" rx="2" fill={choice.design.ink}/><rect x="15" y="59" width="190" height="56" rx="10" fill={choice.design.surface}/></>:choice.design.layout==='immersive'?<><rect x="14" y="26" width="192" height="91" rx="10" fill={choice.design.surface}/><path d="M28 70h94m-94 13h75" stroke={choice.design.ink} strokeWidth="7"/><rect x="28" y="96" width="43" height="9" rx="4" fill={choice.accent}/></>:<><rect x="121" y="28" width="83" height="88" rx={choice.design.imageTreatment==='arch'?40:choice.design.radius/2} fill={choice.design.surface}/><path d="M15 47h88M15 61h75M15 75h55" stroke={choice.design.ink} strokeWidth="7"/><rect x="15" y="98" width="49" height="12" rx={choice.design.buttonStyle==='pill'?6:2} fill={choice.accent}/></>}</svg>
    <span>{choice.name}{activeDesignId===choice.id&&<Check size={16}/>}</span>
   </button>)}</div>
   {choices.length>4&&<button className={styles.moreDesigns} onClick={()=>setAllDesigns(value=>!value)}>{allDesigns?'По-малко варианти':`Още ${choices.length-4} визии`}</button>}
   {!choices.length&&!designError&&<p className={styles.note} role="status">Подбираме визии за бизнеса…</p>}
   <div className={styles.suggestions} aria-label="Готови промени">{actions.map(action=><button key={action.id} disabled={busy} onClick={()=>onDesign(action.id)}>{action.name}<ArrowRight size={15}/></button>)}</div>
   <form onSubmit={e=>{e.preventDefault();onDesign('photos');}} className={styles.photos}><label htmlFor="website-photo-keywords">Нови снимки по тема<input id="website-photo-keywords" value={keywords} onChange={e=>onKeywords(e.target.value)} maxLength={150} minLength={2} required placeholder="Например: bicycle workshop repair"/></label><button className={styles.run} disabled={busy||keywords.trim().length<2}>{busy?'Прилагаме…':'Намери снимки'}<ArrowRight size={18}/></button></form>
   <p className={styles.note}>Текстовете ти се запазват. Снимките са илюстративни, с посочени автор и лиценз.</p>
  </>:<>
   <p className={styles.lead}>Опиши промяна, която я няма сред готовите.</p>
   <form onSubmit={event=>{event.preventDefault();onRun();}}><label htmlFor="website-local-instruction">Твоята промяна<textarea id="website-local-instruction" value={value} onChange={event=>onChange(event.target.value)} minLength={5} maxLength={2000} required rows={2} placeholder="Например: направи началото като списание с голяма снимка."/></label><button className={styles.run} disabled={busy||!value.trim()||!capability?.configured}><Sparkle size={19}/>{busy?'AI подготвя промяната…':'Приложи с AI'}<ArrowRight size={19}/></button></form>
   <div className={styles.status}><div><span className={styles.dot} data-ready={!!capability?.configured}/><p>{capability?.configured?`${capability.execution==='remote'?'Собствен AI сървър':'AI на тази машина'} · ${capability.model}`:capability?.message||'Проверяваме връзката с AI…'}</p></div><button disabled={busy} onClick={onRefresh}><ArrowClockwise size={15}/>Провери</button></div>
   <p className={styles.note}>AI може да работи на сървъра на платформата или на отделна машина, свързана от администратора. Готовият дизайнер остава достъпен.</p>
  </>}
 </section>;
}
