"use client";

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,CircleNotch,MagnifyingGlass,PencilLine,Play,Sparkle,X,ArrowLeft,FilmSlate,ChatsCircle,FileText,ChartBar,FlowArrow,Handshake,Receipt,CalendarDots,ArrowsClockwise,Question,Target,EnvelopeSimple,UsersThree,Scales,ListChecks} from '@phosphor-icons/react';
import type {BrandBrain,WorkflowRecipe,WorkflowTemplateId,WorkflowTemplate,WorkflowCapability} from '@/lib/workflow-domain';
import styles from './workflow-launchpad.module.css';

export type BrainPreset={name:string;audience:string;offer:string;voice:string;notes:string;guardrails:string};
const businessPresets=[
  {id:'personal',name:'Личен бранд',audience:'Хора, които следят моите знания и опит.',offer:'Съдържание и експертна помощ. Конкретна платена оферта още не е зададена.'},
  {id:'service',name:'Услуги',audience:'Хора и фирми, които търсят моята услуга.',offer:'Професионална услуга. Специализацията, цената и условията още не са зададени.'},
  {id:'shop',name:'Онлайн магазин',audience:'Клиенти, които търсят продукти в моя магазин.',offer:'Продукти в онлайн магазин. Каталогът, цените и наличностите още не са предоставени.'},
  {id:'local',name:'Местен бизнес',audience:'Хора в района на бизнеса.',offer:'Местни продукти или услуги. Името, адресът и конкретната оферта още не са предоставени.'},
  {id:'agency',name:'Агенция',audience:'Фирми, които търсят външен партньор.',offer:'Услуги за бизнес клиенти. Обхватът, цените и доказателствата още не са предоставени.'},
];
const icons={content:FilmSlate,sales:Handshake,deals:FileText,operations:FlowArrow,intelligence:ChartBar,support:ChatsCircle,finance:Receipt};
const intentCopy:Record<WorkflowTemplateId,{title:string;purpose:string}>={
  content:{title:'Какво ще публикуваш?',purpose:'Подготви текст или сценарий за своя бизнес.'},
  sales:{title:'Какво ти трябва за следващия клиент?',purpose:'Подготви оферта, въпроси или отговор.'},
  deals:{title:'Подготви следващия разговор.',purpose:'Изясни условията и следващото решение.'},
  operations:{title:'Коя работа повтаряш?',purpose:'Подреди процеса и виж какво може да поеме AI.'},
  intelligence:{title:'Какво искаш да провериш?',purpose:'Сравни наличните факти и открий какво липсва.'},
  support:{title:'На кой въпрос отговаряш?',purpose:'Подготви полезен отговор за своя клиент.'},
  finance:{title:'Кои числа искаш да подредиш?',purpose:'Сравни разходи, приходи или варианти по твоите данни.'},
};
function recipeIcon(recipe:WorkflowRecipe){const id=recipe.id;if(/week|meeting|plan/.test(id))return CalendarDots;if(/rewrite|edit/.test(id))return PencilLine;if(/repurpose|followup/.test(id))return ArrowsClockwise;if(/question|faq|objection/.test(id))return Question;if(/target|pricing|qualification/.test(id))return Target;if(/email|invoice/.test(id))return EnvelopeSimple;if(/onboard|team/.test(id))return UsersThree;if(/terms|negotiat|risk/.test(id))return Scales;if(/check|process|procedure/.test(id))return ListChecks;if(/journey/.test(id))return FlowArrow;if(/offer/.test(id))return FileText;return icons[recipe.templateId];}
export interface BriefRefinement {original:string;proposed:string;changes:string[];missingInputs:string[];provider:string;model:string}

