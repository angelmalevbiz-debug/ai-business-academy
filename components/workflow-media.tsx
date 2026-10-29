"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowClockwise,Check,DownloadSimple,FilmSlate,Play,Scissors,Stop,UploadSimple,WarningCircle,X} from '@phosphor-icons/react';
import styles from './workflow-media.module.css';

type Aspect='9:16'|'1:1'|'16:9';
interface Asset{id:string;name:string;mime:string;bytes:number;duration:number;width:number;height:number;createdAt:string;sourceUrl:string}
interface Job{id:string;assetId:string;assetName:string;status:'queued'|'running'|'ready'|'failed'|'cancelled';progress:number;version:number;start:number;end:number;aspect:Aspect;layout:'fit'|'fill';captionText:string;createdAt:string;outputUrl:string|null;error:string|null}
interface State{assets:Asset[];jobs:Job[];capability:{upload:boolean;render:boolean;worker:boolean;message:string}}
const statusName:Record<Job['status'],string>={queued:'Чака ред',running:'Монтажът върви',ready:'MP4 е готов',failed:'Монтажът спря',cancelled:'Спрян'};
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const bytes=(value:number)=>`${(value/1024/1024).toLocaleString('bg-BG',{maximumFractionDigits:1})} MB`;
const endpoint='/api/workflow/media';

