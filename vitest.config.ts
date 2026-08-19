import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * Component tests run in the jsdom environment so `document.cookie` /
 * `window.location` (used by the API client and CSRF helper) are available.
 * The `@/*` alias mirrors `tsconfig.json` paths so test imports resolve like
 * app imports. The Playwright-based real-backend flow is a separate script
 * (not driven by this config).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});