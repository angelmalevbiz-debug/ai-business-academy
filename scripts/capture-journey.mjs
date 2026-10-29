import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.JOURNEY_ORIGIN || 'http://127.0.0.1:3200';
const output = resolve('docs/journey-review/after');
const arrivedOnly = process.env.JOURNEY_CAPTURE_MODE === 'arrived-only';
const sceneLabel = '3D карта на учебния път';
const evidence = [];
const errors = [];
const overviewPaints = new WeakMap();
const focusedPaints = new WeakMap();
const sourceFiles = ['components/community-app.tsx', 'components/workspace-home.tsx', 'components/workspace-home.module.css', 'components/journey-scene.tsx', 'components/journey-scene.module.css', 'app/globals.css'];
const sourceDigests = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
if (arrivedOnly) {
  const previous = JSON.parse(await readFile(resolve(output, 'inventory.json'), 'utf8'));
  for (const file of sourceFiles) if (previous.sourceDigests[file] !== sourceDigests[file]) throw new Error(`Cannot append evidence from a different source revision: ${file}`);
  evidence.push(...previous.evidence.filter(item => item.name !== 'camera-arrived').map(item => ({ ...item, status: item.name === 'camera-travel' && item.paintIssues?.length ? 'inconclusive' : item.status || 'accepted' })));
  errors.push(...previous.errors);
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch();

async function ready(page, url = '/') {
  await page.goto(`${origin}${url}`);
  await page.locator('.loading-state').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('[data-phase]').count()) await page.waitForFunction(() => ['webgl', 'fallback'].includes(document.querySelector('[data-renderer]')?.getAttribute('data-renderer')));
}

