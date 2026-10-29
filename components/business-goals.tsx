'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FlowArrow, Globe, Lightbulb, Megaphone, Package, Handshake, Plus } from '@phosphor-icons/react';
import styles from './business-goals.module.css';

type BusinessStage = 'new' | 'existing';
type BusinessGoalsProps = {
  openWebsite: (stage: BusinessStage) => void;
  openWorkflow: (goal: 'content' | 'business' | 'automation', recipe?: string) => void;
  openPositioning: () => void;
  openTeam: () => void;
};

export function BusinessGoals({ openWebsite, openWorkflow, openPositioning, openTeam }: BusinessGoalsProps) {
  const [stage, setStage] = useState<BusinessStage | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  function chooseStage(next: BusinessStage | null) {
    setStage(next);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  const outcomes = stage === 'new' ? [
    { title: 'Да проверя идеята си', description: 'Как да разбереш дали някой я иска.', icon: Lightbulb, action: () => openWorkflow('business', 'intelligence-validate-idea') },
    { title: 'Да подредя първата си оферта', description: 'Какво предлагаш и за кого е.', icon: Handshake, action: () => openWorkflow('business', 'sales-offer-one-page') },
    { title: 'Да представя бизнеса си', description: 'Кратък текст за първата публикация.', icon: Megaphone, action: () => openWorkflow('content', 'content-intro-post') },
  ] : [
    { title: 'Да представя продукта по-добре', description: 'За кого е и защо да го избере.', icon: Package, action: openPositioning },
    { title: 'Да подготвя съдържание', description: 'Идеи и сценарий за следващите публикации.', icon: Megaphone, action: () => openWorkflow('content', 'content-content-week') },
    { title: 'Да намаля ръчната работа', description: 'Намери повтарящото се в един процес.', icon: FlowArrow, action: () => openWorkflow('automation', 'operations-process-map') },
  ];

  return <section className={styles.hub} aria-label="Развитие на бизнес">
    <header className={styles.heading}>
      {stage && <button className={styles.back} onClick={() => chooseStage(null)}><ArrowLeft size={18} />{stage === 'new' ? 'Започвам бизнес' : 'Вече имам бизнес'}<span>Промени</span></button>}
      <h1 ref={heading} tabIndex={-1}>{stage ? 'Какво ти трябва сега?' : 'На какъв етап си?'}</h1>
      <p>{stage ? 'Избери резултат. Отваряме направо мястото за него.' : 'Ще ти покажем подходящите възможности.'}</p>
    </header>

    {!stage ? <div className={styles.stageChoices}>
      <button className={styles.stageNew} onClick={() => chooseStage('new')}>
        <span className={styles.stageVisual} aria-hidden="true"><Plus size={48} weight="light" /><span className={styles.stageLine} /><span className={styles.stageDot} /></span>
        <span><strong>Започвам бизнес</strong><span>Имам идея. Искам да ѝ дам форма.</span></span>
        <ArrowRight size={27} aria-hidden="true" />
      </button>
      <button className={styles.stageExisting} onClick={() => chooseStage('existing')}>
        <span className={styles.stageVisual} aria-hidden="true"><Check size={42} weight="light" /><span className={styles.stageLine} /><ArrowUpRight size={37} weight="light" /></span>
        <span><strong>Вече имам бизнес</strong><span>Искам да развия нещо конкретно.</span></span>
        <ArrowRight size={27} aria-hidden="true" />
      </button>
    </div> : <div className={styles.destinations} key={stage}>
      <section className={styles.website} aria-labelledby="business-website-title">
        <div className={styles.websiteCopy}>
          <Globe size={28} weight="light" aria-hidden="true" />
          <h2 id="business-website-title">Собствен сайт.</h2>
          <p>Твоят бизнес, твоите снимки, твоят стил.</p>
        </div>
        <div className={styles.sitePreview} aria-hidden="true">
          <div className={styles.browserBar}><i /><i /><i /><span>Твоят сайт</span></div>
          <div className={styles.previewPage}>
            <div className={styles.previewNav}><strong>ТВОЯТ БИЗНЕС</strong><span>За нас&nbsp;&nbsp; Контакт</span></div>
            <div className={styles.previewHero}><div><strong>Това, което правиш.<br />На едно място.</strong><span>Покажи с какво помагаш.</span><b>Свържи се с нас <ArrowUpRight size={10} /></b></div><div className={styles.previewLayout}><span /><span /><span /></div></div>
            <div className={styles.previewSections}><span>Услуги</span><span>За бизнеса</span><span>Контакт</span></div>
          </div>
        </div>
        <button className={styles.primary} onClick={() => openWebsite(stage)}>Създай сайт<ArrowRight size={22} /></button>
        <p className={styles.websiteNote}>Създаване, редактиране и изтегляне на сайта.</p>
      </section>
      <section className={styles.outcomes} aria-label="Други резултати за бизнеса">
        {outcomes.map(item => <button key={item.title} onClick={item.action} className={styles.outcome}>
          <item.icon size={26} weight="light" aria-hidden="true" />
          <span><strong>{item.title}</strong><span>{item.description}</span></span>
          <ArrowUpRight size={23} aria-hidden="true" />
        </button>)}
      </section>
    </div>}

    <footer className={styles.footer}><button onClick={openTeam}><FlowArrow size={20} />Виж AI екипа<ArrowRight size={18} /></button></footer>
  </section>;
}
