import { defineConfig } from "playwright/test";

/**
 * Playwright E2E config — browser tests against the real backend (3000) +
 * frontend (3001). See `test/browser/` for specs.
 *
 * Reuses the already-running dev server on 3001 when present; only starts its
 * own if none is reachable. The backend on 3000 must be up separately
 * (docker-compose stack) — Playwright does not manage it.
 */
const browserBaseURL =
  process.env.FE51_UI_ORIGIN ??
  process.env.FE44_UI_ORIGIN ??
  process.env.FE41_UI_ORIGIN ??
  process.env.FE22_UI_ORIGIN ??
  process.env.FE13_UI_ORIGIN ??
  "http://127.0.0.1:3001";
const apiBaseURL =
  process.env.FE51_API_BASE ??
  process.env.FE44_API_BASE ??
  process.env.FE42_API_BASE ??
  process.env.FE41_API_BASE ??
  process.env.FE22_API_BASE ??
  process.env.FE13_API_BASE ??
  "http://127.0.0.1:3000/api/v1";
const useHttpsFixture = browserBaseURL.startsWith("https://");
const backendOrigin = new URL(apiBaseURL).origin;
const useExternalServer = process.env.FE51_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false, // shared backend state — avoid parallel writes
  use: {
    baseURL: browserBaseURL,
    ignoreHTTPSErrors: useHttpsFixture,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: useHttpsFixture
          ? `NEXT_PUBLIC_API_BASE=/api/v1 FE51_BACKEND_ORIGIN=${backendOrigin} npx next dev --experimental-https --experimental-https-key /tmp/fe42-key.pem --experimental-https-cert /tmp/fe42-cert.pem -p 3443`
          : `NEXT_PUBLIC_API_BASE=${apiBaseURL} npm run dev`,
        url: browserBaseURL,
        reuseExistingServer: !useHttpsFixture,
        ignoreHTTPSErrors: useHttpsFixture,
        timeout: 60_000,
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
