import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin=process.env.COMMUNITY_E2E_ORIGIN||'http://127.0.0.1:3123';
const evidence=resolve('docs/daily-plan-visual-20261028');
const headers={Origin:origin};
async function register(page:Page){const id=randomUUID();const response=await page.request.post('/api/workspace',{headers,data:{action:'register',name:'Проверка на дневния план',email:`daily-${id}@example.test`,password:`Local-${id}`,ageBand:'18+'}});expect(response.status()).toBe(200);}
async function workspace(page:Page){const response=await page.request.get('/api/workspace');expect(response.ok()).toBeTruthy();return response.json();}
async function capture(page:Page,name:string){await mkdir(evidence,{recursive:true});const toast=page.locator('.toast');if(await toast.count())await toast.getByRole('button',{name:'Затвори',exact:true}).click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true,animations:'disabled'});const accessibility=await new AxeBuilder({page}).include('#main-content').analyze();await writeFile(resolve(evidence,name+'-accessibility.json'),JSON.stringify(accessibility.violations,null,2));expect(accessibility.violations).toEqual([]);}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();const viewport=page.viewportSize();if(viewport?.width===390){await page.setViewportSize({width:320,height:viewport.height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.setViewportSize(viewport);}}
async function ready(page:Page){await page.goto('/?view=daily');await expect(page.locator('.daily-page')).toBeVisible();}

test('daily guest choices are visual, keyboard operable and preserve a real editable starter',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:1000});await ready(page);
 const choice=page.getByRole('region',{name:'Избери стъпка за днес'});
 await expect(choice).toBeVisible();await capture(page,'guest-desktop');
 await page.setViewportSize({width:390,height:844});await noOverflow(page);await capture(page,'guest-mobile');
 const starter=choice.getByRole('button',{name:/Подготвям едно съобщение/});await starter.focus();await starter.press('Enter');
 const input=page.getByRole('textbox',{name:'Какво ще направиш?',exact:true});await expect(input).toHaveValue('Подготвям едно кратко съобщение за бизнеса си.');
 await expect(input).toBeFocused();await noOverflow(page);await capture(page,'editing-mobile');
 await page.setViewportSize({width:1440,height:1000});await capture(page,'editing-desktop');
 await page.getByRole('button',{name:'Откажи',exact:true}).click();await expect(choice).toBeVisible();expect(errors).toEqual([]);
});

test('daily task saves, completes once and shows actual persisted progress after reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await register(page);await page.setViewportSize({width:1440,height:1000});await ready(page);
 await page.getByRole('region',{name:'Избери стъпка за днес'}).getByRole('button',{name:/Проверявам една идея/}).click();
 const input=page.getByRole('textbox',{name:'Какво ще направиш?',exact:true});await input.fill('Проверявам една идея с конкретен пример.');
 await page.getByRole('radio',{name:'15 мин',exact:true}).check();await page.getByRole('button',{name:'Запази стъпката',exact:true}).click();
 const saved=page.getByRole('region',{name:'Запазената ти стъпка'});await expect(saved).toBeVisible();await expect(saved.getByRole('heading',{name:'Проверявам една идея с конкретен пример.',exact:true})).toBeVisible();
 let state=await workspace(page);expect(state.development.goal.nextAction).toBe('Проверявам една идея с конкретен пример.');expect(state.development.goal.minutes).toBe(15);expect(state.development.dailyActions).toHaveLength(0);
 await capture(page,'saved-desktop');await page.setViewportSize({width:390,height:844});await noOverflow(page);await capture(page,'saved-mobile');
 await saved.getByRole('button',{name:'Отбележи като направено',exact:true}).click();await expect(saved.getByRole('button',{name:'Отбележи като направено',exact:true})).toHaveCount(0);
 state=await workspace(page);const actual=state.development.dailyActions.filter((item:{kind:string;referenceId:string})=>item.kind==='practice'&&item.referenceId==='goal-next-action');expect(actual).toHaveLength(1);
 const dates=page.getByRole('complementary',{name:'Последните 7 дни'}).locator('time');await expect(dates).toHaveCount(7);const dayValues=await dates.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('datetime')));expect(new Set(dayValues).size).toBe(7);expect(dayValues).toContain(actual[0].day);await expect(page.getByRole('complementary',{name:'Последните 7 дни'}).locator('li[data-done="true"]')).toHaveCount(1);
 await page.reload();await expect(saved).toBeVisible();await expect(saved.getByRole('button',{name:'Отбележи като направено',exact:true})).toHaveCount(0);expect((await workspace(page)).development.dailyActions.filter((item:{referenceId:string})=>item.referenceId==='goal-next-action')).toHaveLength(1);
 await noOverflow(page);await capture(page,'completed-mobile');await page.setViewportSize({width:1440,height:1000});await capture(page,'completed-desktop');
 const accessibility=await new AxeBuilder({page}).include('#main-content').analyze();await writeFile(resolve(evidence,'accessibility.json'),JSON.stringify(accessibility.violations,null,2));expect(accessibility.violations).toEqual([]);expect(errors).toEqual([]);
});

test('daily completion respects reduced motion and weekly display matches actual days',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await register(page);
 const goal={title:'Моята задача за днес',nextAction:'Подготвям един конкретен пример за днес.',why:'',obstacle:'',ifThen:'',minutes:5,daysPerWeek:3,reminderEnabled:false,reminderHour:18};
 expect((await page.request.post('/api/workspace',{headers,data:{action:'saveGoal',goal}})).ok()).toBeTruthy();await ready(page);
 await page.getByRole('button',{name:'Отбележи като направено',exact:true}).click();
 await expect.poll(()=>page.locator('.daily-page').evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length)).toBe(0);
 expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBeTruthy();
 const state=await workspace(page);expect(state.development.weekly.activeDays).toBe(1);expect(state.development.weekly.actions).toBe(1);
 await page.getByRole('button',{name:'Редактирай стъпката',exact:true}).click();await expect(page.getByRole('textbox',{name:'Какво ще направиш?',exact:true})).toHaveValue(goal.nextAction);await page.getByRole('button',{name:'Откажи',exact:true}).click();
});
