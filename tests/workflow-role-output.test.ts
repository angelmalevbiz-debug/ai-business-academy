import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePublicationPackage,compileWorkflowRoleOutput,workflowRoleSchema} from '../lib/workflow-role-output';
import {generateWorkflowOutput,workflowPrompt,workflowRoleCapability} from '../lib/workflow-runner';
import type {ReservedWorkflowStep} from '../lib/workflow-store';
function scene():ReservedWorkflowStep{const date='2026-10-27T00:00:00Z';return{ownerId:'test',token:'test',run:{id:'run',projectId:'project',templateId:'content',status:'running',currentStep:3,totalSteps:7,brainVersion:1,error:null,createdAt:date,updatedAt:date},project:{id:'project',templateId:'content',title:'Покажи процеса',brief:'Покажи реален работен процес без измислени резултати.',createdAt:date,updatedAt:date},brain:{id:'brain',version:1,name:'Тест',audience:'Начинаещи',voice:'Кратко и ясно',offer:'Умения',notes:'',guardrails:'Без измислени факти',updatedAt:date},inputs:[],role:'copy',stepIndex:3,feedback:''};}
test('content roles require distinct structured sections instead of accepting the previous briefing blob',()=>{
  const value=scene();assert.ok('spokenScript' in workflowRoleSchema(value).properties);
  const output=compileWorkflowRoleOutput(value,{title:'Сценарий',hook:'Ето къде се губи времето.',spokenScript:'Това е едно запитване. Първо го проверявам, после го подреждам.',callToAction:'Покажи как го правиш ти.'});
  assert.match(output.content,/Думи за произнасяне/);assert.match(output.content,/Ето къде/);
  assert.throws(()=>compileWorkflowRoleOutput(value,{title:'Бриф',content:'Общ бриф вместо задължителен сценарий.'}),/не попълни секцията/);
  assert.throws(()=>compileWorkflowRoleOutput({...value,role:'art'},{title:'Монтаж',shots:[],checks:['Провери']}),/между 2 и 6/);
});
test('publication compiler includes exact current script and shot versions, known unknowns and no generated posting claims',()=>{
  const value=scene(),date=value.run.createdAt;
  value.inputs=[{id:'script',projectId:'project',runId:'run',role:'copy',title:'Сценарий',content:'Това са точните думи за произнасяне.',revision:3,status:'draft',feedback:'',provenance:'ai',provider:'ollama',model:'test',sourceId:null,createdAt:date,updatedAt:date},{id:'shots',projectId:'project',runId:'run',role:'art',title:'Кадри',content:'Кадър 1 показва точното действие.',revision:2,status:'draft',feedback:'',provenance:'human',provider:null,model:null,sourceId:null,createdAt:date,updatedAt:date}];
  const output=compilePublicationPackage(value);assert.equal(output.provenance,'compiled');assert.equal(output.provider,null);assert.equal(output.model,null);assert.match(output.content,/Сценарий — версия 3/);assert.match(output.content,/План за кадрите — версия 2/);assert.ok(output.content.includes(value.inputs[0].content));assert.match(output.content,/Часът не е определен/);
  assert.throws(()=>compilePublicationPackage({...value,inputs:value.inputs.slice(0,1)}),/липсва актуален сценарий/);
});

test('customer post rejects leaked internal status but allows an actual offer about AI drafts',()=>{
  const value=scene();value.project.recipeId='content-intro-post';
  for(const content of ['Полезен текст. Това е работна чернова, която не е публикувана.','Публикацията е чернова за преглед.','Материалът не е публикуван.','Текстът не е свързан с външно публикуване.'])assert.throws(()=>compileWorkflowRoleOutput(value,{title:'Публикация',content}),/вътрешен работен статус/);
  const content='Имаш идея, но не знаеш откъде да започнеш? В AI Business Academy можеш да разгледаш интерактивен пример и да подготвиш AI чернови за своята бизнес задача. Избери какво искаш да направиш.';
  assert.equal(compileWorkflowRoleOutput(value,{title:'Публикация',content}).content,content);
});

