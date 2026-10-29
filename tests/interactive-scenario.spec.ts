import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SCENARIOS, type InteractiveScenario as AuthoredScenario } from '../lib/interactive-scenarios';

const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';
const headers = { Origin: origin };
type Catalog = { lessons: {id:string;title:string}[]; universeUnits: {id:string;title:string}[] };

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeVisible();
}

async function openScenario(page: Page, scenario: AuthoredScenario, catalog: Catalog) {
  if (catalog.lessons.some(item => item.id === scenario.id)) {
    await ready(page, `/?view=lesson&lesson=${encodeURIComponent(scenario.id)}`);
  } else {
    const topic = catalog.universeUnits.find(item => item.id === scenario.id);
    expect(topic, `scenario ${scenario.id} must have a published material`).toBeTruthy();
    await ready(page, '/?view=universe');
    const topicButton = page.locator('.universe-map button').filter({hasText:topic!.title});
    if (!await topicButton.isVisible()) await page.locator('.universe-map-toggle').click();
    await topicButton.click();
  }
  const rendered = page.locator(`[data-scenario="${scenario.id}"]`);
  await expect(rendered).toBeVisible();
  return rendered;
}

async function choose(rendered: Locator, label: string) {
  await rendered.getByRole('button', {name:label,exact:true}).click();
  await expect(rendered).toHaveAttribute('data-state','result', {timeout:1000});
}

async function finish(rendered: Locator, authored: AuthoredScenario) {
  for (let index=0; index<authored.steps.length; index++) {
    await choose(rendered, authored.steps[index].options.find(option=>option.correct)!.label);
    await rendered.getByRole('button', {name:index<authored.steps.length-1?'Виж следващия случай':'Събери картината',exact:true}).click();
  }
  await expect(rendered).toHaveAttribute('data-state','finished');
  await expect(rendered.getByRole('heading', {name:authored.finish,exact:true})).toBeVisible();
}

test('a cold guest reaches a visible consequence in two intentional clicks without registration or a planning form', async ({page}) => {
  const authored=SCENARIOS['process-map'];
  await ready(page);
  await page.getByRole('button', {name:'Виж един готов пример',exact:true}).click();
  const rendered=page.locator(`[data-scenario="${authored.id}"]`);
  await expect(rendered).toHaveAttribute('data-state','choice');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await choose(rendered, authored.steps[0].options[0].label);
  await expect(rendered.getByRole('status').filter({hasText:authored.steps[0].options[0].outcome})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await (await page.request.get('/api/workspace')).json()).user).toBeNull();
});

test('all 26 published situations show distinct choice consequences, permit comparison and finish without creating practical progress', async ({page},testInfo) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];
  const writes:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(request.method()==='POST'&&request.url().endsWith('/api/workspace'))writes.push(String(request.postDataJSON()?.action));
  });
  const before=await (await page.request.get('/api/workspace')).json();
  const catalog=before.catalog as Catalog;
  expect(Object.keys(SCENARIOS)).toHaveLength(26);
  const evidence: {id:string;scenes:number;choicesCompared:boolean;finished:boolean;restarted:boolean}[]=[];
  for(const authored of Object.values(SCENARIOS)) {
    await test.step(authored.id,async()=>{
      const rendered=await openScenario(page,authored,catalog);
      await expect(rendered).toHaveAttribute('data-state','choice');
      await expect(rendered.getByRole('heading', {name:authored.hook,exact:true})).toBeVisible();
      for(let index=0;index<authored.steps.length;index++) {
        const step=authored.steps[index];
        expect(step.options).toHaveLength(2);
        expect(new Set(step.options.map(option=>option.outcome)).size).toBe(2);
        for(const item of step.visual.items) {
          await expect(rendered.getByText(item.label,{exact:true}).first()).toBeVisible();
          if(item.value) await expect(rendered.getByText(item.value,{exact:true}).first()).toBeVisible();
        }
        await choose(rendered,step.options[0].label);
        await expect(rendered.getByRole('status').filter({hasText:step.options[0].outcome})).toBeVisible();
        if(step.options[0].visual) for(const item of step.options[0].visual.items) {
          await expect(rendered.locator('[data-kind]').getByText(item.label,{exact:true}).first()).toBeVisible();
          if(item.value) await expect(rendered.locator('[data-kind]').getByText(item.value,{exact:true}).first()).toBeVisible();
        }
        await rendered.getByText('Защо се получава така?',{exact:true}).click();
        await expect(rendered.getByText(step.options[0].explanation,{exact:true})).toBeVisible();
        await rendered.getByRole('button',{name:'Пробвай друг избор',exact:true}).click();
        await expect(rendered).toHaveAttribute('data-state','choice');
        await expect(rendered.getByRole('heading',{name:index===0?authored.hook:step.title,exact:true})).toBeFocused();
        await choose(rendered,step.options[1].label);
        await expect(rendered.getByRole('status').filter({hasText:step.options[1].outcome})).toBeVisible();
        if(step.options[1].visual) for(const item of step.options[1].visual.items) {
          await expect(rendered.locator('[data-kind]').getByText(item.label,{exact:true}).first()).toBeVisible();
          if(item.value) await expect(rendered.locator('[data-kind]').getByText(item.value,{exact:true}).first()).toBeVisible();
        }
        await expect(rendered.getByRole('status').filter({hasText:step.options[0].outcome})).toHaveCount(0);
        await rendered.getByRole('button',{name:index<authored.steps.length-1?'Виж следващия случай':'Събери картината',exact:true}).click();
      }
      await expect(rendered).toHaveAttribute('data-state','finished');
      await expect(rendered.getByRole('heading',{name:authored.finish,exact:true})).toBeVisible();
      await expect(rendered).toContainText('Видя пример.');
      await rendered.getByRole('button',{name:'Отначало',exact:true}).click();
      await expect(rendered).toHaveAttribute('data-state','choice');
      evidence.push({id:authored.id,scenes:authored.steps.length,choicesCompared:true,finished:true,restarted:true});
    });
  }
  const after=await (await page.request.get('/api/workspace')).json();
  expect(after.completedLessonIds).toEqual(before.completedLessonIds);
  expect(after.development.unitProgress).toEqual(before.development.unitProgress);
  expect(after.development.dailyActions).toEqual(before.development.dailyActions);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach('all-situation-consequences.json',{body:JSON.stringify({evidence,writes,errors},null,2),contentType:'application/json'});
});

