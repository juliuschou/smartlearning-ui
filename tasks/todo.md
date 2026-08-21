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

## 2026-08-20 — US-F7 使用者設定與變更密碼（完成；DB 驗證受環境阻塞）

### Goal and acceptance criteria

- [x] 完成 backend R-F7-3 common-password rejection 與 R-F7-7 account/source dual login rate limit，保留既有未相關工作樹變更。
- [x] 完成/修正 role-neutral `/settings/password`、force-change gate、voluntary change、session cache seed/rotation 與 CSRF。
- [x] 新增 backend policy/limiter 與 frontend ChangePasswordForm regression tests。
- [x] 跑 targeted → module/full verification；PostgreSQL 已可用，DB-backed verification 完成。

### Checkpoints

- [x] A — audit and harden existing backend F7 work.
- [x] B — fix frontend force-change/retry behavior and add F7 component tests.
- [x] C — run verification, inspect both repositories, and record results; static and DB-backed checks pass.

### Risk & rollback

- Risk: high (authentication, password state, session rotation, rate limiting).
- Rollback: revert/remove only F7 files and wiring; no schema migration. Preserve unrelated backend README/live-session/lesson changes.

### Dependencies & environment

- Node 24+, backend migrated `smartlearning_test` for DB-backed e2e, explicit backend CORS including `http://localhost:3001` for browser smoke.

### Working notes

- StepUpDialog/useStepUp are explicitly deferred to F8; self-service change-password uses inline current-password verification.
- Backend is a separate dirty repository; UI is clean at start. Do not commit without explicit request.

### Results

- **What changed**: hardened the existing change-password form with latched force-change mode and Unicode code-point validation; carried/displayed `retryAfterSeconds`; fixed stale F7 comments; added the dedicated `ChangePasswordForm` Vitest suite.
- **Frontend verification**: `npx next typegen`, `npm test` (5 files / 36 tests), `npm run typecheck`, `npm run lint:check`, and `npm run build` all passed. One pre-existing React Hook Form compiler warning remains in `AccountCreateForm.tsx`; Vite also reports a future ESM config warning.
- **Backend verification**: targeted typecheck/lint/format/build and 3 F7-related unit suites (33 tests) passed; the full backend static/unit pass also passed (21 suites / 120 tests before the final targeted additions).
- **DB-backed verification**: `NODE_ENV=test npm run prisma:migrate:status` passed with 12 migrations and 0 pending; auth-rate-limit e2e passed (7/7), auth-courses e2e passed (14/14), and identity integration passed (7/7). The original `P1001` was not reproduced; only non-fatal Nest `LegacyRouteConverter` startup warnings appeared.

## Known gaps (mark in code + delivery)

- F6 historical note: the original mustChangePassword redirect pointed to a not-yet-implemented F7 route; US-F7 work below supersedes that gap.
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

## 2026-08-21 — 角色專屬首頁（完成）

### Goal and acceptance criteria

- [x] Admin 登入後可在既有 admin shell 下進入 `/admin`，看到 accessible heading、說明與 `/admin/accounts/new` CTA。
- [x] Student `/student` 與 `useMyCourses()` 的 student-only gate、loading/error/empty/data 狀態維持不變。
- [x] Teacher 新增受保護 `/teacher` route group，landing 只顯示 `SessionDto` 的 displayName、username、role、canCreateCourse。
- [x] Admin/student/teacher 無 `next` 時分別導向 `/admin`、`/student`、`/teacher`；未知 role 維持 `/` 防禦性 fallback。
- [x] `mustChangePassword` 優先於 `next` 與 role check；forced teacher password change 完成後導向 `/teacher`。
- [x] 未登入/錯誤 role 在 children render 前導向 encoded `/login?next=...`；既有 open-redirect 防護不退化。
- [x] 不修改 backend、schema、API/query contract、public `/`、student flow 或新增依賴/mock API 資料。

### Checkpoints

- [x] A — 更新 login/password-change role mapping 與 auth regression tests。
- [x] B — 新增 admin landing、teacher layout/page/view。
- [x] C — 新增 admin/teacher route and component regression tests。
- [x] D — 執行 typegen、targeted tests、typecheck、lint、build、diff check，並記錄結果。

### Risk & rollback

- Risk: medium（auth-adjacent redirect 與 protected route）；無資料遷移或 backend 變更。
- Rollback: 僅移除本 slice 新檔案、teacher mapping 與對應 tests；保留既有未提交 `tasks/todo.md` 內容，不 reset 整個 working tree。

### Dependencies & environment

- UI repo `/home/user/projects/smartLearning/smartLearning-ui`；Node 24+、Next 16.3.1、React 19、React Query 5。
- Component/static verification 不需 backend 或 migrated DB；browser runner/spec 目前缺失，非必要證據。

### Working notes

- 角色首頁執行方案已存在於 `/home/user/projects/smartLearning/docs/智學互動平台/50_實作與測試/角色專屬首頁實作計畫-執行方案.md`；本 slice 依其 frontend-only scope 執行。
- 既有學生與 public starter route 不重建；teacher view 不新增 API/query。

