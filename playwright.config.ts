import { defineConfig } from 'playwright/test';

/**
 * Playwright E2E config — browser tests against the real backend (3000) +
 * frontend (3001). See `test/browser/` for specs.
 *
 * Reuses the already-running dev server on 3001 when present; only starts its
 * own if none is reachable. The backend on 3000 must be up separately
 * (docker-compose stack) — Playwright does not manage it.
 */
const browserBaseURL = process.env.FE42_UI_ORIGIN ?? 'http://localhost:3001';
const useHttpsFixture = browserBaseURL.startsWith('https://');

export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  retries: 0,
  fullyParallel: false, // shared backend state — avoid parallel writes
  use: {
    baseURL: browserBaseURL,
    ignoreHTTPSErrors: useHttpsFixture,
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: useHttpsFixture
      ? 'NEXT_PUBLIC_API_BASE=https://localhost:3444/api/v1 npx next dev --experimental-https --experimental-https-key /tmp/fe42-key.pem --experimental-https-cert /tmp/fe42-cert.pem -p 3443'
      : 'npm run dev',
    url: browserBaseURL,
    reuseExistingServer: true,
    ignoreHTTPSErrors: useHttpsFixture,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
