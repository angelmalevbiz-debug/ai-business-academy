'use client';

import { useId, useRef, useState } from 'react';
import { ArrowRight, Check } from '@phosphor-icons/react';

type Field = 'tried' | 'outcome' | 'check';
export function QuickLessonReport({ checklist, report, onChange }: {
  checklist: string[]; report: Record<Field,string>; onChange: (field: Field, value: string) => void;
}) {
  const [stage,setStage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const questions = [
    {field:'tried' as const,label:'Проба',prompt:'Какво пробва?',options:checklist},
    {field:'outcome' as const,label:'Резултат',prompt:'Как мина?',options:['Получи се по план','Открих какво да поправя','Още тествам']},
    {field:'check' as const,label:'Проверка',prompt:'Как провери?',options:['С примерни данни','Сравних с очаквания резултат','Помолих човек да провери']},
  ];
  function move(index:number) {setStage(index); requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));}
  const current = questions[stage];
  return <div className="lesson-quick-report">
    <div className="quick-report-progress" role="group" aria-label="Части на отчета">{questions.map((question,index)=><button type="button" key={question.field} aria-pressed={stage===index} onClick={()=>move(index)}><span>{report[question.field]?<Check size={14}/>:index+1}</span>{question.label}</button>)}</div>
    <h3 ref={heading} id={id} tabIndex={-1}>{current ? current.prompt : 'Отчетът е подготвен.'}</h3>
    {current ? <div className="quick-report-choices" role="group" aria-labelledby={id}>{current.options.map(option=><button key={option} type="button" aria-pressed={report[current.field]===option} onClick={()=>{const updated={...report,[current.field]:option};onChange(current.field,option);const missing=questions.findIndex(question=>!updated[question.field]);move(missing<0?3:missing);}}><span>{option}</span><ArrowRight size={18} aria-hidden="true"/></button>)}</div> : <button type="button" className="text-link" onClick={()=>move(0)}>Промени отговорите<ArrowRight size={17}/></button>}
  </div>;
}
