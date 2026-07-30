import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Standalone config for the component/integration test suite. We deliberately
// don't reuse vite.config.ts here because that config throws unless PORT and
// BASE_PATH are set (they only exist when the dev server runs under a workflow).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The completion-validation runner executes this suite concurrently with
    // the api-server suite on shared CPUs. Under that contention the default
    // 5s per-test timeout flakes on the slowest interaction tests (userEvent
    // driven), so give tests generous headroom and cap worker fan-out to keep
    // per-worker throughput predictable. Timeouts only ever fire on genuine
    // hangs, so the higher ceiling costs nothing on green runs.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 2,
      },
    },
  },
});
