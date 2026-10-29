'use client';

import { useState } from 'react';
import { DownloadSimple, Trash, ArrowRight } from '@phosphor-icons/react';
import {GoogleSignIn} from './google-sign-in';

export function AccountDataControls({ isAdmin, busy, deleteAccount,ageBand }: {
  isAdmin: boolean; busy: boolean; ageBand?:string; deleteAccount: (password: string,authentication?:'google') => Promise<boolean>;
}) {
  const [exporting, setExporting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [google,setGoogle]=useState({connected:false,recentlyAuthenticated:false});
  const [authentication,setAuthentication]=useState<'password'|'google'>('password');
  async function exportData() {
    setExporting(true); setMessage(''); setFailed(false);
    try {
      const response = await fetch('/api/workspace', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'exportData'})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Изтеглянето не успя. Опитай отново.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a');
      link.href = url; link.download = `academy-data-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Файлът с данните ти е подготвен за изтегляне.');
    } catch(error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Няма връзка. Опитай отново.'); }
    finally { setExporting(false); }
  }
  return <section className="account-data panel">
    <h2>Твоите данни</h2>
    <div className="account-export-row"><p>Изтегли копие на профила, задачите и личните си бележки.</p><button className="button secondary" disabled={exporting || busy} onClick={() => void exportData()}><DownloadSimple size={19}/>{exporting ? 'Подготвяне…' : 'Изтегли данните'}</button></div>
    {message && <p className={failed ? 'account-data-error' : 'muted'} role={failed ? 'alert' : 'status'}>{message}</p>}
    <details className="account-delete" onToggle={event=>{if(event.currentTarget.open)void fetch('/api/connections',{cache:'no-store'}).then(response=>response.json()).then(result=>{if(result.google)setGoogle(result.google);}).catch(()=>{});}}>
      <summary><Trash size={17}/>Изтрий профила</summary>
      <p>Изтриват се профилът, задачите, бележките и твоите публикации и отговори. Действието е окончателно.</p>
      {isAdmin && <p>Публикуваните учебни материали и редакционната история остават с анонимизиран автор. Последният администратор не може да изтрие профила си, преди да има друг.</p>}
      {google.connected&&<div className="account-auth-choice"><button type="button" className="button secondary" aria-pressed={authentication==='password'} onClick={()=>setAuthentication('password')}>С парола</button><button type="button" className="button secondary" aria-pressed={authentication==='google'} onClick={()=>setAuthentication('google')}>С Google</button></div>}
      {authentication==='google'&&!google.recentlyAuthenticated&&<><p>Първо потвърди входа си с Google. После се върни тук и избери „С Google“. Потвърждението важи 10 минути.</p><GoogleSignIn linking ageBand={ageBand}/></>}
      <form onSubmit={async event => {event.preventDefault(); if (confirmed && await deleteAccount(password,authentication==='google'?'google':undefined)) setPassword('');}}>
        {authentication==='password'?<><label htmlFor="delete-account-password">Потвърди с текущата си парола</label>
        <input id="delete-account-password" type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} maxLength={128}/></>:google.recentlyAuthenticated&&<p>Входът с Google е потвърден за тази сесия.</p>}
        <label className="account-delete-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required/>Разбирам, че изтритите данни няма да могат да се възстановят.</label>
        <button className="button primary" disabled={busy || !confirmed || (authentication==='google'?!google.recentlyAuthenticated:!password)}>{busy ? 'Изтриване…' : 'Изтрий окончателно'}<ArrowRight size={17}/></button>
      </form>
    </details>
  </section>;
}
