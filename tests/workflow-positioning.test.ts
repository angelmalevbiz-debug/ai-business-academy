import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AppError,createMember} from '../lib/auth';
import {closeDb,getDb} from '../lib/db';
import {saveWorkflowBrain} from '../lib/workflow-store';
import {createPositioningMaterial,generatePositioning,getPositioningState,positioningNeedsClaimReview,savePositioningProduct,validatePositioningOutput} from '../lib/workflow-positioning';
import type {WorkflowCapability} from '../lib/workflow-domain';

const directory=mkdtempSync(join(tmpdir(),'academy-positioning-'));process.env.COMMUNITY_DB_PATH=join(directory,'test.db');
const cap:WorkflowCapability={provider:'ollama',model:'explicit unit-test fixture',configured:true,status:'ready',message:'Fixture',networkChecked:false,publishing:false,editing:false};
const password='Isolated-positioning-unit-password';
async function member(ageBand:'18+'|'14-17'='18+'){return createMember({name:'Positioning test',email:`positioning-${randomUUID()}@example.test`,password,ageBand});}
const productInput=()=>({name:'Поправка на велосипеди',type:'service',facts:'Проверка и настройка на спирачки по описания обхват. Не е посочен срок.',audience:'Хора, които карат велосипед до работа.',evidence:'Само описание на реалния обхват.',constraints:'Без измислен срок или гарантирана безопасност.',requestId:randomUUID()});
const output=()=>({summary:'Свържи ремонта с конкретния маршрут на човека.',angles:Array.from({length:3},(_,index)=>({audience:['Хора с ежедневен маршрут','Хора след дълга пауза','Хора преди пътуване'][index],situation:['Преди пътуване до работа.','Преди първото каране за сезона.','Преди нов маршрут извън града.'][index],need:['Да разбере обхвата на проверката.','Да знае какво реално е проверено.','Да получи ясна информация за услугата.'][index],positioning:['Виж проверката преди ежедневния си маршрут.','Разбери какво е проверено преди връщане към карането.','Обсъди обхвата на проверката преди нов маршрут.'][index],proofNeeded:['Потвърди действителния обхват на услугата.'],claimRisk:'Не е посочен срок за завършване.',hooks:[['Преди работния маршрут: виж проверката.','Връщаш велосипеда от гаража?','Какво да провериш преди нов маршрут?'][index],'Какво включва тази проверка?'],adCopy:['Караш до работа? Виж проверката на спирачните накладки и попитай за условията преди посещение.','Връщаш се към карането? Покажи действителната проверка и попитай за обхвата на услугата.','Предстои нов маршрут? Разгледай какво механикът проверява и уточни реалните условия.'][index],videoOutline:[{visual:'Механик поставя велосипеда на стойка.',spoken:'Започваме с проверка на спирачките.'},{visual:'Отблизо се вижда проверяваният компонент.',spoken:'Показваме какво реално е включено.'},{visual:'Механик отбелязва какво е проверено.',spoken:'Попитай за условията преди посещение.'}],email:{subject:'Какво включва проверката?',body:'Здравей, предлагаме проверка на спирачки според описания обхват. Попитай за условията и възможните часове, преди да планираш посещение.'}}))});
function fixtureFor(input:{user:string}){
  const payload=JSON.parse(input.user) as {angle?:{positioning:string};input?:{angle?:{positioning:string}}},angle=payload.angle||payload.input?.angle;
  if(!angle)return output();
  return output().angles.find(item=>item.positioning===angle.positioning)||output().angles[0];
}
after(()=>{closeDb();rmSync(directory,{recursive:true,force:true});});

