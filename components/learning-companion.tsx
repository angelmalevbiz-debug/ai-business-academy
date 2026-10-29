'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChatCircle, X } from '@phosphor-icons/react';

export function LearningCompanion({ hint, compact = false }: { hint: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className={`learning-companion ${compact ? 'compact' : ''} ${open ? 'is-speaking' : ''}`}>
    {open && <div className="companion-hint" role="status"><strong>Искра</strong><p>{hint}</p><button aria-label="Скрий съвета" onClick={() => setOpen(false)}><X size={17} /></button></div>}
    <button className="companion-character" onClick={() => setOpen(value => !value)} aria-label="Искра: съвет за задачата" aria-expanded={open}>
      <Image src="/brand/iskra-mascot.png" width={360} height={360} alt="Искра, синьо-оранжевият водач на академията" sizes="(max-width: 760px) 150px, 280px" loading={compact ? 'lazy' : 'eager'} />
      <span className="companion-prompt"><ChatCircle size={15} />Съвет от Искра</span>
    </button>
  </div>;
}
