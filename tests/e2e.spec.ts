import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ensureNavigation, openLevelList, openRegistration, openLessonMaterial, openToolsMore } from './navigation';

const firstLesson = 'Намери проблем, който си струва да решиш';
const firstPath = 'Първата ти AI автоматизация';
const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';

async function expectWorkspaceReady(page: Page) {
  await expect(page.getByRole('status', { name: 'Зареждане' })).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeVisible();
}

test('guest can explore lessons, search and see registration only when saving', async ({ page }, testInfo) => {
  await page.goto('/');
  await expectWorkspaceReady(page);
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-overview.png'), fullPage: true });

  await ensureNavigation(page);

  await page.getByRole('link', { name: 'Примери', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Виж пример в действие.' })).toBeVisible();
  await expect(page.locator('.library-grid .path-card')).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Търси в общността' }).fill('Намери проблем');
  await expect(page.locator('.search-results').getByRole('button', { name: firstLesson, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-results')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Търси в общността' }).fill('');
  await page.getByRole('textbox', { name: 'Търси в общността' }).fill('Намери проблем');
  await page.getByRole('button', { name: firstLesson, exact: true }).click();
  await expect(page.locator('[data-scenario="process-map"]')).toBeVisible();
  await openLessonMaterial(page);
  await expect(page.getByRole('heading', { name: firstLesson, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Провери го на практика' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await ensureNavigation(page);

  await page.getByRole('link', { name: 'Примери', exact: true }).click();
  await page.getByRole('button', { name: `Запази ${firstPath}`, exact: true }).click();
  const registration = page.getByRole('dialog');
  await expect(registration.getByRole('heading', { name: 'Създай профил' })).toBeVisible();
  await expect(registration.getByLabel('Имейл', { exact: true })).toBeVisible();
  await registration.getByRole('button', { name: 'Затвори', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const query = `Няма такава дискусия ${randomUUID()}`;
  await page.getByRole('textbox', { name: 'Търси в общността' }).fill(query);
  await page.getByRole('button', { name: 'Търси и в дискусиите', exact: true }).click();
  await expect(page).toHaveURL(/view=community/);
  await expect(page.getByRole('heading', { name: 'Виж как мина при другите.', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Търси в общността' })).toHaveValue(query);
  await expect(page.locator('.post-card')).toHaveCount(0);
});

test('a real member completes the learning loop, shares feedback and keeps private work private after logout', async ({ page }) => {
  const unique = randomUUID().slice(0, 12);
  const email = `e2e-${unique}@example.com`;
  const memberName = `Тест Участник ${unique}`;
  const password = `Test-${randomUUID()}-Local`;
  let worksheet = "";
  const discussionBody = 'Използвам само измислени запитвания. Прототипът определя категория, а човек проверява резултата. Как бихте проверили двусмислен вход?';
  const discussionTitle = `${discussionBody.split('.')[0]}.`;
  const reply = `Ще добавя пример с липсващ текст и ръчна проверка на резултата ${unique}.`;
  const toolProblem = `При всяко тестово запитване ${unique} преписвам категорията ръчно в отделна таблица. Искам да проверявам всички неясни случаи на едно място.`;

  await test.step('register and choose one learning direction', async () => {
    await page.goto('/');
    await expectWorkspaceReady(page);
    await openRegistration(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Име или псевдоним', { exact: true }).fill(memberName);
    await dialog.getByLabel('Имейл', { exact: true }).fill(email);
    await dialog.getByLabel(/^Парола/).fill(password);
    await dialog.getByLabel('Възрастова група', { exact: true }).selectOption('18+');
    await dialog.getByRole('button', { name: 'Създай безплатен профил', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
    await dialog.getByRole('radio', { name: /^Автоматизации като услуга/ }).check();
    await expect(dialog.getByText('Започваме от основите · 5 часа седмично')).toBeVisible();
    await dialog.getByRole('button', { name: 'Към моя път', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '3D карта на учебния път', exact: true })).toBeVisible();
    expect((await (await page.request.get('/api/workspace')).json()).user.profile).toMatchObject({ goal: 'service', level: 'beginner', hours: 5 });
  });

  await test.step('submit a practical task, mark personal progress and reload persisted work', async () => {
    await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
    await expect(page.locator('[data-scenario="process-map"]')).toBeVisible();
    await openLessonMaterial(page);
    await expect(page.getByRole('heading', { name: firstLesson, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Отвори краткия отчет', exact: true }).click();
    const quickReport = page.locator('.lesson-quick-report');
    for (let index = 0; index < 3; index++) {
      await quickReport.locator('.quick-report-choices').getByRole('button').first().click();
    }
    await expect(quickReport.getByRole('heading', {name:'Отчетът е подготвен.'})).toBeVisible();
    worksheet = await page.locator('.lesson-report-preview').evaluate(element => element.lastChild?.textContent?.trim() || '');
    await page.getByRole('button', { name: 'Изпрати за обратна връзка', exact: true }).click();
    await expect(page.locator('.submission-result')).toContainText(worksheet);
    await expect(page.locator('.submission-result')).toContainText('Очаква преглед');
    await page.getByRole('button', { name: 'Отбележи стъпката като завършена', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Стъпката е завършена', exact: true })).toBeDisabled();
    await page.reload();
    await expectWorkspaceReady(page);
    await openLessonMaterial(page);
    await expect(page.locator('.submission-result')).toContainText(worksheet);
    await expect(page.getByRole('button', { name: 'Стъпката е завършена', exact: true })).toBeDisabled();
  });

  await test.step('save a learning path and find it again after reload', async () => {
    await ensureNavigation(page);
    await page.getByRole('link', { name: 'Примери', exact: true }).click();
    await page.getByRole('button', { name: `Запази ${firstPath}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Премахни ${firstPath} от запазени`, exact: true })).toBeVisible();
    await ensureNavigation(page);
    await page.getByRole('link', { name: /^Запазени/ }).click();
    await expect(page.locator('.library-grid .path-card')).toHaveCount(1);
    await page.reload();
    await expectWorkspaceReady(page);
    await expect(page.locator('.library-grid .path-card')).toHaveCount(1);
    await expect(page.getByRole('button', { name: firstPath, exact: true })).toBeVisible();
  });

  await test.step('publish a real discussion and a reply', async () => {
    await ensureNavigation(page);
    await page.getByRole('link', { name: 'Общност', exact: true }).click();
    await page.getByRole('button', { name: 'Задай въпрос', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Какъв е въпросът?', { exact: true }).fill(discussionBody);
    await dialog.getByRole('button', { name: 'Публикувай', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.post-card').filter({ hasText: discussionTitle }).click();
    await expect(page.getByRole('heading', { name: discussionTitle, exact: true })).toBeVisible();
    await page.getByLabel('Добави към разговора', { exact: true }).fill(reply);
    await page.getByRole('button', { name: 'Публикувай отговор', exact: true }).click();
    await expect(page.locator('.thread-replies')).toContainText(reply);
  });

  await test.step('send a product need and confirm it was recorded', async () => {
    await ensureNavigation(page);
    await page.getByRole('link', { name: 'AI инструменти', exact: true }).click();
    await openToolsMore(page);
    await page.locator('.tool-request-disclosure > summary').click();
    await page.getByLabel('Задачата, която би искал да улесниш', { exact: true }).fill(toolProblem);
    await page.getByRole('button', { name: 'Изпрати предложение', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Предложението ти е записано.');
    await expect(page.getByLabel('Задачата, която би искал да улесниш', { exact: true })).toHaveValue('');
    const workspace = await (await page.request.get('/api/workspace')).json();
    expect(workspace.tools.some((item: { problem: string }) => item.problem === toolProblem)).toBe(true);
    expect(workspace.completedLessonIds).toContain('process-map');
    expect(workspace.user.profile).toMatchObject({ goal: 'service', level: 'beginner', hours: 5 });
  });

  await test.step('log out and clear private member state while retaining public conversations', async () => {
    await page.getByRole('button', { name: 'Моят профил', exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Изход от профила', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
    await page.reload();
    await expectWorkspaceReady(page);
    const workspace = await (await page.request.get('/api/workspace')).json();
    expect(workspace.user).toBeNull();
    expect(workspace.submissions).toEqual([]);
    expect(workspace.completedLessonIds).toEqual([]);
    expect(workspace.bookmarkedPathIds).toEqual([]);
    expect(workspace.tools).toEqual([]);
    expect(workspace.posts.some((post: { title: string }) => post.title === discussionTitle)).toBe(true);
    expect(JSON.stringify(workspace)).not.toContain(worksheet);
    expect(JSON.stringify(workspace)).not.toContain(email);
  });
});

test('a minor keeps the registered age and gets an educational path without the adult commercial task', async ({ page }) => {
  const unique = randomUUID().slice(0, 12);
  await page.goto('/');
  await expectWorkspaceReady(page);
  await openRegistration(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Име или псевдоним', { exact: true }).fill(`Млад Участник ${unique}`);
  await dialog.getByLabel('Имейл', { exact: true }).fill(`minor-${unique}@example.com`);
  await dialog.getByLabel(/^Парола/).fill(`Local-minor-${randomUUID()}`);
  await dialog.getByLabel('Възрастова група', { exact: true }).selectOption('14-17');
  await dialog.getByRole('button', { name: 'Създай безплатен профил', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
  await expect(dialog.locator('.onboarding-safety-note')).toContainText('учебен режим');
  await dialog.getByRole('button', { name: 'Към моя път', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '3D карта на учебния път', exact: true })).toBeVisible();
  const minorLessons = await openLevelList(page);
  await expect(minorLessons.locator('ol button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: /Подготви оферта за услуга/ })).toHaveCount(0);

  await page.goto('/?view=lesson&lesson=service-offer');
  await expectWorkspaceReady(page);
  await openLessonMaterial(page);
  await expect(page.locator('.info-note')).toContainText('достъпна за пълнолетни');
  await expect(page.getByLabel(/^Твоят текст/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Изпрати за обратна връзка', exact: true })).toHaveCount(0);
  const directAttempt = await page.request.post('/api/workspace', {
    headers: { Origin: origin },
    data: { action: 'submit', lessonId: 'service-offer', text: 'Учебна оферта с измислени данни, която не трябва да бъде приета за непълнолетен участник.' },
  });
  expect(directAttempt.status()).toBe(403);
  const workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.user.profile.ageBand).toBe('14-17');
  expect(workspace.submissions).toEqual([]);
});

test('a CLI-created administrator reviews member work and moderates a real discussion', async ({ page }) => {
  const unique = randomUUID().slice(0, 12);
  const memberName = `За Преглед ${unique}`;
  const memberEmail = `review-member-${unique}@example.com`;
  const memberPassword = `Local-member-${randomUUID()}`;
  const adminEmail = `review-admin-${unique}@example.com`;
  const adminPassword = `Local-admin-${randomUUID()}`;
  const memberWork = `Учебен процес за преглед ${unique}: измислен вход, три ясни стъпки, човешко одобрение и запис на проверения резултат.`;
  const postTitle = `Публикация за модерация ${unique}`;
  const feedback = `Входът и изходът са описани ясно. Добави измерено време за ръчната проверка при следващото подобрение ${unique}.`;
  const originHeaders = { Origin: origin };

  // Setup uses the real registration and submission API; administrative access
  // is provisioned only through the same local CLI offered to the operator.
  const registration = await page.request.post('/api/workspace', {
    headers: originHeaders,
    data: { action: 'register', name: memberName, email: memberEmail, password: memberPassword, ageBand: '18+' },
  });
  expect(registration.ok()).toBeTruthy();
  const submission = await page.request.post('/api/workspace', {
    headers: originHeaders,
    data: { action: 'submit', lessonId: 'process-map', text: memberWork },
  });
  expect(submission.ok()).toBeTruthy();
  const publication = await page.request.post('/api/workspace', {
    headers: originHeaders,
    data: { action: 'post', category: 'question', title: postTitle, body: 'Тестова публикация с измислени данни за проверка на модераторския процес. Тя трябва да може да бъде скрита от администратор.' },
  });
  expect(publication.ok()).toBeTruthy();
  const logout = await page.request.post('/api/workspace', { headers: originHeaders, data: { action: 'logout' } });
  expect(logout.ok()).toBeTruthy();

  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COMMUNITY_DB_PATH: process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', 'e2e.db'),
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      ADMIN_NAME: `Екип Преглед ${unique}`,
    },
    stdio: 'pipe',
    timeout: 30_000,
  });

  await page.goto('/');
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имейл', { exact: true }).fill(adminEmail);
  await dialog.getByLabel(/^Парола/).fill(adminPassword);
  await dialog.getByRole('button', { name: 'Влез в профила', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await ensureNavigation(page);
  await page.getByRole('button', { name: 'Администрация', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Преглед на задачи' })).toBeVisible();
  const review = page.locator('.admin-review').filter({ hasText: memberName });
  await expect(review).toContainText(memberWork);
  await review.getByLabel('Обратна връзка', { exact: true }).fill(feedback);
  await review.getByRole('button', { name: 'Завърши прегледа', exact: true }).click();
  await expect(review.locator('.tag')).toHaveText('Прегледана');

  await ensureNavigation(page);

  await page.getByRole('link', { name: 'Общност', exact: true }).click();
  await page.locator('.post-card').filter({ hasText: postTitle }).click();
  await page.getByRole('button', { name: 'Скрий публикацията', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Публикацията е скрита от общността.');
  await expect(page.locator('.post-card').filter({ hasText: postTitle })).toHaveCount(0);

  // Confirm the actual member sees the human review and the hidden discussion
  // no longer appears in the member's public community response.
  await page.getByRole('button', { name: 'Моят профил', exact: true }).click();
  await page.getByRole('button', { name: 'Изход от профила', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
  const login = await page.request.post('/api/workspace', {
    headers: originHeaders,
    data: { action: 'login', email: memberEmail, password: memberPassword },
  });
  expect(login.ok()).toBeTruthy();
  const memberWorkspace = await login.json();
  expect(memberWorkspace.posts.some((post: { title: string }) => post.title === postTitle)).toBe(false);
  await page.goto('/?view=lesson&lesson=process-map');
  await expectWorkspaceReady(page);
  await openLessonMaterial(page);
  await expect(page.locator('.submission-result')).toContainText('Прегледана');
  await expect(page.locator('.submission-result blockquote')).toContainText(feedback);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('navigation works and main surfaces fit a 390px viewport', async ({ page }, testInfo) => {
    await page.goto('/');
    await expectWorkspaceReady(page);
    await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-overview.png'), fullPage: true });
    await page.getByRole('button', { name: 'Отвори менюто', exact: true }).click();
    await ensureNavigation(page);
    await page.getByRole('link', { name: 'Общност', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Виж как мина при другите.' })).toBeVisible();

    for (const view of ['overview', 'library', 'path', 'community', 'tools', 'saved', 'profile', 'lesson']) {
      await page.goto(view === 'overview' ? '/' : `/?view=${view}`);
      await expectWorkspaceReady(page);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${view} should not require horizontal scrolling`).toBeLessThanOrEqual(dimensions.viewport);
    }
  });
});

