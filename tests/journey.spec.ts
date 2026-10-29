import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openLessonMaterial } from './navigation';

const origin = process.env.COMMUNITY_E2E_ORIGIN || 'http://127.0.0.1:3100';
const sceneLabel = '3D карта на учебния път';

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('.loading-state')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeVisible();
}

async function enterMap(page: Page, direction = 'Автоматизирай задача') {
  await ready(page,'/?view=path');
  await page.getByRole('button',{name:'Промени посоката',exact:true}).click();
  await page.getByRole('button',{name:'Назад',exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Виж как става. После решаваш.', exact: true })).toBeVisible();
  const arrivalScene = page.locator('[data-renderer]');
  await expect(arrivalScene).toHaveAttribute('data-camera-state', 'overview');
  await expect.poll(async () => arrivalScene.getAttribute('data-renderer')).toMatch(/^(webgl|fallback)$/);
  await expectPaintedScene(arrivalScene, 'overview');
  await expect(page.getByRole('button', { name: /^Ниво \d/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Или избери друга посока', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(`^${direction}`) }).check();
  await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
  const scene = page.getByRole('region', { name: sceneLabel, exact: true });
  await expect(scene).toBeVisible();
  await expect.poll(async () => scene.getAttribute('data-renderer')).toMatch(/^(webgl|fallback)$/);
  await expectPaintedScene(scene);
  return scene;
}

async function expectPaintedScene(scene: Locator, expectedCamera?: 'overview' | 'focus' | 'moving' | 'orbit') {
  if (await scene.getAttribute('data-renderer') !== 'webgl') return;
  await expect.poll(async () => scene.evaluate((element, camera) => {
    const canvas = element.querySelector('canvas');
    return {
      ready: element.getAttribute('data-paint-state') === 'ready',
      selection: element.getAttribute('data-painted-selected') === element.getAttribute('data-selected'),
      dimensions: Boolean(canvas?.width && canvas?.height
        && Number(element.getAttribute('data-painted-width')) === canvas.width
        && Number(element.getAttribute('data-painted-height')) === canvas.height),
      camera: element.getAttribute('data-painted-camera') === (camera || element.getAttribute('data-camera')),
    };
  }, expectedCamera), { message: 'WebGL must have painted the current selection, camera state and backing dimensions' }).toEqual({ ready: true, selection: true, dimensions: true, camera: true });
}

async function assertNoViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), label).toEqual([]);
}

async function assertMapControlsDoNotOverlap(page: Page, label: string) {
  const targets = [
    { name: 'level dock', locator: page.getByRole('button', { name: 'Предишно ниво', exact: true }).locator('..') },
    { name: 'help', locator: page.getByRole('button', { name: 'Как работи?', exact: true }) },
    { name: 'motion', locator: page.getByRole('button', { name: /^(Спри|Пусни) движението$/ }) },
    { name: 'lesson list', locator: page.locator('summary').filter({ hasText: /^Всички уроци$/ }) },
  ];
  const lessonAction = page.getByRole('button', { name: 'Пусни примера', exact: true });
  if (await lessonAction.isVisible()) targets.push({ name: 'primary lesson action', locator: lessonAction });
  const boxes = [];
  for (const target of targets) {
    await expect(target.locator, `${label}: ${target.name}`).toBeVisible();
    const box = await target.locator.boundingBox();
    expect(box, `${label}: ${target.name}`).not.toBeNull();
    boxes.push({ name: target.name, ...box! });
  }
  const overlaps = [];
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const first = boxes[a];
      const second = boxes[b];
      const horizontal = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
      const vertical = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
      if (horizontal > 1 && vertical > 1) overlaps.push([first.name, second.name]);
    }
  }
  expect(overlaps, `${label}: control hit areas must not overlap`).toEqual([]);
}