### Results

- **What changed**: 新增 `/admin` 靜態管理首頁與建立帳號 CTA；新增受保護 `/teacher` route/layout/page 與 session-only `TeacherHomeView`；login 與 forced password-change 的 teacher fallback 改為 `/teacher`；補齊 auth、admin、teacher route/view regression tests。
- **Where**: `app/(admin)/admin/page.tsx`、`app/(teacher)/layout.tsx`、`app/(teacher)/teacher/page.tsx`、`features/teacher/TeacherHomeView.tsx`、兩個 auth feature/test，以及三個新首頁測試；未修改 backend、student flow 或 public root。
- **How verified**: `npx next typegen`、targeted Vitest（6 suites / 36 tests）、`npm run typecheck`、`npm run lint:check`、`npm run build`（10 pages）、`git diff --check` 全部通過。
- **Warnings**: lint 僅有既存 `features/admin/AccountCreateForm.tsx:68:16` React Compiler `watch()` memoization warning；另有非阻塞 Vitest/Vite config loader warning，均非本 slice 引入。
- **Lessons recorded**: `tasks/lessons.md` 補記 Vitest hoisted mock、全域替換 mock state，以及 test lifecycle import 的 tripwires。

## 2026-08-21 — US-F16 開課授權旗標（前端／靜態完成；真實驗收 Blocked）

### Goal and acceptance criteria

- [x] 依執行方案完成正式契約輸入與 F8 最小帳號列表／詳情承載頁；未猜測 API、角色、query key 或文案。
- [x] 以 server 狀態驅動可存取的 `canCreateCourse` switch，成功後以 response seed + query invalidation/refetch，失敗不保留 local-only 成功狀態。
- [x] 維持 permission toggle 與 account disable/restore、CLI credential revoke 的邊界。
- [x] 補齊目標元件/API 測試與靜態 gate；真實 backend/DB 無法執行的項目明確標記 Blocked。

### Checkpoints

- [x] A — 契約、帳號 route/data/query key 與 backend endpoint 已實作；`smartlearning_test` migration status 與 account-admin DB-backed e2e 已通過。
- [x] B — 實作 API 型別、GET list/detail hooks、PATCH mutation、accessible switch、admin CTA/routes 與 invalidation。
- [x] C — targeted/full Vitest、typegen、typecheck、lint、build、diff check 與 browser spec discovery 已通過；真實 fixture flow 仍 Blocked。
- [x] D — 已記錄風險、回滾與驗收狀態；DB/browser 未完成項明確標為 Blocked，不以 mock/placeholder 降級。

### Risk & rollback

- Risk: high（管理員 authorization boundary、跨 backend/frontend、真實資料保留與 credential side effects）。
- Rollback: 移除 F16 新增的 backend PATCH/DTO/service/tests/docs，再移除 UI switch、mutation、API 型別/hooks/routes/tests；保留既有帳號建立、disable/restore 與 credential 流程，不做資料回滾。

### Dependencies & environment

- Node 24+、Next 16.3.1、React 19、React Query 5；前端預定 `localhost:3001`。
- Backend `localhost:3000` liveness 與 `smartlearning_test` migration/e2e 已可用；真實 browser 仍需 UI `localhost:3001`、明確 CORS、五個 `F16_*` fixture 變數與隔離測試帳號。

### Working notes

- 來源：`/home/user/projects/smartLearning/docs/智學互動平台/50_實作與測試/US-F16 前端實作計畫-執行方案.md`。
- 正式 endpoint：`PATCH /api/v1/admin/accounts/:id/permissions`，body 僅 `{ canCreateCourse: boolean }`，HTTP 200 + `AccountDto`；Session + CSRF + Admin。
- backend permission mutation 使用 row lock、student true 403、同值 no-op，且不撤 session/CLI/token、不修改既有 domain rows。
- Next.js 16 dynamic page 使用 async `params: Promise<{ accountId: string }>`；Playwright runner 使用既有 `playwright` package 的 `playwright/test`，未新增依賴。

### Results

