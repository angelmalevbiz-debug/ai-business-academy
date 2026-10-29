import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openUniverseTopics, openUniverseMaterial } from './navigation';
const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';

test('closed mobile navigation cannot receive keyboard focus off screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const bounds = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label') || element.textContent, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
    });
    expect(focus.left, `${focus.label} should not be focused outside the mobile viewport`).toBeGreaterThanOrEqual(0);
    expect(focus.right, `${focus.label} should fit the viewport when focused`).toBeLessThanOrEqual(391);
  }
  await page.getByRole('button', { name: 'Отвори менюто', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Примери', exact: true })).toBeVisible();
  for (const key of ['Shift+Tab', ...Array.from({ length: 14 }, () => 'Tab')]) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.sidebar'))), `${key} should keep focus within the open navigation`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Отвори менюто', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Отвори менюто', exact: true }).click();
  await page.getByRole('link', { name: 'Примери', exact: true }).click();
  await expect(page).toHaveURL(/view=library/);
  await expect(page.locator('#main-content')).toBeFocused();
});

test('authentication dialog supports keyboard entry, visible errors and focus return', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Вход', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Имейл', { exact: true }).fill('unknown-account@example.com');
  await dialog.getByLabel(/^Парола/).fill('Incorrect-local-password');
  await dialog.locator('button[type=submit]').count().then(async count => {
    if (count) await dialog.locator('button[type=submit]').click();
    else await dialog.locator('form .button.primary').click();
  });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText(/имейл|парола/i);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('loading, error and login states meet the automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  const login = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(login.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.keyboard.press('Escape');
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route('**/api/workspace', async route => {
    await responseGate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Няма връзка със сървъра. Опитай отново.' }) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.loading-state')).toBeVisible();
  const loading = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(loading.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  releaseResponse();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  const error = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(error.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.unroute('**/api/workspace');
  await page.getByRole('button', { name: 'Опитай отново', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?' })).toBeVisible();
});

test('every main guest screen reflows at phone, tablet and desktop widths', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['overview', 'path', 'library', 'lesson', 'community', 'tools', 'saved', 'profile', 'daily', 'universe']) {
      await page.goto(`/?view=${view}`);
      await expect(page.locator('.loading-state')).toHaveCount(0);
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(size.document, `${view} should fit ${width}px`).toBeLessThanOrEqual(size.viewport);
      await expect(page.locator('#main-content')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('contextual learning guide opens by keyboard, explains the journey and can be dismissed', async ({ page }) => {
  await page.goto('/?view=path');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Как работи?', exact: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const guide = page.getByRole('dialog');
  await expect(guide).toContainText('Пусни готовия пример.');
  await guide.getByRole('button', { name: 'Продължи', exact: true }).click();
  await expect(guide).toContainText('Виж последицата.');
  await guide.getByRole('button', { name: 'Продължи', exact: true }).click();
  await expect(guide).toContainText('Показваш и трудностите.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('sharing work in progress stays private until publishing and resets the question composer', async ({ page }) => {
  const identity = randomUUID().slice(0, 12);
  expect((await page.request.post('/api/workspace', {
    headers: { Origin: origin },
    data: { action: 'register', name: `Участник в процес ${identity}`, email: `progress-${identity}@example.com`, password: `Local-${randomUUID()}`, ageBand: '18+' },
  })).ok()).toBeTruthy();
  await page.goto('/?view=community');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  const before = await (await page.request.get('/api/workspace')).json();
  await page.getByRole('button', { name: 'Покажи процеса', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Сподели опит', exact: true })).toBeVisible();
  await expect(dialog.locator('input[name="category"]')).toHaveValue('progress');
  await expect(dialog.getByLabel('Заглавие', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Какво пробваш?', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Затвори', exact: true }).click();
  const afterClosing = await (await page.request.get('/api/workspace')).json();
  expect(afterClosing.posts).toHaveLength(before.posts.length);
  await page.getByRole('button', { name: 'Задай въпрос', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Нова дискусия', exact: true })).toBeVisible();
  await expect(dialog.locator('input[name="category"]')).toHaveValue('question');
  await expect(dialog.getByLabel('Какъв е въпросът?', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Затвори', exact: true }).click();
  await page.getByRole('button', { name: 'Покажи процеса', exact: true }).click();
  dialog = page.getByRole('dialog');
  const body = `Какво пробвах: примерен процес ${identity}.\nКъде се затрудних: неясен вход.\nКакво промених: добавих ръчна проверка.\nСледваща стъпка: ще проверя още два измислени примера.`;
  await dialog.getByLabel('Какво пробваш?', { exact: true }).fill(body);
  const compactBody = body.replace(/\s+/g, ' ');
  const firstSentenceEnd = compactBody.search(/[.!?](?=\s|$)/);
  const title = firstSentenceEnd >= 4 ? compactBody.slice(0, firstSentenceEnd + 1) : compactBody.slice(0, 140);
  await dialog.getByRole('button', { name: 'Публикувай', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.post-card').filter({ hasText: title })).toBeVisible();
  const afterPublishing = await (await page.request.get('/api/workspace')).json();
  expect(afterPublishing.posts.find((post: { title: string }) => post.title === title)).toMatchObject({ title, body, category: 'progress' });
});

test('optional speech starts only after consent and supports pause, resume and stop', async ({ page }) => {
  // Exercise the browser UI state deterministically; this is not a test of an
  // installed voice, audio quality or clinical effectiveness.
  await page.addInitScript(() => {
    const commands: string[] = [];
    const queued: { onerror?: () => void }[] = [];
    Object.assign(window, { reviewSpeechCommands: commands });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { text: string; constructor(text: string) { this.text = text; } } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'bg-BG', name: 'Test Bulgarian voice' }],
      speak: (utterance: { onerror?: () => void }) => { queued.push(utterance); commands.push('speak'); },
      pause: () => commands.push('pause'),
      resume: () => commands.push('resume'),
      cancel: () => { commands.push('cancel'); for (const utterance of queued.splice(0)) utterance.onerror?.(); },
    } });
  });
  const identity = randomUUID();
  const registration = await page.request.post('/api/workspace', {
    headers: { Origin: origin },
    data: { action: 'register', name: 'Проверка на четенето', email: `speech-${identity}@example.com`, password: `Review-${randomUUID()}`, ageBand: '18+' },
  });
  expect(registration.ok()).toBeTruthy();
  await page.goto('/?view=universe');
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await openUniverseTopics(page);
  await page.locator('.universe-map button').filter({ hasText: 'Кратка пауза преди работа' }).click();
  await openUniverseMaterial(page);
  await page.locator('.universe-stage-tabs').getByRole('button', { name: /Изпробвай/ }).click();
  const practice = page.locator('.attention-practice');
  const start = practice.getByRole('button', { name: 'Прочети на глас', exact: true });
  const stop = practice.getByRole('button', { name: 'Стоп', exact: true });
  const commands = () => page.evaluate(() => (window as unknown as { reviewSpeechCommands: string[] }).reviewSpeechCommands);
  await expect(start).toBeDisabled();
  expect((await commands()).filter(command => command === 'speak')).toEqual([]);
  const consent = practice.getByRole('checkbox');
  await consent.check();
  await start.click();
  await expect(start).toBeDisabled();
  await expect(stop).toBeEnabled();
  await practice.getByRole('button', { name: 'Пауза', exact: true }).click();
  await practice.getByRole('button', { name: 'Продължи', exact: true }).click();
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(start).toBeEnabled();
  await expect(practice).not.toContainText('Четенето спря.');
  expect(await commands()).toEqual(expect.arrayContaining(['speak', 'pause', 'resume', 'cancel']));
  await start.click();
  await consent.uncheck();
  await expect(start).toBeDisabled();
  await expect(stop).toBeDisabled();
  await consent.check();
  await start.click();
  const cancelBeforeHiding = (await commands()).filter(command => command === 'cancel').length;
  await page.locator('.universe-stage-tabs').getByRole('button', {name:/Разбери/}).click();
  await expect(practice).toHaveCount(0);
  expect((await commands()).filter(command => command === 'cancel').length).toBeGreaterThan(cancelBeforeHiding);
  await page.locator('.universe-stage-tabs').getByRole('button', {name:/Изпробвай/}).click();
  await expect(start).toBeDisabled();
});

test('reading surfaces reflow in the CSS viewport equivalent of 200 percent browser zoom', async ({ browser }) => {
  // A 1280px desktop zoomed to 200% exposes a 640 CSS-pixel layout viewport.
  // Unlike element.style.zoom this exercises the correct responsive breakpoints.
  // Physical browser zoom and assistive technology still need a manual audit.
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, baseURL: origin });
  const page = await context.newPage();
  for (const view of ['overview', 'library', 'lesson', 'community', 'tools', 'daily', 'universe']) {
    await page.goto(`/?view=${view}`);
    await expect(page.locator('.loading-state')).toHaveCount(0);
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(size.document, `${view} should reflow at 200 percent zoom`).toBeLessThanOrEqual(size.viewport);
  }
  await context.close();
});

