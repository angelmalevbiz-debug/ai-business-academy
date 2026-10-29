import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next*/**', '.data/**', '.agents/**', '.reference/**', 'lib/vendor/optimal-engine/**', 'node_modules/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'])
]);
