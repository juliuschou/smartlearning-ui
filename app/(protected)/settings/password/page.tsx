import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';

export const metadata: Metadata = {
  title: '變更密碼 | 智學互動平台',
};

/**
 * Change-password route — US-F7.
 *
 * Server-component shell for `/settings/password`. The client `ChangePasswordForm`
 * reads the session via `useSession()` to know whether this is a force-change
 * (`mustChangePassword=true`) or a voluntary change, and redirects to the
 * role home after a successful force-change.
 *
 * This page is the gate target referenced by `LoginForm`, `(admin)/layout`, and
 * `(student)/layout` when `mustChangePassword` is true — landing here no longer
 * 404s (it did before US-F7 landed).
 */
export default function ChangePasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">變更密碼</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          設定符合安全規則的密碼（12–128 字元，允許 passphrase）。
        </p>
        <div className="mt-6 flex justify-center">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}