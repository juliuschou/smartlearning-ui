import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E config — browser tests against the real backend (3000) +
 * frontend (3001). See `test/browser/` for specs.
 *
 * Reuses the already-running dev server on 3001 when present; only starts its
 * own if none is reachable. The backend on 3000 must be up separately
 * (docker-compose stack) — Playwright does not manage it.
 */
export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false, // shared backend state — avoid parallel writes
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});