test('a simulation never submits member work or marks a real lesson or Universe topic complete',async({page})=>{
  const identity=randomUUID();
  const registration=await page.request.post('/api/workspace',{headers,data:{action:'register',name:'Проверка на примери',email:`scenario-progress-${identity}@example.test`,password:`Scenario-${randomUUID()}`,ageBand:'18+'}});
  expect(registration.ok()).toBeTruthy();
  const before=await registration.json();
  for(const authored of [SCENARIOS['process-map'],SCENARIOS['attention-and-evidence']]) {
    const rendered=await openScenario(page,authored,before.catalog);
    await finish(rendered,authored);
  }
  const after=await (await page.request.get('/api/workspace')).json();
  expect(after.completedLessonIds).toEqual(before.completedLessonIds);
  expect(after.submissions).toEqual(before.submissions);
  expect(after.development.unitProgress).toEqual(before.development.unitProgress);
  expect(after.development.dailyActions).toEqual(before.development.dailyActions);
});

test('scene choices resume after reload and stay separate for guest and signed-in account',async({page})=>{
  const authored=SCENARIOS['process-map'];
  const url=`/?view=lesson&lesson=${authored.id}`;
  await ready(page,url);
  let rendered=page.locator(`[data-scenario="${authored.id}"]`);
  await choose(rendered,authored.steps[0].options[0].label);
  await page.reload();
  await expect(rendered).toHaveAttribute('data-state','result');
  await expect(rendered).toContainText(authored.steps[0].options[0].outcome);
  const email=`scenario-session-${randomUUID()}@example.test`,password=`Scenario-${randomUUID()}`;
  const member=await page.request.post('/api/workspace',{headers,data:{action:'register',name:'Проверка на сесия',email,password,ageBand:'18+'}});
  expect(member.ok()).toBeTruthy();
  await page.reload();
  rendered=page.locator(`[data-scenario="${authored.id}"]`);
  await expect(rendered).toHaveAttribute('data-state','choice');
  await choose(rendered,authored.steps[0].options[1].label);
  expect((await page.request.post('/api/workspace',{headers,data:{action:'logout'}})).ok()).toBeTruthy();
  await page.reload();
  await expect(rendered).toHaveAttribute('data-state','result');
  await expect(rendered).toContainText(authored.steps[0].options[0].outcome);
  expect((await page.request.post('/api/workspace',{headers,data:{action:'login',email,password}})).ok()).toBeTruthy();
  await page.reload();
  await expect(rendered).toHaveAttribute('data-state','result');
  await expect(rendered).toContainText(authored.steps[0].options[1].outcome);
});

