import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ensureNavigation, openLevelList, openLessonMaterial, openUniverseMaterial } from './navigation';

const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';
const headers = { Origin: origin };

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeVisible();
}

async function member(page: Page) {
  const identity = randomUUID().slice(0, 10);
  const password = `Final-review-${randomUUID()}`;
  const result = await page.request.post('/api/workspace', { headers, data: { action: 'register', name: `Проверка ${identity}`, email: `final-${identity}@example.test`, password, ageBand: '18+' } });
  expect(result.status()).toBe(200);
  return { password, identity, workspace: await result.json() };
}

test('a missing lesson tells the learner what happened and offers a real recovery route', async ({ page }) => {
  await ready(page, '/?view=lesson&lesson=not-a-published-lesson');
  await expect(page.getByRole('heading', { name: 'Този урок не е наличен', exact: true })).toBeVisible();
  await expect(page.locator('.lesson-article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Предай задачата', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Избери друг урок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Виж пример в действие.', exact: true })).toBeVisible();
  await expect(page.locator('.library-grid .path-card').first()).toBeVisible();
});

test('a library filter cannot hide other paths when opening the saved collection', async ({ page }) => {
  const account = await member(page);
  const first = account.workspace.catalog.paths.find((path: { id: string }) => path.id === 'automation');
  const second = account.workspace.catalog.paths.find((path: { id: string }) => path.id === 'ai-for-business');
  for (const path of [first, second]) expect((await page.request.post('/api/workspace', { headers, data: { action: 'bookmark', pathId: path.id } })).ok()).toBeTruthy();
  await ready(page, '/?view=library');
  await page.locator('.filter-tabs').getByRole('button', { name: first.category, exact: true }).click();
  await expect(page.locator('.library-grid .path-card')).toHaveCount(1);
  await ensureNavigation(page);
  await page.getByRole('link', { name: /^Запазени/ }).click();
  await expect(page.getByRole('heading', { name: 'Запазени пътища', exact: true })).toBeVisible();
  await expect(page.locator('.library-grid .path-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: second.title, exact: true })).toBeVisible();
});

test('a deep linked lesson returns to its own path and selected level instead of the default map', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const workspace = await (await page.request.get('/api/workspace')).json();
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'ai-for-business');
  const lessonId = path.lessonIds[1];
  const lesson = workspace.catalog.lessons.find((item: { id: string }) => item.id === lessonId);
  await ready(page, `/?view=lesson&lesson=${lessonId}`);
  await expect(page.locator(`[data-scenario="${lessonId}"]`)).toBeVisible();
  await openLessonMaterial(page);
  await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Към картата', exact: true }).click();
  const scene = page.getByRole('region', { name: '3D карта на учебния път', exact: true });
  await expect(scene).toHaveAttribute('data-selected', lessonId);
  await expect(page.getByRole('navigation', { name: 'Посока на обучението' })).toContainText(path.title);
  const list = await openLevelList(page);
  await expect(list.locator('ol button')).toHaveCount(path.lessonIds.length);
  await expect(list.locator('ol button[aria-current="step"]')).toContainText(lesson.title);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${lessonId}`));
});

test('reduced motion preserves the visible arrival route rather than leaving its connectors collapsed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page,'/?view=path');
  await page.getByRole('button',{name:'Промени посоката',exact:true}).click();
  await page.getByRole('button',{name:'Назад',exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Виж как става. После решаваш.', exact: true })).toBeVisible();
  const connectors = page.locator('[class*="arrivalStages"] > b');
  await expect(connectors).toHaveCount(2);
  const visibleRoute = await connectors.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return { scale: new DOMMatrixReadOnly(style.transform).a, opacity: Number(style.opacity), width: bounds.width };
  }));
  for (const connector of visibleRoute) {
    expect(connector.scale).toBeCloseTo(1);
    expect(connector.opacity).toBe(1);
    expect(connector.width).toBeGreaterThan(5);
  }
});

test('a selected thinking problem opens its active situation and reveals reference material only when requested', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '/?view=universe&topic=attention-and-evidence');
  await expect(page.getByRole('heading',{name:'Факт или предположение?',exact:true}).first()).toBeVisible();
  const study = page.locator('#universe-study');
  const situation=study.locator('[data-scenario="attention-and-evidence"]');
  await expect(situation).toHaveAttribute('data-state','choice');
  await expect(study.locator('.scene-reference')).not.toHaveAttribute('open','');
  await expect(study.getByRole('radio').first()).not.toBeVisible();
  const before=await (await page.request.get('/api/workspace')).json();
  await situation.getByRole('button',{name:'Идеята е безполезна',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(situation).toHaveAttribute('data-state','result');
  await expect(situation.getByRole('status').filter({hasText:'Приемаш едно обяснение без проверка.'})).toBeFocused();
  expect((await (await page.request.get('/api/workspace')).json()).development.unitProgress).toEqual(before.development.unitProgress);
  await openUniverseMaterial(page);
  await expect(study.getByRole('heading', { name: 'Факт или предположение?', exact: true })).toBeVisible();
  await study.getByRole('button', { name: /Провери разбирането си/ }).click();
  await expect(study.getByRole('radio').first()).toBeVisible();
  await expect(page.locator('.universe-stage-content')).toBeFocused();
});

test('a member downloads their real data, recovers from a wrong deletion password and deletes their account', async ({ page }) => {
  const account = await member(page);
  const marker = `Лична работа ${account.identity}: използвам измислени данни, карта на процеса и човешка проверка.`;
  expect((await page.request.post('/api/workspace', { headers, data: { action: 'submit', lessonId: 'process-map', text: marker } })).ok()).toBeTruthy();
  expect((await page.request.post('/api/workspace', { headers, data: { action: 'reflect', unitId: 'attention-and-evidence', text: marker } })).ok()).toBeTruthy();
  await ready(page, '/?view=profile');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Изтегли данните', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^academy-data-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const serialized = await readFile(downloadPath!, 'utf8');
  const exported = JSON.parse(serialized);
  expect(exported.account.id).toBe(account.workspace.user.id);
  expect(exported.learning.submissions[0].text).toBe(marker);
  expect(exported.development.reflections[0].text).toBe(marker);
  expect(serialized).not.toMatch(/password_hash|token_hash/);
  await page.locator('.account-delete summary').click();
  const confirm = page.getByRole('button', { name: 'Изтрий окончателно', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Потвърди с текущата си парола', { exact: true }).fill('wrong-password');
  await page.getByLabel('Разбирам, че изтритите данни няма да могат да се възстановят.', { exact: true }).check();
  await confirm.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Паролата не съвпада' })).toBeVisible();
  expect((await (await page.request.get('/api/workspace')).json()).user.id).toBe(account.workspace.user.id);
  await page.getByLabel('Потвърди с текущата си парола', { exact: true }).fill(account.password);
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?', exact: true })).toBeVisible();
  const anonymous = await (await page.request.get('/api/workspace')).json();
  expect(anonymous.user).toBeNull();
  expect(anonymous.submissions).toEqual([]);
  expect((await page.context().cookies()).some(cookie => cookie.name === 'wv_session')).toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Вход', exact: true })).toBeVisible();
});

test('a moderator can remove one reply while preserving the useful discussion', async ({ page }) => {
  const account = await member(page);
  const title = `Разговор за проверка ${account.identity}`;
  const posted = await page.request.post('/api/workspace', { headers, data: { action: 'post', category: 'question', title, body: 'Проверявам примерен процес с измислени данни и споделям конкретна пречка.' } });
  expect(posted.ok()).toBeTruthy();
  const post = (await posted.json()).posts.find((item: { title: string }) => item.title === title);
  const reply = `Тестов отговор за модерация ${account.identity}`;
  expect((await page.request.post('/api/workspace', { headers, data: { action: 'reply', postId: post.id, body: reply } })).ok()).toBeTruthy();
  const email = `moderation-${account.identity}@example.test`;
  const password = `Moderation-${randomUUID()}`;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], { cwd: process.cwd(), env: { ...process.env, COMMUNITY_DB_PATH: process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', 'e2e.db'), ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: `Екип ${account.identity}` }, stdio: 'pipe', timeout: 30_000 });
  expect((await page.request.post('/api/workspace', { headers, data: { action: 'login', email, password } })).ok()).toBeTruthy();
  await ready(page, '/?view=community');
  await page.locator('.post-card').filter({ hasText: title }).click();
  await expect(page.locator('.thread-replies')).toContainText(reply);
  await page.getByRole('button', { name: 'Скрий отговора', exact: true }).click();
  await expect(page.locator('.thread-replies')).not.toContainText(reply);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('.thread-replies')).toContainText('0 отговора');
  const publicResult = await page.request.get('/api/workspace', { headers: { Cookie: '' } });
  const stillPublished = (await publicResult.json()).posts.find((item: { id: string }) => item.id === post.id);
  expect(stillPublished).toBeTruthy();
  expect(stillPublished.replies).toEqual([]);
});

test('profile resumes actual saved work while community reading does not require composing a post', async ({page}) => {
  const account=await member(page);
  const draft=`Собствена чернова ${account.identity}: описвам измислен вход и човешка проверка на резултата.`;
  expect((await page.request.post('/api/workspace',{headers,data:{action:'saveDraft',lessonId:'process-map',text:draft}})).ok()).toBeTruthy();
  await ready(page,'/?view=profile');
  await expect(page.locator('.profile-return')).toContainText('Остави нещо започнато');
  await page.locator('.profile-return').getByRole('button',{name:'Продължи от запазеното',exact:true}).click();
  await expect(page).toHaveURL(/lesson=process-map/);
  await expect(page.locator('#lesson-material')).toHaveAttribute('open','');
  const report=page.locator('#lesson-submission');
  await report.locator(':scope > summary').click();
  await page.locator('.lesson-write-more > summary').click();
  await expect(page.getByLabel(/^Твоят текст/)).toHaveValue(draft);
  await ready(page,'/?view=community');
  await expect(page.getByRole('heading',{name:'Виж как мина при другите.',exact:true})).toBeVisible();
  await expect(page.locator('.post-card').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.community-filters')).not.toHaveAttribute('open','');
  await expect(page.locator('.community-contribute').getByRole('button',{name:'Задай въпрос',exact:true})).toBeEnabled();
});

