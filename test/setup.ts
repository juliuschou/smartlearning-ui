import '@testing-library/jest-dom/vitest';

/**
 * Vitest global setup.
 *
 * `@testing-library/jest-dom/vitest` extends Vitest's expect with DOM matchers
 * like `toBeInTheDocument`, `toHaveAttribute`, `toBeDisabled`.
 *
 * jsdom does not implement `window.matchMedia`, `IntersectionObserver`, or
 * `scrollTo` — stub them so client components that touch them don't throw.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
}