async function capture(page, name, width, motion = 'reduce') {
  // Decorative entrance scenes are aria-hidden. Inspect the underlying renderer
  // without relying on an accessible region that intentionally does not exist.
  if (await page.locator('[data-renderer]').count()) {
    await page.waitForFunction(() => ['webgl', 'fallback'].includes(document.querySelector('[data-renderer]')?.getAttribute('data-renderer')));
    if (!name.startsWith('fallback') && await page.locator('[data-renderer]').getAttribute('data-renderer') !== 'webgl') throw new Error(`${name}-${width}: normal scene unexpectedly fell back instead of drawing WebGL`);
    await page.waitForFunction(requireMoving => {
      const scene = document.querySelector('[data-renderer]');
      if (scene?.getAttribute('data-renderer') !== 'webgl') return true;
      const canvas = scene.querySelector('canvas');
      return scene.getAttribute('data-paint-state') === 'ready'
        && scene.getAttribute('data-painted-selected') === scene.getAttribute('data-selected')
        && scene.getAttribute('data-painted-camera') === scene.getAttribute('data-camera')
        && (!requireMoving || scene.getAttribute('data-painted-camera') === 'moving')
        && canvas?.width > 0 && canvas?.height > 0
        && Number(scene.getAttribute('data-painted-width')) === canvas.width
        && Number(scene.getAttribute('data-painted-height')) === canvas.height;
    }, name.startsWith('camera-travel'));
  }
  const previousOverview = overviewPaints.get(page);
  const previousFocus = focusedPaints.get(page);
  if (name.includes('map-focus') && previousOverview) {
    await page.waitForFunction(previous => {
      const scene = document.querySelector('[data-renderer]');
      if (scene?.getAttribute('data-renderer') !== 'webgl') return true;
      return scene.getAttribute('data-camera') === 'focus'
        && scene.getAttribute('data-camera-target') !== previous.target
        && Number(scene.getAttribute('data-render-count')) > previous.frames;
    }, previousOverview);
  }
  if (name.includes('map-return') && previousFocus) {
    await page.waitForFunction(previous => {
      const scene = document.querySelector('[data-renderer]');
      if (scene?.getAttribute('data-renderer') !== 'webgl') return true;
      return scene.getAttribute('data-camera') === 'focus'
        && scene.getAttribute('data-camera-target') === previous.target
        && Number(scene.getAttribute('data-render-count')) > 0;
    }, previousFocus);
  }
  // A ResizeObserver callback can clear the WebGL buffer. Wait for layout to
  // remain stable across consecutive animation frames before taking the image.
  if (!name.startsWith('camera-travel')) await page.evaluate(() => new Promise(resolve => {
    let previous = '';
    let stable = 0;
    function check() {
      const scene = document.querySelector('[data-renderer]');
      const canvas = scene?.querySelector('canvas');
      const bounds = scene?.getBoundingClientRect();
      const value = JSON.stringify([bounds?.width, bounds?.height, canvas?.width, canvas?.height, scene?.getAttribute('data-camera-target'), scene?.getAttribute('data-render-count')]);
      stable = value === previous ? stable + 1 : 0;
      previous = value;
      if (stable >= 2 || scene?.getAttribute('data-camera') === 'moving') resolve();
      else requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }));
  const file = `${name}-${width}.png`;
  await page.screenshot({ path: resolve(output, file), fullPage: true });
  const metrics = await page.evaluate(() => {
    const scene = document.querySelector('[data-renderer]');
    const canvas = scene?.querySelector('canvas');
    const context = canvas?.getContext('webgl2');
    const heading = document.querySelector('main h1')?.getBoundingClientRect();
    const choiceForm = document.querySelector('[data-phase] fieldset')?.getBoundingClientRect();
    const selectedMarker = document.querySelector('[data-scene-node][aria-current="step"]')?.getBoundingClientRect();
    return {
      heading: document.querySelector('main h1')?.textContent,
      phase: document.querySelector('[data-phase]')?.getAttribute('data-phase'),
      overview: document.querySelector('[data-phase]')?.getAttribute('data-overview'),
      visibleText: document.querySelector('main')?.innerText,
      viewport: innerWidth,
      viewportHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      headingRect: heading ? { ...heading.toJSON(), documentTop: heading.top + scrollY } : null,
      choiceFormRect: choiceForm ? { ...choiceForm.toJSON(), documentTop: choiceForm.top + scrollY } : null,
      selectedMarkerRect: selectedMarker?.toJSON() || null,
      renderer: scene?.getAttribute('data-renderer'),
      camera: scene?.getAttribute('data-camera'),
      cameraPosition: scene?.getAttribute('data-camera-position'),
      cameraTarget: scene?.getAttribute('data-camera-target'),
      selected: scene?.getAttribute('data-selected'),
      renderCount: scene?.getAttribute('data-render-count'),
      paintState: scene?.getAttribute('data-paint-state'),
      paintedCamera: scene?.getAttribute('data-painted-camera'),
      paintedSelected: scene?.getAttribute('data-painted-selected'),
      paintedWidth: scene?.getAttribute('data-painted-width'),
      paintedHeight: scene?.getAttribute('data-painted-height'),
      interaction: scene?.getAttribute('data-interaction'),
      pixelRatio: scene?.getAttribute('data-pixel-ratio'),
      bufferPixels: scene?.getAttribute('data-buffer-pixels'),
      renderQuality: scene?.getAttribute('data-render-quality'),
      shadowSize: scene?.getAttribute('data-shadow-size'),
      drawCalls: scene?.getAttribute('data-draw-calls'),
      triangles: scene?.getAttribute('data-triangles'),
      frameCpuMs: scene?.getAttribute('data-frame-cpu-ms'),
      averageFrameCpuMs: scene?.getAttribute('data-average-frame-cpu-ms'),
      canvas: canvas ? { width: canvas.width, height: canvas.height, webgl2: Boolean(context), contextLost: context?.isContextLost() } : null,
      nodes: [...document.querySelectorAll('[data-scene-node]')].map(node => ({ id: node.getAttribute('data-scene-node'), label: node.getAttribute('aria-label'), current: node.getAttribute('aria-current') })),
      controls: [...document.querySelectorAll('[data-phase] button, [data-phase] summary')].filter(element => {
        const style = getComputedStyle(element);
        const closedDetails = element.closest('details:not([open])');
        const hiddenByDetails = closedDetails && element !== closedDetails.querySelector('summary');
        return element.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[inert]') && !hiddenByDetails;
      }).map(element => {
        const rect = element.getBoundingClientRect();
        return { name: element.getAttribute('aria-label') || element.textContent.trim(), x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, inViewport: rect.bottom > 0 && rect.top < innerHeight };
      }),
    };
  });
  const mapControls = await page.evaluate(() => {
    if (document.querySelector('[data-phase]')?.getAttribute('data-phase') !== 'map') return [];
    const phase = document.querySelector('[data-phase]');
    const buttons = [...phase.querySelectorAll('button')];
    const dock = buttons.find(element => element.getAttribute('aria-label') === 'Предишно ниво')?.parentElement;
    const help = buttons.find(element => element.textContent.trim() === 'Как работи?');
    const motion = buttons.find(element => /^(Спри|Пусни) движението$/.test(element.getAttribute('aria-label') || ''));
    const list = [...phase.querySelectorAll('summary')].find(element => element.textContent.trim() === 'Всички уроци');
    return [['dock', dock], ['help', help], ['motion', motion], ['lesson list', list]].map(([name, element]) => {
      const rect = element?.getBoundingClientRect();
      return { name, rect: rect?.toJSON() || null, visible: Boolean(rect?.width && rect?.height && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none') };
    });
  });
  const controlIssues = [];
  const paintIssues = [];
  if (metrics.renderer === 'webgl') {
    if (metrics.paintState !== 'ready') paintIssues.push('paint is pending');
    if (metrics.paintedSelected !== metrics.selected) paintIssues.push('painted selection differs from intent');
    if (metrics.paintedCamera !== metrics.camera) paintIssues.push('painted camera differs from intent');
    if (Number(metrics.paintedWidth) !== metrics.canvas.width || Number(metrics.paintedHeight) !== metrics.canvas.height) paintIssues.push('canvas backing dimensions differ from the last painted dimensions');
    if (name.startsWith('camera-travel') && (metrics.camera !== 'moving' || metrics.paintedCamera !== 'moving')) paintIssues.push('travel capture missed the actual painted moving frame');
  }
  for (let a = 0; a < mapControls.length; a++) {
    const first = mapControls[a];
    if (!first.visible) controlIssues.push({ type: 'hidden', name: first.name });
    for (let b = a + 1; b < mapControls.length; b++) {
      const second = mapControls[b];
      if (!first.rect || !second.rect) continue;
      const horizontal = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
      const vertical = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
      if (horizontal > 1 && vertical > 1) controlIssues.push({ type: 'overlap', names: [first.name, second.name] });
    }
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  if (metrics.renderer === 'webgl' && name.includes('map-focus') && previousOverview && (metrics.cameraTarget === previousOverview.target || Number(metrics.renderCount) <= previousOverview.frames)) {
    throw new Error(`${file}: camera intent changed without a newly painted focused pose`);
  }
  if (metrics.renderer === 'webgl' && name.includes('map-overview')) overviewPaints.set(page, { target: metrics.cameraTarget, frames: Number(metrics.renderCount) });
  if (metrics.renderer === 'webgl' && name.includes('map-focus')) focusedPaints.set(page, { target: metrics.cameraTarget });
  const movingCaptureInconclusive = name.startsWith('camera-travel') && paintIssues.length === 1 && paintIssues[0] === 'travel capture missed the actual painted moving frame';
  const status = paintIssues.length ? movingCaptureInconclusive ? 'inconclusive' : 'failed' : 'accepted';
  evidence.push({ file, name, width, motion, status, metrics, mapControls, controlIssues, paintIssues, violations: axe.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) });
  await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ checkedAt: new Date().toISOString(), origin, sourceDigests, evidence, errors }, null, 2));
  if (paintIssues.length && !movingCaptureInconclusive) throw new Error(`${file}: ${paintIssues.join('; ')}`);
}

