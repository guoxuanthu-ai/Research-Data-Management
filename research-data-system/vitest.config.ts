import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    '@rds/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    '@rds/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
  } },
  test: { environment: 'node', testTimeout: 30000, hookTimeout: 30000, pool: 'forks', maxWorkers: 1 },
});
