import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * Tests run in jsdom so browser globals such as `document.cookie` and
 * `window.location` are available to transport helpers.
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
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});