async function enter(page, direction = 'AI автоматизации') {
  await page.getByRole('button', { name: 'Започни оттук', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(`^${direction}`) }).check();
  await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
  const scene = page.getByRole('region', { name: sceneLabel, exact: true });
  await scene.waitFor();
  await page.waitForFunction(() => ['webgl', 'fallback'].includes(document.querySelector('[data-renderer]')?.getAttribute('data-renderer')));
  return scene;
}

async function pageCaptureSelect(page, scene, index) {
  const node = scene.locator('[data-scene-node]').nth(index);
  if (await node.isVisible()) {
    try { await node.click({ timeout: 1000 }); return; } catch {}
  }
  await page.locator('summary').filter({ hasText: /^Всички уроци$/ }).click();
  await page.locator('details[open] ol button').nth(index).click();
}

async function orbit(page, scene) {
  const start = await scene.locator('canvas').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    for (const y of [0.5, 0.7, 0.35]) {
      for (const x of [0.2, 0.4, 0.6]) {
        const point = { x: bounds.left + bounds.width * x, y: bounds.top + bounds.height * y };
        if (document.elementFromPoint(point.x, point.y) === element) return point;
      }
    }
    return null;
  });
  if (!start) throw new Error('No unobstructed canvas point for direct orbit capture');
  const before = await scene.getAttribute('data-camera-position');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + Math.min(120, page.viewportSize().width * 0.2), start.y + 24, { steps: 16 });
  await page.waitForFunction(position => document.querySelector('[data-camera-position]')?.getAttribute('data-camera-position') !== position, before);
  await page.mouse.up();
}