test('positioning products are versioned, idempotent, owned and limited without requiring a brand',async()=>{
  const user=await member(),other=await member(),input=productInput(),product=savePositioningProduct(user,input);
  assert.equal(savePositioningProduct(user,input).id,product.id);assert.equal(getPositioningState(user).products.length,1);assert.deepEqual(getPositioningState(null),{products:[],strategies:[],materials:[]});assert.equal(getPositioningState(other).products.length,0);
  assert.throws(()=>savePositioningProduct(other,{...input,id:product.id,expectedVersion:1}),error=>error instanceof AppError&&error.status===404);
  const changed=savePositioningProduct(user,{...input,id:product.id,expectedVersion:1,facts:'Променен и потвърден реален обхват на услугата.'});assert.equal(changed.version,2);
  assert.throws(()=>savePositioningProduct(user,{...input,id:product.id,expectedVersion:1}),error=>error instanceof AppError&&error.status===409);
  for(let i=0;i<9;i++)savePositioningProduct(user,{...productInput(),name:`Реална услуга ${i}`});assert.throws(()=>savePositioningProduct(user,productInput()),error=>error instanceof AppError&&error.status===409);
  assert.throws(()=>savePositioningProduct(null,productInput()),error=>error instanceof AppError&&error.status===401);const minor=await member('14-17');assert.throws(()=>savePositioningProduct(minor,productInput()),error=>error instanceof AppError&&error.status===403);
});

test('actual-provider dependency output creates frozen source map and useful idempotent deliverables',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput());let calls=0,prompt='';const generate=async(_cap:WorkflowCapability,input:{system:string;user:string})=>{calls++;prompt=input.user;return fixtureFor(input);},requestId=randomUUID();
  const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId},{capability:cap,generate});assert.equal(strategy.angles.length,3);assert.equal(strategy.product.facts,product.facts);assert.equal(strategy.provider,'ollama');assert.equal(strategy.brainVersion,0);assert.ok(prompt.includes(product.facts));
  assert.equal((await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId},{capability:cap,generate})).id,strategy.id);assert.equal(calls,4);
  for(const format of ['ad','video','email']){const saved=createPositioningMaterial(user,{strategyId:strategy.id,angleId:strategy.angles[0].id,format});assert.ok(saved.content.length>50);assert.equal(createPositioningMaterial(user,{strategyId:strategy.id,angleId:strategy.angles[0].id,format}).id,saved.id);}
  const other=await member();assert.throws(()=>createPositioningMaterial(other,{strategyId:strategy.id,angleId:strategy.angles[0].id,format:'ad'}),error=>error instanceof AppError&&error.status===404);
  savePositioningProduct(user,{...productInput(),id:product.id,expectedVersion:1});assert.throws(()=>createPositioningMaterial(user,{strategyId:strategy.id,angleId:strategy.angles[1].id,format:'ad'}),error=>error instanceof AppError&&error.status===409);
});

test('provider absence, malformed repetition and stale product/brain cannot fabricate a saved strategy',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput());await assert.rejects(()=>generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:{...cap,configured:false,message:'Provider is unavailable'}}),error=>error instanceof AppError&&error.status===503);
  const repeated=output();repeated.angles[1]={...repeated.angles[0]};assert.throws(()=>validatePositioningOutput(repeated),error=>error instanceof AppError&&error.status===502);
  let repairs=0;await assert.rejects(()=>generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async()=>{repairs++;return{summary:'Липсва подходящ отговор.',angles:[]};}}),error=>error instanceof AppError&&error.status===502);assert.equal(repairs,2);assert.equal(getPositioningState(user).strategies.length,0);
  await assert.rejects(()=>generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{if(!JSON.parse(input.user).angle)savePositioningProduct(user,{...productInput(),id:product.id,expectedVersion:1,facts:'Променени факти, докато доставчикът генерира отговора.'});return fixtureFor(input);}}),error=>error instanceof AppError&&error.status===409);assert.equal(getPositioningState(user).strategies.length,0);
  const newer=getPositioningState(user).products[0];await assert.rejects(()=>generatePositioning(user,{productId:newer.id,expectedVersion:newer.version,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{if(!JSON.parse(input.user).angle)saveWorkflowBrain(user,{expectedVersion:0,name:'Нов бранд',audience:'Предоставена аудитория',voice:'Кратко',offer:'Реална услуга',notes:'',guardrails:'Без измислени факти'});return fixtureFor(input);}}),error=>error instanceof AppError&&error.status===409);
});