async function assertShortScreenComposition(page: Page, label: string) {
  const positions = await page.evaluate(() => {
    const heading = document.querySelector('main h1')?.getBoundingClientRect();
    const choices = document.querySelector('[data-phase] fieldset')?.getBoundingClientRect();
    return { headingTop: heading ? heading.top + scrollY : null, choicesTop: choices ? choices.top + scrollY : null };
  });
  expect(positions.headingTop, `${label}: heading exists`).not.toBeNull();
  expect(positions.headingTop!, `${label}: heading must not retain an extra viewport-relative gap`).toBeLessThan(430);
  if (positions.choicesTop !== null) expect(positions.choicesTop, `${label}: choices stay with their heading`).toBeLessThan(455);
}

test('a guest follows the two-step entrance, selects a real lesson and returns to the chosen direction', async ({ page }) => {
  await enterMap(page, 'Направи AI продукт');
  await page.getByRole('button', { name: 'Промени посоката', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Направи AI продукт/ })).toBeChecked();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Виж как става. После решаваш.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ниво \d/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Или избери друга посока', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Направи AI продукт/ })).toBeChecked();
  await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'ai-development');
  const secondLesson = workspace.catalog.lessons.find((item: { id: string }) => item.id === path.lessonIds[1]);
  const scene = page.getByRole('region', { name: sceneLabel, exact: true });
  await expect(scene.locator('[data-scene-node]')).toHaveCount(path.lessonIds.length);
  await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', 'overview');
  await scene.locator(`[data-scene-node="${secondLesson.id}"]`).click();
  await expect(scene).toHaveAttribute('data-selected', secondLesson.id);
  await expect(scene).toHaveAttribute('data-camera', 'focus');
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=lesson.*lesson=${secondLesson.id}`));
  await expect(page.locator(`[data-scenario="${secondLesson.id}"]`)).toBeVisible();
  await openLessonMaterial(page);
  await expect(page.getByRole('heading', { name: secondLesson.title, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Към картата', exact: true }).click();
  await expect(page.getByRole('region', { name: sceneLabel, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: sceneLabel, exact: true })).toBeVisible();
  const persisted = await page.evaluate(() => sessionStorage.getItem('academy:journey:guest'));
  expect(JSON.parse(persisted || '{}')).toMatchObject({ phase: 'map', pathId: 'ai-development' });
  expect((await (await page.request.get('/api/workspace')).json()).user).toBeNull();
});

test('WebGL renders actual frames and camera movement follows the most recent selected node', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const scene = await enterMap(page);
  await expect(scene).toHaveAttribute('data-renderer', 'webgl');
  await expect.poll(async () => Number(await scene.getAttribute('data-render-count'))).toBeGreaterThan(0);
  const context = await scene.locator('canvas').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    const context = element.getContext('webgl2');
    return { webgl2: Boolean(context), width: element.width, height: element.height, lost: context?.isContextLost() };
  });
  expect(context).toMatchObject({ webgl2: true, lost: false });
  expect(context.width).toBeGreaterThan(0);
  expect(context.height).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', 'overview');
  await expectPaintedScene(scene, 'overview');
  const overview = await scene.getAttribute('data-camera-position');
  const overviewFrames = Number(await scene.getAttribute('data-render-count'));
  const nodes = scene.locator('[data-scene-node]');
  const firstId = await nodes.nth(0).getAttribute('data-scene-node');
  const lastId = await nodes.nth(2).getAttribute('data-scene-node');
  await nodes.nth(0).click();
  await expect(scene).toHaveAttribute('data-camera', 'moving');
  await expect.poll(() => scene.evaluate((element, previous) => ({
    ready: element.getAttribute('data-paint-state') === 'ready',
    paintedCamera: element.getAttribute('data-painted-camera'),
    paintedSelected: element.getAttribute('data-painted-selected'),
    changedPosition: element.getAttribute('data-camera-position') !== previous.position,
    advancedFrames: Number(element.getAttribute('data-render-count')) > previous.frames,
  }), { position: overview, frames: overviewFrames }), { message: 'an actual intermediate moving frame must be painted before the next selection interrupts it' }).toEqual({ ready: true, paintedCamera: 'moving', paintedSelected: firstId, changedPosition: true, advancedFrames: true });
  const movingPaint = await scene.evaluate(element => ({ ...((element as HTMLElement).dataset) }));
  // Click a later destination while the first journey is still running.
  await page.getByRole('button', { name: 'Следващо ниво', exact: true }).click();
  await page.getByRole('button', { name: 'Следващо ниво', exact: true }).click();
  await expect(scene).toHaveAttribute('data-selected', lastId!);
  await expect(scene).toHaveAttribute('data-camera', 'focus');
  expect(await scene.getAttribute('data-camera-position')).not.toBe(overview);
  expect(lastId).not.toBe(firstId);
  await expect.poll(async () => scene.getAttribute('data-selected')).toBe(lastId);
  await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', 'overview');
  expect(await scene.getAttribute('data-camera-position')).toBe(overview);
  await nodes.nth(0).click();
  await expect(scene).toHaveAttribute('data-camera', 'moving');
  await page.getByRole('button', { name: 'Спри движението', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', 'focus', { timeout: 500 });
  await expect(page.locator('[data-phase]')).toHaveAttribute('data-motion', 'static');
  await page.getByRole('button', { name: 'Следващо ниво', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera', 'focus', { timeout: 500 });
  await page.getByRole('button', { name: 'Пусни движението', exact: true }).click();
  await expect(page.locator('[data-phase]')).toHaveAttribute('data-motion', 'animated');
  expect(errors).toEqual([]);
  const motionEvidence = JSON.stringify({ checkedAt: new Date().toISOString(), overview: { position: overview, frames: overviewFrames }, movingPaint, finalSelected: lastId, errors }, null, 2);
  await testInfo.attach('actual-moving-paint.json', { body: motionEvidence, contentType: 'application/json' });
  await mkdir(resolve('docs/journey-review'), { recursive: true });
  await writeFile(resolve('docs/journey-review/scene-motion-painted.json'), motionEvidence);
});

test('direct dragging changes the real camera, respects the drawing budget and stops rendering at rest', async ({ browser }, testInfo) => {
  const measurements = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width, height: 900 },
      deviceScaleFactor: 3,
      reducedMotion: width === 390 ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const scene = await enterMap(page);
    await expect(scene).toHaveAttribute('data-renderer', 'webgl');
    await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera', 'overview');
    const canvas = scene.locator('canvas');
    const start = await canvas.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      for (const y of [0.5, 0.7, 0.35]) {
        for (const x of [0.2, 0.4, 0.6]) {
          const point = { x: bounds.left + bounds.width * x, y: bounds.top + bounds.height * y };
          if (document.elementFromPoint(point.x, point.y) === element) return point;
        }
      }
      return null;
    });
    expect(start, 'the real canvas must have an unobstructed pointer target').not.toBeNull();
    const before = await scene.getAttribute('data-camera-position');
    const countBefore = Number(await scene.getAttribute('data-render-count'));
    await page.mouse.move(start!.x, start!.y);
    await page.mouse.down();
    await page.mouse.move(start!.x + Math.min(120, width * 0.2), start!.y + 24, { steps: 16 });
    await expect(scene).toHaveAttribute('data-camera', 'orbit');
    await expect(scene).toHaveAttribute('data-interaction', 'orbit');
    await expect.poll(() => scene.getAttribute('data-camera-position')).not.toBe(before);
    const during = await scene.getAttribute('data-camera-position');
    await page.mouse.up();
    await expect(scene).toHaveAttribute('data-camera', 'overview');
    expect(await scene.getAttribute('data-interaction')).toBeNull();
    await page.waitForTimeout(200);
    const firstIdle = Number(await scene.getAttribute('data-render-count'));
    await page.waitForTimeout(400);
    const secondIdle = Number(await scene.getAttribute('data-render-count'));
    expect(secondIdle, 'an unchanged scene must not redraw continuously').toBe(firstIdle);
    expect(firstIdle).toBeGreaterThan(countBefore);
    const pixels = Number(await scene.getAttribute('data-buffer-pixels'));
    expect(pixels).toBeGreaterThan(0);
    expect(pixels).toBeLessThanOrEqual(1_800_000);
    expect(Number(await scene.getAttribute('data-draw-calls'))).toBeGreaterThan(0);
    expect(Number(await scene.getAttribute('data-triangles'))).toBeGreaterThan(0);
    const measurement = {
      width,
      deviceScaleFactor: 3,
      reducedMotion: width === 390,
      before,
      during,
      firstIdle,
      secondIdle,
      pixelRatio: await scene.getAttribute('data-pixel-ratio'),
      bufferPixels: pixels,
      shadowSize: await scene.getAttribute('data-shadow-size'),
      drawCalls: await scene.getAttribute('data-draw-calls'),
      triangles: await scene.getAttribute('data-triangles'),
    };
    measurements.push(measurement);
    // Returning to a lesson must restore its intended pose after manual orbit.
    const secondId = await scene.locator('[data-scene-node]').nth(1).getAttribute('data-scene-node');
    await page.getByRole('button', { name: 'Следващо ниво', exact: true }).click();
    await expect(scene).toHaveAttribute('data-selected', secondId!);
    await expect(scene).toHaveAttribute('data-camera', 'focus');
    expect(await scene.getAttribute('data-camera-position')).not.toBe(during);
    await context.close();
  }
  const evidence = JSON.stringify({ checkedAt: new Date().toISOString(), measurements }, null, 2);
  await testInfo.attach('orbit-performance.json', { body: evidence, contentType: 'application/json' });
  await mkdir(resolve('docs/journey-review'), { recursive: true });
  await writeFile(resolve('docs/journey-review/orbit-performance.json'), evidence);
});

test('reduced motion preserves the same lessons without a required camera journey', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const scene = await enterMap(page);
  const target = page.getByRole('button', { name: 'Следващо ниво', exact: true });
  const lessonId = await scene.locator('[data-scene-node]').nth(1).getAttribute('data-scene-node');
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(scene).toHaveAttribute('data-selected', lessonId!);
  await expect(scene).toHaveAttribute('data-camera', 'focus', { timeout: 500 });
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${lessonId}`));
  await context.close();
});