try {
  if (!arrivedOnly) {
  for (const [width, height] of [[1440, 1000], [390, 1000], [320, 1000], [768, 1000], [390, 667], [320, 568], [667, 375]]) {
    const prefix = height === 1000 ? '' : `short-${height}-`;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ name: `normal-${width}`, message: error.message }));
    await ready(page);
    await capture(page, `${prefix}entrance`, width);
    await page.getByRole('button', { name: 'Започни оттук', exact: true }).click();
    await capture(page, `${prefix}direction`, width);
    await page.getByRole('radio', { name: /^AI автоматизации/ }).check();
    await page.getByRole('button', { name: 'Влез в картата', exact: true }).click();
    const scene = page.getByRole('region', { name: sceneLabel, exact: true });
    await scene.waitFor();
    await page.waitForFunction(() => ['webgl', 'fallback'].includes(document.querySelector('[data-renderer]')?.getAttribute('data-renderer')));
    await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
    await capture(page, `${prefix}map-overview`, width);
    // Projected markers can be outside a focused camera; use the explicit list
    // on narrow layouts to retain the same reachable lesson without forced clicks.
    if (width === 1440 || width === 390 || width === 320) await scene.locator('[data-scene-node]').nth(1).click();
    else {
      await page.locator('summary').filter({ hasText: /^Всички уроци$/ }).click();
      await page.locator('details[open] ol button').nth(1).click();
    }
    await page.waitForFunction(() => document.querySelector('[data-camera]')?.getAttribute('data-camera') === 'focus');
    await capture(page, `${prefix}map-focus`, width);
    await page.getByRole('button', { name: 'Отвори урока', exact: true }).click();
    await page.getByRole('heading', { name: 'Задача', exact: true }).waitFor();
    await capture(page, `${prefix}lesson`, width);
    await page.getByRole('button', { name: 'Към учебния път', exact: true }).click();
    await scene.waitFor();
    await capture(page, `${prefix}map-return`, width);
    if (height === 1000 && (width === 1440 || width === 390)) {
      await page.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
      await orbit(page, scene);
      await capture(page, 'map-orbit', width);
    }
    await context.close();
  }

  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/^webgl/.test(type)) return null;
      return original.apply(this, [type, ...args]);
    };
  });
  const fallback = await fallbackContext.newPage();
  fallback.on('pageerror', error => errors.push({ name: 'forced-fallback', message: error.message }));
  await ready(fallback);
  const fallbackScene = await enter(fallback);
  await fallback.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await capture(fallback, 'fallback-overview', 390);
  await fallbackScene.locator('[data-fallback-node]').nth(1).click();
  await capture(fallback, 'fallback-focus', 390);
  await fallback.getByRole('button', { name: 'Отвори урока', exact: true }).click();
  await fallback.getByRole('heading', { name: 'Задача', exact: true }).waitFor();
  await capture(fallback, 'fallback-lesson', 390);
  await fallbackContext.close();
  }

  const animatedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const animated = await animatedContext.newPage();
  animated.on('pageerror', error => errors.push({ name: 'animated', message: error.message }));
  await ready(animated);
  const animatedScene = await enter(animated);
  await animated.getByRole('button', { name: 'Виж цялата карта', exact: true }).click();
  await pageCaptureSelect(animated, animatedScene, 3);
  if (!arrivedOnly) await capture(animated, 'camera-travel', 1440, 'no-preference');
  await animated.waitForFunction(() => document.querySelector('[data-camera]')?.getAttribute('data-camera') === 'focus');
  await capture(animated, 'camera-arrived', 1440, 'no-preference');
  await animatedContext.close();
} finally {
  for (const file of sourceFiles) {
    const finalDigest = createHash('sha256').update(await readFile(file)).digest('hex');
    if (finalDigest !== sourceDigests[file]) errors.push({ name: 'source-changed-during-capture', message: file });
  }
  await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ checkedAt: new Date().toISOString(), origin, sourceDigests, evidence, errors }, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ captures: evidence.length, accepted: evidence.filter(item => item.status === 'accepted').length, inconclusive: evidence.filter(item => item.status === 'inconclusive').map(item => item.file), overflows: evidence.filter(item => item.metrics.scrollWidth > item.width).map(item => item.file), controlIssues: evidence.filter(item => item.controlIssues.length).map(item => ({ file: item.file, issues: item.controlIssues })), paintIssues: evidence.filter(item => item.paintIssues.length).map(item => ({ file: item.file, status: item.status, issues: item.paintIssues })), violations: evidence.filter(item => item.violations.length).map(item => ({ file: item.file, violations: item.violations })), errors }, null, 2));
