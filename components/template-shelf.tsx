'use client';

import { useState } from 'react';
import { DownloadSimple, ArrowRight } from '@phosphor-icons/react';

const groups = [
  {id:'build', title:'Построй', preview:['Вход','Правило','Проверка'], files:[
    {title:'Карта на бизнес процес', description:'Подреди входа, стъпките и резултата.', file:'process-map.md'},
    {title:'Първи работещ поток', description:'Повтори примера и провери какво излиза.', file:'first-workflow.md'},
    {title:'Примерни запитвания', description:'Измислени данни за безопасен тест.', file:'request-test-cases.csv'},
  ]},
  {id:'check', title:'Провери', preview:['Очаквано','Получено','Извод'], files:[
    {title:'План за тест на автоматизация', description:'Провери обичайния случай и грешките.', file:'test-plan.md'},
    {title:'Има ли смисъл от промяната?', description:'Сравни времето и разходите в таблица.', file:'business-value.csv'},
  ]},
  {id:'share', title:'Покажи', preview:['Проблем','Промяна','Резултат'], files:[
    {title:'Казус с проверим резултат', description:'Покажи работата и ограниченията ѝ.', file:'case-study.md'},
    {title:'Примерна оферта · 18+', description:'Опиши обхват, цена и приемане на работа.', file:'service-offer.md'},
  ]},
] as const;

export function TemplateShelf() {
  const [selected, setSelected] = useState(0);
  const group = groups[selected];
  return <section className="template-shelf panel">
    <h2>Вземи готова основа.</h2>
    <div className="template-tabs" role="group" aria-label="Шаблони според задачата">{groups.map((item,index)=><button key={item.id} aria-pressed={selected===index} onClick={()=>setSelected(index)}>{item.title}</button>)}</div>
    <div className={`template-preview template-preview-${group.id}`} aria-label={group.preview.join(' → ')}>{group.preview.map((part,index)=><span key={part}>{index>0&&<ArrowRight size={20} aria-hidden="true"/>}<strong>{part}</strong></span>)}</div>
    <div className="template-files" key={group.id}>{group.files.map(file=><a className="template-row" key={file.file} href={`/templates/${file.file}`} download><span><strong>{file.title}</strong><small>{file.description}</small></span><span className="template-file-format">{file.file.endsWith('.csv')?'CSV':'ТЕКСТ'}<DownloadSimple size={19}/></span></a>)}</div>
    <p className="template-format-note">Текстът се редактира в бележник; CSV файлът се отваря в таблица.</p>
  </section>;
}
