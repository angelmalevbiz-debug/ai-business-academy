import {AppError,textField} from './auth';
import type {Member} from './domain';
import {getDb} from './db';
import type {PositioningProduct} from './workflow-positioning';
import {saveWorkflowBrain,workflowMember} from './workflow-store';

/** Explicit owner action. No generated segment or advertising claim becomes a brand fact. */
export function applyPositioningBrain(userInput:Member|null,data:Record<string,unknown>){
 const user=workflowMember(userInput);
 if(user.ageBand!=='18+')throw new AppError('Търговският контекст е за пълнолетни.',403);
 const row=getDb().prepare('SELECT id,name,payload,version FROM workflow_positioning_products WHERE id=? AND member_id=?').get(textField(data.productId,'Продукт',1,100),user.id);
 if(!row)throw new AppError('Продуктът не е достъпен.',404);
 const product={...JSON.parse(String(row.payload)),id:String(row.id),name:String(row.name),version:Number(row.version)} as PositioningProduct;
 if(product.version!==data.expectedVersion)throw new AppError('Продуктът е променен. Зареди го отново.',409);
 const breakAt=product.facts.lastIndexOf(' ',1900),boundary=product.facts.length<=1900?product.facts.length:breakAt>=10?breakAt:1900;
 return saveWorkflowBrain(user,{
  expectedVersion:data.expectedBrainVersion,
  name:product.name.slice(0,100),
  audience:product.audience||'Аудиторията още не е уточнена. Не я представяй като изследван факт.',
  voice:'Ясен, кратък български. Конкретно описание на действителната работа. Без общи лозунги.',
  offer:product.facts.slice(0,boundary),
  notes:`Собствен продукт: ${product.name}\nИзточник: продукт ${product.id}, версия ${product.version}.\n${product.facts.slice(boundary).trim()?`Продължение на описанието от полето „Предложение“:\n${product.facts.slice(boundary).trim()}\n`:''}Предоставени доказателства:\n${product.evidence||'Не са предоставени. Не измисляй доказателства, клиенти или резултати.'}`,
  guardrails:`${product.constraints}\nИзползвай само предоставените свойства. Генерираните аудитории, послания и продажби не са проверени факти. Нищо не е разрешено за външно публикуване или изпращане само с това действие.`.trim(),
 });
}
