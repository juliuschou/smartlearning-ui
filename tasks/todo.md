# US-F6 — 使用者登入、登出與 Web Session（前端）

## Goal
讓 active 帳號能以帳密登入、取得安全 session、依 `next` 重導回原目的地；mustChangePassword 使用者登入後重導改密碼路由；已登入者可登出，登出後清除 query 快取並以 replace navigation 回登入頁。不實作 F7 變更密碼頁。

## Acceptance criteria
- 登入頁表單（帳號 + 密碼），中文驗證訊息。
- `useLogin` 不附 CSRF（`mutate: false`）；成功後寫 session 快取、依 `next` 重導（open-redirect 防護）。
- `useLogout` 附 CSRF；成功後 `queryClient.clear()`。
- mustChangePassword=true → `router.replace('/settings/password')`（F7 gap，註解標記）。
- admin layout 加 mustChangePassword gate + 登出鈕。
- 錯誤依穩定 `code` 顯示中文，`AUTH_INVALID_CREDENTIALS` 通用訊息，不洩露存在性。
- 抽 `Field`/`inputClass` 共用到 `components/ui/Field.tsx`，`AccountCreateForm` 改 import。

## Checklist
- [x] Plan + acceptance criteria
- [x] 1. `lib/api/types.ts` 加 `LoginPayload`
- [x] 2. `components/ui/Field.tsx` 抽共用；`AccountCreateForm` 改用
- [x] 3. `lib/api/auth.ts` 新增 `useLogin` + `useLogout`
- [x] 4. `features/auth/LoginForm.tsx` 新增
- [x] 5. `components/auth/LogoutButton.tsx` 新增
- [x] 6. `app/login/page.tsx` 改寫
- [x] 7. `app/(admin)/layout.tsx` 加 gate + 登出鈕
- [x] 8. `test/login-form.test.tsx` 新增
- [x] 9. `test/logout.test.tsx` 新增
- [x] 10. 驗證：typegen/typecheck/lint/build/test

## Results
- **What changed**: 登入頁表單（`LoginForm`）、`useLogin`/`useLogout` hooks（login 不附 CSRF via `mutate:false`；logout 成功後 `queryClient.clear()`）、admin shell 加 mustChangePassword gate + 登出鈕（`LogoutButton`）、`Field`/`inputClass` 抽到 `components/ui/Field.tsx` 並讓 `AccountCreateForm` 改用。
- **Where**: 新增 `lib/api/auth.ts`、`features/auth/LoginForm.tsx`、`components/ui/Field.tsx`、`components/auth/LogoutButton.tsx`、`test/login-form.test.tsx`、`test/logout.test.tsx`；改寫 `app/login/page.tsx`、`app/(admin)/layout.tsx`；微調 `lib/api/types.ts`（`LoginPayload`）、`features/admin/AccountCreateForm.tsx`（共用 Field）。
- **How verified**: `npx next typegen` ✓、`npm run typecheck` ✓（0 errors）、`npm run lint:check` ✓（0 errors，2 pre-existing warnings）、`npm run build` ✓（4 routes 靜態預渲染）、`npm test` ✓（3 files / 21 tests passed）。
- **Test scope**: 21 個元件測試（含既有 F5 8 個 + 新增 login 9 個 + logout 3 個 + 1 role-options）。涵蓋驗證、CSRF-exempt 送出、session cache seeding、`next`/mustChangePassword 重導、open-redirect 防護、穩定錯誤碼、logout 清快取。
- **Note**: 修正了既有 `account-create-form.test.tsx` 的 `ApiRequestError` mock constructor 簽章（與真實 `(error: ApiError, status)` 對齊），一併讓 typecheck 全綠。
- **未執行**: 真實後端手動/瀏覽器流程（需後端 `npm run start:dev` + migrated DB + bootstrap admin）。指令見原計畫 §驗證手動流程。

## Known gaps (mark in code + delivery)
- mustChangePassword=true 重導 `/settings/password` → F7 頁面尚未實作（404 預期）。
- 學員/老師專屬首頁尚未實作；非 admin 登入暫重導 `/`。

## Risk & Rollback
- 風險等級：中。觸碰 auth 路由與 admin gate，前端可逆、無資料遷移。
- 受影響：`app/login`、`app/(admin)` admin shell、API client 使用方式（login 不附 CSRF）。
- Rollback：還原 `app/login/page.tsx` 為 placeholder、還原 `app/(admin)/layout.tsx`、移除新檔案。`apiRequest` 不需改本體（login 用 `mutate: false`）。
- 監控信號：cookie/token 不出現在 log（前端不 log credentials）。

## Dependencies & Environment
- Node 24+、Next 16.3.1、React 19、React Query 5、zod 4、react-hook-form 7。
- 後端 `/api/v1/auth/login|session|logout` 已實作（`NEXT_PUBLIC_API_BASE`，預設 `http://localhost:3000/api/v1`）。
- `npx next typegen` 產生 `LayoutProps`/`PageProps`（tsc --noEmit 前必須先跑）。