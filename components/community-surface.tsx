'use client';

import {useState} from 'react';
import Image from 'next/image';
import {ArrowLeft,ArrowRight,ArrowUpRight,ChatCircle,ChatsCircle,FileText,Plus,ShieldCheck,PaperPlaneTilt,CaretDown,Path,UsersThree} from '@phosphor-icons/react';
import type {Member,Post} from '@/lib/domain';
import type {WorkspaceMutator} from './contracts';
import styles from './community-surface.module.css';

export type CommunitySurfaceProps={
  posts:Post[];selectedPost:Post|null;user:Member|null;busy:boolean;category:string;
  categoryLabels:Record<string,string>;setCategory:(category:string)=>void;
  openPost:(id:string)=>void;closePost:()=>void;openQuestion:()=>void;openProgress:()=>void;
  mutate:WorkspaceMutator;requireUser:(action:()=>void)=>void;
};
const initials=(name:string)=>name.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
const date=(value:string)=>new Date(value).toLocaleDateString('bg-BG',{day:'numeric',month:'short',timeZone:'Europe/Sofia'});
const categoryIcon={question:ChatCircle,progress:Path,resource:FileText};

export function CommunitySurface({posts,selectedPost,user,busy,category,categoryLabels,setCategory,openPost,closePost,openQuestion,openProgress,mutate,requireUser}:CommunitySurfaceProps){
  const [replyDraft,setReplyDraft]=useState({postId:'',text:''});
  const reply=selectedPost?.id===replyDraft.postId?replyDraft.text:'';
  const setReply=(text:string)=>setReplyDraft({postId:selectedPost?.id||'',text});
  const featured=posts[0];
  return <section className={styles.surface} aria-label="Общност на AI Business Academy">
    <header className={styles.heading}>
      <div><h1>Виж как мина при другите.</h1><p>Хората следят пътя, не съвършенството.</p></div>
      {!selectedPost?<div className={`community-contribute ${styles.actions}`}><button className={styles.primary} onClick={openQuestion}><Plus size={23}/>Задай въпрос</button><button className={styles.secondary} onClick={openProgress}><ChatsCircle size={22}/>Покажи процеса</button></div>:null}
    </header>
    {selectedPost?<section className={`thread ${styles.thread}`}>
      <button className={styles.back} onClick={()=>{setReply('');closePost();}}><ArrowLeft size={19}/>Всички дискусии</button>
      <PostMeta post={selectedPost} label={categoryLabels[selectedPost.category]}/>
      <h2>{selectedPost.title}</h2><p className={`preserve-text ${styles.body}`}>{selectedPost.body}</p>
      {user?.role==='admin'?<button className={styles.moderate} disabled={busy} onClick={async()=>{if(await mutate({action:'hidePost',postId:selectedPost.id},'Публикацията е скрита от общността.')){setReply('');closePost();}}}><ShieldCheck size={18}/>Скрий публикацията</button>:null}
      <div className={`thread-replies ${styles.replies}`}><h3>{selectedPost.replyCount} отговора</h3>
        {selectedPost.hasMoreReplies?<p className={styles.detail}>Показани са последните 100 отговора. По-старите отговори още нямат странициран изглед.</p>:null}
        {selectedPost.replies.map(item=><div key={item.id} className={`reply ${styles.reply}`}><span className={styles.avatar}>{initials(item.authorName)}</span><div><strong>{item.authorName}</strong><p className="preserve-text">{item.body}</p><small>{date(item.createdAt)}</small>{user?.role==='admin'?<button className={styles.moderate} disabled={busy} onClick={()=>void mutate({action:'hideReply',replyId:item.id},'Отговорът е скрит. Разговорът остава достъпен.')}>Скрий отговора</button>:null}</div></div>)}
      </div>
      <form className={styles.replyForm} onSubmit={event=>{event.preventDefault();requireUser(()=>{void(async()=>{if(await mutate({action:'reply',postId:selectedPost.id,body:reply},'Отговорът е публикуван.'))setReply('');})();});}}>
        <label htmlFor="reply">Добави към разговора</label><textarea id="reply" value={reply} onChange={event=>setReply(event.target.value)} required minLength={5} maxLength={3000} placeholder="Какъв е твоят опит?" rows={3}/><button className={styles.primary} disabled={busy}>Публикувай отговор<PaperPlaneTilt size={19}/></button>
      </form>
    </section>:<div className={styles.layout}>
      <div className={styles.feed}>
        {featured?<Conversation post={featured} label={categoryLabels[featured.category]} open={()=>openPost(featured.id)} featured/>:<div className={styles.empty}>
          <Image src="/community-reference-20261028/conversation-glass.webp" alt="" width={720} height={480} sizes="(max-width:760px) 88vw, 380px" loading="eager" className={styles.emptyArt}/>
          <div><h2>Нова дискусия</h2><p>Още няма публикации в тази категория.</p><button className={styles.primary} onClick={openQuestion}>Публикувай въпрос<ArrowRight size={20}/></button></div>
        </div>}
        <details className={`community-filters ${styles.filters}`}><summary>Намери конкретен разговор<CaretDown size={18}/></summary><div className={styles.filterButtons}><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>Всички дискусии</button>{Object.entries(categoryLabels).map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{label}</button>)}</div></details>
        <div className={styles.stream}>{posts.slice(1).map(post=><Conversation key={post.id} post={post} label={categoryLabels[post.category]} open={()=>openPost(post.id)}/>)}</div>
      </div>
      <aside className={styles.companion} aria-label="Как да се включиш">
        <h2>Покажи какво опита.<br/>Получи друг поглед.</h2>
        <div className={styles.exchange} aria-hidden="true"><span><FileText size={31}/></span><ArrowRight size={28}/><span><UsersThree size={32}/></span></div>
        <div className={styles.exchangeLabels}><span>Твоят опит</span><span>Идеи от другите</span></div>
        <details className={styles.rules}><summary>Как пазим разговора полезен<CaretDown size={17}/></summary><div><h3>Споделяй по същество.</h3><ul><li>Покажи какво опита.</li><li>Пази данните на клиенти.</li><li>Без обещания за доход.</li></ul><details><summary>Всички правила</summary><p>Бъди конкретен и добронамерен. Споделяй контекста и какво вече си опитал.</p><ul><li>Без спам и непоискани продажби.</li><li>Без чувствителни данни на клиенти.</li><li>Резултатите имат нужда от контекст.</li><li>Не обещаваме гарантиран доход.</li></ul><small>Началните материали са публикувани от екипа.</small></details></div></details>
      </aside>
    </div>}
  </section>;
}

