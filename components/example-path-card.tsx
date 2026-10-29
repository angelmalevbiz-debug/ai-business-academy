'use client';

import {ArrowRight,BookmarkSimple,CaretDown} from '@phosphor-icons/react';
import type {LearningPath} from '@/lib/domain';
import {ExamplePreview} from './example-preview';
import styles from './example-path-card.module.css';

type Props={path:LearningPath;accessibleIds:string[];completed:string[];minutes:number;saved:boolean;featured:boolean;open:(id:string)=>void;save:()=>void};

export function ExamplePathCard({path,accessibleIds,completed,minutes,saved,featured,open,save}:Props){
 const next=accessibleIds.find(id=>!completed.includes(id))||accessibleIds[0];
 const count=accessibleIds.filter(id=>completed.includes(id)).length;
 const kind=path.id==='automation'&&accessibleIds.includes('process-map')?'automation':path.id==='ai-development'&&accessibleIds.includes('product-problem')?'development':path.id==='ai-for-business'&&accessibleIds.includes('business-audit')?'business':'generic';
 const hook=kind==='automation'?'Кое писмо трябва да спре?':kind==='development'?'Харесват идеята. Ще я ползват ли?':kind==='business'?'Кое си струва да автоматизираш?':path.tagline;
 return <article className={`path-card ${styles.card}`} data-kind={kind} data-featured={featured}>
  <div className={styles.visual}><ExamplePreview kind={kind} title={path.title} tagline={path.tagline}/></div>
  <div className={`path-row-main ${styles.copy}`}>
   <div className={styles.titleRow}><h2><button disabled={!next} onClick={()=>open(next)}>{path.title}</button></h2></div>
   <p className={styles.hook}>{hook}</p>
   <div className={styles.actions}>
    <button className={`text-link ${styles.launch}`} disabled={!next} onClick={()=>open(next)}>{!next?'Очаква материал':next!==accessibleIds[0]?'Продължи':'Пусни примера'}<ArrowRight size={20}/></button>
    <button className={`save-button ${styles.save} ${saved?'is-saved':''}`} aria-label={saved?`Премахни ${path.title} от запазени`:`Запази ${path.title}`} aria-pressed={saved} onClick={save}><BookmarkSimple size={21} weight={saved?'fill':'regular'}/></button>
    <details className={`path-depth ${styles.depth}`}><summary>Какво има вътре<CaretDown size={14}/></summary><p>{path.description}</p><span>{accessibleIds.length} материала · {minutes} мин · {path.level}</span><p>{count?`${count} от ${accessibleIds.length} задачи са отбелязани в профила ти.`:'Своя работа можеш да запазиш отделно.'}</p>{next&&next!==accessibleIds[0]?<p>Отваря следващото незавършено: <button onClick={()=>open(accessibleIds[0])}>или започни от първия пример.</button></p>:null}</details>
   </div>
  </div>
 </article>;
}