export function WorkflowLaunchpad({recipes,templates,department,brain,capability,busy,user,launch,onDepartment,onPreset,custom,initialRecipeId,initialAddition=''}:{recipes:WorkflowRecipe[];templates:WorkflowTemplate[];department:WorkflowTemplateId;brain:BrandBrain|null;capability?:WorkflowCapability;busy:boolean;user:boolean;launch:(recipe:WorkflowRecipe,addition:string)=>Promise<void>;onDepartment:(id:WorkflowTemplateId,recipeId?:string)=>void;onPreset:(value:BrainPreset)=>Promise<boolean>;custom:React.ReactNode;initialRecipeId?:string|null;initialAddition?:string}){
  const [recipeChoice,setRecipeChoice]=useState<string|null|undefined>(undefined),[search,setSearch]=useState(''),[all,setAll]=useState(false),[addition,setAddition]=useState(initialAddition),[refining,setRefining]=useState(false),[candidate,setCandidate]=useState<BriefRefinement|null>(null),[error,setError]=useState(''),[business,setBusiness]=useState('');
  const searchInput=useRef<HTMLInputElement>(null),refinementRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>refinementRequest.current?.abort(),[]);
  const chosen=recipes.find(item=>item.id===(recipeChoice===undefined?initialRecipeId:recipeChoice))||null;
  const setChosen=(item:WorkflowRecipe|null)=>setRecipeChoice(item?.id||null);
  const [preparing,setPreparing]=useState(false);
  const filtered=useMemo(()=>recipes.filter(item=>(all||item.templateId===department)&&(!search||`${item.title} ${item.description} ${item.tags.join(' ')}`.toLocaleLowerCase('bg-BG').includes(search.toLocaleLowerCase('bg-BG')))),[recipes,department,search,all]);
  const direction=intentCopy[department];
  const canRun=Boolean(capability?.configured&&capability.worker?.available);
  const launchLabel=!user?'Започни с безплатен профил':canRun?capability?.status==='unavailable'?'Опитай да създадеш черновата':'Създай черновата':'Запази задачата';
  const readiness=!capability?'Проверяваме дали AI може да започне.':!capability.configured?'AI не е свързан. Засега можеш да запазиш задачата.':!capability.worker?.available?'Изпълнението е временно недостъпно. Задачата ще остане запазена.':capability.status==='unavailable'?'AI не отговори при последната проверка. Можеш да опиташ отново.':capability.status==='configured_unverified'?'Връзката с AI още не е проверена. При проблем задачата остава запазена.':'AI ще подготви чернова. Ти решаваш какво да използваш.';
  function choose(recipe:WorkflowRecipe){setChosen(recipe);setAddition('');setCandidate(null);setError('');onDepartment(recipe.templateId,recipe.id);}
  async function refine(){
    if(!chosen||!addition.trim())return;setRefining(true);setError('');setCandidate(null);const controller=new AbortController();refinementRequest.current?.abort();refinementRequest.current=controller;
    try{const response=await fetch('/api/workflow',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'refineBrief',recipeId:chosen.id,text:addition.trim()})});const value=await response.json();if(!response.ok)throw new Error(value.error||'Текстът не се преработи. Опитай пак.');if(!controller.signal.aborted)setCandidate(value.refinement);}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Връзката прекъсна.');}finally{if(!controller.signal.aborted)setRefining(false);}
  }
  async function begin(){
    if(!chosen)return;setError('');setPreparing(true);
    try{if(user&&!brain){const preset=businessPresets.find(item=>item.id===business);if(!preset){setError('Избери за какво работи екипът. Няма нужда да попълваш профил.');return;}const saved=await onPreset({name:preset.name,audience:preset.audience,offer:preset.offer,voice:'Кратко, ясно и естествено на български.',notes:'Начален контекст, избран от човека. Няма предоставени реални клиенти, резултати, цени или статистика. Всички липси се отбелязват; не се измислят.',guardrails:'Не измисляй факти, доказателства, отзиви, числа, адреси или обещания. Подготвяй чернови за човешки преглед.'});if(!saved)return;}
      await launch(chosen,addition.trim());
    }finally{setPreparing(false);}
  }
  return <section className={styles.launchpad} aria-label="Избор на готова задача">
    {!chosen?<>
      <div className={styles.title}><div><h2>{all?'Какво ти трябва?':direction.title}</h2><p>{all?'Избери конкретната работа или я намери с дума.':direction.purpose}</p></div></div>
      {all?<div className={styles.catalog}><label htmlFor="workflow-recipe-search">Намери задача<input ref={searchInput} id="workflow-recipe-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Видео, оферта, отговор…"/></label><nav aria-label="Филтри на задачите">{templates.map(item=><button key={item.id} aria-pressed={department===item.id} onClick={()=>{onDepartment(item.id);setAll(false);setSearch('');}}>{item.name}</button>)}</nav></div>:null}
      <div className={styles.list}>{filtered.slice(0,all||search?48:6).map((recipe,index)=>{const Icon=recipeIcon(recipe);return <button key={recipe.id} className={styles.recipe} onClick={()=>choose(recipe)} disabled={busy}><span className={styles.preview} data-kind={recipe.templateId} data-format={recipe.outputKind} data-variant={index%4}><Icon size={24} weight="duotone"/><i/><i/></span><span><strong>{recipe.title}</strong><small>{recipe.outcome}</small></span><ArrowRight size={18}/></button>;})}</div>
      {!filtered.length?<p className={styles.empty}>Не намерих такава задача. Опитай с друга дума или опиши своя.</p>:null}
      <button className={styles.catalogToggle} onClick={()=>{const next=!all;setAll(next);setSearch('');if(next)requestAnimationFrame(()=>searchInput.current?.focus());}}><MagnifyingGlass size={17}/>{all?'Покажи само това направление':`Всички задачи · ${recipes.length}`}<ArrowRight size={16}/></button>
      <details className={styles.custom}><summary><PencilLine size={17}/>Или опиши своя задача</summary>{custom}</details>
    </>:<>
      <button className={styles.back} onClick={()=>{setChosen(null);setCandidate(null);setError('');onDepartment(department);}} disabled={preparing||busy||refining}><ArrowLeft size={17}/>Друг резултат</button>
      <div className={styles.chosenTitle}><h2>{chosen.title}</h2></div>
      <div className={styles.deliverable}><FileText size={25} aria-hidden="true"/><div><strong>Какво ще получиш</strong><p>{chosen.outcome}</p></div></div>
      <div className={styles.handoff} aria-label="Как се подготвя резултатът"><span><FileText size={19} aria-hidden="true"/><strong>AI подготвя</strong><small>Чернова</small></span><ArrowRight size={21} aria-hidden="true"/><span><PencilLine size={19} aria-hidden="true"/><strong>Ти преглеждаш</strong><small>Промени или използвай</small></span></div>
      {!brain&&user?<fieldset className={styles.business}><legend>За какво е екипът?</legend><div>{businessPresets.map(item=><button key={item.id} type="button" aria-pressed={business===item.id} onClick={()=>setBusiness(item.id)}>{item.name}{business===item.id?<Check size={13}/>:null}</button>)}</div><small>Начална посока. Конкретните факти добавяш, когато решиш.</small></fieldset>:brain?<p className={styles.context}><Check size={14}/>Използва {brain.name} · контекст v{brain.version}</p>:null}
      {chosen.requiredInputs.length?<p className={styles.inputs}><strong>От теб:</strong> {chosen.requiredInputs.join(' · ')}.</p>:null}
      {chosen.connections.length||!chosen.readyWithoutConnections?<details className={styles.needs}><summary>Какво е нужно за изпълнение</summary>{chosen.connections.map((item,index)=><p key={`c${index}`}>{item}</p>)}{!chosen.readyWithoutConnections?<strong>Външното действие изисква реално свързване.</strong>:null}</details>:null}
      <details className={styles.ownWords}><summary><PencilLine size={16}/>Искам да уточня нещо <span>По желание</span></summary><label htmlFor="workflow-own-words">Твоите думи<textarea id="workflow-own-words" rows={3} maxLength={2500} value={addition} disabled={refining||busy} onChange={event=>{setAddition(event.target.value);setCandidate(null);setError('');}} placeholder="Например: По-директно, за начинаещи и без натиск за покупка."/></label><button className={styles.refine} onClick={()=>void refine()} disabled={!user||!capability?.configured||addition.trim().length<3||refining||busy}>{refining?<CircleNotch size={17}/>:<Sparkle size={17}/>}AI, подреди идеята ми</button>{!user?<p>Профилът запазва твоята задача и уточнения.</p>:null}</details>
      {candidate?<div className={styles.candidate}><div><h3>Така ли го имаш предвид?</h3><button onClick={()=>setCandidate(null)} aria-label="Затвори предложението"><X size={17}/></button></div><p>{candidate.proposed}</p>{candidate.proposed.trim()===candidate.original.trim()?<small>Текстът вече е ясен. AI предлага да го запазиш.</small>:candidate.changes.length?<small>{candidate.changes.join(' · ')}</small>:null}{candidate.missingInputs.length?<small>Още не знаем: {candidate.missingInputs.join('; ')}</small>:null}<div className={styles.candidateActions}><button onClick={()=>{setAddition(candidate.proposed);setCandidate(null);}}><Check size={16}/>Да, използвай това</button><button onClick={()=>setCandidate(null)}>Остави моите думи</button></div></div>:null}
      {error?<p className={styles.error} role="alert">{error}</p>:null}
      {(!canRun||capability?.status!=='ready')?<p className={styles.readiness} data-ready={false}>{readiness}</p>:null}
      <button className={styles.start} onClick={()=>void begin()} disabled={busy||preparing||refining}>{busy||preparing?<CircleNotch size={19}/>:<Play size={18} weight="fill"/>}{launchLabel}<ArrowRight size={18}/></button>
      <p className={styles.footnote}>Нищо не се изпраща или публикува автоматично.</p>
    </>}
  </section>;
}
