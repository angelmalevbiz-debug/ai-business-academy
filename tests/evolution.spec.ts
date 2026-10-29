import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ensureNavigation, openLevelList, openUniverseTopics, openLessonMaterial, openUniverseMaterial, openDailyPlanForm } from './navigation';

const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';
const headers = { Origin: origin };

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeVisible();
}

async function openReviewForm(page: Page) {
  await openLessonMaterial(page);
  await page.locator('#lesson-submission > summary').click();
  await page.locator('.lesson-write-more summary').click();
}

async function register(page: Page, ageBand: '18+' | '14-17' = '18+') {
  const identity = randomUUID().slice(0, 12);
  const email = `evolution-${identity}@example.com`;
  const password = `Local-evolution-${randomUUID()}`;
  const result = await page.request.post('/api/workspace', {
    headers,
    data: { action: 'register', name: `Участник ${identity}`, email, password, ageBand },
  });
  expect(result.status()).toBe(200);
  return { email, password, identity };
}

async function post(page: Page, data: Record<string, unknown>) {
  return page.request.post('/api/workspace', { headers, data });
}

async function universeStage(page: Page, label: 'Разбери' | 'Провери' | 'Изпробвай') {
  await openUniverseMaterial(page);
  const tab = page.locator('.universe-stage-tabs').getByRole('button', { name: new RegExp(label) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
}

test('the selected Universe problem checks an answer and keeps reflection private', async ({ page }) => {
  await register(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page, '/?view=universe&topic=attention-and-evidence');
  await page.locator('.universe-purpose summary').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Факт или предположение?');
  await expect(page.locator('#universe-intro')).toHaveCount(0);

  const study = page.locator('.universe-unit');
  await expect(study.locator('[data-scenario="attention-and-evidence"]')).toBeVisible();
  await openUniverseMaterial(page);
  await expect(study.getByRole('heading', { name: 'Факт или предположение?' })).toBeVisible();
  await expect(study).toContainText('Научни данни и ограничения');
  await study.locator('.universe-source-disclosure summary').click();
  await expect(study.locator('.universe-sources a').first()).toBeVisible();
  await expect(study.getByRole('radio').first()).not.toBeVisible();
  const publicWorkspace = await (await page.request.get('/api/workspace')).json();
  expect(publicWorkspace.catalog.universeUnits[0].question.answerIndex).toBeUndefined();
  expect(publicWorkspace.editorCatalog).toBeUndefined();

  await universeStage(page, 'Провери');
  await study.getByRole('radio', { name: 'Хората не харесват идеята ми.' }).check();
  await study.getByRole('button', { name: 'Провери отговора' }).click();
  await expect(study.locator('.question-feedback')).toContainText('Опитай отново.');
  expect((await (await page.request.get('/api/workspace')).json()).development.unitProgress).toEqual([]);
  await study.getByRole('radio', { name: 'Въпросът още няма отговор.' }).check();
  await study.getByRole('button', { name: 'Провери отговора' }).click();
  await expect(study.locator('.question-feedback')).toContainText('Правилно.');
  await expect(study.locator('.review-due')).toContainText('Следващ преговор');
  const progress = (await (await page.request.get('/api/workspace')).json()).development.unitProgress;
  expect(progress).toHaveLength(1);
  expect(progress[0]).toMatchObject({ unitId: 'attention-and-evidence', reviewCount: 0 });

  const reflection = `Тестова лична бележка ${randomUUID()}: фактът е липса на отговор, а причината е предположение. Ще формулирам въпроса отново с повече контекст.`;
  await universeStage(page, 'Изпробвай');
  await study.locator('.reflection-capture summary').click();
  await study.locator('#reflection').fill(reflection);
  await study.getByRole('button', { name: 'Запази бележката' }).click();
  await expect(study.locator('.reflection-history')).toContainText('Моите бележки');
  await study.locator('.reflection-history summary').click();
  await expect(study.locator('.reflection-history')).toContainText(reflection);
  await page.reload();
  await expect(page.locator('.universe-map')).toBeVisible();
  await expect(page.locator('#universe-intro')).toHaveCount(0);
  await openUniverseTopics(page);
  await page.locator('.universe-map button').filter({ hasText: 'Факт или предположение?' }).click();
  await universeStage(page, 'Изпробвай');
  await page.locator('.reflection-history summary').click();
  await expect(page.locator('.reflection-history')).toContainText(reflection);
  expect(errors).toEqual([]);
});

test('minor cannot use the optional adult practice and the adult must opt in', async ({ browser }) => {
  const minorContext = await browser.newContext({ baseURL: origin });
  const minor = await minorContext.newPage();
  await register(minor, '14-17');
  await ready(minor, '/?view=universe');
  await openUniverseTopics(minor);
  await minor.locator('.universe-map button').filter({ hasText: 'Кратка пауза преди работа' }).click();
  await universeStage(minor, 'Изпробвай');
  await expect(minor.locator('.practice-gate')).toContainText('за пълнолетни');
  await expect(minor.getByRole('button', { name: 'Прочети на глас' })).toHaveCount(0);
  const forbidden = await post(minor, { action: 'recordPractice', unitId: 'attention-to-action', consent: true });
  expect(forbidden.status()).toBe(403);
  await minorContext.close();

  const adultContext = await browser.newContext({ baseURL: origin });
  const adult = await adultContext.newPage();
  await register(adult);
  await ready(adult, '/?view=universe');
  await openUniverseTopics(adult);
  await adult.locator('.universe-map button').filter({ hasText: 'Кратка пауза преди работа' }).click();
  await universeStage(adult, 'Изпробвай');
  const start = adult.getByRole('button', { name: 'Прочети на глас' });
  await expect(start).toBeDisabled();
  const rejected = await post(adult, { action: 'recordPractice', unitId: 'attention-to-action', consent: false });
  expect(rejected.status()).toBe(400);
  await adult.getByLabel('Избирам доброволно и съм на безопасно място.').check();
  await expect(start).toBeEnabled();
  await adult.getByRole('button', { name: 'Отбележи практиката' }).click();
  await expect(adult.locator('.toast')).toContainText('Практиката е отбелязана.');
  await expect(adult.getByRole('button', { name: 'Стоп', exact: true })).toBeDisabled();
  await adultContext.close();
});

test('member drafts are separated by lesson and only the owner sees private goals and reflection', async ({ browser }) => {
  const ownerContext = await browser.newContext({ baseURL: origin });
  const owner = await ownerContext.newPage();
  const member = await register(owner);
  const privateGoal = `Моя частна цел ${member.identity}`;
  const privateReflection = `Моя частна рефлексия ${member.identity}: планирам да отделя пет минути за проверим учебен процес и да запиша фактите.`;
  const firstDraft = `Чернова за първи урок ${member.identity}: първоначално описвам примерен вход и безопасна човешка проверка.`;
  const secondDraft = `Чернова за втори урок ${member.identity}: скицирам измислен прототип без клиентски данни.`;
  expect((await post(owner, { action: 'reflect', unitId: 'attention-and-evidence', text: privateReflection })).ok()).toBeTruthy();
  await ready(owner, '/?view=daily');
  await openDailyPlanForm(owner);
  await owner.getByLabel('Какво ще направиш?').fill(privateGoal);
  await owner.getByRole('button', { name: 'Запази стъпката' }).click();
  await expect(owner.getByRole('heading', { name: 'Твоята стъпка' })).toBeVisible();
  await expect(owner.getByText(privateGoal, { exact: true })).toBeVisible();
  await owner.reload();
  await expect(owner.getByRole('heading', { name: 'Твоята стъпка' })).toBeVisible();
  await expect(owner.getByText(privateGoal, { exact: true })).toBeVisible();
  await owner.getByRole('button', { name: 'Отбележи като направено' }).click();
  await expect(owner.getByRole('status').filter({hasText:'Отбелязано за днес.'})).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Отбележи като направено' })).toHaveCount(0);

  await ready(owner, '/?view=lesson&lesson=process-map');
  await openReviewForm(owner);
  await owner.getByLabel(/^Твоят текст/).fill(firstDraft);
  await owner.getByRole('button', { name: 'Запази чернова' }).click();
  await expect(owner.getByText('Черновата е запазена в профила ти.').first()).toBeVisible();
  await ready(owner, '/?view=lesson&lesson=first-prototype');
  await openReviewForm(owner);
  await owner.getByLabel(/^Твоят текст/).fill(secondDraft);
  await owner.getByRole('button', { name: 'Запази чернова' }).click();
  await expect(owner.getByText('Черновата е запазена в профила ти.').first()).toBeVisible();
  await ready(owner, '/?view=lesson&lesson=process-map');
  await openReviewForm(owner);
  await expect(owner.getByLabel(/^Твоят текст/)).toHaveValue(firstDraft);
  await ready(owner, '/?view=lesson&lesson=first-prototype');
  await openReviewForm(owner);
  await expect(owner.getByLabel(/^Твоят текст/)).toHaveValue(secondDraft);
  await owner.reload();
  await openReviewForm(owner);
  await expect(owner.getByLabel(/^Твоят текст/)).toHaveValue(secondDraft);
  await ready(owner, '/?view=lesson&lesson=process-map');
  await openReviewForm(owner);
  await expect(owner.getByLabel(/^Твоят текст/)).toHaveValue(firstDraft);

  const otherContext = await browser.newContext({ baseURL: origin });
  const other = await otherContext.newPage();
  await register(other);
  const otherWorkspace = await (await other.request.get('/api/workspace')).text();
  expect(otherWorkspace).not.toContain(privateGoal);
  expect(otherWorkspace).not.toContain(privateReflection);
  expect(otherWorkspace).not.toContain(firstDraft);
  expect((await post(other, { action: 'saveContent', kind: 'path', targetId: 'unauthorized-test', payload: {} })).status()).toBe(403);
  await otherContext.close();

  const adminEmail = `evolution-admin-${member.identity}@example.com`;
  const adminPassword = `Local-admin-${randomUUID()}`;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, COMMUNITY_DB_PATH: process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', 'e2e.db'), ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, ADMIN_NAME: `Екип ${member.identity}` },
    stdio: 'pipe', timeout: 30_000,
  });
  const adminContext = await browser.newContext({ baseURL: origin });
  const admin = await adminContext.newPage();
  expect((await post(admin, { action: 'login', email: adminEmail, password: adminPassword })).ok()).toBeTruthy();
  const adminWorkspace = await (await admin.request.get('/api/workspace')).text();
  expect(adminWorkspace).not.toContain(privateGoal);
  expect(adminWorkspace).not.toContain(privateReflection);
  expect(adminWorkspace).not.toContain(firstDraft);
  await adminContext.close();
  await ownerContext.close();
});

