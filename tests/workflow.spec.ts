import{test,expect,type Page}from'@playwright/test';import{randomUUID}from'node:crypto';import type{WorkflowState}from'../lib/workflow-domain';import{ensureNavigation}from'./navigation';
const origin=process.env.COMMUNITY_E2E_ORIGIN||'http://127.0.0.1:3100',headers={Origin:origin};
const state=async(page:Page)=>(await(await page.request.get('/api/workflow')).json())as WorkflowState;
async function register(page:Page,ageBand='18+'){const id=randomUUID();const value={name:'Workflow тест',email:`workflow-${id}@example.test`,password:`Local-password-${id}`,ageBand};expect((await page.request.post('/api/workspace',{headers,data:{action:'register',...value}})).ok()).toBeTruthy();return value;}
async function ready(page:Page){await page.goto('/?view=workflow');await expect(page.getByRole('heading',{name:'Какво ще публикуваш?',exact:true})).toBeVisible();await expect(page.getByRole('figure',{name:'Карта на работния екип'})).toHaveAttribute('data-state','ready');}
async function chooseFirst(page:Page){await page.getByRole('button',{name:/Първото ми кратко видео/}).click();}
async function brain(page:Page){const value={action:'saveBrain',expectedVersion:0,name:'Запазен тестов бранд',audience:'Начинаещи предприемачи',voice:'Кратко и ясно',offer:'Практични услуги',notes:'Уникално знание сапфирена фактура',guardrails:'Без измислени факти.'};expect((await page.request.post('/api/workflow',{headers,data:value})).ok()).toBeTruthy();}
test('guest sees company departments and outcome suggestions before any required text',async({page})=>{await page.goto('/');await ensureNavigation(page);await page.getByRole('link',{name:'Работа с AI',exact:true}).click();await expect(page.getByRole('heading',{name:'Какво ще публикуваш?',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Задача за екипа',exact:true})).toBeHidden();const scene=page.getByRole('figure',{name:'Карта на работния екип'});await expect(scene).toHaveAttribute('data-painted-department','overview');await chooseFirst(page);await page.getByRole('button',{name:'Как работи AI екипът',exact:true}).click();await scene.scrollIntoViewIfNeeded();await expect(scene).toHaveAttribute('data-painted-department','content');await expect(page.getByRole('textbox',{name:'Твоите думи',exact:true})).toBeHidden();await page.getByRole('button',{name:'Започни с безплатен профил',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect((await state(page)).projects).toEqual([]);});
test('new member starts a ready task with choices only and restores actual work',async({page})=>{await register(page);await ready(page);await chooseFirst(page);await page.getByRole('button',{name:'Личен бранд',exact:true}).click();await page.getByRole('button',{name:'Запази задачата',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();const saved=await state(page);expect(saved.brain?.name).toBe('Личен бранд');expect(saved.projects[0].recipeId).toBe('content-first-reel');expect(saved.runs[0].totalSteps).toBe(7);expect(saved.artifacts).toEqual([]);await page.reload();await expect(page.getByRole('heading',{name:'Първото ми кратко видео',exact:true})).toBeVisible();expect((await state(page)).projects[0].id).toBe(saved.projects[0].id);});
test('searchable task catalog uses a job-specific smaller role sequence',async({page})=>{await register(page);await brain(page);await ready(page);await page.getByRole('button',{name:'Всички задачи · 44',exact:true}).click();await page.getByRole('textbox',{name:'Намери задача',exact:true}).fill('по-ясен');await page.getByRole('button',{name:/Направи този текст по-ясен/}).click();await page.getByRole('button',{name:'Запази задачата',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();expect((await state(page)).runs[0].totalSteps).toBe(2);});
test('optional own words remain unchanged when no AI provider is connected',async({page})=>{await register(page);await brain(page);await ready(page);await chooseFirst(page);await page.getByText('Искам да уточня нещо',{exact:false}).click();const text=page.getByRole('textbox',{name:'Твоите думи',exact:true});await text.fill('Искам кратък пример без жаргон.');await expect(page.getByRole('button',{name:'AI, подреди идеята ми',exact:true})).toBeDisabled();expect((await state(page)).projects).toEqual([]);await expect(text).toHaveValue('Искам кратък пример без жаргон.');});
test('memory cites a real own source and production calendar persists completion without posting',async({page})=>{await register(page);await brain(page);await ready(page);await chooseFirst(page);await page.getByRole('button',{name:'Запази задачата',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();const rooms=page.getByRole('navigation',{name:'Работни пространства'});await page.locator('summary').filter({hasText:/^Работата ми$/}).click();await rooms.getByRole('button',{name:'Памет и източници',exact:true}).click();await page.getByRole('textbox',{name:'Какво търсиш?',exact:true}).fill('сапфирена');await page.getByRole('button',{name:'Намери',exact:true}).click();await expect(page.getByRole('heading',{name:'Запазен тестов бранд',exact:true})).toBeVisible();await page.locator('summary').filter({hasText:/^Работата ми$/}).click();await rooms.getByRole('button',{name:'Календар',exact:true}).click();await page.getByRole('button',{name:'Добави задача',exact:true}).click();await page.getByLabel('Дата',{exact:true}).fill(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Kiev'}));await page.getByRole('button',{name:'Запази в плана',exact:true}).click();await expect(page.getByRole('button',{name:/Отбележи като готово/})).toBeVisible();await page.getByRole('button',{name:/Отбележи като готово/}).click();await expect(page.getByRole('button',{name:/Върни в плана/})).toBeVisible();const saved=await state(page);expect(saved.planItems[0]).toMatchObject({phase:'film',status:'done',version:2});expect(saved.capability.publishing).toBe(false);await page.reload();await page.locator('summary').filter({hasText:/^Работата ми$/}).click();await rooms.getByRole('button',{name:'Календар',exact:true}).click();await expect(page.getByRole('button',{name:/Върни в плана/})).toBeVisible();});
test('member privacy and age safeguards survive recipes, memory and workrooms',async({page,browser})=>{await register(page);await brain(page);await ready(page);await chooseFirst(page);await page.getByRole('button',{name:'Запази задачата',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();const project=(await state(page)).projects[0];const context=await browser.newContext(),other=await context.newPage();await register(other,'14-17');expect((await other.request.post('/api/workflow',{headers,data:{action:'planProduction',projectId:project.id,day:'2026-10-29',phase:'film'}})).status()).toBe(404);const found=await other.request.post('/api/workflow',{headers,data:{action:'searchWorkflowMemory',query:'сапфирена'}});expect((await found.json()).hits).toEqual([]);await ready(other);await other.locator('summary').filter({hasText:/^Други области$/}).click();await other.getByRole('navigation',{name:'Направления Workflow'}).getByRole('button',{name:'Продажби',exact:true}).click();await other.getByRole('button',{name:/Оферта/}).first().click();await other.getByRole('button',{name:'Услуги',exact:true}).click();await other.getByRole('button',{name:'Запази задачата',exact:true}).click();await expect(other.locator('[role="alert"]').filter({hasText:'пълнолетни'})).toBeVisible();expect((await state(other)).projects).toEqual([]);await context.close();await page.request.post('/api/workspace',{headers,data:{action:'logout'}});expect((await state(page)).brain).toBeNull();expect((await state(page)).projects).toEqual([]);});
test('phone keyboard traverses department and role camera levels without overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await ready(page);await page.locator('summary').filter({hasText:/^Други области$/}).click();const department=page.getByRole('navigation',{name:'Направления Workflow'}).getByRole('button',{name:'Съдържание',exact:true});await department.focus();await page.keyboard.press('Enter');const scene=page.getByRole('figure',{name:'Карта на работния екип'});await scene.scrollIntoViewIfNeeded();await expect(scene).toHaveAttribute('data-painted-department','content');await page.getByRole('button',{name:'Разгледай компанията без панела',exact:true}).click();const role=page.getByRole('navigation',{name:'Екип и общ контекст'}).getByRole('button',{name:'Координатор',exact:true});await role.focus();await page.keyboard.press('Enter');await expect(scene).toHaveAttribute('data-painted-selection','chief');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);});
test('a guest keeps the selected outcome through registration without being diverted into learning setup',async({page})=>{
  await ready(page);await chooseFirst(page);
  await page.getByText('Искам да уточня нещо',{exact:false}).click();
  const addition='Покажи само ръцете и реалния процес. Без измислени резултати.';
  await page.getByRole('textbox',{name:'Твоите думи',exact:true}).fill(addition);
  await page.getByRole('button',{name:'Започни с безплатен профил',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Име или псевдоним',{exact:true}).fill('Нов Workflow участник');
  await dialog.getByLabel('Имейл',{exact:true}).fill(`registration-${randomUUID()}@example.test`);
  await dialog.getByLabel(/^Парола/).fill(`Isolated-${randomUUID()}`);
  await dialog.getByLabel('Възрастова група',{exact:true}).selectOption('18+');
  await dialog.getByRole('button',{name:'Създай безплатен профил',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Първото ми кратко видео',exact:true})).toBeVisible();
  await expect(page.locator('#workflow-own-words')).toHaveValue(addition);
  await expect(page.getByRole('button',{name:'Личен бранд',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Задача за екипа',exact:true})).toBeHidden();
  expect((await state(page)).projects).toEqual([]);
  await page.getByRole('button',{name:'Личен бранд',exact:true}).click();
  await page.getByRole('button',{name:'Запази задачата',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();
  expect((await state(page)).projects[0].brief).toContain(addition);
});

test('phone catalog opens at its search and a department change releases the previous outcome',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);await chooseFirst(page);
  await page.locator('summary').filter({hasText:/^Други области$/}).click();const departments=page.getByRole('navigation',{name:'Направления Workflow'});
  await departments.getByRole('button',{name:'Продажби',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Какво ти трябва за следващия клиент?',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Първото ми кратко видео',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Всички задачи · 44',exact:true}).click();
  const search=page.getByRole('textbox',{name:'Намери задача',exact:true});
  await expect(search).toBeFocused();await expect(search).toBeInViewport();
  await search.fill('по-ясен');await page.getByRole('button',{name:/Направи този текст по-ясен/}).click();
  await expect(page.getByRole('heading',{name:'Направи този текст по-ясен',exact:true})).toBeVisible();
  await expect(departments.getByRole('button',{name:'Съдържание',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('saving a production date outside the visible week reveals its actual calendar record',async({page})=>{
  await register(page);await brain(page);await ready(page);await chooseFirst(page);
  await page.getByRole('button',{name:'Запази задачата',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Готов за работа'})).toBeVisible();
  await page.locator('summary').filter({hasText:/^Работата ми$/}).click();await page.getByRole('navigation',{name:'Работни пространства'}).getByRole('button',{name:'Календар',exact:true}).click();
  await page.getByRole('button',{name:'Добави задача',exact:true}).click();
  const future=new Date();future.setUTCDate(future.getUTCDate()+28);
  const date=future.toLocaleDateString('en-CA',{timeZone:'Europe/Kiev'});
  await page.getByLabel('Дата',{exact:true}).fill(date);
  await page.getByRole('combobox',{name:'Какво правим',exact:true}).selectOption('review');
  await page.getByRole('button',{name:'Запази в плана',exact:true}).click();
  await expect(page.getByRole('button',{name:/Отбележи като готово/})).toBeVisible();
  expect((await state(page)).planItems[0]).toMatchObject({day:date,phase:'review',status:'planned'});
  await page.getByRole('button',{name:'Днес',exact:true}).click();
  await expect(page.getByRole('button',{name:/Отбележи като готово/})).toHaveCount(0);
});



test('a selected map role explains its work and opens a matching exact task without starting a job',async({page})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
  const scene=page.getByRole('figure',{name:'Карта на работния екип'});await scene.scrollIntoViewIfNeeded();
  if(width<760)await scene.getByRole('navigation',{name:'Избери екип',exact:true}).getByRole('button',{name:'Анализатор',exact:true}).click();else await scene.getByRole('button',{name:'Място: Анализатор',exact:true}).click();
  const role=page.getByRole('region',{name:'Задачи за Анализатор',exact:true});await expect(role).toBeVisible();
  await expect(role.getByRole('heading',{name:'Анализатор',exact:true})).toBeVisible();
  await expect(role).toContainText('Разделя доказаното от предположенията и липсващите данни.');
  await expect(page.getByRole('heading',{name:'Какво ще публикуваш?',exact:true})).toHaveCount(0);
  const suggestion=role.getByRole('button',{name:/Разбери този материал/});await expect(suggestion).toBeVisible();await suggestion.click();
  await expect(page.getByRole('heading',{name:'Разбери този материал',exact:true})).toBeVisible();
  await expect(page).toHaveURL(url=>url.searchParams.get('task')==='intelligence-source-brief');
  await expect(page.getByRole('region',{name:'Задачи за Анализатор',exact:true})).toHaveCount(0);
  const value=await state(page);expect(value.projects).toEqual([]);expect(value.runs).toEqual([]);expect(value.artifacts).toEqual([]);
 }
});


