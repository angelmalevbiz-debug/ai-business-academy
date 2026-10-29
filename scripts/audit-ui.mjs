import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const label = process.env.AUDIT_LABEL || 'baseline';
const output = path.resolve('docs/verification', label);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const findings = [];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    for (const view of ['overview', 'path', 'library', 'lesson', 'community', 'tools', 'profile', 'universe', 'daily']) {
      await page.goto(`${baseURL}/?view=${view}`);
      await page.locator('.loading-state').waitFor({ state: 'hidden' });
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, heading: document.querySelector('main h1')?.textContent }));
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      findings.push({ width, view, url: page.url(), dimensions, pageErrors: [...pageErrors], violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.helpUrl, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })), incompleteChecks: axe.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) });
      if (view === 'overview' || view === 'universe') await page.screenshot({ path: path.join(output, `${view}-${width}.png`), fullPage: true });
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(path.join(output, 'accessibility.json'), JSON.stringify({ label, checkedAt: new Date().toISOString(), scope: 'Automated axe checks on unauthenticated surfaces; not a complete WCAG audit or human usability study.', findings }, null, 2));
process.stdout.write(JSON.stringify({ output, pages: findings.length, violations: findings.reduce((sum, f) => sum + f.violations.length, 0), overflow: findings.filter(f => f.dimensions.document > f.dimensions.viewport).map(f => ({ width: f.width, view: f.view })), runtimeErrors: [...new Set(findings.flatMap(f => f.pageErrors))] }, null, 2));
