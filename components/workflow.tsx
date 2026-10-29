"use client";

import {useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {ArrowRight, ArrowSquareOut, Brain, CaretDown, Check, CheckCircle, CircleNotch, Copy, DownloadSimple, FileText, FlowArrow, FolderOpen, Pause, Play, Plus, WarningCircle, X, FilmSlate, Megaphone, UsersThree, Stack} from '@phosphor-icons/react';
import type {Member} from '@/lib/domain';
import {WORKFLOW_ROLES, WORKFLOW_TEMPLATES, type BrandBrain, type WorkflowArtifact, type WorkflowState, type WorkflowTemplateId,type WorkflowRecipe,type WorkflowRoleId} from '@/lib/workflow-domain';
import {WorkflowLaunchpad,type BrainPreset} from './workflow-launchpad';
import {WORKFLOW_RECIPES} from '@/lib/workflow-recipes';
import {analyzeVideoCsv,type VideoAnalysis} from '@/lib/workflow-analytics';
import styles from './workflow.module.css';

const World = dynamic(()=>import('./workflow-world'), {ssr:false, loading:()=> <div className={styles.worldLoading} role="status"><FlowArrow size={36}/><span>Подреждаме работното пространство…</span></div>});
const Workroom = dynamic(()=>import('./workflow-workroom').then(module=>module.WorkflowWorkroom),{loading:()=> <div className={styles.worldLoading} role="status">Отваряме работата ти…</div>});
const Media = dynamic(()=>import('./workflow-media').then(module=>module.WorkflowMedia),{loading:()=> <div className={styles.worldLoading} role="status">Отваряме видеата…</div>});
const Company = dynamic(()=>import('./workflow-company').then(module=>module.WorkflowCompany),{loading:()=> <div className={styles.worldLoading} role="status">Отваряме бизнес екипа…</div>});
const Positioning = dynamic(()=>import('./workflow-positioning').then(module=>module.WorkflowPositioning),{loading:()=> <div className={styles.worldLoading} role="status">Отваряме продуктите…</div>});
const statusLabel:Record<string,string>={ready:'Готов за работа',running:'Екипът работи',awaiting_approval:'Чака твоя преглед',completed:'Одобрено',blocked:'Нужно е решение',failed:'Нужно е повторение',cancelled:'Спряно'};
const roleName=(id:string)=>WORKFLOW_ROLES.find(role=>role.id===id)?.name||id;
const nowId=()=>crypto.randomUUID();
const roleStartingTasks:Record<WorkflowRoleId,string[]>={
  chief:['operations-delegation','content-content-week','sales-offer-one-page'],
  research:['intelligence-source-brief','intelligence-competitor-comparison','intelligence-validate-idea'],
  strategy:['intelligence-validate-idea','sales-service-package','operations-process-map'],
  copy:['content-rewrite-post','content-intro-post','sales-follow-up'],
  art:['content-first-reel','content-explain-offer','operations-sop'],
  publish:['content-first-reel','content-explain-offer','content-document-journey'],
  community:['support-reply-customer','support-faq','content-repurpose-content'],
};

export function Workflow({user,onJoin,onDirty}:{user:Member|null;onJoin:()=>void;onDirty?:(dirty:boolean)=>void}) {
  const [data,setData]=useState<WorkflowState|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [template,setTemplate]=useState<WorkflowTemplateId>('content');
  const [worldDepartment,setWorldDepartment]=useState<WorkflowTemplateId|null>(null),[room,setRoom]=useState<'company'|'library'|'approvals'|'memory'|'calendar'|'media'|'ceo'|'positioning'>('company'),[sheetOpen,setSheetOpen]=useState(true);
  const roomMenu=useRef<HTMLDetailsElement>(null);
  const [worldOpen,setWorldOpen]=useState(false);
  const [pendingRecipe,setPendingRecipe]=useState<string|null>(null),[pendingAddition,setPendingAddition]=useState('');
  const [selected,setSelected]=useState<string|null>(null),[projectId,setProjectId]=useState('');
  const [brief,setBrief]=useState(''),[composing,setComposing]=useState(true);
  const [videoCsv,setVideoCsv]=useState(''),[analysis,setAnalysis]=useState<VideoAnalysis|null>(null),[sourceError,setSourceError]=useState('');
  const [busy,setBusy]=useState(false),[paused,setPaused]=useState(false);
  const [following,setFollowing]=useState(true),[history,setHistory]=useState(false);
  const [artifactEditing,setArtifactEditing]=useState(false),[artifactDirty,setArtifactDirty]=useState(false);
  const live=useRef(false),actor=useRef(user?.id||'guest'),followRef=useRef(true),busyRef=useRef(false);
  const sheet=useRef<HTMLElement>(null);
  useEffect(()=>{onDirty?.(artifactDirty);if(!artifactDirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>{window.removeEventListener('beforeunload',warn);onDirty?.(false);};},[artifactDirty,onDirty]);
  function discardAllowed(){return !artifactDirty||window.confirm('Имаш незапазен текст. Искаш ли да напуснеш редакцията без да го запазиш?');}

  useEffect(()=>{
    live.current=true;actor.current=user?.id||'guest';
    const controller=new AbortController();
    let restoredRecipe:WorkflowRecipe|undefined;
    const load=async()=>{
      setLoading(true);setData(null);setProjectId('');setError('');setSelected(null);setComposing(true);setPendingRecipe(null);setPendingAddition('');setRoom('company');
      try {const response=await fetch('/api/workflow',{signal:controller.signal,cache:'no-store'});const value=await response.json();if(!response.ok)throw new Error(value.error||'Работното пространство не се зареди.');if(!controller.signal.aborted){setData(value);const savedProjectId=new URLSearchParams(window.location.search).get('project');const recent=savedProjectId?value.projects?.find((item:{id:string})=>item.id===savedProjectId):value.projects?.[0];if(savedProjectId&&!recent)setError('Тази запазена задача не е достъпна. Избери нова задача.');let pending:null|string=null,addition='';try{if(actor.current!=='guest'){pending=sessionStorage.getItem('academy:workflow:pending-recipe');addition=(sessionStorage.getItem('academy:workflow:pending-addition')||'').slice(0,2500);}}catch{}const recipe=value.recipes?.find((item:WorkflowRecipe)=>item.id===pending);if(recipe){restoredRecipe=recipe;setPendingRecipe(recipe.id);setPendingAddition(addition);setTemplate(recipe.templateId);setWorldDepartment(recipe.templateId);try{sessionStorage.removeItem('academy:workflow:pending-recipe');sessionStorage.removeItem('academy:workflow:pending-addition');}catch{}}else if(recent){setProjectId(recent.id);setTemplate(recent.templateId);setWorldDepartment(recent.templateId);setComposing(false);}}}
      catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Връзката прекъсна. Опитай пак.');}
      finally{if(!controller.signal.aborted){
        const params=new URLSearchParams(window.location.search),goal=params.get('goal');
        const intent=goal==='business'?'sales':goal==='automation'?'operations':goal==='content'?'content':null;
        const requested=WORKFLOW_RECIPES.find(item=>item.id===params.get('task'));
        const chosen=restoredRecipe||requested;
        if(chosen){setPendingRecipe(chosen.id);setTemplate(chosen.templateId);setWorldDepartment(chosen.templateId);setProjectId('');setSelected(null);setComposing(true);setWorldOpen(false);}
        else if(intent){setTemplate(intent);setWorldDepartment(intent);setProjectId('');setSelected(null);setComposing(true);}
        const wantedRoom=params.get('room');if(wantedRoom==='media'||wantedRoom==='ceo'||wantedRoom==='positioning'||wantedRoom==='library'||wantedRoom==='approvals'||wantedRoom==='memory'||wantedRoom==='calendar')setRoom(wantedRoom);setLoading(false);
      }}
    };void load();
    return()=>{live.current=false;controller.abort();};
  },[user?.id]);

  async function send(payload:Record<string,unknown>) {
    const identity=actor.current;busyRef.current=true;setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch('/api/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const value=await response.json();if(!response.ok)throw new Error(value.error||'Промяната не се запази. Опитай отново.');
      if(!live.current||identity!==actor.current)return null;
      setData(value as WorkflowState);return value as WorkflowState;
    } catch(cause){if(live.current&&identity===actor.current){setError(cause instanceof Error?cause.message:'Връзката прекъсна.');try{const latest=await fetch('/api/workflow',{cache:'no-store'});if(latest.ok){const value=await latest.json();if(live.current&&identity===actor.current)setData(value);}}catch{/* Retain the last readable state while the connection recovers. */}}return null;}
    finally{busyRef.current=false;if(live.current&&identity===actor.current)setBusy(false);}
  }
  function focusSheet(){requestAnimationFrame(()=>{if(window.innerWidth<900)sheet.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});}
  function taskLocation(department?:WorkflowTemplateId,recipeId?:string,savedProjectId?:string){
    const url=new URL(window.location.href);
    const goal=department==='content'?'content':department==='sales'?'business':department==='operations'?'automation':null;
    if(goal)url.searchParams.set('goal',goal);else url.searchParams.delete('goal');
    if(recipeId)url.searchParams.set('task',recipeId);else url.searchParams.delete('task');
    if(savedProjectId)url.searchParams.set('project',savedProjectId);else url.searchParams.delete('project');
    window.history.replaceState({},'',url);
  }
  function updateRoom(next:typeof room){setRoom(next);const url=new URL(window.location.href);if(next==='company')url.searchParams.delete('room');else url.searchParams.set('room',next);window.history.replaceState({},'',url);}
  function selectRole(id:string|null){if(!discardAllowed())return;updateRoom('company');setSelected(id);if(id&&id!=='brain'&&!worldDepartment)setWorldDepartment(template);setComposing(false);setFollowing(false);followRef.current=false;if(id)setSheetOpen(true);}
  function newTask(){if(!discardAllowed())return;updateRoom('company');taskLocation(template);setSheetOpen(true);setProjectId('');setSelected(null);setPendingRecipe(null);setPendingAddition('');setComposing(true);focusSheet();}
  const projects=data?.projects||[];
  const project=projects.find(item=>item.id===projectId);
  const activeTemplate=(data?.templates||WORKFLOW_TEMPLATES).find(item=>item.id===(project?.templateId||template))!;
  const projectRecipe=(data?.recipes||WORKFLOW_RECIPES).find(item=>item.id===project?.recipeId);
  const effectiveRoles=projectRecipe?.roles||activeTemplate.roles;
  const run=data?.runs.filter(item=>item.projectId===project?.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const artifacts=data?.artifacts.filter(item=>item.projectId===project?.id)||[];
  const currentArtifacts=artifacts.filter(item=>item.status!=='rejected');
  const artifact=selected&&selected!=='brain'?artifacts.find(item=>item.role===selected):(currentArtifacts[0]||artifacts[0]);
  const currentRole=run?effectiveRoles[run.currentStep]:undefined;
  const aiReady=Boolean(data?.capability.configured);
  const workerReady=Boolean(data?.capability.worker?.available);
  const auto=run?.autoStatus==='queued'||run?.autoStatus==='running';
  const activeJobs=Boolean(data?.runs.some(item=>item.autoStatus==='queued'||item.autoStatus==='running'||item.status==='running'));

  useEffect(()=>{
    if(!activeJobs)return;
    let stopped=false;const identity=actor.current;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{if(!busyRef.current){const response=await fetch('/api/workflow',{cache:'no-store'});if(response.ok){const next=await response.json() as WorkflowState;if(!stopped&&live.current&&actor.current===identity&&!busyRef.current){setData(next);const item=next.runs.find(value=>value.id===run?.id);const nextTemplate=next.templates.find(value=>value.id===item?.templateId);const project=next.projects.find(value=>value.id===item?.projectId);const recipe=next.recipes.find(value=>value.id===project?.recipeId);const role=item&&(recipe?.roles||nextTemplate?.roles)?.[Math.min(item.currentStep,item.totalSteps-1)];if(followRef.current&&role&&item?.autoStatus!=='paused')setSelected(role);}}}}catch{/* Polling failure does not discard the durable job or its saved artifacts. */}finally{if(!stopped)timer=setTimeout(poll,1800);}};
    timer=setTimeout(poll,500);return()=>{stopped=true;clearTimeout(timer);};
  },[activeJobs,run?.id]);

  async function runTeam(runId:string,initial:WorkflowState) {
    setComposing(false);const item=initial.runs.find(value=>value.id===runId),nextProject=initial.projects.find(value=>value.id===item?.projectId),nextRecipe=initial.recipes?.find(value=>value.id===nextProject?.recipeId),nextTemplate=initial.templates.find(value=>value.id===item?.templateId),role=item&&(nextRecipe?.roles||nextTemplate?.roles)?.[item.currentStep];if(followRef.current&&role)setSelected(role);
    await send({action:'startRun',runId});
  }
  async function launchRecipe(recipe:WorkflowRecipe,addition:string){
    if(!user){try{sessionStorage.setItem('academy:workflow:pending-recipe',recipe.id);sessionStorage.setItem('academy:workflow:pending-addition',addition.slice(0,2500));}catch{}onJoin();return;}const next=await send({action:'createFromRecipe',recipeId:recipe.id,...(addition?{brief:addition}:{}),requestId:nowId()});
    if(!next)return;const created=next.projects.find(item=>!projects.some(old=>old.id===item.id));if(!created)return;taskLocation();setPendingRecipe(null);setProjectId(created.id);setTemplate(recipe.templateId);setWorldDepartment(recipe.templateId);setRoom('company');setComposing(false);setSelected(recipe.roles[0]||'chief');setSheetOpen(true);setHistory(false);
    const nextRun=next.runs.find(item=>item.projectId===created.id);if(nextRun&&next.capability.configured&&next.capability.worker?.available){followRef.current=true;setFollowing(true);await runTeam(nextRun.id,next);}
  }
  async function savePreset(preset:BrainPreset){const next=await send({action:'saveBrain',expectedVersion:data?.brain?.version||0,...preset});return Boolean(next);}
  async function startTask(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!user){onJoin();return;}if(!data?.brain){setSelected('brain');setComposing(false);return;}
    const fullBrief=[brief.trim(),analysis?.summary].filter(Boolean).join('\n\n');if(fullBrief.length>5000){setError('Задачата и данните заедно надхвърлят 5000 знака. Съкрати текста или използвай по-кратки заглавия и линкове.');return;}
    const next=await send({action:'createProject',templateId:template,title:brief.trim().split(/[.!?\n]/)[0].slice(0,100),brief:fullBrief,requestId:nowId()});
    if(!next)return;const created=next.projects.find(item=>!projects.some(old=>old.id===item.id));if(!created)return;
    taskLocation();setProjectId(created.id);setComposing(false);setSelected('chief');setHistory(false);
    const firstRun=next.runs.find(item=>item.projectId===created.id);if(firstRun&&next.capability.configured&&next.capability.worker?.available){followRef.current=true;setFollowing(true);await runTeam(firstRun.id,next);}
  }
  function openProject(id:string){const item=projects.find(value=>value.id===id);if(!item||!discardAllowed())return;taskLocation(undefined,undefined,id);setPendingRecipe(null);setProjectId(id);setTemplate(item.templateId);setWorldDepartment(item.templateId);updateRoom('company');setSheetOpen(true);setComposing(false);setSelected(null);setHistory(false);focusSheet();}
  function chooseTemplate(id:WorkflowTemplateId,recipeId?:string){if(auto||busy||!discardAllowed())return;taskLocation(id,recipeId);setTemplate(id);setWorldDepartment(id);setProjectId('');setSelected(null);setPendingRecipe(recipeId||null);setPendingAddition('');setComposing(true);setSheetOpen(true);}
  function switchRoom(next:typeof room){if(!discardAllowed())return;updateRoom(next);if(roomMenu.current){roomMenu.current.open=false;roomMenu.current.querySelector('summary')?.focus();}}

  return <section className={styles.page} aria-label="Workflow работно пространство">
    <header className={styles.heading}>
      <div className={styles.identity}><div><h1>{room==='company'&&!project&&!selected?'Какво ще направим днес?':'Работа с AI'}</h1>{room==='company'&&!project&&!selected?<p>Избери задача. AI подготвя, ти решаваш.</p>:null}</div></div>
      {room==='company'?<div className={styles.headerActions}>
        <button onClick={()=>{selectRole('brain');focusSheet();}} className={styles.brainButton}><Brain size={20}/><span>{data?.brain?.name||'Бизнесът ми'}<small>{data?.brain?`Общ контекст · версия ${data.brain.version}`:'Фактите, които използва екипът'}</small></span></button>
        <button className={styles.newButton} onClick={newTask} aria-label="Избери нова задача" disabled={busy||auto}><Plus size={18}/><span>Избери задача</span></button>
      </div>:null}
    </header>
    <nav className={styles.rooms} aria-label="Работни пространства">
      <div className={styles.primaryRooms}>{([{id:'company',label:'Задачи',name:'Екип и задачи',icon:Stack,detail:'Сценарии и оферти'},{id:'positioning',label:'Реклами',name:'Продукт и реклама',icon:Megaphone,detail:'Продукт и послания'},{id:'media',label:'Видео',name:'Видео студио',icon:FilmSlate,detail:'Монтаж и субтитри'},{id:'ceo',label:'Екип',name:'Бизнес координатор',icon:UsersThree,detail:'Проекти и решения'}] as const).map(item=><button key={item.id} onClick={()=>switchRoom(item.id)} aria-label={item.name} aria-pressed={room===item.id}><item.icon size={27}/><span>{item.label}<small>{item.detail}</small></span></button>)}</div>
      <details ref={roomMenu} className={styles.roomMenu} data-active={['library','approvals','memory','calendar'].includes(room)} onKeyDown={event=>{if(event.key==='Escape'&&roomMenu.current){roomMenu.current.open=false;roomMenu.current.querySelector('summary')?.focus();}}}><summary>Работата ми<CaretDown size={15} aria-hidden="true"/></summary><div><button onClick={()=>{if(roomMenu.current)roomMenu.current.open=false;selectRole('brain');focusSheet();}}>Бизнесът ми</button>{([{id:'library',label:'Текстове и сценарии',name:'Сценарии и материали'},{id:'approvals',label:'За одобрение',name:'За одобрение'},{id:'memory',label:'Търси в работата',name:'Памет и източници'},{id:'calendar',label:'План за работа',name:'Календар'}] as const).map(item=><button key={item.id} onClick={()=>switchRoom(item.id)} aria-label={item.name} aria-pressed={room===item.id}>{item.label}{item.id==='approvals'&&data?.runs.some(value=>value.status==='awaiting_approval')?<b>{data.runs.filter(value=>value.status==='awaiting_approval').length}</b>:null}</button>)}</div></details>
    </nav>
    {room==='positioning'?<Positioning key={user?.id||'guest'} user={user} capability={data?.capability} brainVersion={data?.brain?.version||0} onBrainLinked={async()=>{await send({action:'refreshCapability'});setNotice('Предоставените факти са запазени за екипа.');}} onJoin={onJoin}/>:room==='ceo'?<Company key={user?.id||'guest'} signedIn={Boolean(user)} state={data} onJoin={onJoin} onBrain={()=>{selectRole('brain');focusSheet();}} onProject={openProject} onRefresh={()=>void send({action:'refreshCapability'})}/>:room==='media'?<Media key={user?.id||'guest'} user={Boolean(user)} onJoin={onJoin}/>:room!=='company'&&data?<Workroom key={`${user?.id||'guest'}:${room}`} state={data} room={room} signedIn={Boolean(user)} onJoin={onJoin} onCreate={newTask} onOpenProject={openProject} onSelectArtifact={id=>{const item=data.artifacts.find(value=>value.id===id);if(item){openProject(item.projectId);setSelected(item.role);}}} onAction={send}/>:<>
    <details className={styles.departmentsPicker}><summary>Други области<CaretDown size={14}/></summary><nav className={styles.departments} aria-label="Направления Workflow"><button aria-pressed={worldDepartment===null} onClick={()=>{if(discardAllowed()){setWorldDepartment(null);setSelected(null);}}}>Цялата компания</button>{(data?.templates||WORKFLOW_TEMPLATES).map(item=><button key={item.id} aria-pressed={worldDepartment===item.id} disabled={busy} onClick={()=>chooseTemplate(item.id)}>{item.name}</button>)}</nav></details>

    <div className={styles.workbench} data-sheet-open={sheetOpen} data-starting={!project&&!selected} data-focused={!project&&!selected&&Boolean(pendingRecipe)}>
      {!pendingRecipe||project||selected||worldOpen?<div className={styles.worldSection}>
        <div className={styles.worldStatus}><span className={styles.provider} data-ready={data?.capability.status==='ready'}><i/>{loading?'Проверяваме връзката':data?.capability.status==='ready'?'AI е свързан':data?.capability.configured?'AI е настроен':'AI не е свързан'}</span><button onClick={()=>setPaused(value=>!value)} aria-pressed={paused} aria-label={paused?'Пусни движението':'Спри движението'}>{paused?<Play size={16}/>:<Pause size={16}/>}</button></div>
        <World artifacts={currentArtifacts.map(({id,role,title,revision,status})=>({id,role,title,revision,status}))} onArtifactSelect={id=>{const item=data?.artifacts.find(value=>value.id===id);if(item){openProject(item.projectId);setSelected(item.role);}}} selected={selected} onSelect={selectRole} department={worldDepartment} onDepartmentSelect={id=>{if(id)chooseTemplate(id);else if(discardAllowed()){setWorldDepartment(null);setSelected(null);}}} activeRole={run?.status==='running'||auto?currentRole:null} completedRoles={currentArtifacts.map(item=>item.role)} paused={paused}/>
        {project||selected||!sheetOpen?<nav className={styles.stationRail} aria-label="Екип и общ контекст"><button aria-pressed={selected===null} onClick={()=>selectRole(null)}>Целият екип</button><button aria-pressed={selected==='brain'} onClick={()=>selectRole('brain')}><Brain size={16}/>Бранд</button>{WORKFLOW_ROLES.filter(role=>effectiveRoles.includes(role.id)).map(role=><button key={role.id} aria-pressed={selected===role.id} onClick={()=>selectRole(role.id)}>{currentArtifacts.some(item=>item.role===role.id)?<Check size={14}/>:null}{role.name}</button>)}</nav>:null}
        {project?<div className={styles.handoff}><span>{activeTemplate.name}</span><div>{effectiveRoles.map((role,index)=><span key={role} data-done={currentArtifacts.some(item=>item.role===role)} data-active={role===currentRole&&Boolean(auto)}><b>{roleName(role)}</b>{index<effectiveRoles.length-1?<ArrowRight size={13}/>:<CheckCircle size={14}/>}</span>)}</div></div>:null}
        {selected?<button className={styles.openSheet} onClick={focusSheet}>{selected==='brain'?'Отвори контекста на бранда':artifact?'Отвори резултата':'Виж задачата на ролята'}<ArrowRight size={17}/></button>:null}
      </div>:null}
      {!sheetOpen?<button className={styles.showSheet} onClick={()=>setSheetOpen(true)}>Избери резултат<ArrowRight size={18}/></button>:null}
      <aside ref={sheet} className={styles.sheet} aria-label="Текуща задача и резултат" tabIndex={-1} hidden={!sheetOpen}>
        <button className={styles.closeSheet} onClick={()=>{if(discardAllowed()){setWorldOpen(true);setSheetOpen(false);}}} aria-label="Разгледай компанията без панела"><X size={18}/></button>
        {loading?<div className={styles.sheetLoading} role="status"><CircleNotch size={25}/>Зареждаме работата ти…</div>:selected==='brain'?<BrainSheet brain={data?.brain||null} busy={busy||auto} user={user} onJoin={onJoin} save={async fields=>{const next=await send({action:'saveBrain',expectedVersion:data?.brain?.version||0,...fields});if(next){setNotice('Контекстът е запазен. Новите задачи ще го използват.');setSelected(null);setComposing(true);}}}/>:selected&&!project?<RoleStartingPoint roleId={selected} recipes={data?.recipes||WORKFLOW_RECIPES} busy={busy||auto} choose={chooseTemplate} back={()=>{setSelected(null);setComposing(true);}}/>:composing||!project?<>
          <WorkflowLaunchpad key={`${template}:${pendingRecipe||'choose'}`} initialRecipeId={pendingRecipe} initialAddition={pendingAddition} recipes={data?.recipes||WORKFLOW_RECIPES} templates={data?.templates||WORKFLOW_TEMPLATES} department={template} onDepartment={chooseTemplate} brain={data?.brain||null} capability={data?.capability} busy={busy||auto} user={Boolean(user)} launch={launchRecipe} onPreset={savePreset} custom={<>
          <h3>Своя задача</h3>
          <form className={styles.briefForm} onSubmit={startTask}>
            <label htmlFor="workflow-brief">Задача за екипа</label><textarea id="workflow-brief" value={brief} onChange={event=>setBrief(event.target.value)} minLength={20} maxLength={5000} required rows={5} placeholder={activeTemplate.id==='content'?'Например: Подготви три кратки видеа за услугата ми. Искам конкретни примери и сценарий за снимане.':'Какъв резултат ти трябва? Добави фактите, с които разполагаш.'}/>
            {['content','intelligence'].includes(template)?<details className={styles.dataIntake}><summary>Добави данни от видеа</summary><p>Сравни гледанията в твоята извадка. Екипът ще получи изчисленията.</p><label htmlFor="workflow-csv">CSV с title, views, likes, comments, url<textarea id="workflow-csv" rows={4} maxLength={100000} value={videoCsv} onChange={event=>{setVideoCsv(event.target.value);setAnalysis(null);setSourceError('');}} placeholder={'title,views,likes,comments\nЗаглавие на видео,1200,45,6'}/></label><label className={styles.fileInput}>Или избери CSV файл<input type="file" accept=".csv,text/csv,text/plain" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>100000){setSourceError('Файлът трябва да е до 100 KB.');return;}setVideoCsv(await file.text());setAnalysis(null);setSourceError('');}}/></label><button type="button" className={styles.secondary} onClick={()=>{try{setAnalysis(analyzeVideoCsv(videoCsv));setSourceError('');}catch(cause){setAnalysis(null);setSourceError(cause instanceof Error?cause.message:'Данните не се разчетоха.');}}}>Сравни видеата</button>{sourceError?<p role="alert">{sourceError}</p>:null}{analysis?<div className={styles.analysis}><strong>{analysis.rows} видеа · медиана {analysis.medianViews.toLocaleString('bg-BG')}</strong>{analysis.items.slice(0,3).map((item,index)=><div key={index}><span>{item.title}</span><b>{item.relativeViews===null?'Без база':`${item.relativeViews.toFixed(1)}×`}</b></div>)}<p>Спрямо медианата в подадените данни. Възрастта на видеата не е изравнена. Произходът не е проверен.</p></div>:null}</details>:null}
            <button className={styles.primary} type="submit" disabled={busy||auto}>{busy?<CircleNotch size={18}/>:<ArrowRight size={18}/>} {!user?'Започни с безплатен профил':!data?.brain?'Дай контекст на екипа':aiReady&&workerReady?'Пусни екипа':'Запази задачата'}</button>
          </form>
          <p className={styles.shortNote}>{activeTemplate.outcome}</p>
          {(!aiReady||!workerReady)&&user?<SetupNote capability={data?.capability}/>:null}
          </>}/>
        </>:artifact?<ArtifactSheet key={`${artifact.id}:${artifact.revision}`} artifact={artifact} busy={busy||auto} onNotice={setNotice} onAction={send} onEditing={setArtifactEditing} onDirty={setArtifactDirty}/>:<>
          <div className={styles.runHeading}><FileText size={26}/><span>{selected?roleName(selected):activeTemplate.name}</span></div><h2>{project.title}</h2><p className={styles.rolePurpose}>{selected?WORKFLOW_ROLES.find(role=>role.id===selected)?.purpose:project.brief}</p>
          <div className={styles.waiting}>{auto||busy?<CircleNotch size={24}/>:<FlowArrow size={26}/>}<strong>{auto?`${roleName(currentRole||'chief')} подготвя чернова…`:selected?'Още няма резултат от тази роля.':'Задачата е запазена.'}</strong></div>
          {!aiReady||!workerReady?<SetupNote capability={data?.capability}/>:null}
        </>}
        {run&&project&&!composing&&selected!=='brain'?<div className={styles.runControls}>
          <span role="status">{statusLabel[run.status]}<small>Контекст v{run.brainVersion} · {Math.min(run.currentStep,run.totalSteps)}/{run.totalSteps} предадени задачи</small></span>
          {['awaiting_approval','completed'].includes(run.status)?<div className={styles.bundle}><h3>Целият пакет</h3><div>{effectiveRoles.map(role=>{const item=currentArtifacts.find(value=>value.role===role);return item?<button key={item.id} onClick={()=>selectRole(role)}>{roleName(role)}<span>v{item.revision}{item.status==='approved'?<Check size={13}/>:null}</span></button>:null;})}</div><button className={styles.secondary} onClick={()=>{const content=`# ${project.title}\n\n${run.status==='completed'?'Одобрен пакет':'Чернова за преглед'} · Контекст v${run.brainVersion}\n\n`+effectiveRoles.map(role=>{const item=currentArtifacts.find(value=>value.role===role);return item?`## ${roleName(role)} · v${item.revision}\n\n${item.content}`:'';}).filter(Boolean).join('\n\n---\n\n');const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`workflow-${project.id.slice(0,8)}.md`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><DownloadSimple size={17}/>Изтегли целия пакет</button>{run.status==='awaiting_approval'?<button className={styles.primary} disabled={busy||auto||artifactEditing} onClick={()=>void send({action:'approveRun',runId:run.id,expectedArtifacts:currentArtifacts.filter(item=>item.runId===run.id).map(item=>({id:item.id,revision:item.revision}))})}><CheckCircle size={18}/>Одобри целия пакет</button>:<p>Всички показани версии са одобрени.</p>}</div>:null}
          {auto?<button className={styles.secondary} onClick={()=>void send({action:'pauseRun',runId:run.id})} disabled={busy}><Pause size={16}/>Пауза след текущата</button>:!busy&&['ready','failed','blocked'].includes(run.status)&&aiReady?<button className={styles.primary} onClick={()=>{followRef.current=true;setFollowing(true);if(workerReady)void runTeam(run.id,data!);else {if(currentRole)setSelected(currentRole);void send({action:'runStep',runId:run.id,requestId:nowId()});}}}><Play size={17}/>{workerReady?(run.currentStep?'Продължи екипа':'Пусни екипа'):'Изпълни следващата роля'}</button>:null}
          {auto?<p className={styles.shortNote}>Можеш да затвориш страницата. Локалният екип продължава, докато компютърът и услугата работят.</p>:null}
          {auto?<button className={styles.textButton} onClick={()=>{followRef.current=!following;setFollowing(!following);}}>{following?'Камерата следи екипа':'Следи екипа с камерата'}</button>:null}
          {run.error?<p className={styles.inlineError}>{run.error}</p>:null}
          {['ready','running','failed','blocked'].includes(run.status)?<button className={styles.textButton} onClick={()=>void send({action:'cancelRun',runId:run.id})} disabled={busy}>Прекрати тази задача</button>:null}
        </div>:null}
      </aside>
    </div>
    </>}
    {error?<div className={styles.alert} role="alert"><WarningCircle size={20}/><p>{error}</p><button onClick={()=>setError('')} aria-label="Затвори съобщението"><X size={18}/></button></div>:null}
    {notice?<p className={styles.notice} role="status"><Check size={17}/>{notice}</p>:null}
    {!project&&!selected&&pendingRecipe?<button className={styles.worldToggle} aria-expanded={worldOpen} onClick={()=>setWorldOpen(value=>!value)}>{worldOpen?'Скрий AI екипа':'Как работи AI екипът'}<CaretDown size={16}/></button>:null}
    <section className={styles.history}>
      <button className={styles.historyToggle} aria-expanded={history} onClick={()=>setHistory(value=>!value)}><FolderOpen size={20}/><span>Всички задачи</span><b>{projects.length}</b><Plus size={17}/></button>
      {history?<div className={styles.projectList}>{projects.length?projects.map(item=>{const last=data?.runs.filter(value=>value.projectId===item.id).at(-1);return <button key={item.id} onClick={()=>openProject(item.id)}><span>{item.title}<small>{WORKFLOW_TEMPLATES.find(value=>value.id===item.templateId)?.name} · {last?statusLabel[last.status]:''}</small></span><ArrowRight size={18}/></button>;}):<p>Първата ти задача ще остане тук.</p>}</div>:null}
    </section>
    {user?.role==='admin'?<PublisherBridge busy={busy} onAction={async payload=>{const next=await send(payload);if(next&&payload.action==='importPublisherDraft'){const imported=next.artifacts.find(item=>item.sourceId===payload.draftId);if(imported){setProjectId(imported.projectId);setTemplate('content');setSelected(imported.role);setComposing(false);focusSheet();}}return next;}} onNotice={setNotice}/>:null}
    {project&&data?.events.some(event=>event.projectId===project.id)?<details className={styles.activity}><summary>Как мина задачата</summary><ol>{data.events.filter(event=>event.projectId===project.id).slice(-15).map(event=><li key={event.id}><time>{new Date(event.createdAt).toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'})}</time><span>{event.message}</span></li>)}</ol></details>:null}
  </section>;
}

function RoleStartingPoint({roleId,recipes,busy,choose,back}:{roleId:string;recipes:WorkflowRecipe[];busy:boolean;choose:(department:WorkflowTemplateId,recipeId?:string)=>void;back:()=>void}){
  const role=WORKFLOW_ROLES.find(item=>item.id===roleId);
  if(!role)return null;
  const compatible=recipes.filter(item=>item.roles.includes(role.id));
  const preferred=roleStartingTasks[role.id].map(id=>compatible.find(item=>item.id===id)).filter((item):item is WorkflowRecipe=>Boolean(item));
  const suggestions=[...preferred,...compatible.filter(item=>!preferred.some(value=>value.id===item.id))].slice(0,3);
  return <section className={styles.roleStart} aria-label={`Задачи за ${role.name}`}>
    <h2>{role.name}</h2><p className={styles.roleIntro}>{role.purpose}</p>
    <h3>С какво да помогне?</h3>
    <div className={styles.roleTasks}>{suggestions.map(recipe=><button key={recipe.id} disabled={busy} onClick={()=>choose(recipe.templateId,recipe.id)}><span><strong>{recipe.title}</strong><small>{recipe.outcome}</small></span><ArrowRight size={22} aria-hidden="true"/></button>)}</div>
    {role.id==='publish'?<p className={styles.roleLimit}>Получаваш пакет за преглед. Тази роля не публикува в профилите ти.</p>:null}
    <button className={styles.roleBack} disabled={busy} onClick={back}>Всички задачи<ArrowRight size={18}/></button>
  </section>;
}

function SetupNote({capability}:{capability?:WorkflowState['capability']}){return <details className={styles.setup}><summary>Свързване на AI и екипа</summary><p>{capability?.message||'За създаване на резултати е необходим AI модел.'}</p>{capability?.worker&&!capability.worker.available?<p>{capability.worker.message}</p>:null}<p>Локален Ollama или OpenAI се настройва на сървъра. Ключове не се въвеждат в задачите.</p></details>;}

function BrainSheet({brain,busy,user,onJoin,save}:{brain:BrandBrain|null;busy:boolean;user:Member|null;onJoin:()=>void;save:(fields:Record<string,string>)=>Promise<void>}) {
  return <><div className={styles.brainTitle}><Brain size={30}/><h2>Брандът е общият контекст.</h2></div><p className={styles.rolePurpose}>Офертата, хората и гласът ти стигат до всяка роля.</p>
    <form key={brain?.version||0} className={styles.brainForm} onSubmit={event=>{event.preventDefault();if(!user){onJoin();return;}const fields=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;void save(fields);}}>
      <label>Име на бранда<input name="name" defaultValue={brain?.name||''} required minLength={2} maxLength={100} placeholder="Как се казва бизнесът ти?"/></label>
      <label>За кого е<input name="audience" defaultValue={brain?.audience||''} required minLength={5} maxLength={2000} placeholder="Кой има нужда от това, което правиш?"/></label>
      <label>Какво предлагаш<textarea name="offer" defaultValue={brain?.offer||''} required minLength={10} maxLength={2000} rows={3} placeholder="Услуга, продукт и конкретната полза."/></label>
      <label>Как говориш<input name="voice" defaultValue={brain?.voice||'Ясно, кратко и директно.'} required minLength={3} maxLength={2000}/></label>
      <details><summary>Още контекст и граници</summary><label>Факти и източници<textarea name="notes" defaultValue={brain?.notes||''} maxLength={6000} rows={4} placeholder="Линкове, реални данни и примери за твои текстове."/></label><label>Какво да избягва<textarea name="guardrails" defaultValue={brain?.guardrails||''} maxLength={3000} rows={3} placeholder="Забранени твърдения, поверителни данни, нежелан тон."/></label></details>
      <button className={styles.primary} disabled={busy}>{busy?<CircleNotch size={18}/>:<Check size={18}/>}Запази контекста</button>
    </form>{brain?<p className={styles.shortNote}>Версия {brain.version}. Започнатите задачи пазят своята версия.</p>:null}</>;
}

function ArtifactSheet({artifact,busy,onNotice,onAction,onEditing,onDirty}:{artifact:WorkflowArtifact;busy:boolean;onNotice:(message:string)=>void;onAction:(payload:Record<string,unknown>)=>Promise<WorkflowState|null>;onEditing:(value:boolean)=>void;onDirty:(value:boolean)=>void}){
  const [editing,setEditing]=useState(false),[text,setText]=useState(artifact.content),[rejecting,setRejecting]=useState(false),[feedback,setFeedback]=useState('');
  useEffect(()=>{onEditing(editing);onDirty(editing&&text!==artifact.content);return()=>{onEditing(false);onDirty(false);};},[editing,text,artifact.content,onEditing,onDirty]);
  function download(){const blob=new Blob([artifact.content],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${artifact.role}-v${artifact.revision}.txt`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <><div className={styles.artifactMeta}><span>{roleName(artifact.role)}</span><span>{artifact.status==='approved'?<><CheckCircle size={15}/>Одобрено</>:artifact.status==='rejected'?'Върнато за промяна':'Чернова'} · v{artifact.revision}</span></div><h2>{artifact.title}</h2>
    {editing?<form onSubmit={async event=>{event.preventDefault();if(await onAction({action:'editArtifact',artifactId:artifact.id,expectedRevision:artifact.revision,content:text}))setEditing(false);}}><label htmlFor="workflow-artifact-edit">Редактирай резултата</label><textarea id="workflow-artifact-edit" className={styles.editArea} value={text} onChange={event=>setText(event.target.value)} required minLength={10} maxLength={30000} rows={15}/><div className={styles.artifactActions}><button className={styles.primary} disabled={busy}>Запази нова версия</button><button type="button" className={styles.secondary} onClick={()=>{setEditing(false);setText(artifact.content);}}>Откажи</button></div></form>:<div className={styles.artifactText}>{artifact.content}</div>}
    <div className={styles.artifactUtility}><button onClick={async()=>{try{await navigator.clipboard.writeText(artifact.content);onNotice('Текстът е копиран.');}catch{onNotice('Копирането не е разрешено. Изтегли текста вместо това.');}}}><Copy size={17}/>Копирай</button><button onClick={download}><DownloadSimple size={17}/>Изтегли</button>{!editing?<button onClick={()=>setEditing(true)} disabled={busy}>Редактирай</button>:null}</div>
    {!editing&&artifact.status!=='approved'?<div className={styles.artifactActions}><button className={styles.primary} disabled={busy} onClick={()=>void onAction({action:'approveArtifact',artifactId:artifact.id,expectedRevision:artifact.revision})}><Check size={17}/>Одобри тази версия</button><button className={styles.secondary} disabled={busy} onClick={()=>setRejecting(value=>!value)}>Искам промяна</button></div>:null}
    {rejecting?<form className={styles.feedbackForm} onSubmit={async event=>{event.preventDefault();if(await onAction({action:'rejectArtifact',artifactId:artifact.id,expectedRevision:artifact.revision,feedback}))setRejecting(false);}}><label htmlFor="workflow-feedback">Какво да се промени?</label><textarea id="workflow-feedback" value={feedback} onChange={event=>setFeedback(event.target.value)} minLength={5} maxLength={2000} required rows={3}/><button className={styles.secondary} disabled={busy}>Върни с тази бележка</button></form>:null}
    {artifact.feedback?<p className={styles.shortNote}>{artifact.feedback}</p>:null}<p className={styles.provenance}>{artifact.provenance==='ai'?`${artifact.provider} · ${artifact.model}`:artifact.provenance==='compiled'?'Сглобен пакет от конкретните версии на сценария и монтажния план':artifact.provenance==='imported'?'Внесено от свързаното студио':'Редактирано от човек'}. Одобрението запазва версията; публикуването е отделно.</p>
  </>;
}

function PublisherBridge({busy,onAction,onNotice}:{busy:boolean;onAction:(payload:Record<string,unknown>)=>Promise<WorkflowState|null>;onNotice:(message:string)=>void}){
  const [value,setValue]=useState<{available?:boolean;message?:string;drafts?:{id:string;title:string;status?:string}[];studioUrl?:string;bridgeMode?:string}|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
  async function inspect(){setChecking(true);setError('');try{const response=await fetch('/api/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publisherStatus'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Студиото не се свърза.');let drafts=[];if(result.publisher?.available){const listed=await fetch('/api/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publisherDrafts'})});const values=await listed.json();if(!listed.ok)throw new Error(values.error||'Черновите не се заредиха.');drafts=values.drafts||[];}setValue({...result.publisher,drafts});}catch(cause){setError(cause instanceof Error?cause.message:'Връзката не е достъпна.');}finally{setChecking(false);}}
  return <details className={styles.publisher}><summary><FlowArrow size={20}/><span>Свързано студио за съдържание</span><ArrowSquareOut size={17}/></summary><div><h2>Монтажът и каналите ти.</h2><p>Съществуващото студио остава отделно. Тук внасяш избрана чернова.</p><button className={styles.secondary} onClick={()=>void inspect()} disabled={checking}>{checking?<CircleNotch size={17}/>:<FlowArrow size={17}/>}Провери връзката</button>{value?.studioUrl?<a className={styles.secondary} href={value.studioUrl} target="_blank" rel="noreferrer">Отвори студиото<ArrowSquareOut size={17}/></a>:null}{error?<p role="alert">{error}</p>:null}{value?.message?<p>{value.message}</p>:null}<div className={styles.projectList}>{value?.drafts?.map(draft=><div key={draft.id}><span>{draft.title}<small>{draft.status}</small></span><button className={styles.secondary} disabled={busy} onClick={async()=>{if(await onAction({action:'importPublisherDraft',draftId:draft.id,requestId:nowId()}))onNotice('Избраната чернова е внесена в твоята работа.');}}>Внеси черновата</button></div>)}</div></div></details>;
}


