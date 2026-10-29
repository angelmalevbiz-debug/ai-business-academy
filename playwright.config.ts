import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// Keep test data separate from the user's database and from previous runs.
const testDb = process.env.COMMUNITY_E2E_DB_PATH || resolve(process.cwd(), '.data', `e2e-${randomUUID()}.db`);
process.env.COMMUNITY_E2E_DB_PATH = testDb;
const testPort = Number(process.env.COMMUNITY_E2E_PORT || 3100);
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535) throw new Error('Invalid COMMUNITY_E2E_PORT');
const testOrigin = `http://127.0.0.1:${testPort}`;
process.env.COMMUNITY_E2E_ORIGIN = testOrigin;

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e.spec.ts', 'evolution.spec.ts', 'design.spec.ts', 'journey.spec.ts', 'next-level.spec.ts', 'final-review.spec.ts', 'interactive-scenario.spec.ts', 'workflow.spec.ts', 'intent-navigation.spec.ts', 'workflow-company.spec.ts', 'workflow-positioning.spec.ts', 'websites.spec.ts', 'daily-plan-visual.spec.ts', 'website-visual-editor.spec.ts', 'website-portability.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: process.env.COMMUNITY_E2E_REPORT_PATH || 'docs/journey-review/regression.json' }]],
  outputDir: 'test-results',
  use: {
    baseURL: testOrigin,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.COMMUNITY_BROWSER_CHANNEL ? { channel: process.env.COMMUNITY_BROWSER_CHANNEL } : {}) } }],
  webServer: {
    command: `npm run dev -- --port ${testPort}`,
    url: testOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_DIST_DIR: '.next-e2e',
      COMMUNITY_DB_PATH: testDb,
      APP_ORIGIN: testOrigin,
      // Regression journeys verify durable state without starting real model jobs.
      WORKFLOW_AI_PROVIDER: 'none',
      WEBSITE_AI_PROVIDER: 'none',
      WEBSITE_IMAGE_SEARCH: 'none',
      SITE_CONNECTION_ENCRYPTION_KEY: '',
    },
  },
});
