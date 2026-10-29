'use client';
import {useEffect,useState} from 'react';
import {ArrowRight} from '@phosphor-icons/react';
import styles from './google-sign-in.module.css';

export function GoogleSignIn({linking=false,ageBand=''}:{linking?:boolean;ageBand?:string}){
 const [configured,setConfigured]=useState<boolean|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false;fetch('/api/connections',{cache:'no-store'}).then(response=>response.json()).then(result=>{if(!cancelled)setConfigured(result.google?.configured===true);}).catch(()=>{if(!cancelled)setConfigured(false);});return()=>{cancelled=true;};},[]);
 return <div className={styles.google}>
  <button type="button" className={styles.start} disabled={!configured||busy} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{linking?'Свържи Google за по-лесен вход':'Продължи с Google'}<ArrowRight size={18}/></button>
  {configured===false&&<p className={styles.note}>Google входът още не е настроен. Можеш да влезеш с имейл.</p>}
  {open&&<form className={styles.consent} onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);try{const response=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'google',ageBand:form.get('google-age'),consent:form.get('google-consent')==='on',returnTo:location.pathname+location.search})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Google входът не се отвори. Опитай отново.');location.assign(result.url);}catch(e){setError((e as Error).message);setBusy(false);}}}>
   <label>Възрастова група<select name="google-age" required defaultValue={ageBand}><option value="" disabled>Избери група</option><option value="18+">18 или повече години</option><option value="14-17">14–17 години</option></select></label>
   <label className={styles.check}><input type="checkbox" name="google-consent" required/><span>Разрешавам да използваме името и имейла ми от Google за вход или нов профил тук. <a href="/website-connections-policy" target="_blank" rel="noopener noreferrer">Как използваме данните</a></span></label>
   {error&&<p role="alert">{error}</p>}<button type="submit" className={styles.submit} disabled={busy}>{busy?'Отваряме Google…':'Към Google'}<ArrowRight size={18}/></button>
  </form>}
  {!linking&&<div className={styles.divider}>или с имейл</div>}
 </div>;
}