export function WorkflowMedia({user,onJoin}:{user:boolean;onJoin:()=>void}){
  const [data,setData]=useState<State|null>(null),[loading,setLoading]=useState(user),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
  const [assetId,setAssetId]=useState(''),[jobId,setJobId]=useState(''),[aspect,setAspect]=useState<Aspect>('9:16'),[layout,setLayout]=useState<'fit'|'fill'>('fit'),[start,setStart]=useState('0'),[end,setEnd]=useState(''),[captionText,setCaptionText]=useState(''),[showOutput,setShowOutput]=useState(true);
  const player=useRef<HTMLVideoElement>(null),readController=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null),operation=useRef(false),mounted=useRef(false),restored=useRef(false);
  const assets=data?.assets||[],jobs=data?.jobs||[];
  const asset=assets.find(item=>item.id===assetId)||assets[0];
  const selectedJob=jobs.find(item=>item.id===jobId&&item.assetId===asset?.id)||jobs.find(item=>item.assetId===asset?.id);
  const pending=jobs.some(item=>item.status==='queued'||item.status==='running');
  const readyOutput=selectedJob?.status==='ready'&&selectedJob.outputUrl?selectedJob.outputUrl:null;
  const playerSource=showOutput&&readyOutput?readyOutput:asset?.sourceUrl;

  const load=useCallback(async(background=false)=>{
    if(!user||operation.current)return;
    const controller=new AbortController();readController.current?.abort();readController.current=controller;
    try{const response=await fetch(endpoint,{cache:'no-store',signal:controller.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'Видеата не се заредиха. Опитай отново.');if(mounted.current&&!controller.signal.aborted){setData(value);if(!restored.current&&value.assets.length){restored.current=true;const first=value.assets[0] as Asset,prior=(value.jobs as Job[]).find(item=>item.assetId===first.id);setAssetId(first.id);if(prior){setJobId(prior.id);setStart(String(prior.start));setEnd(String(prior.end));setAspect(prior.aspect);setLayout(prior.layout);setCaptionText(prior.captionText||'');}else setEnd(String(Math.min(first.duration,180)));}}}
    catch(cause){if(mounted.current&&!controller.signal.aborted&&!background)setError(cause instanceof Error?cause.message:'Връзката прекъсна. Опитай отново.');}
    finally{if(mounted.current&&!controller.signal.aborted)setLoading(false);}
  },[user]);
  useEffect(()=>{mounted.current=true;const initialRead=setTimeout(()=>void load(),0);return()=>{clearTimeout(initialRead);mounted.current=false;readController.current?.abort();writeController.current?.abort();};},[load]);
  useEffect(()=>{if(!pending||!user||busy)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{await load(true);if(!stopped)timer=setTimeout(poll,1800);};timer=setTimeout(poll,1000);return()=>{stopped=true;clearTimeout(timer);};},[pending,user,busy,load]);

  function chooseAsset(item:Asset){restored.current=true;setAssetId(item.id);setJobId('');setStart('0');setEnd(String(Math.min(item.duration,180)));setCaptionText('');setShowOutput(false);setError('');setNotice('');}
  async function write(body:Record<string,unknown>,label:string){
    operation.current=true;readController.current?.abort();const controller=new AbortController();writeController.current=controller;setBusy(label);setError('');setNotice('');
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.error||'Промяната не се запази. Опитай отново.');if(!mounted.current||controller.signal.aborted)return null;setData(value);return value as State;}
    catch(cause){if(mounted.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Връзката прекъсна. Опитай отново.');return null;}
    finally{operation.current=false;if(mounted.current)setBusy('');}
  }
  async function upload(file:File){
    if(!user){onJoin();return;}
    if(!/\.(mp4|webm)$/i.test(file.name)||!['video/mp4','video/webm',''].includes(file.type)){setError('Избери MP4 или WebM видео.');return;}
    if(file.size>250*1024*1024||file.size===0){setError('Файлът трябва да е непразен и до 250 MB.');return;}
    operation.current=true;readController.current?.abort();const controller=new AbortController();writeController.current=controller;setBusy('upload');setError('');setNotice('');
    try{const response=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':file.type||(/\.webm$/i.test(file.name)?'video/webm':'video/mp4'),'X-File-Name':encodeURIComponent(file.name)},body:file,signal:controller.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'Видеото не се качи. Опитай отново.');if(mounted.current&&!controller.signal.aborted){setData(value);const item=(value.assets as Asset[]).find(next=>!assets.some(old=>old.id===next.id))||(value.assets as Asset[])[0];if(item)chooseAsset(item);setNotice('Видеото е качено. Избери формат и направи MP4.');}}
    catch(cause){if(mounted.current)setError(controller.signal.aborted?'Качването е спряно. Избери файла, когато си готов.':cause instanceof Error?cause.message:'Връзката прекъсна при качването.');}
    finally{operation.current=false;if(mounted.current)setBusy('');}
  }
  async function render(event:React.FormEvent){event.preventDefault();if(!asset)return;const first=Number(start),last=Number(end||Math.min(asset.duration,180));if(!Number.isFinite(first)||!Number.isFinite(last)||first<0||last>asset.duration+.01||last<=first||last-first>180){setError('Избери откъс до 3 минути в рамките на видеото.');return;}const value=await write({action:'render',assetId:asset.id,start:first,end:last,aspect,layout,captionText:captionText.trim(),requestId:crypto.randomUUID()},'render');if(value){const created=value.jobs.find(item=>!jobs.some(old=>old.id===item.id));if(created)setJobId(created.id);setShowOutput(true);setNotice('Задачата е запазена. Монтажът продължава и при затворена страница.');}}
  const invalidRange=Boolean(asset&&(Number(start)<0||Number(end||Math.min(asset.duration,180))>asset.duration+.01||Number(end||Math.min(asset.duration,180))-Number(start)<.2||Number(end||Math.min(asset.duration,180))-Number(start)>180));

  return <section className={styles.studio} aria-label="Видео студио">
    <header className={styles.header}><div><h2>От твое видео<br/>до готов MP4.</h2><p>Избери откъс и размер. Получаваш видео за изтегляне.</p></div><span className={styles.mediaMark} aria-hidden="true"><Scissors size={30}/><Play size={20} weight="fill"/></span></header>
    {!user?<div className={styles.guest}><div className={styles.guestVisual} aria-hidden="true"><span><FilmSlate size={42}/></span><ArrowRight size={25}/><span className={styles.vertical}><Play size={33} weight="fill"/></span></div><h3>Започни със свое видео.</h3><p>Избираш откъс и формат. Видеото остава само в твоя профил.</p><button className={styles.primary} onClick={onJoin}>Влез, за да качиш видео<ArrowRight size={19}/></button></div>:<>
      {loading?<p className={styles.loading} role="status">Зареждаме твоите видеа…</p>:null}
      {error?<div className={styles.error} role="alert"><WarningCircle size={20}/><p>{error}</p><button onClick={()=>setError('')} aria-label="Затвори грешката"><X size={18}/></button></div>:null}
      {notice?<p className={styles.notice} role="status"><Check size={17}/>{notice}</p>:null}
      {!loading&&data?<>
        <div className={styles.uploadRow}><label className={styles.upload} data-disabled={!data.capability.upload||Boolean(busy)}><UploadSimple size={20}/>{busy==='upload'?'Качвам файла…':assets.length?'Качи друго видео':'Качи MP4 или WebM'}<input aria-label="Качи видео" type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={!data.capability.upload||Boolean(busy)} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label><span>До 250 MB · само твоят профил</span>{busy==='upload'?<button className={styles.textButton} onClick={()=>writeController.current?.abort()}>Спри качването<Stop size={16}/></button>:null}</div>
        {!data.capability.render||!data.capability.worker?<p className={styles.availability}>{data.capability.message}</p>:null}
        {asset?<>
          {assets.length>1?<nav className={styles.assetList} aria-label="Твоите качени видеа">{assets.map(item=><button key={item.id} aria-pressed={item.id===asset.id} disabled={Boolean(busy)} onClick={()=>chooseAsset(item)}><FilmSlate size={16}/><span>{item.name}</span><small>{time(item.duration)}</small></button>)}</nav>:null}
          <div className={styles.editor}>
            <div className={styles.screenColumn}>
              <div className={styles.screenHeading}><span>{asset.name}</span><small>{asset.width} × {asset.height} · {time(asset.duration)} · {bytes(asset.bytes)}</small></div>
              {readyOutput?<nav className={styles.sourceSwitch} aria-label="Източник на прегледа"><button aria-pressed={!showOutput} onClick={()=>setShowOutput(false)}>Оригинал</button><button aria-pressed={showOutput} onClick={()=>setShowOutput(true)}>Готов клип<Check size={14}/></button></nav>:null}
              <div className={styles.screen} data-output={Boolean(showOutput&&readyOutput)}>{playerSource?<video ref={player} key={playerSource} controls playsInline preload="metadata" src={playerSource} aria-label={showOutput&&readyOutput?'Готовият MP4 клип':'Оригиналното ти видео'}/>:null}</div>
              {selectedJob?<div className={styles.jobState} data-state={selectedJob.status}><div><span>{statusName[selectedJob.status]}</span>{selectedJob.status==='running'?<strong>{Math.round(selectedJob.progress)}%</strong>:null}</div>{selectedJob.status==='running'?<progress aria-label="Извършен монтаж" max={100} value={selectedJob.progress}/>:null}{selectedJob.status==='queued'?<p>Записано е. Изчаква свободен монтажен процес.</p>:null}{selectedJob.error?<p role="alert">{selectedJob.error}</p>:null}{['queued','running'].includes(selectedJob.status)?<button className={styles.textButton} disabled={Boolean(busy)} onClick={()=>void write({action:'cancel',jobId:selectedJob.id,expectedVersion:selectedJob.version},'cancel')}><Stop size={16}/>Спри тази задача</button>:selectedJob.status==='failed'||selectedJob.status==='cancelled'?<button className={styles.textButton} disabled={Boolean(busy)||!data.capability.worker} onClick={()=>void write({action:'retry',jobId:selectedJob.id,expectedVersion:selectedJob.version},'retry')}><ArrowClockwise size={17}/>Опитай отново</button>:null}{readyOutput?<a className={styles.download} href={`${readyOutput}${readyOutput.includes('?')?'&':'?'}download=1`} download><DownloadSimple size={21}/>Изтегли MP4<ArrowRight size={18}/></a>:null}</div>:null}
            </div>
            <form className={styles.controls} onSubmit={event=>void render(event)}>
              <fieldset className={styles.formats}><legend>Къде ще го показваш?</legend>{([{value:'9:16',title:'Вертикално',note:'Reels · TikTok · Shorts'},{value:'1:1',title:'Квадратно',note:'Публикация'},{value:'16:9',title:'Хоризонтално',note:'YouTube · сайт'}] as const).map(item=><button key={item.value} type="button" aria-pressed={aspect===item.value} onClick={()=>setAspect(item.value)}><span className={styles.formatShape} style={{aspectRatio:item.value.replace(':','/')}}/><span><strong>{item.title}</strong><small>{item.note}</small></span>{aspect===item.value?<Check size={17}/>:null}</button>)}</fieldset>
              <fieldset className={styles.framing}><legend>Как да стои кадърът?</legend><button type="button" aria-pressed={layout==='fit'} onClick={()=>setLayout('fit')}>Целият кадър{layout==='fit'?<Check size={14}/>:null}</button><button type="button" aria-pressed={layout==='fill'} onClick={()=>setLayout('fill')}>Запълни формата{layout==='fill'?<Check size={14}/>:null}</button></fieldset>
              <div className={styles.trim}><h3><Scissors size={18}/>Коя част запазваме?</h3><div><label htmlFor="media-trim-start">Начало · секунди<input id="media-trim-start" type="number" min={0} max={asset.duration} step="0.1" required value={start} onChange={event=>setStart(event.target.value)}/></label><span aria-hidden="true">→</span><label htmlFor="media-trim-end">Край · секунди<input id="media-trim-end" type="number" min={0.1} max={asset.duration} step="0.1" required value={end||String(Math.min(asset.duration,180))} onChange={event=>setEnd(event.target.value)}/></label></div><div className={styles.fromPlayer}><button type="button" onClick={()=>{if(player.current&&!(showOutput&&readyOutput))setStart(player.current.currentTime.toFixed(1));}} disabled={Boolean(showOutput&&readyOutput)}>Тук започва</button><button type="button" onClick={()=>{if(player.current&&!(showOutput&&readyOutput))setEnd(player.current.currentTime.toFixed(1));}} disabled={Boolean(showOutput&&readyOutput)}>Тук свършва</button></div><small>Пусни видеото и маркирай начало и край. Откъсът е до 3 минути.</small></div>
              <details className={styles.caption}><summary>Добави текст върху клипа<span>По желание</span></summary><label htmlFor="media-caption">Твоят текст<textarea id="media-caption" maxLength={180} rows={3} value={captionText} onChange={event=>setCaptionText(event.target.value)} placeholder="Кратка реплика или заглавие"/></label><p>Текстът се добавя в готовия файл. Това не е автоматичен препис на речта.</p></details>
              <button className={styles.primary} type="submit" disabled={Boolean(busy)||invalidRange||!data.capability.render||!data.capability.worker}><FilmSlate size={20}/>{busy==='render'?'Записвам задачата…':'Направи готов MP4'}<ArrowRight size={18}/></button>
              <p className={styles.resultNote}>Изтегляш файла. Публикуването е отделно действие.</p>
            </form>
          </div>
          {jobs.length?<section className={styles.history} aria-label="Предишни монтажи"><h3>Твоите монтажи</h3>{jobs.slice(0,12).map(item=><button key={item.id} onClick={()=>{setAssetId(item.assetId);setJobId(item.id);setStart(String(item.start));setEnd(String(item.end));setAspect(item.aspect);setLayout(item.layout);setCaptionText(item.captionText||'');setShowOutput(true);}} aria-pressed={selectedJob?.id===item.id}><FilmSlate size={19}/><span><strong>{item.assetName}</strong><small>{time(item.start)}–{time(item.end)} · {item.aspect}</small></span><b data-ready={item.status==='ready'}>{statusName[item.status]}</b><ArrowRight size={17}/></button>)}</section>:null}
        </>:<div className={styles.empty}><div className={styles.emptyFilm} aria-hidden="true"><FilmSlate size={68} weight="thin"/><ArrowRight size={29}/><span>MP4</span></div><h3>Първо избери свое видео.</h3><p>Избираш откъс и размер. Монтажът подготвя файла.</p></div>}
      </>:!loading?<button className={styles.textButton} onClick={()=>void load()}><ArrowClockwise size={18}/>Зареди видеата отново</button>:null}
    </>}
  </section>;
}