test('an administrator can draft and publish a new learning path without exposing the draft', async ({ browser }) => {
  const unique = randomUUID().slice(0, 10);
  const adminEmail = `editor-${unique}@example.com`;
  const adminPassword = `Editor-${randomUUID()}`;
  const id = `e2e-path-${unique}`;
  const title = `Учебен път ${unique}`;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, COMMUNITY_DB_PATH: process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', 'e2e.db'), ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, ADMIN_NAME: `Редактор ${unique}` },
    stdio: 'pipe', timeout: 30_000,
  });
  const adminContext = await browser.newContext({ baseURL: origin });
  const admin = await adminContext.newPage();
  expect((await post(admin, { action: 'login', email: adminEmail, password: adminPassword })).ok()).toBeTruthy();
  await ready(admin, '/?view=studio');
  await expect(admin.getByRole('heading', { name: 'Редактор на съдържание' })).toBeVisible();
  await admin.getByRole('button', { name: 'Нов материал', exact: true }).click();
  await admin.getByLabel(/^Идентификатор/).fill(id);
  await admin.getByLabel('Заглавие', { exact: true }).fill(title);
  await admin.getByLabel('Продължителност в минути').fill('20');
  // Saving from another editor section must reveal the invalid field instead
  // of leaving the browser unable to focus a required hidden control.
  await admin.getByRole('button', {name:'Запази чернова',exact:true}).click();
  await expect(admin.getByLabel('Описание', {exact:true})).toBeFocused();
  await admin.getByRole('group', {name:'Части на редактора'}).getByRole('button', {name:'Материал',exact:true}).click();
  await admin.getByLabel('Описание', { exact: true }).fill('Тестова пътека за проверка на публикуването и работата на учебния каталог.');
  await admin.getByLabel('Категория', { exact: true }).fill('Тестова категория');
  await admin.getByLabel('Ниво', { exact: true }).fill('Начинаещи');
  await admin.getByLabel('Кратко описание', { exact: true }).fill('Практика в малки стъпки');
  await admin.getByRole('group', {name:'Части на редактора'}).getByRole('button', {name:'Преглед',exact:true}).click();
  await expect(admin.getByRole('region', {name:'Преглед на текста'})).toContainText(title);
  await expect(admin.getByRole('region', {name:'Преглед на текста'})).toContainText('Тестова пътека за проверка');
  await admin.getByRole('button', { name: 'Запази чернова' }).click();
  const history = admin.getByRole('heading', { name: 'Версии на материала' }).locator('xpath=ancestor::section[1]');
  await expect(history).toContainText('Чернова');

  const guestContext = await browser.newContext({ baseURL: origin });
  const guest = await guestContext.newPage();
  const before = await (await guest.request.get('/api/workspace')).json();
  expect(before.catalog.paths.some((path: { id: string }) => path.id === id)).toBe(false);
  expect(JSON.stringify(before)).not.toContain(title);
  await admin.getByRole('button', { name: 'Публикувай', exact: false }).click();
  await expect(history).toContainText('Публикувана');
  const after = await (await guest.request.get('/api/workspace')).json();
  expect(after.catalog.paths.some((path: { id: string; title: string }) => path.id === id && path.title === title)).toBe(true);
  await ready(guest, '/?view=library');
  await expect(guest.getByRole('heading', { name: title })).toBeVisible();
  await expect(guest.getByRole('heading', { name: title }).locator('xpath=ancestor::article[1]').getByRole('button', { name: 'Очаква материал' })).toBeDisabled();
  // Linking a newly published lesson must make this direction usable in the
  // learner's map as well, without adding the ID to a frontend allow-list.
  const lessonId = `e2e-lesson-${unique}`;
  const sourceLesson = after.catalog.lessons[0];
  const lessonDraftResponse = await post(admin, { action: 'saveContent', kind: 'lesson', targetId: lessonId, payload: { ...sourceLesson, id: lessonId, pathId: id, title: `Първа задача ${unique}`, adultOnly: false } });
  expect(lessonDraftResponse.ok()).toBeTruthy();
  const lessonDraft = (await lessonDraftResponse.json()).contentRevisions.find((revision: { targetId: string; status: string }) => revision.targetId === lessonId && revision.status === 'draft');
  expect((await post(admin, { action: 'publishContent', revisionId: lessonDraft.id, expectedVersion: 0 })).ok()).toBeTruthy();
  const currentPath = after.catalog.paths.find((path: { id: string }) => path.id === id);
  const pathDraftResponse = await post(admin, { action: 'saveContent', kind: 'path', targetId: id, payload: { ...currentPath, lessonIds: [lessonId] } });
  expect(pathDraftResponse.ok()).toBeTruthy();
  const linkedState = await pathDraftResponse.json();
  const pathDraft = linkedState.contentRevisions.find((revision: { targetId: string; status: string }) => revision.targetId === id && revision.status === 'draft');
  const publishedVersion = linkedState.contentRevisions.filter((revision: { targetId: string; status: string }) => revision.targetId === id && revision.status === 'published').reduce((latest: number, revision: { version: number }) => Math.max(latest, revision.version), 0);
  expect((await post(admin, { action: 'publishContent', revisionId: pathDraft.id, expectedVersion: publishedVersion })).ok()).toBeTruthy();
  await ready(guest, '/');
  await ready(guest,'/?view=path');
  await guest.getByRole('button', { name: 'Промени посоката', exact: true }).click();
  await guest.getByRole('radio', { name: title, exact: true }).check();
  await guest.getByRole('button', { name: 'Влез в картата', exact: true }).click();
  await expect(guest.getByRole('heading', { name: `Първа задача ${unique}`, exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(guest).toHaveURL(new RegExp(`lesson=${lessonId}`));
  await guestContext.close();
  await adminContext.close();
});

test('completed learning path shows an honest next direction instead of restarting lesson one', async ({ page }) => {
  const member = await register(page);
  const profile = await post(page, { action: 'profile', goal: 'service', level: 'beginner', hours: 5, ageBand: '18+' });
  expect(profile.ok()).toBeTruthy();
  const workspace = await profile.json();
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'automation');
  expect(path.lessonIds).toHaveLength(6);
  for (const lessonId of path.lessonIds as string[]) {
    const text = `Учебна задача ${member.identity}: това е примерен процес с измислени данни, описани стъпки и проверка на резултата.`;
    const submitted = await post(page, { action: 'submit', lessonId, text });
    expect(submitted.status(), `submit ${lessonId}`).toBe(200);
    const completed = await post(page, { action: 'complete', lessonId });
    expect(completed.status(), `complete ${lessonId}`).toBe(200);
  }
  await ready(page, '/?view=path');
  await expect(page.getByText('Всички уроци са отбелязани. Покажи как се получи проектът.', { exact: true })).toBeVisible();
  const completedJourney = await openLevelList(page);
  await expect(completedJourney).toContainText('6 от 6 завършени');
  await expect(completedJourney.locator('ol button')).toHaveCount(6);
  await completedJourney.locator('ol button').first().click();
  await expect(page.getByRole('region', { name: '3D карта на учебния път', exact: true })).toHaveAttribute('data-selected', path.lessonIds[0]);
  await expect(page.getByText('Има запазена работа', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${path.lessonIds[0]}`));
  await page.getByRole('button', { name: 'Към картата', exact: true }).click();
  await expect(page.getByText('Всички уроци са отбелязани. Покажи как се получи проектът.', { exact: true })).toBeVisible();
  const completedState = await (await page.request.get('/api/workspace')).json();
  expect(completedState.completedLessonIds).toEqual(expect.arrayContaining(path.lessonIds));
  await ensureNavigation(page);
  await page.getByRole('link', { name: 'Моят път', exact: true }).click();
  await page.getByRole('button', { name: 'Избери следваща посока', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?', exact: true })).toBeVisible();
});

test('editor can cancel leaving unsaved content or explicitly discard it', async ({ page }) => {
  const unique = randomUUID().slice(0, 10);
  const adminEmail = `dirty-editor-${unique}@example.com`;
  const adminPassword = `Editor-${randomUUID()}`;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, COMMUNITY_DB_PATH: process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', 'e2e.db'), ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, ADMIN_NAME: `Редактор ${unique}` },
    stdio: 'pipe', timeout: 30_000,
  });
  expect((await post(page, { action: 'login', email: adminEmail, password: adminPassword })).ok()).toBeTruthy();
  await ready(page, '/?view=studio');
  await page.getByRole('button', { name: 'Нов материал', exact: true }).click();
  const unsavedTitle = `Незапазен тест ${unique}`;
  await page.getByLabel('Заглавие', { exact: true }).fill(unsavedTitle);
  const cancelDialog = page.waitForEvent('dialog');
  const firstClick = page.getByRole('link', { name: 'Примери', exact: true }).click();
  const cancelled = await cancelDialog;
  expect(cancelled.type()).toBe('confirm');
  expect(cancelled.message()).toContain('незапазени промени');
  await cancelled.dismiss();
  await firstClick;
  await expect(page.getByRole('heading', { name: 'Редактор на съдържание' })).toBeVisible();
  await expect(page.getByLabel('Заглавие', { exact: true })).toHaveValue(unsavedTitle);
  const confirmDialog = page.waitForEvent('dialog');
  const secondClick = page.getByRole('link', { name: 'Примери', exact: true }).click();
  const confirmed = await confirmDialog;
  expect(confirmed.type()).toBe('confirm');
  await confirmed.accept();
  await secondClick;
  await expect(page.getByRole('heading', { name: 'Виж пример в действие.' })).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).text();
  expect(workspace).not.toContain(unsavedTitle);
});

test('universe remains usable with reduced motion and fits narrow and wide viewports', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: origin, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await ready(page, '/?view=universe&topic=attention-and-evidence');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Факт или предположение?');
    await expect(page.locator('.universe-unit [data-scenario] h2').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('canvas.cosmic-field')).toBeVisible();
    await page.getByRole('button', { name: 'Спри движението' }).click();
    await expect(page.getByRole('button', { name: 'Движението е спряно' })).toHaveAttribute('aria-pressed', 'true');
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`universe-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
  await context.close();
});