test('health hypotheses are flagged and unsupported illness-prevention ad promises are rejected',async()=>{
  const user=await member(),product=savePositioningProduct(user,{...productInput(),name:'Пречиствател',facts:'Филтрира частици според предоставената спецификация. Хипотезата за предотвратяване на болест не е доказателство.'});assert.equal(positioningNeedsClaimReview(product),true);
  const bad=output();bad.angles[0].adCopy='Този продукт предотвратява заболявания при децата и премахва всички бактерии.';assert.throws(()=>validatePositioningOutput(bad),error=>error instanceof AppError&&error.status===502);
  const good=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>fixtureFor(input)});assert.equal(good.claimReviewRequired,true);
  assert.throws(()=>createPositioningMaterial(user,{strategyId:good.id,angleId:good.angles[0].id,format:'ad'}),error=>error instanceof AppError&&error.status===409);
  assert.ok(createPositioningMaterial(user,{strategyId:good.id,angleId:good.angles[0].id,format:'ad',claimsReviewed:true}).id);
});

test('member deletion removes owned positioning products, frozen maps and materials',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput()),strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>fixtureFor(input)});createPositioningMaterial(user,{strategyId:strategy.id,angleId:strategy.angles[0].id,format:'email'});
  getDb().prepare('DELETE FROM members WHERE id=?').run(user.id);for(const table of ['workflow_positioning_products','workflow_positioning_strategies','workflow_positioning_materials'])assert.equal(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE member_id=?`).get(user.id)!.n,0);
});

test('distinct audience labels cannot hide repeated positioning, and invented properties require a real repair',async()=>{
  const repeated=output();repeated.angles[1].positioning=repeated.angles[0].positioning;assert.throws(()=>validatePositioningOutput(repeated),error=>error instanceof AppError&&error.status===502);
  const user=await member(),product=savePositioningProduct(user,productInput());let calls=0;
  const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{calls++;const response=fixtureFor(input);if(calls===2&&'adCopy' in response)response.adCopy='Не се използват специални инструменти. Провери спирачките преди маршрута.';return response;}});
  assert.equal(calls,5);assert.equal(getPositioningState(user).strategies.length,1);assert.ok(strategy.angles.every(angle=>!angle.adCopy.includes('специални инструменти')));
});

test('concurrent reuse of an intent cannot return another product or product version',async()=>{
  const user=await member(),first=savePositioningProduct(user,productInput()),second=savePositioningProduct(user,{...productInput(),name:'Втора действителна услуга'}),requestId=randomUUID(),generate=async(_cap:WorkflowCapability,input:{user:string})=>fixtureFor(input);
  const results=await Promise.allSettled([generatePositioning(user,{productId:first.id,expectedVersion:1,requestId},{capability:cap,generate}),generatePositioning(user,{productId:second.id,expectedVersion:1,requestId},{capability:cap,generate})]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);const refused=results.find(item=>item.status==='rejected') as PromiseRejectedResult;assert.ok(refused.reason instanceof AppError&&refused.reason.status===409);const saved=getPositioningState(user).strategies;assert.equal(saved.length,1);
  await assert.rejects(()=>generatePositioning(user,{productId:saved[0].productId,expectedVersion:2,requestId},{capability:cap,generate}),error=>error instanceof AppError&&error.status===409);
});

test('known speed, safety, fear and restriction-as-copy defects use one real repair, not canned replacement copy',async()=>{
  for(const bad of ['Само за момент проверяваме велосипеда преди следващия маршрут.','След проверката ще се движите с сигурност по своя маршрут.','Не е посочен срок. Виж какво проверяваме на велосипеда.','Какво ще се случи, ако не ги провериш днес? Попитай за проверката.','Бърза и ясна проверка, която не отнема много време.','Без специално оборудване, само с обяснение.','Проверката не изисква специални инструменти.','Сигурността ти е в ръцете на експерта.','Механикът показва, че инсталацията е правилна.']){
    const user=await member(),product=savePositioningProduct(user,productInput());let calls=0,repairRequested=false;
    const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{calls++;const response=fixtureFor(input);if(calls===2&&'adCopy' in response)response.adCopy=bad;if(JSON.parse(input.user).validationError)repairRequested=true;return response;}});
    assert.equal(calls,5,bad);assert.equal(repairRequested,true);assert.ok(strategy.angles.every(angle=>angle.adCopy!==bad));assert.equal(strategy.angles[0].adCopy,output().angles[0].adCopy);
  }
});

test('an unsupported safety positioning is repaired before drafting, and a repeated defect saves nothing',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput());let calls=0;
  const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{calls++;const response=fixtureFor(input);if(calls===1&&'angles' in response)response.angles[0].positioning='Проверката дава увереност, че спирачките работят както трябва.';return response;}});
  assert.equal(calls,5);assert.equal(strategy.angles[0].positioning,output().angles[0].positioning);
  const blocked=await member(),blockedProduct=savePositioningProduct(blocked,productInput());let refusedCalls=0;
  await assert.rejects(()=>generatePositioning(blocked,{productId:blockedProduct.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async()=>{refusedCalls++;const bad=output();bad.angles[0].positioning='Проверката дава увереност, че спирачките работят както трябва.';return bad;}}),error=>error instanceof AppError&&error.status===502);
  assert.equal(refusedCalls,2);assert.equal(getPositioningState(blocked).strategies.length,0);
});

test('a narrow Bulgarian agreement correction is transparent, persisted and does not invent product facts',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput());let calls=0;
  const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{calls++;const response=fixtureFor(input);if(calls===2&&'videoOutline' in response)response.videoOutline[1]={visual:'Механик показва компонента в добър състояние.',spoken:'Виж какво е включено в проверката.'};return response;}});
  assert.equal(calls,4);assert.equal(strategy.angles[0].videoOutline[1].visual,'Механик показва компонента в добро състояние.');assert.deepEqual(strategy.editorialNotes,['Езикова поправка: „добър състояние“ → „добро състояние“.']);assert.deepEqual(getPositioningState(user).strategies[0].editorialNotes,strategy.editorialNotes);assert.equal(strategy.product.facts,product.facts);
  const material=createPositioningMaterial(user,{strategyId:strategy.id,angleId:strategy.angles[0].id,format:'video'});assert.ok(material.content.includes('в добро състояние'));assert.ok(!material.content.includes('в добър състояние'));
});

test('the exact empty filler sentence is deleted transparently while real generated copy stays intact',async()=>{
  const user=await member(),product=savePositioningProduct(user,productInput());let calls=0;
  const strategy=await generatePositioning(user,{productId:product.id,expectedVersion:1,requestId:randomUUID()},{capability:cap,generate:async(_cap,input)=>{calls++;const response=fixtureFor(input);if(calls===2&&'adCopy' in response)response.adCopy='Без обещания, само факти. '+response.adCopy;return response;}});
  assert.equal(calls,4);assert.equal(strategy.angles[0].adCopy,output().angles[0].adCopy);assert.deepEqual(strategy.editorialNotes,['Премахнато празно изречение: „Без обещания, само факти.“']);assert.deepEqual(getPositioningState(user).strategies[0].editorialNotes,strategy.editorialNotes);
  const empty=output();empty.angles[0].adCopy='Без обещания, само факти.';assert.throws(()=>validatePositioningOutput(empty),error=>error instanceof AppError&&error.status===502);
});