test('watch mode makes actual choices, pauses without advancing and yields control immediately to a manual choice',async({page})=>{
  const authored=SCENARIOS['process-map'];
  await ready(page,`/?view=lesson&lesson=${authored.id}`);
  const rendered=page.locator(`[data-scenario="${authored.id}"]`);
  const correct=authored.steps[0].options.find(option=>option.correct)!;
  await rendered.getByRole('button',{name:'Гледай примера',exact:true}).click();
  await expect(rendered).toHaveAttribute('data-state','result',{timeout:4000});
  await expect(rendered).toContainText(correct.outcome);
  await rendered.getByRole('button',{name:'Пауза',exact:true}).click();
  await page.waitForTimeout(3700);
  await expect(rendered).toHaveAttribute('data-state','result');
  await expect(rendered).toContainText(correct.outcome);
  await rendered.getByRole('button',{name:'Пробвай друг избор',exact:true}).click();
  await rendered.getByRole('button',{name:'Гледай примера',exact:true}).click();
  const alternative=authored.steps[0].options.find(option=>!option.correct)!;
  await choose(rendered,alternative.label);
  await expect(rendered.getByRole('button',{name:'Гледай примера',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.waitForTimeout(2200);
  await expect(rendered).toHaveAttribute('data-state','result');
  await expect(rendered).toContainText(alternative.outcome);
});

test('situation inputs, choices and consequences reflow at 320 and 390px and remain usable by keyboard and reduced motion',async({browser},testInfo)=>{
  const records=[];
  for(const width of [320,390]) {
    const context=await browser.newContext({baseURL:origin,viewport:{width,height:844},reducedMotion:'reduce'});
    const page=await context.newPage();
    const authored=SCENARIOS['process-map'];
    await ready(page,`/?view=lesson&lesson=${authored.id}`);
    const rendered=page.locator(`[data-scenario="${authored.id}"]`);
    await expect(rendered).toHaveAttribute('data-state','choice');
    for(const target of await rendered.getByRole('group',{name:'Сцени в примера'}).getByRole('button').all()) {
      const bounds=await target.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    const firstChoice=rendered.getByRole('button',{name:authored.steps[0].options[0].label,exact:true});
    const lightBoard=rendered.locator('[data-light="true"]');
    await expect(lightBoard).toBeVisible();
    const lightBackground=await lightBoard.evaluate(element=>getComputedStyle(element).backgroundColor);
    const surfaceBackground=await rendered.evaluate(element=>getComputedStyle(element).backgroundColor);
    expect(lightBackground).not.toBe(surfaceBackground);
    await firstChoice.focus();
    await page.keyboard.press('Enter');
    await expect(rendered).toHaveAttribute('data-state','result');
    await expect(rendered.getByRole('status').filter({hasText:authored.steps[0].options[0].outcome})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`situation-result-${width}.png`),fullPage:true});
    await rendered.getByRole('button',{name:'Виж следващия случай',exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(rendered).toHaveAttribute('data-state','choice');
    await expect(rendered.getByRole('heading',{name:authored.steps[1].title,exact:true})).toBeFocused();
    const darkBoard=rendered.locator('[data-light="false"]');
    await expect(darkBoard).toBeVisible();
    expect(await darkBoard.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
    const darkAudit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(darkAudit.violations).toEqual([]);
    records.push({width,lightBackground,surfaceBackground,keyboardFocus:'result then next scene heading',reducedMotion:true,axeViolations:0});
    await context.close();
  }
  await testInfo.attach('phone-situation-accessibility.json',{body:JSON.stringify(records,null,2),contentType:'application/json'});
});

test('the executable message rule shows a direct match, a synonym miss, a refusal error and clears stale results when input changes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const writes:string[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/workspace'))writes.push(String(request.postDataJSON()?.action));});
  await ready(page,'/?view=tools');
  await expect(page.getByRole('heading',{name:'Хвани грешката на автоматизацията.',exact:true})).toBeVisible();
  const result=page.getByRole('status',{name:'Резултат от правилото',exact:true});
  await expect(result).toContainText('Къде ще попадне?');
  for(const example of [
    {label:'Иска оферта',category:'Оферта',note:'Думата е намерена.'},
    {label:'Пита за цена',category:'За проверка',note:'Пропуск:'},
    {label:'Отказва оферта',category:'Оферта',note:'Грешка:'},
  ]) {
    await page.getByRole('button',{name:example.label,exact:true}).click();
    await expect(result.getByText('Получена категория',{exact:true})).toHaveCount(0);
    await expect(result).toContainText('Къде ще попадне?');
    await page.getByRole('button',{name:'Обработи',exact:true}).click();
    await expect(result.getByText(example.category,{exact:true})).toBeVisible();
    await expect(result).toContainText(example.note);
    await expect(result).toContainText('Изчаква човек');
  }
  await page.getByText('Пробвай друг текст',{exact:true}).click();
  await page.getByLabel('Използвай измислен текст.',{exact:true}).fill('Къде е пратката ми?');
  await expect(result.getByText('Получена категория',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Обработи',exact:true}).click();
  await expect(result.getByText('За проверка',{exact:true})).toBeVisible();
  await page.getByLabel('Използвай измислен текст.',{exact:true}).fill('');
  await expect(result.getByText('Получена категория',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Обработи',exact:true}).click();
  await expect(result).toContainText('Няма текст за категоризиране.');
  expect(writes).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
