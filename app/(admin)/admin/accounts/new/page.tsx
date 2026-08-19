import type { Metadata } from 'next';
import { AccountCreateForm } from '@/features/admin/AccountCreateForm';

export const metadata: Metadata = {
  title: '建立帳號 | 智學互動平台',
};

export default function NewAccountPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">建立帳號</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          系統管理員建立老師或管理員帳號。
        </p>
        <div className="mt-6 flex justify-center">
          <AccountCreateForm />
        </div>
      </div>
    </main>
  );
}