- **What changed (backend)**: 新增 `UpdateAccountPermissionsDto`、`PATCH /admin/accounts/:id/permissions`、`AccountService.updateCourseCreationPermission()`（row lock/student invariant/no-op/單欄位更新）、course-create owner-lock recheck to close the revoke/create TOCTOU, OpenAPI assertion、account-admin F16 e2e cases，以及同步 `docs/frontend-api-reference.md`（含既有 GET list/detail 與 PATCH 契約）。
- **What changed (frontend)**: 新增 `useAccounts`/`useAccount`/`useUpdateAccountPermissions`、request type/query key/error mapping、`AccountsListView`、`AccountDetailView` accessible switch、`/admin/accounts` 與 `/admin/accounts/[accountId]` routes、admin management CTA、component tests，以及 real-backend Playwright spec/runner wiring。
- **Browser test hardening**: the fixture flow now accepts either initial permission value, checks focus/ARIA state, asserts the blocked request leaves the course list unchanged, archives its created course, restores the original permission, and logs out the teacher/admin sessions in `finally` cleanup.
- **Frontend verification**: full `npm test` passed (10 files / 57 tests)；after browser-spec hardening, targeted `npm test -- test/account-detail-view.test.tsx test/accounts-list-view.test.tsx` passed (2 files / 9 tests), `npm run typecheck`、`npm run lint:check`、`npm run build`、`git diff --check` all passed, and `node test/browser/run.mjs --list` discovered 1 Chromium test without executing it. Lint retains one pre-existing React Hook Form warning at `features/admin/AccountCreateForm.tsx:68`；Vitest retains the existing Vite config loader warning.
- **Backend verification**: `npm run typecheck`、`npm run lint:check`、`npm run format:check`、`npm run build`、`npm test -- --runInBand`（21 suites / 121 tests）passed; OpenAPI e2e passed (3 tests); `NODE_ENV=test npm run prisma:migrate:status` passed（12 migrations，schema up to date）；targeted `NODE_ENV=test npm run test:e2e -- --runInBand test/account-admin.e2e-spec.ts` passed（1 suite / 10 tests）。
- **Not yet verified**: real Playwright fixture flow. `node test/browser/run.mjs --list` discovers 1 Chromium test, but all five required `F16_*` fixture variables are unset and UI port `3001` is not listening at the check; the browser flow remains explicitly **Blocked**, not claimed as completed.

## 2026-08-22 — US-F0 老師建立課程前端

### Goal and acceptance criteria

- [ ] 真實 backend/F16 preflight passes before UI edits, or blockers are recorded without mock workarounds。
- [ ] authorized teacher can create a Course with only `name` and optional `description`。
- [ ] Course creation returns server-backed `draft` detail owned by the creator; no co-teaching/transfer/edit scope。
- [ ] denied/stale permission shows stable 403 and creates no Course。
- [ ] CSRF/Origin, accessibility, keyboard, route boundaries, and error states are covered。
- [ ] F1/F9 downstream work is not faked; route status is explicitly completed/blocked/not-applicable。

### Checklist

- [ ] A — backend health, migrations, OpenAPI, F16 permission and CORS/CSRF preflight
- [ ] B — Course types, query keys, create/detail hooks
- [ ] C — create form, `/courses/new`, `/courses/[courseId]`, boundaries and teacher CTA
- [ ] D — component/route/browser regression coverage
- [ ] E — targeted tests, typegen, typecheck, lint, build, diff check, browser discovery
- [ ] F — record Results, acceptance matrix, blocked evidence, risk/rollback notes

### Risk & Rollback

- Risk: medium/high — authenticated mutation, CSRF/Origin, authorization UX and cross-route navigation; no schema migration.
- Rollback: remove/revert only F0 API/types/query keys, feature/routes, CTA, and tests; preserve existing auth/F16/student/teacher work and never reset the backend repository.
- Monitoring signals: stable 403/CSRF errors, no Course ID after denial, no credentials/cookies/CSRF in logs, successful detail GET after 201.

### Dependencies & Environment

- Node 24+, Next 16.3.1, React 19, React Query 5, React Hook Form 7, Zod 4。
- Backend `localhost:3000`, UI `localhost:3001`, explicit `CORS_ORIGIN` including `http://localhost:3001`; current UI env is `NEXT_PUBLIC_API_BASE`。
- Real browser fixture may be blocked if F16 variables or migrated DB are unavailable; do not replace it with MSW/runtime mocks。

### Working notes

- Route group `(teacher)` maps `app/(teacher)/courses/new/page.tsx` to `/courses/new` and `[courseId]` to `/courses/:courseId`。
- POST body must not include `ownerAccountId`, `status`, teacher assignments, or unknown fields。
- `canCreateCourse` is a visibility hint only; backend transaction recheck is the authorization authority。
- F9 route is not yet confirmed; use an explicit non-navigating deferred entry state rather than a dead link or placeholder flow。

### Preflight Results (2026-08-22)

- **Command/scope**: backend health probes, `/api/docs` + `/api/docs-json`, `NODE_ENV=test npm run prisma:migrate:status`, repository status/diff checks, and inspection of F16/course e2e evidence。
- **Result**: backend contract **PASS**; real F16 browser acceptance **BLOCKED**。
- **Evidence**: health/live and health/ready HTTP 200; OpenAPI HTTP 200 with `/api/v1/courses`, `POST` 201 and DTO fields; test database has 12 migrations and is up to date; existing backend e2e records success/403/no-row behavior。
- **Blockers**: required `F16_*` browser fixtures are unset and UI port 3001 is not running, so the real Playwright gate cannot be claimed. Checked-in CORS defaults differ from the UI origin; effective runtime probes currently allow 3001 but launch configuration must be verified。
- **Decision**: per the authoritative US-F0 stop rule (lines 119–130), do not edit F0 product files or claim implementation until the real F16 gate and exact runtime CORS setup are available. Tasks #2–#5 remain pending。