test('written copy rejects actual editorial leakage without blocking a product that teaches editing',()=>{
  const value=scene();value.project.recipeId='content-rewrite-post';
  for(const content of [
    'Полезно начало. Това е редактирана чернова с премахнати елементи.',
    'Публикация за бизнеса.\n\nПремахнати са: обещания и статистика.',
    'Публикация за бизнеса. Съкрати текста, запази смисъла и гласа на бранда.',
    'Публикация за бизнеса, без да се изисква външно публикуване.',
    'Всичко е изолирано и готово за преглед.',
    'Here is the edited text. A useful message for readers.',
    'Полезна публикация. Това е готов текст за читателя – кратък и ясен.',
    'Предлагаме интерактивни примери. Няма обещания за доход, статистики или резултати.',
    'Предлагаме интерактивни примери. Покани читателя да избере задача.',
    'Подготви своя публикация. Без допълнителни обещания и статистика.',
  ])assert.throws(()=>compileWorkflowRoleOutput(value,{title:'Публикация',content}),/редакторски указания/);
  for(const content of [
    'В AI Business Academy можеш да подготвиш AI чернови и да ги редактираш със собствения си опит. Избери задача.',
    'Съкрати текста си до най-важното. В интерактивния пример виждаш как една дълга оферта става ясна.',
    'Пробвай инструкцията „Съкрати текста, запази смисъла“ върху свой пример.',
  ])assert.equal(compileWorkflowRoleOutput(value,{title:'Публикация',content}).content,content);
  assert.doesNotMatch(workflowPrompt(value).system,/Резултат: Редактирана чернова и какво е премахнато/);
});

test('written copy gets one real-provider repair request and never accepts the same invalid meta output',async()=>{
  const value=scene();value.project.recipeId='content-rewrite-post';
  const capability={provider:'openai' as const,model:'test-provider',copyModel:'explicit-writer-model',configured:true,status:'configured_unverified' as const,message:'Test provider transport',networkChecked:false,publishing:false as const,editing:false as const};
  const original=globalThis.fetch,requests:Record<string,unknown>[]=[];
  const invalid={title:'Публикация',content:'Това е редактирана чернова. Премахнати са: дългите изречения.'};
  const valid={title:'Започни с конкретна задача',content:'Имаш идея, но не знаеш откъде да започнеш? Разгледай интерактивен пример в AI Business Academy и избери задача за своя бизнес.'};
  let repairValid=true;
  globalThis.fetch=async(_input,options)=>{
    requests.push(JSON.parse(String(options?.body)));
    const output=requests.length%2===1||!repairValid?invalid:valid;
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}),{status:200});
  };
  try{
    const result=await generateWorkflowOutput(value,capability);
    assert.equal(result.content,valid.content);assert.equal(result.provider,'openai');assert.equal(result.model,'explicit-writer-model');assert.equal(requests.length,2);
    assert.ok(requests.every(request=>request.model==='explicit-writer-model'));
    assert.match(JSON.stringify(requests[1]),/Не обяснявай какво си поправил/);
    repairValid=false;
    await assert.rejects(generateWorkflowOutput(value,capability),/редакторски указания/);
    assert.equal(requests.length,4,'each generation has one initial attempt and at most one repair');
  }finally{globalThis.fetch=original;}
});

test('an explicit copy model specializes written tasks only and never changes the provider',()=>{
  const value=scene();value.project.recipeId='content-intro-post';
  const capability={provider:'ollama' as const,model:'general-model',copyModel:'writer-model',configured:true,status:'ready' as const,message:'Configured',networkChecked:true,publishing:false as const,editing:false as const};
  const selected=workflowRoleCapability(value,capability);
  assert.equal(selected.model,'writer-model');assert.equal(selected.provider,'ollama');assert.equal(capability.model,'general-model');
  for(const role of ['chief','research','strategy','art','publish','community'] as const)assert.equal(workflowRoleCapability({...value,role},capability),capability);
  assert.equal(workflowRoleCapability({...value,project:{...value.project,recipeId:'content-first-reel'}},capability),capability);
  assert.equal(workflowRoleCapability({...value,project:{...value.project,templateId:'sales',recipeId:'sales-offer-one-page'}},capability),capability);
  assert.equal(workflowRoleCapability(value,capability,''),capability);
  assert.throws(()=>workflowRoleCapability(value,capability,'x'.repeat(151)),/WORKFLOW_AI_COPY_MODEL/);
});
