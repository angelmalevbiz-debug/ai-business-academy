import {AppError} from './auth';
import type {ReservedWorkflowStep} from './workflow-store';
import {workflowRecipe} from './workflow-recipes';

const field={type:'string',minLength:2};
const list={type:'array',items:{type:'string',minLength:2,maxLength:1600},minItems:1,maxItems:6};
function record(properties:Record<string,unknown>){return{type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
const contentSchemas={
  chief:record({goal:field,providedFacts:list,decisions:list}),
  research:record({providedEvidence:list,unknowns:list,nextChecks:list}),
  strategy:record({nextAction:field,reason:field,successCheck:field}),
  copy:record({hook:field,spokenScript:field,callToAction:field}),
  art:record({shots:{type:'array',minItems:2,maxItems:6,items:record({seconds:field,action:field,screenText:field})},checks:list}),
  community:record({replies:{type:'array',minItems:2,maxItems:2,items:record({question:field,reply:field})},humanEscalation:field}),
};
export function workflowRoleSchema(reservation:ReservedWorkflowStep){
  if(['chief','research','strategy','community'].includes(reservation.role))return record({title:field,...contentSchemas[reservation.role as keyof typeof contentSchemas].properties});
  if(reservation.role==='copy'&&workflowRecipe(reservation.project.recipeId)?.outputKind==='text')return record({title:field,content:field});
  if(reservation.project.templateId!=='content'||reservation.role==='publish')return record({title:field,content:field});
  return record({title:field,...contentSchemas[reservation.role].properties});
}
function strings(value:unknown,label:string,min=1,max=6){if(!Array.isArray(value)||value.length<min||value.length>max||value.some(item=>typeof item!=='string'||item.trim().length<2||item.length>1600))throw new AppError(`Моделът не попълни секцията „${label}“. Няма записана чернова.`,502);return value as string[];}
function text(value:unknown,label:string,max=2400){if(typeof value!=='string'||value.trim().length<2||value.length>max)throw new AppError(`Моделът не попълни секцията „${label}“. Няма записана чернова.`,502);return value.trim();}
function row(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Моделът върна неподходяща структура за тази роля.',502);return value as Record<string,unknown>;}
const bullets=(items:string[])=>items.map(item=>`• ${item}`).join('\n');
// These patterns describe the generation/editing process, not the offered product.
// Do not reject the word “чернова” itself: an AI service can legitimately offer drafts.
const writtenCopyLeaks=[
  /(?:това\s+е\s+(?:(?:редактирана|работна|подготвена)\s+)?чернова|това\s+е\s+готов\s+текст\s+за\s+читателя|(?:текстът|материалът|публикацията)\s+(?:не\s+е\s+публикуван|е\s+(?:(?:редактирана|работна)\s+)?чернова))/iu,
  /(?:не\s+е\s+свързан[ао]?\s+с\s+външно\s+публикуване|без\s+да\s+се\s+изисква\s+външно\s+публикуване|(?:всичко|текстът|материалът)\s+е\s+изолиран[оа]?\s+и\s+готов[оа]?\s+за\s+преглед)/iu,
  /(?:^|[.!?\n])\s*(?:премахнати\s+са\s*:|(?:редакторски\s+бележки|какво\s+е\s+премахнато|промени\s+по\s+текста)\s*:|(?:редактирах|съкратих|преработих)\s+(?:текста|публикацията)|съкрати\s+текста\s*,\s*запази\s+смисъла|(?:дай|върни)\s+(?:самия|само\s+крайния)\s+текст)/iu,
  /(?:^|[.!?\n])\s*(?:here\s+is\s+(?:your|the)\s+(?:revised|edited)\s+(?:draft|text)|i(?:\s+have|'ve)\s+(?:removed|rewritten|shortened))/iu,
  /(?:^|[.!?\n])\s*(?:няма|без)\s+(?:допълнителни\s+)?обещания\s+за\s+доход\s*[,–—-]\s*статистик[аи]/iu,
  /(?:^|[.!?\n])\s*(?:(?:покани|подкани|насърчи|помоли)\s+(?:читателя|аудиторията)|без\s+допълнителни\s+обещания\s+и\s+статистика)/iu,
];
function validateWrittenCopy(content:string){
  if(writtenCopyLeaks.some(pattern=>pattern.test(content)))throw new AppError('Клиентският текст съдържа вътрешен работен статус или редакторски указания вместо самата публикация. Върни само готовия текст за читателя, без описание на редакцията, черновата или публикуването.',502);
}
export function compileWorkflowRoleOutput(reservation:ReservedWorkflowStep,value:unknown){
  const output=row(value),title=text(output.title,'Заглавие',180);let content:string;
  if((reservation.project.templateId!=='content'&&!['chief','research','strategy','community'].includes(reservation.role))||reservation.role==='publish'||(reservation.role==='copy'&&workflowRecipe(reservation.project.recipeId)?.outputKind==='text')){
    content=text(output.content,'Резултат',20000);
    if(reservation.role==='copy'&&workflowRecipe(reservation.project.recipeId)?.outputKind==='text')validateWrittenCopy(content);
    return{title,content};
  }
  switch(reservation.role){
    case'chief':content=`Цел\n${text(output.goal,'Цел')}\n\nПредоставени факти\n${bullets(strings(output.providedFacts,'Предоставени факти'))}\n\nРешения за човек\n${bullets(strings(output.decisions,'Решения'))}`;break;
    case'research':content=`Предоставени доказателства\n${bullets(strings(output.providedEvidence,'Доказателства'))}\n\nНе знаем\n${bullets(strings(output.unknowns,'Не знаем'))}\n\nСледваща проверка\n${bullets(strings(output.nextChecks,'Следваща проверка'))}`;break;
    case'strategy':content=`Следващ ход\n${text(output.nextAction,'Следващ ход')}\n\nЗащо\n${text(output.reason,'Защо')}\n\nКак проверяваме\n${text(output.successCheck,'Проверка')}`;break;
    case'copy':content=`Кукичка\n${text(output.hook,'Кукичка',400)}\n\nДуми за произнасяне\n${text(output.spokenScript,'Сценарий',2400)}\n\nПризив\n${text(output.callToAction,'Призив',400)}`;break;
    case'art':{
      if(!Array.isArray(output.shots)||output.shots.length<2||output.shots.length>6)throw new AppError('Монтажният план трябва да има между 2 и 6 конкретни кадъра.',502);
      content=`Кадри за заснемане\n${output.shots.map(item=>{const shot=row(item);return`${text(shot.seconds,'Секунди',50)} — ${text(shot.action,'Действие',700)}\nНадпис: ${text(shot.screenText,'Надпис',200)}`;}).join('\n\n')}\n\nПроверки\n${bullets(strings(output.checks,'Проверки'))}`;break;
    }
    case'community':{
      if(!Array.isArray(output.replies)||output.replies.length!==2)throw new AppError('Нужни са точно две чернови на отговори.',502);
      content=`Възможни въпроси и чернови\n${output.replies.map(item=>{const reply=row(item);return`Въпрос: ${text(reply.question,'Въпрос',500)}\nОтговор: ${text(reply.reply,'Отговор',900)}`;}).join('\n\n')}\n\nВключи човек, когато\n${text(output.humanEscalation,'Включване на човек',600)}`;break;
    }
  }
  if(content.length>12000)throw new AppError('Резултатът е прекалено дълъг за преглед.',502);
  return{title,content};
}

export function compilePublicationPackage(reservation:ReservedWorkflowStep){
  const script=reservation.inputs.find(item=>item.role==='copy'),art=reservation.inputs.find(item=>item.role==='art');
  if(!script||!art)throw new AppError('За пакета липсва актуален сценарий или план за кадрите.',409);
  return{title:`Пакет за преглед: ${reservation.project.title}`.slice(0,180),content:`Сценарий — версия ${script.revision}\n${script.content}\n\nПлан за кадрите — версия ${art.revision}\n${art.content}\n\nПреди публикуване\n• Човекът проверява фактите, правата за кадрите и крайното видео.\n• Описанието и форматът се потвърждават според избраната мрежа.\n• Часът не е определен: няма предоставена проверена статистика за активността на аудиторията.\n• Няма свързан акаунт, планирана публикация или изпратен пост.\n\nИзточници на пакета\n${script.id} — v${script.revision}\n${art.id} — v${art.revision}`,provider:null,model:null,provenance:'compiled' as const};
}