function PostMeta({post,label}:{post:Post;label:string}){return <div className={styles.meta}><span className={styles.avatar}>{initials(post.authorName)}</span><span><strong>{post.authorName}{post.authorRole==='admin'?<ShieldCheck size={14}/>:null}</strong><small>{date(post.createdAt)}</small></span><span className={styles.category}>{label}</span></div>;}
function Conversation({post,label,open,featured=false}:{post:Post;label:string;open:()=>void;featured?:boolean}){
  const Icon=categoryIcon[post.category];
  const lastReply=post.replies.at(-1);
  return <button className={`post-card ${styles.post} ${featured?styles.featured:''}`} data-category={post.category} onClick={open}>
    {featured?<Image src="/community-reference-20261028/conversation-glass.webp" alt="" width={720} height={480} sizes="(max-width:760px) 80vw, 360px" loading="eager" className={styles.featureArt}/>:null}
    <div className={styles.postContent}><PostMeta post={post} label={label}/><h3>{post.title}</h3><div className={featured?styles.featureBody:undefined}><p className={styles.excerpt}>{post.body}</p>{featured?<Image src="/community-reference-20261028/conversation-glass.webp" alt="" width={720} height={480} sizes="130px" loading="eager" className={styles.mobileFeatureArt}/>:null}</div>
      {!featured&&lastReply?<span className={styles.lastReply}><strong>{lastReply.authorName}</strong><span>{lastReply.body}</span></span>:null}
      <span className={styles.postBottom}><span><Icon size={18}/>{post.replyCount} отговора</span><span>{featured?'Влез в разговора':'Отвори'}<ArrowUpRight size={19}/></span></span>
    </div>
  </button>;
}
