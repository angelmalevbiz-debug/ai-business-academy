import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const phase = process.env.DESIGN_PHASE || 'before';
const origin = process.env.DESIGN_ORIGIN || 'http://127.0.0.1:3200';
const database = resolve(process.env.COMMUNITY_DB_PATH || `.data/design-${phase}.db`);
const output = resolve(`docs/design-review/${phase}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const evidence = [];
const widths = [1440, 390];
const views = ['overview', 'path', 'library', 'lesson', 'community', 'tools', 'saved', 'profile', 'daily', 'universe'];
const identity = randomUUID().slice(0, 8);
const password = `Review-${randomUUID()}`;
const headers = { Origin: origin };
const extended = phase === 'after' && process.env.DESIGN_EXTENDED !== '0';
const assetRefreshOnly = process.env.DESIGN_ASSET_REFRESH === '1';
const pageErrors = [];
function watch(page) { page.on('pageerror', error => pageErrors.push({ url: page.url(), message: error.message })); }

if (assetRefreshOnly) {
  const results = [];
  const inventoryPath = resolve(output, 'inventory.json');
  const { readFile } = await import('node:fs/promises');
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    watch(page);
    const workspace = await (await context.request.get(`${origin}/api/workspace`)).json();
    for (const width of [1440, 390, 1536, 320, 768]) {
      await page.setViewportSize({ width, height: width === 1536 ? 1024 : 1000 });
      await ready(page, 'overview');
      await capture(page, 'guest', 'overview', width);
      if ([1440, 390, 1536].includes(width)) await page.screenshot({ path: resolve(output, `comp-overview-${width}.png`), fullPage: true });
      if (width === 1536) await page.screenshot({ path: resolve(output, 'comp-viewport-1536x1024.png') });
      const home = evidence.at(-1);
      results.push({ kind: 'home', width, file: home.file, violations: home.violations, overflow: home.metrics.scrollWidth > width, images: home.metrics.images });
      if (![1440, 390].includes(width)) continue;
      for (let index = 0; index < workspace.catalog.paths.length; index++) {
        await ready(page, 'overview');
        const path = workspace.catalog.paths[index];
        await page.locator('.project-cover').nth(index).click();
        const lesson = workspace.catalog.lessons.find(lesson => lesson.id === path.lessonIds[0]);
        const heading = page.getByRole('heading', { name: lesson.title, exact: true });
        await heading.waitFor();
        if (!new URL(page.url()).searchParams.get('lesson')?.includes(lesson.id)) throw new Error(`Gallery navigation failed: ${path.id}`);
        results.push({ kind: 'gallery-navigation', width, path: path.id, lesson: lesson.id, passed: true });
      }
      await ready(page, 'library');
      await capture(page, 'guest', 'library', width);
      const library = evidence.at(-1);
      results.push({ kind: 'library-all', width, file: library.file, violations: library.violations, overflow: library.metrics.scrollWidth > width });
      for (const path of workspace.catalog.paths) {
        await page.locator('.filter-tabs').getByRole('button', { name: path.category, exact: true }).click();
        if (await page.locator('.path-card').count() !== 1) throw new Error(`Filter failed: ${path.id}`);
        await page.getByRole('heading', { name: path.title, exact: true }).waitFor();
        await capture(page, 'guest', `library-filter-${path.id}`, width);
        const entry = evidence.at(-1);
        results.push({ kind: 'library-filter', width, path: path.id, file: entry.file, violations: entry.violations, overflow: entry.metrics.scrollWidth > width, images: entry.metrics.images });
      }
    }
    await context.close();
  } finally {
    await browser.close();
    await writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
  }
  const checkedAt = new Date().toISOString();
  for (const entry of evidence) {
    const previous = inventory.evidence.find(item => item.file === entry.file);
    if (previous) Object.assign(previous, entry, { assetRefreshedAt: checkedAt });
  }
  await writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
  await writeFile(resolve(output, 'asset-refresh.json'), JSON.stringify({ checkedAt, scope: 'Targeted home and gallery checks after final image resolution, planet illustration and heading-size changes; separate from the earlier 20/20 regression.', results, pageErrors }, null, 2));
  console.log(JSON.stringify({ assetRefreshOnly: true, screenshots: evidence.length, checks: results.length, violations: results.filter(item => item.violations?.length), overflows: results.filter(item => item.overflow), pageErrors }, null, 2));
  process.exit(0);
}

async function ready(page, view) {
  await page.goto(`${origin}/?view=${view}`);
  await page.locator('.loading-state').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, role, name, width) {
  const file = `${role}-${name}-${width}.png`;
  await page.evaluate(async () => {
    const position = { x: scrollX, y: scrollY };
    for (const img of document.images) {
      const bounds = img.getBoundingClientRect();
      if (bounds.width && bounds.height && bounds.right > 0 && bounds.left < innerWidth && !img.complete) {
        img.scrollIntoView({ block: 'center', behavior: 'instant' });
        await Promise.race([new Promise(resolve => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); }), new Promise(resolve => setTimeout(resolve, 10000))]);
      }
      if (img.complete && img.naturalWidth) await img.decode().catch(() => {});
    }
    scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
  });
  await page.screenshot({ path: resolve(output, file), fullPage: true });
  const metrics = await page.evaluate(() => ({
    heading: document.querySelector('main h1')?.textContent,
    text: document.querySelector('main')?.innerText,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    images: [...document.images].map(img => ({ src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth })),
    studyDocumentTop: document.querySelector('.universe-study') ? Math.round(document.querySelector('.universe-study').getBoundingClientRect().top + scrollY) : null,
    buttons: [...document.querySelectorAll('button,a,input,textarea,select')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).map(e => ({ text: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 100), tag: e.tagName, width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height) })),
  }));
  let violations = [];
  if (role === 'guest' || phase === 'after') {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    violations = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
  }
  evidence.push({ file, role, name, width, metrics, violations });
  await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ phase, origin, checkedAt: new Date().toISOString(), evidence, pageErrors }, null, 2));
}
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    watch(page);
    for (const view of views) { await ready(page, view); await capture(page, 'guest', view, width); }
    await ready(page, 'overview');
    await page.getByRole('button', { name: 'Вход', exact: true }).click();
    await capture(page, 'guest', 'login', width);
    await page.getByRole('button', { name: 'Затвори', exact: true }).click();
    const registerButtons = page.locator('main').getByRole('button', { name: /Открий своя път|Избери учебен път|Започни с първия урок|Започни безплатно|Създай безплатен профил|Регистрация/, exact: false });
    if (await registerButtons.count()) { await registerButtons.first().click(); await capture(page, 'guest', 'registration', width); }
    if (extended) {
      await page.getByRole('dialog').getByRole('button', { name: 'Затвори', exact: true }).click();
      const companion = page.getByRole('button', { name: 'Искра: съвет за задачата', exact: true });
      if (await companion.count()) {
        await companion.click();
        await capture(page, 'guest', 'companion-hint', width);
        await page.getByRole('button', { name: 'Скрий съвета', exact: true }).click();
      }
      const workspace = await (await context.request.get(`${origin}/api/workspace`)).json();
      for (const lesson of workspace.catalog.lessons) {
        await ready(page, `lesson&lesson=${encodeURIComponent(lesson.id)}`);
        await capture(page, 'guest', `lesson-${lesson.id}`, width);
      }
      await ready(page, 'universe');
      for (const unit of workspace.catalog.universeUnits) {
        const toggle = page.locator('.universe-map-toggle[aria-expanded="false"]');
        if (await toggle.isVisible()) await toggle.click();
        await page.locator('.universe-map button').filter({ hasText: unit.title }).click();
        await capture(page, 'guest', `universe-${unit.id}`, width);
      }
      for (const view of ['admin', 'studio']) { await ready(page, view); await capture(page, 'guest', `${view}-restricted`, width); }
    }
    await context.close();
  }
  const member = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const result = await member.request.post(`${origin}/api/workspace`, { headers, data: { action: 'register', name: 'Дизайнерски преглед', email: `design-member-${identity}@example.com`, password, ageBand: '18+' } });
  if (!result.ok()) throw new Error(`Registration failed: ${result.status()} ${await result.text()}`);
  const page = await member.newPage();
  watch(page);
  await ready(page, 'profile');
  const personalize = page.getByRole('button', { name: /Персонализирай плана|Настрой учебния план|Създай моя план/ });
  if (await personalize.count()) {
    await personalize.first().click();
    for (let step = 0; step < 3; step++) { await capture(page, 'member', `onboarding-${step + 1}`, 1440); const dialog = page.getByRole('dialog'); const forward = dialog.getByRole('button', { name: /Продължи|Покажи моя път|Запази плана|Създай плана|Запази и отвори плана/ }); await forward.last().click(); }
  }
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of views) { await ready(page, view); await capture(page, 'member', view, width); }
    if (extended) {
      await ready(page, 'community');
      await page.getByRole('button', { name: 'Започни дискусия', exact: true }).click();
      await capture(page, 'member', 'new-discussion', width);
      await page.getByRole('dialog').getByRole('button', { name: 'Затвори', exact: true }).click();
      const progress = page.getByRole('button', { name: 'Сподели опит', exact: true });
      if (await progress.count()) {
        await progress.click();
        await capture(page, 'member', 'share-progress', width);
        await page.getByRole('dialog').getByRole('button', { name: 'Затвори', exact: true }).click();
      }
      if (await page.locator('.post-card').count()) {
        await page.locator('.post-card').first().click();
        await capture(page, 'member', 'discussion-thread', width);
      }
      await page.getByRole('button', { name: 'Известия', exact: true }).click();
      await capture(page, 'member', 'notifications-empty', width);
      await page.getByRole('dialog').getByRole('button', { name: 'Затвори', exact: true }).click();
      if (width === 390) {
        await ready(page, 'profile');
        await page.getByRole('button', { name: 'Персонализирай плана', exact: true }).click();
        for (let step = 0; step < 3; step++) {
          await capture(page, 'member', `onboarding-${step + 1}`, width);
          await page.getByRole('dialog').getByRole('button', { name: /Продължи|Запази и отвори плана/ }).last().click();
        }
      }
    }
  }
  await member.close();
  const email = `design-admin-${identity}@example.com`;
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/create-admin.ts'], { env: { ...process.env, COMMUNITY_DB_PATH: database, ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: 'Редакторски преглед' }, stdio: 'pipe' });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const login = await admin.request.post(`${origin}/api/workspace`, { headers, data: { action: 'login', email, password } });
  if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
  const adminPage = await admin.newPage();
  watch(adminPage);
  for (const width of widths) { await adminPage.setViewportSize({ width, height: 1000 }); for (const view of ['admin', 'studio']) { await ready(adminPage, view); await capture(adminPage, 'admin', view, width); } }
  await admin.close();
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    watch(page);
    let releaseResponse;
    const responseGate = new Promise(resolve => { releaseResponse = resolve; });
    await page.route('**/api/workspace', async route => { await responseGate; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Временна грешка при зареждане. Опитай отново.' }) }); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.loading-state').waitFor();
    await capture(page, 'guest', 'loading', width);
    releaseResponse();
    await page.getByRole('alert').filter({ hasText: 'Временна грешка при зареждане.' }).waitFor();
    await capture(page, 'guest', 'error', width);
    await context.close();
  }
  if (extended) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    watch(page);
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of views) { await ready(page, view); await capture(page, 'guest', view, width); }
    }
    await context.close();
  }
} finally {
  await writeFile(resolve(output, 'browser-errors.json'), JSON.stringify(pageErrors, null, 2));
  await browser.close();
}
await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ phase, origin, checkedAt: new Date().toISOString(), evidence, pageErrors }, null, 2));
await writeFile(resolve(output, 'browser-errors.json'), JSON.stringify(pageErrors, null, 2));
console.log(JSON.stringify({ phase, output, captures: evidence.length, overflows: evidence.filter(e => e.metrics.scrollWidth > e.width).map(e => e.file), violations: evidence.reduce((sum, e) => sum + e.violations.length, 0), pageErrors }, null, 2));
