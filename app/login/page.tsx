import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/LoginForm';

export const metadata: Metadata = {
  title: '登入 | 智學互動平台',
};

/**
 * Login route — US-F6.
 *
 * Server-component shell wrapping the client `LoginForm`. The form reads
 * `?next=` and the session via client hooks; this page stays simple. Detecting
 * an already-authenticated visitor is left to the protected admin layout
 * (login page is reachable while logged in, which is harmless).
 *
 * `LoginForm` uses `useSearchParams`, so it must be under a `<Suspense>` boundary
 * on Next 16 to avoid de-opting the page to client-side rendering.
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
          登入
        </h1>
        <div className="flex justify-center">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
