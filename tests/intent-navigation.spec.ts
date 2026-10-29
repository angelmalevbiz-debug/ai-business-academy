import{test,expect}from'@playwright/test';
import{randomUUID}from'node:crypto';

const origin=process.env.COMMUNITY_E2E_ORIGIN||'http://127.0.0.1:3100',headers={Origin:origin};
async function state(page:import('@playwright/test').Page){return(await page.request.get('/api/workspace')).json();}
const intentions=[
 {choice:'Съдържание за моя бизнес',action:'Подготви ми съдържание',goal:'content',recipe:'content-content-week',title:'Какво да снимам тази седмица'},
 {choice:'По-малко ръчна работа',action:'Подреди моя процес',goal:'automation',recipe:'operations-process-map',title:'Намери повтарящата се работа'},
] as const;
async function workflowState(page:import('@playwright/test').Page){return(await page.request.get('/api/workflow')).json();}

test('home resumes actual unfinished AI work and its exact private project survives reload',async({page})=>{
 const id=randomUUID();
 expect((await page.request.post('/api/workspace',{headers,data:{action:'register',name:'Запазена работа',email:`resume-${id}@example.test`,password:`Local-${id}`,ageBand:'18+'}})).ok()).toBeTruthy();
 const call=async(data:Record<string,unknown>)=>{const response=await page.request.post('/api/workflow',{headers,data});expect(response.ok()).toBeTruthy();return response.json();};
 await call({action:'saveBrain',expectedVersion:0,name:'Фото студио',audience:'Местни бизнеси',voice:'Кратко и ясно.',offer:'Продуктови снимки',notes:'Предоставени са само тези факти.',guardrails:'Не измисляй цени или клиенти.'});
 const first=await call({action:'createFromRecipe',recipeId:'content-intro-post',requestId:randomUUID()});const older=first.projects[0];
 const second=await call({action:'createFromRecipe',recipeId:'content-rewrite-post',requestId:randomUUID()});const recent=second.projects.find((item:{id:string})=>item.id!==older.id);
 await page.goto('/');const resume=page.locator('aside').filter({has:page.getByRole('heading',{name:'Продължи работата си.',exact:true})});
 await expect(resume.getByText(recent.title,{exact:true})).toBeVisible();await resume.getByRole('button',{name:'Продължи задачата',exact:true}).click();
 await expect(page).toHaveURL(url=>url.searchParams.get('project')===recent.id&&!url.searchParams.has('task')&&!url.searchParams.has('goal'));
 await expect(page.locator('aside[aria-label="Текуща задача и резултат"]')).toContainText(recent.title);
 await page.reload();await expect(page.locator('aside[aria-label="Текуща задача и резултат"]')).toContainText(recent.title);
 await page.goto('/?view=workflow&project='+older.id);await expect(page.locator('aside[aria-label="Текуща задача и резултат"]')).toContainText(older.title);
 await page.reload();await expect(page.locator('aside[aria-label="Текуща задача и резултат"]')).toContainText(older.title);
 const after=await workflowState(page);expect(after.projects).toHaveLength(2);expect(after.runs).toHaveLength(2);expect(after.artifacts).toEqual([]);
 await page.getByRole('button',{name:'Избери нова задача',exact:true}).click();await expect(page).not.toHaveURL(/project=/);
 await page.request.post('/api/workspace',{headers,data:{action:'logout'}});await page.goto('/');await expect(page.getByText(recent.title,{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Виж един готов пример',exact:true})).toBeVisible();
});

test('home opens content and process directly; business choices lead to the selected result without creating work',async({page})=>{
 await page.goto('/');
 for(const item of intentions){
  await expect(page.getByRole('heading',{name:'Какво искаш да направиш?',exact:true})).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button',{name:item.choice,exact:true}).click();
  await expect(page).toHaveURL(url=>url.searchParams.get('view')==='workflow'&&url.searchParams.get('goal')===item.goal&&url.searchParams.get('task')===item.recipe);
  await expect(page.getByRole('heading',{name:item.title,exact:true})).toBeVisible();
  expect((await workflowState(page)).projects).toEqual([]);
  expect((await workflowState(page)).runs).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading',{name:item.title,exact:true})).toBeVisible();
  await expect(page).toHaveURL(url=>url.searchParams.get('task')===item.recipe);
  await page.goBack();
 }
 await expect(page.getByRole('heading',{name:'Какво искаш да направиш?',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Развитие на бизнес',exact:true}).click();
 await page.getByRole('button',{name:/Започвам бизнес/}).click();
 await page.getByRole('button',{name:/Да подредя първата си оферта/}).click();
 await expect(page).toHaveURL(url=>url.searchParams.get('goal')==='business'&&url.searchParams.get('task')==='sales-offer-one-page');
 await expect(page.getByRole('heading',{name:'Оферта на една страница',exact:true})).toBeVisible();
 expect((await workflowState(page)).projects).toEqual([]);
 await page.goto('/');
 await page.getByRole('button',{name:'Фокус и ясни решения',exact:true}).click();
 await expect(page).toHaveURL(/view=universe/);
 await expect(page.getByRole('heading',{name:'Какво те спира днес?',exact:true})).toBeVisible();
 await expect(page.locator('[data-scenario]')).toHaveCount(0);
});

test('unknown task links safely offer real tasks from the selected department',async({page})=>{
 await page.goto('/?view=workflow&goal=business&task=missing-recipe');
 await expect(page.getByRole('heading',{name:'Какво ти трябва за следващия клиент?',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Оферта на една страница/})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Първото ми кратко видео',exact:true})).toHaveCount(0);
 expect((await workflowState(page)).projects).toEqual([]);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Какво ти трябва за следващия клиент?',exact:true})).toBeVisible();
});

test('a home-selected result and own words survive registration without starting a model job',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Развитие на бизнес',exact:true}).click();
 await page.getByRole('button',{name:/Започвам бизнес/}).click();
 await page.getByRole('button',{name:/Да подредя първата си оферта/}).click();
 await expect(page.getByRole('heading',{name:'Оферта на една страница',exact:true})).toBeVisible();
 await page.getByText('Искам да уточня нещо',{exact:false}).click();
 const addition='Оферта за фотография на продукти. Без посочени цена или срок.';
 await page.getByRole('textbox',{name:'Твоите думи',exact:true}).fill(addition);
 await page.getByRole('button',{name:'Започни с безплатен профил',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Име или псевдоним',{exact:true}).fill('Тест на избрания резултат');
 await dialog.getByLabel('Имейл',{exact:true}).fill(`intent-${randomUUID()}@example.test`);
 await dialog.getByLabel(/^Парола/).fill(`Local-${randomUUID()}`);
 await dialog.getByLabel('Възрастова група',{exact:true}).selectOption('18+');
 await dialog.getByRole('button',{name:'Създай безплатен профил',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Оферта на една страница',exact:true})).toBeVisible();
 await expect(page.locator('#workflow-own-words')).toHaveValue(addition);
 await expect(page).toHaveURL(url=>url.searchParams.get('goal')==='business'&&url.searchParams.get('task')==='sales-offer-one-page');
 await expect(page.getByRole('button',{name:'Услуги',exact:true})).toBeVisible();
 const saved=await workflowState(page);
 expect(saved.projects).toEqual([]);expect(saved.runs).toEqual([]);expect(saved.artifacts).toEqual([]);
});
test('focus timer counts actual time, pauses, restores and never marks learning or work complete',async({page})=>{
 await page.clock.install();await page.goto('/?view=universe');
 await page.getByRole('button',{name:/Трудно ми е да започна/}).click();
 await page.getByRole('button',{name:'Подготви един кадър.',exact:true}).click();await page.getByRole('button',{name:'Започни',exact:true}).click();
 await page.clock.fastForward(61000);await expect(page.getByRole('timer')).toHaveAttribute('aria-label',/03 минути и 59 секунди/);
 await page.getByRole('button',{name:'Пауза',exact:true}).click();const paused=await page.getByRole('timer').textContent();await page.clock.fastForward(60000);expect(await page.getByRole('timer').textContent()).toBe(paused);
 await page.reload();await page.getByRole('button',{name:/Към таймера/}).click();await expect(page.getByText('Подготви един кадър.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Продължи',exact:true}).click();await page.clock.fastForward(240000);await expect(page.getByRole('heading',{name:'Времето изтече.',exact:true})).toBeVisible();const value=await state(page);expect(value.development.unitProgress).toEqual([]);expect(value.development.dailyActions).toEqual([]);await expect(page.getByRole('button',{name:'Запази бележка за сесията',exact:true})).toHaveCount(0);
});
test('focus session stays separate across guest and member; member can save an explicit private note',async({page})=>{
 await page.clock.install();await page.goto('/?view=universe');await page.getByRole('button',{name:/Трудно ми е да започна/}).click();await page.getByRole('button',{name:'Напиши първото изречение.',exact:true}).click();await page.getByRole('button',{name:'Започни',exact:true}).click();await page.getByRole('button',{name:'Пауза',exact:true}).click();
 const id=randomUUID();expect((await page.request.post('/api/workspace',{headers,data:{action:'register',name:'Тест фокус',email:`focus-${id}@example.test`,password:`Local-${id}`,ageBand:'18+'}})).ok()).toBeTruthy();
 await page.reload();await expect(page.getByRole('button',{name:/Трудно ми е да започна/})).toBeVisible();await page.getByRole('button',{name:/Трудно ми е да започна/}).click();await expect(page.getByRole('button',{name:'Довърши една малка задача.',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Започни',exact:true}).click();await page.clock.fastForward(301000);await page.getByRole('button',{name:'Запази бележка за сесията',exact:true}).click();await expect(page.getByRole('button',{name:'Бележката е запазена',exact:true})).toBeDisabled();
 const value=await state(page);expect(value.development.reflections).toHaveLength(1);expect(value.development.reflections[0].text).toContain('а не потвърждение');expect(value.development.unitProgress).toEqual([]);expect(value.completedLessonIds).toEqual([]);
 await page.request.post('/api/workspace',{headers,data:{action:'logout'}});await page.reload();expect((await state(page)).development.reflections).toEqual([]);
});
test('a selected personal problem opens an exact real situation and keeps detailed references optional',async({page})=>{
 await page.goto('/?view=universe');await page.getByRole('button',{name:/Правя прибързани изводи/}).click();await expect(page).toHaveURL(/topic=attention-and-evidence/);const scene=page.locator('[data-scenario="attention-and-evidence"]');await expect(scene).toHaveAttribute('data-state','choice');await expect(page.locator('.scene-reference')).not.toHaveAttribute('open','');await page.getByRole('button',{name:'Към фокуса и решенията',exact:true}).click();await expect(page.getByRole('heading',{name:'Какво те спира днес?',exact:true})).toBeVisible();expect((await state(page)).development.unitProgress).toEqual([]);
});