test('forced WebGL failure keeps the same real lessons available through an accessible fallback', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/^webgl/.test(type)) return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  const page = await context.newPage();
  const scene = await enterMap(page);
  await expect(scene).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await expect(page.getByText('Картата е в опростен изглед.', { exact: true })).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'automation');
  const ids = await scene.locator('[data-fallback-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fallback-node')));
  expect(ids).toEqual(path.lessonIds);
  await scene.locator('[data-fallback-node]').nth(1).click();
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${path.lessonIds[1]}`));
  await assertNoViolations(page, 'fallback lesson');
  await context.close();
});

test('loss of a running WebGL context leaves the lessons usable and stops rendering', async ({ page }) => {
  const scene = await enterMap(page);
  await expect(scene).toHaveAttribute('data-renderer', 'webgl');
  await scene.locator('canvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context-loss extension unavailable in this browser');
    extension.loseContext();
  });
  await expect(scene).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await expect(page.getByText('Картата е в опростен изглед.', { exact: true })).toBeVisible();
  const count = await scene.getAttribute('data-render-count');
  const target = scene.locator('[data-fallback-node]').nth(2);
  const id = await target.getAttribute('data-fallback-node');
  await target.click();
  await expect(scene).toHaveAttribute('data-selected', id!);
  expect(await scene.getAttribute('data-render-count')).toBe(count);
  await page.getByRole('button', { name: 'Пусни примера', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`lesson=${id}`));
});

test('entrance, choices and map remain accessible and fit phone, tablet and desktop widths', async ({ browser }, testInfo) => {
  for (const [width, height] of [[320, 900], [390, 900], [390, 844], [390, 780], [768, 900], [1440, 900], [390, 667], [320, 568], [667, 375]]) {
    const label = `${width}×${height}`;
    const context = await browser.newContext({ baseURL: origin, viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await ready(page,'/?view=path');
    await page.getByRole('button',{name:'Промени посоката',exact:true}).click();
    await page.getByRole('button',{name:'Назад',exact:true}).click();
    const arrivalScene = page.locator('[data-renderer]');
    await expect(arrivalScene).toHaveAttribute('data-camera-state', 'overview');
    await expectPaintedScene(arrivalScene, 'overview');
    if ((width === 390 || width === 1440) && height === 900) {
      await page.screenshot({ path: testInfo.outputPath(`arrival-${width}.png`) });
    }
    await assertNoViolations(page, `entrance ${label}`);
    if (height < 780) await assertShortScreenComposition(page, `entrance ${label}`);
    await page.getByRole('button', { name: 'Или избери друга посока', exact: true }).click();
    await assertNoViolations(page, `choices ${label}`);
    if (height < 780) await assertShortScreenComposition(page, `choices ${label}`);
    await page.getByRole('radio', { name: /^Автоматизирай задача/ }).check();
    await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
    const scene = page.getByRole('region', { name: sceneLabel, exact: true });
    await expect(scene).toBeVisible();
    await expect.poll(() => scene.getAttribute('data-renderer')).toMatch(/^(webgl|fallback)$/);
    await expectPaintedScene(scene, 'focus');
    await assertNoViolations(page, `map ${label}`);
    if (height < 780) await assertShortScreenComposition(page, `focused ${label}`);
    await assertMapControlsDoNotOverlap(page, `focused ${label}`);
    const pause = page.getByRole('button', { name: 'Спри движението', exact: true });
    await pause.click();
    await expect(page.getByRole('button', { name: 'Пусни движението', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Следващо ниво', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera', 'focus', { timeout: 500 });
    await page.getByRole('button', { name: 'Пусни движението', exact: true }).click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera', 'overview');
    await expectPaintedScene(scene, 'overview');
    const overviewTarget = await scene.getAttribute('data-camera-target');
    const overviewFrames = Number(await scene.getAttribute('data-render-count'));
    await assertMapControlsDoNotOverlap(page, `overview ${label}`);
    await assertNoViolations(page, `overview ${label}`);
    await page.getByRole('button', { name: 'Към избрания пример', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera', 'focus');
    await expectPaintedScene(scene, 'focus');
    if (await scene.getAttribute('data-renderer') === 'webgl') {
      await expect.poll(() => scene.getAttribute('data-camera-target'), { message: `focused ${label}: actual painted target must leave the overview` }).not.toBe(overviewTarget);
      await expect.poll(async () => Number(await scene.getAttribute('data-render-count')), { message: `focused ${label}: a real frame must be drawn after selection` }).toBeGreaterThan(overviewFrames);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `map ${label}`).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Промени посоката', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Какво искаш да направиш?', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `choices ${width}`).toBeLessThanOrEqual(width);
    await context.close();
  }
});

test('a guest direction stays separate during login and does not overwrite the member learning profile', async ({ page, browser }) => {
  const identity = randomUUID();
  const password = `Local-${randomUUID()}`;
  const email = `journey-${identity}@example.com`;
  const memberContext = await browser.newContext({ baseURL: origin });
  const registration = await memberContext.request.post('/api/workspace', {
    headers: { Origin: origin },
    data: { action: 'register', name: 'Проверка на отделни пътища', email, password, ageBand: '18+' },
  });
  expect(registration.ok()).toBeTruthy();
  const profile = await memberContext.request.post('/api/workspace', { headers: { Origin: origin }, data: { action: 'profile', goal: 'business', level: 'beginner', hours: 5, ageBand: '18+' } });
  expect(profile.ok()).toBeTruthy();
  await memberContext.close();
  await enterMap(page, 'Направи AI продукт');
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  const login = page.getByRole('dialog');
  await login.getByLabel('Имейл', { exact: true }).fill(email);
  await login.getByLabel(/^Парола/).fill(password);
  await login.getByRole('button', { name: 'Влез в профила', exact: true }).click();
  await expect(login).toHaveCount(0);
  await expect(page.getByRole('region', { name: sceneLabel, exact: true })).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  expect(workspace.user.profile).toMatchObject({ goal: 'business', level: 'beginner', hours: 5 });
  const path = workspace.catalog.paths.find((item: { id: string }) => item.id === 'ai-for-business');
  const ids = await page.getByRole('region', { name: sceneLabel, exact: true }).locator('[data-scene-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-scene-node')));
  expect(ids).toEqual(path.lessonIds);
});
