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

### CP0 execution attempt — 2026-08-22 (initial)

- **Status**: `blocked`; no F0 product files were modified.
- **Evidence**: `curl` health/live, health/ready, and `/api/docs-json` timed out (`HTTP 000`); ports 3000 and 3001 were not listening; `NODE_ENV=test npm run prisma:migrate:status` failed with PostgreSQL `P1001` at `localhost:5432`.
- **Handoff**: `tasks/US-F0-CP0-preflight.md` contains the minimal command/result table, contract revalidation list, and required next action without secrets.
- **Decision**: restore the backend, migrated test DB, UI port 3001, explicit `CORS_ORIGIN=http://localhost:3001`, and isolated F16 fixtures before rerunning CP0. Do not begin CP1–CP5 or use mock/runtime fixtures as a substitute.

### CP0 rerun — 2026-08-22 (environment restored)

- **Status**: `blocked`; environment recovery and the complete CP0 rerun finished without modifying F0 product files.
- **PASS**: backend `/health/live`, `/health/ready`, `/api/docs`, `/api/docs-json`; UI `3001`; backend `3000`; PostgreSQL `5432`/`5433`; Compose database/migrate (`Exited 0`, no pending migrations); `NODE_ENV=test npm run prisma:migrate:status` (12 migrations, `smartlearning_test` up to date).
- **PASS with limitations**: live Course create/detail and `SessionDto.canCreateCourse` contracts; safe CORS/CSRF behavior. Generated OpenAPI has known generic-list/format/nullability gaps.
- **BLOCKED**: exact runtime CORS is `http://localhost:3000,http://localhost:3001` instead of the required single UI origin; all five isolated `F16_*` fixtures are absent; live OpenAPI lacks checked-out F16 `GET /admin/accounts/:id` and `PATCH /admin/accounts/:id/permissions` because the running image is stale relative to the dirty backend tree.
- **Safety**: no mock or runtime fixture substitution, authenticated mutation, mutating browser flow, product-file edit, env-file edit, container removal, or volume deletion was used.
- **Decision**: CP0 remains blocked. Rebuild/recreate the backend from the checked-out F16 source with exact `CORS_ORIGIN=http://localhost:3001`, provide isolated fixtures, rerun CP0, and wait for explicit user confirmation before CP1–CP5.

### CP0 final rerun — 2026-08-22 (dirty F16 source + isolated fixture)

- **Status**: `PASS`; CP0 exit criteria are satisfied. CP1–CP5 were not started.
- **Backend/runtime**: rebuilt from the current uncommitted F16 backend source; isolated `f16isolated` Compose stack is running with `f16-isolated-backend` on `3000`, `f16-isolated-db` on `55433`, and a fresh named fixture volume. The prior `smartlearning-backend` container was stopped only (its container, original DB, and original volume were preserved).
- **Preflight evidence**: health/live, health/ready, and docs JSON HTTP 200; migration exit `0`; `prisma migrate status` found 12 migrations with no pending migrations; OpenAPI 37 paths including F16 account detail and permission PATCH; exact runtime `CORS_ORIGIN=http://localhost:3001`; allowed CORS credentials and no ACAO for an unapproved origin.
- **Fixture evidence**: a fresh admin was compiled-bootstrap provisioned, a unique teacher was created via the real admin API, and the forced password change completed. Target account ID: `01a028b5-c31f-7410-83a5-7032e8e81acd`. Passwords/cookies were kept only in-process and were not persisted or recorded.
- **Real browser evidence**: `node test/browser/run.mjs test/browser/us-f16-account-permission.spec.ts` — Chromium **1 passed** (3.1s), covering server-backed permission state, keyboard/focus/ARIA, revoke→403/no new Course, re-enable→201, archive, restore, and logout cleanup.
- **Safety**: no F0 product files, env files, backend source, existing domain rows, or volumes were reset/deleted; UI `git diff --check` passed.
- **Decision**: stop at CP0 PASS. Do not begin CP1–CP5 without explicit user continuation.

### CP1 disposition — 2026-08-22

- **Status**: `not-applicable`; CP1 的條件式 backend contract slice 不需執行。
- **Evidence**: CP0 final rerun 已確認 Course/session contract、OpenAPI、exact CORS、CSRF/Origin、F16 real browser gate 與 revoke→403/no-new-Course 行為；現有 backend Course controller/DTO/service 亦已具備 request/response、授權重查與 `draft` 建立契約。
- **Scope**: 沒有修改 UI/backend source 或測試，沒有 database/runtime mutation，也沒有 commit。`smartLearning-backend` 既有 Phase B/F16 dirty changes 僅作為基線，未混入本 CP。
- **Verification**: 未重跑 CP1 targeted tests，因本 CP 沒有 implementation delta；本次只記錄 disposition，並以文件 diff/status gate 驗證範圍。
- **Decision**: CP1 記錄為 `not-applicable`；CP2–CP5 維持 pending。開始 CP2 frontend transport 前，需再次取得明確使用者確認。

## 2026-08-22 — US-F0 CP2 前端傳輸切片（完成）

### Goal and acceptance criteria

- [x] 只新增 Course wire types、query keys、transport hooks 與 focused transport tests；不進入 CP3 表單／路由／CTA／detail page。
- [x] `CourseStatus` 僅為 `draft | archived`；`CourseDto` 與 `CreateCoursePayload` 對齊已確認 backend contract。
- [x] `useCreateCourse` 僅送 `name` 與 defined `description`，以 `mutate:true` 經既有 `apiRequest`，成功後才 seed detail cache，無 optimistic Course。
- [x] `useCourse` 轉送 `signal`，空 ID disabled，`retry:false`，`staleTime:30_000`，錯誤保持 typed API error path。
- [x] targeted test、typecheck、diff/scope gate 全部通過。

### Checkpoints

- [x] A — 重新核對現有 API/query-key pattern，建立 CP2 四個預期檔案。
- [x] B — targeted transport test + typecheck；失敗時停留在 CP2 並診斷。
- [x] C — 必要時 typegen，重跑 test/typecheck，執行 diff/scope gate。
- [x] D — 驗證後記錄 Results；CP2 完成即停下並請使用者確認 CP3。

### Risk & rollback

- Risk: medium（authenticated Course mutation/cache wiring；無 schema/server 變更）。
- Rollback: 僅移除 Course types、query keys/hooks 與 focused test；不 reset working tree、不刪 runtime data。

### Dependencies & Environment

- Node 24+、Next 16.3.1、React 19、React Query 5、既有 `apiRequest` client。
- Backend Course create/detail contract 已由 CP0/CP1 證據確認；CP2 驗證只需 UI static/unit tests，不以 mock 取代真實 backend acceptance。

### Working notes

- `MyCourseDto` 是 student enrollment projection，不可當作 teacher-owned `CourseDto`。
- `description` 只在 runtime value 不為 `undefined` 時進入 body；trim/validation 留給 backend contract。
- 不覆寫既有 authoritative `docs/智學互動平台/50_實作與測試/US-F0 CP2 前端傳輸切片實作計畫.md` 或 `US-F0 老師建立課程前端實作計畫.md`。

### Results — CP2 PASS (2026-08-22)

- **What changed**: 新增 `CourseStatus`、`CourseDto`、`CreateCoursePayload`；新增 `queryKeys.courses.all/detail(id)`；新增 `useCreateCourse`（精確重建 body、`mutate:true`、成功後 server-response detail cache seed、無 optimistic update）與 `useCourse`（signal、empty-ID gate、`retry:false`、`staleTime:30_000`）；新增 5 個 focused transport tests。
- **Where**: `lib/api/types.ts`、`lib/api/query-keys.ts`、`lib/api/courses.ts`、`test/courses-api.test.tsx`；本 task log 只記錄驗證結果。沒有 route/page/form/component/CTA/backend/env/dependency 變更。
- **Checkpoint status**: A/B/C/D 全部完成；`npx next typegen` 未執行，因 CP2 沒有 route/generated-type 變更且 `npm run typecheck` 已直接通過。Authoritative CP2 plan 保持不變。
- **Verification**:
  - `npm test -- test/courses-api.test.tsx` → PASS（1 file / 5 tests）。
  - `npm run typecheck` → PASS（0 diagnostics）。
  - `npm run lint:check` → PASS（0 errors；`features/admin/AccountCreateForm.tsx:68` 既有 React Compiler warning）。
  - `npx prettier --check lib/api/types.ts lib/api/query-keys.ts lib/api/courses.ts test/courses-api.test.tsx` → PASS。
  - `git diff --check` → PASS。
  - `git status --short` / `git diff --name-only` scope review → 預期四個 CP2 product files 加本 task log，未見 route/page/backend/env/dependency 變更；untracked product files 已納入檢查。
- **Public hooks**: `useCreateCourse()`、`useCourse(courseId: string)` 可供後續 CP3 UI 使用；沒有新增 runtime mock 或 API fallback。
- **Unresolved downstream blockers**: CP3 route/form 與 CP4/CP5 real backend/Playwright acceptance 尚未開始，依 checkpoint boundary 留待後續確認；CP2 本身無 blocker。
- **Decision**: CP2 到此停止。開始 CP3 前需取得使用者明確確認，不因本次測試通過而自動跨 checkpoint。

## 2026-08-22 — US-F0 CP3-B 建立課程 route shell（完成）

### CP3-B Results — PASS

- **Status**: `PASS`；依 checkpoint 邊界完成 route shell 與 boundaries，並在 CP3 停止。使用者已確認先停在 CP3，未自動進入 CP4。
- **What changed**: 將既有 `CourseCreateForm` 接到受 `(teacher)` route group 保護的 `/courses/new`；新增 Server Component page shell、loading boundary、Client error boundary、not-found boundary，以及 route regression test。
- **Where**: `app/(teacher)/courses/new/page.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx`、`test/course-create-route.test.tsx`。CP3-B 已建立 commit `6d0b2cb`（`feat(courses): add course creation route shell`）。
- **Invariants**: auth、teacher role、`mustChangePassword` 仍由 `app/(teacher)/layout.tsx` 負責；`canCreateCourse` 仍僅控制 teacher-home CTA 可見性；Course owner/status、request payload、CSRF/Origin、server authorization 仍由既有 form/transport/backend 負責。未修改 CP2 transport、CP3-A form/CTA、backend、env、dependencies 或 E2E fixture。
- **Scope guard**: 沒有新增 Course detail route、建立成功後 redirect、F1/F9 流程或任何 CP4/CP5 product work。

### Verification

- `npm test -- test/course-create-form.test.tsx test/teacher-home-view.test.tsx test/course-create-route.test.tsx` → PASS（3 files / 18 tests）。
- `npx next typegen` → PASS（Types generated successfully）。
- `npm run typecheck` → PASS（0 diagnostics）。
- `npm run lint:check` → PASS（0 errors）；保留既有 `features/admin/AccountCreateForm.tsx:68` React Compiler warning。
- `npm run build` → PASS（production build；12/12 pages static generation）。
- `git diff --check` → PASS；commit 後 working tree clean。
- 測試輸出另有非阻塞 Vite config loader ESM warning，未影響結果，未擴大本 checkpoint scope。

### Deferred / not completed

- CP4：Course detail route 與建立成功後導向。
- CP5：真實 backend／Playwright downstream acceptance，以及 F1/F9 行為。
- 未以 mock、placeholder 或 runtime fallback 取代上述尚未完成項。

### Risk & rollback

- **Risk**: medium；route 位於 authenticated mutation 入口，error boundary 必須避免 raw server detail 洩漏，且不可重複實作 client-side authorization。
- **Rollback**: 使用 `git revert 6d0b2cb` 移除本 checkpoint 的四個 route 檔與 route test；保留 CP2、CP3-A，不 reset working tree、不刪除 runtime/domain data、不觸碰 sibling backend。

### Checkpoint decision

- CP3-B 已完成並通過 static verification，停在 **CP3 PASS**。未收到新的明確確認前，不開始 CP4 或修改後續 F0 product scope。

## 2026-08-22 — US-F0 CP4 Course detail 前端實作（進行中）

### Goal and acceptance criteria

- [ ] 建立成功只使用 server response 的 Course ID，以 same-origin `router.replace('/courses/:id')` 導向真實 detail。
- [ ] `/courses/[courseId]` 使用 Next 16 async `params: Promise<{ courseId: string }>`，並受既有 `(teacher)` layout 保護。
- [ ] Detail 由 `useCourse(courseId)` 取得 server state，呈現 name、exact `draft|archived` status、ownerAccountId 與唯一老師語意。
- [ ] loading、unexpected error、query 404 與 route not-found 不洩漏 Course ID/raw backend detail；F9 維持明確 blocked/deferred 且不可導航。
- [ ] 補齊 create redirect、detail view、route/boundary focused regression tests 與 static gates；不修改 backend/transport/依賴。

### Checklist

- [ ] A — 重新確認 CP4 contract、既有 patterns 與 Next 16 route conventions
- [ ] B — create success redirect 與 CourseDetailView
- [ ] C — dynamic route、loading/error/not-found boundaries
- [ ] D — focused form/detail/route regression coverage
- [ ] E — targeted tests、typegen、typecheck、lint、build、diff/scope checks
- [ ] F — 更新 Results、F9 blocked、CP5 residual blocker、rollback notes

### Risk & Rollback

- Risk: medium；主要風險是 server ID 導向錯誤、dynamic params 使用錯誤，以及 404/exception 洩漏 Course 存在性或 raw backend detail。
- Rollback: 僅移除 CP4 redirect、detail feature、dynamic route/boundaries、focused tests 與本 task-log section；保留 CP2/CP3、auth/F16、backend 與 runtime/domain data，不 reset working tree。
- Monitoring signals: create success 後 detail GET 成功；denied/404 不產生新 Course、沒有 raw ID/message 出現在 UI，F9 不出現 dead link。

### Dependencies & Environment

- Node 24+、Next 16.3.1、React 19、React Query 5、React Hook Form 7、Zod 4。
- Backend Course create/detail contract 與 F16 gate 已由 CP0 final rerun/CP2/CP3 evidence 確認；本 CP 不改 backend。
- CP5 real Playwright 仍需 isolated fixture、UI `3001`、backend `3000` 與 exact CORS；不可用 mock/runtime fixture 取代。

### Working notes

- `useCourse(courseId)` 已存在並使用 `GET /courses/:id`、`retry:false`、typed `ApiRequestError`。
- Query 404 由 client view 顯示 generic no-enumeration；route `not-found.tsx` 只作 route-local boundary，不為此新增 server-side fetch/shortcut。
- F9 題目入口尚未獲權威確認，CP4 只保留 non-navigating blocked state。

### Results — CP4 PASS（2026-08-22）

- **Status**: `PASS`；Course detail 前端 slice 完成，未修改 backend、transport contract、env 或 dependencies。
- **What changed**: 建立成功後以 server response 的 `course.id` 呼叫 same-origin `router.replace('/courses/:id')`；新增受 `(teacher)` protected route group 保護的 `/courses/[courseId]`，以 Next 16 async `params` 傳入既有 `useCourse(courseId)`；新增 server-backed detail view 與 route-local loading/error/not-found boundaries。
- **Detail behavior**: 顯示 server `name`、精確 `draft`/`archived` status、`ownerAccountId`，並明確說明 owner 是唯一老師；query 404 使用 generic no-enumeration UI，其他錯誤使用 stable-code `ErrorAlert`；未知資料狀態使用安全 fallback，不渲染 Course ID 或 raw backend message。
- **F9 / CP5 boundary**: F9 題目功能維持 non-navigating blocked state，沒有 dead link、假頁面或 placeholder route。CP5 real backend/Playwright acceptance 未執行，仍需 isolated fixture、UI `3001`、backend `3000` 與 exact runtime CORS，未以 mock/runtime fixture 取代。
- **Where**: `features/courses/CourseCreateForm.tsx`、`features/courses/CourseDetailView.tsx`、`app/(teacher)/courses/[courseId]/page.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx`、`test/course-create-form.test.tsx`、`test/course-detail-view.test.tsx`、`test/course-detail-route.test.tsx`；本 task log 同步記錄結果。未修改 backend 或既有 transport files。

### Verification

- [x] A — contract、既有 patterns 與 Next 16 route conventions 已重新確認。
- [x] B — create success redirect 與 `CourseDetailView` 完成。
- [x] C — dynamic route、loading/error/not-found boundaries 完成。
- [x] D — focused regression coverage 完成：`npm test -- test/course-create-form.test.tsx test/course-detail-view.test.tsx test/course-detail-route.test.tsx` → PASS（3 files / 21 tests，0 failed，0 skipped）。
- [x] E — `npx next typegen` → PASS；`npm run typecheck` → PASS（0 diagnostics）；`npm run lint:check` → PASS（0 errors，保留既有 `features/admin/AccountCreateForm.tsx:68` React Compiler `watch()` warning）；`npm run build` → PASS（Next 16.3.1/Turbopack，TypeScript、12/12 static pages）；`git diff --check` → PASS；status/name-only scope review 僅見 CP4 product/test files 與 task log。
- [x] F — Results、F9 blocked、CP5 residual blocker、risk/rollback notes 已記錄。

### Acceptance matrix

- **Create redirect**: PASS — only the server-returned Course ID builds the same-origin detail URL; validation and mutation failure paths do not navigate.
- **Protected route / params**: PASS — route remains under `(teacher)` and awaits `params: Promise<{ courseId: string }>`; auth and role gates remain in the existing layout.
- **Server-backed projection**: PASS — detail reads through `useCourse(courseId)` and preserves the backend lifecycle value and owner ID.
- **Privacy/error boundaries**: PASS — typed 404, unexpected errors, and route boundaries use curated generic output without Course IDs or raw backend details.
- **F9**: BLOCKED — authoritative question route/API is not confirmed; only a non-interactive deferred state is shown.
- **CP5**: BLOCKED / deferred — real backend Playwright acceptance was intentionally not claimed in CP4.

### CP4 decision

CP4 is complete and verified at the focused/static level. Do not begin CP5, F1, or F9 without a new explicit user request and the required backend/browser acceptance conditions.

## 2026-08-22 — US-F0 CP5 real-backend Playwright spec

### Goal and acceptance criteria

- [x] Add only the authoritative `test/browser/us-f0-course-flow.spec.ts` and this CP5 handoff; preserve product, backend, dependency, env, runner, and Playwright config scope.
- [x] Implement coverage for the authorized teacher Course create/detail flow through real UI at 390×844 with keyboard navigation, exact Origin/CSRF/request-body assertions, server-ID redirect, detail reload, and desktop overflow smoke coverage.
- [x] Implement coverage for missing-CSRF/disallowed-Origin no-row invariants and stale teacher-session reauthorization after admin permission revoke.
- [x] Implement scoped cleanup that archives only this run's successful Course UUIDs, restores the original permission, logs out both contexts, and surfaces cleanup failures.
- [x] Because runtime/fixture prerequisites are absent, record real-browser acceptance as `blocked`, never as skipped success or a mock substitute.

### Checklist

- [x] A — inspect CP5 contract, selectors, request/session conventions, and runtime gate.
- [x] B — implement context-bound spec and local helpers.
- [x] C — run targeted/full static verification and browser discovery.
- [x] D — preserve blocked evidence for the gated real browser flow; do not run a live mutating command without isolated fixtures and explicit authorization.
- [x] E — review diff scope and append sanitized Results/acceptance matrix.

### Risk & rollback

- Risk: medium/high — authenticated Course creation/archive and admin permission mutation affect isolated fixture state.
- Rollback: remove only the CP5 spec and this CP5 task-log section; do not reset unrelated UI/backend changes or delete runtime data.
- Safety: use `--workers=1`, exact returned UUID tracking, no credentials/cookies/CSRF/raw messages in output, and no delete/truncate/Compose teardown.

### Dependencies & Environment

- Node 24+, Next 16.3.1, Playwright 1.62.1; backend 3000, UI 3001, migrated isolated DB, exact runtime `CORS_ORIGIN=http://localhost:3001`, source/runtime parity, and all `F0_*` fixture variables.

### Working notes

- CP5 spec uses two independent `browser.newContext()` instances and each context's `request` API; the standalone Playwright `request` fixture is not used.
- `canCreateCourse` is only a UI visibility hint; the Course create transaction is the authorization authority.
- F9 remains explicitly deferred/non-navigating.
- The browser gate was not substituted with skipped assertions, mocks, placeholders, backend changes, or runtime workarounds.

### Results — static implementation PASS; real browser acceptance BLOCKED (2026-08-22)

- **What changed**: added `test/browser/us-f0-course-flow.spec.ts` only for the CP5 real-backend flow. The spec reads only the allowed `F0_*` variables, uses independent admin/teacher contexts, context-bound request APIs, server-returned Course IDs, exact mutation headers/body checks, keyboard/focus/ARIA assertions, no-row security invariants, stale-session reauthorization, and archive-only cleanup.
- **Safety hardening after review**: the mutating test now fails closed unless all eight fixture/runtime variables are present and the API/UI targets have valid expected URL shapes; Course IDs enter cleanup only after exact name/owner/draft plus baseline-difference validation; uncertain POSTs use unique-name owner-scoped reconciliation with detail verification; archive attempts continue independently and aggregate failures.
- **Static verification**: `npx prettier --write test/browser/us-f0-course-flow.spec.ts` → PASS; `npx next typegen` → PASS; targeted Course tests (3 files / 21 tests) → PASS; `npm run typecheck` → PASS (0 diagnostics); `npm run lint:check` → PASS (0 errors, one pre-existing React Hook Form `watch()` warning at `features/admin/AccountCreateForm.tsx:68`); `npm run build` → PASS; `git diff --check` → PASS; full `npm test` → PASS (15 files / 87 tests); `node test/browser/run.mjs --list` → PASS (2 Chromium tests discovered).
- **Runtime probes**: backend health/live, health/ready, and `/api/docs-json` returned HTTP 200 during preflight; these probes did not perform authenticated mutations.
- **Real browser status**: **BLOCKED**. All required F0 fixture variables were absent at the gate, and the live mutating browser command was not executed after the execution guard denied the delegated action. No Course was created or archived, no permission was changed, no session was logged out by CP5, and no cleanup path was exercised.
- **Acceptance matrix**:
  - CP5 spec scope and context-bound API usage: **PASS** (static inspection/typecheck).
  - Teacher create/detail, server-ID redirect, exact request contract, keyboard/accessibility, and desktop overflow: **BLOCKED** (requires real fixtures and live browser execution).
  - Missing-CSRF/disallowed-Origin no-row invariants: **BLOCKED** (requires authenticated live teacher context).
  - Admin UI revoke and stale teacher-session `403 FORBIDDEN`: **BLOCKED** (requires authenticated live admin/teacher fixtures).
  - Archive-only cleanup, permission restoration, logout, and cleanup-failure propagation: **NOT EXERCISED** (correctly not claimed while the gated test was blocked).
  - F9: **BLOCKED/deferred**; the spec asserts the existing non-navigating deferred state and adds no question flow.
- **Scope review**: changed files are `test/browser/us-f0-course-flow.spec.ts`, `tasks/todo.md`, and the required `tasks/lessons.md` lesson for the earlier zsh preflight error. No product source, backend source, dependency/lockfile, env file, Playwright config, runner, database row, or runtime volume was changed.
- **Decision**: CP5 implementation and static evidence are complete, but CP5 real-backend acceptance remains **BLOCKED**, not a real-E2E success. Rerun the gated browser command only with isolated F0 fixtures and explicit authorization for its authenticated Course/permission mutations.

### Commit record

- CP5 browser coverage and the related task records were committed as `128e9b5` (`test(browser): add US-F0 Course flow coverage`) on 2026-08-22.

## 2026-08-24 — US-F0 CP5 live run — real-browser acceptance BLOCKED by a spec assertion bug

### Context

- CP-C (isolated fixture provisioning) had already been completed in a prior authorized session: admin `cp5admin` + teacher `cp5teacher` provisioned, forced password change done, and the 8 `F0_*` vars persisted in a transient `chmod 600` file `/tmp/us-f0-cp5-fixture.env`. Isolated project `smartlearning-cp5-f0-20260824` was healthy (backend 3000, db 55436, migrate exit 0, `CORS_ORIGIN=http://localhost:3001`).
- This session executed the authorized **CP-D live Playwright run** and then recorded CP-E per the execution plan. User instruction: authorize CP-D, then commit the CP-E documentation.

### CP-D result — FAIL (blocked), with root cause identified

- Ran: `node test/browser/run.mjs --workers=1 test/browser/us-f0-course-flow.spec.ts` (fixtures sourced from the transient env file). Result: **1 failed** — never `test.skip` (fail-closed gate held).
- **Failure point**: `Enable teacher course permission did not send the exact UI Origin` at `assertMutationHeaders` (spec line 357). Cleanup also reported failures: `restore original teacher permission, teacher logout`.
- **Root cause (confirmed, not a backend/UI defect)**: The browser **does** send `Origin: http://localhost:3001` + a non-empty `X-CSRF-Token` on the PATCH (proven via the HAR trace snapshot and via `request.allHeaders()` which returned `origin: "http://localhost:3001"`). But the spec reads **`request.headers()`**, and on a real cross-origin request Playwright's `headers()` **omits the `Origin` key** → `headers.origin` is `undefined`. So `headers.origin !== uiOrigin` becomes `undefined !== "http://localhost:3001"` → false-negative throw. The CSRF sub-check passes because the `x-csrf-token` key _is_ present in `headers()`. Fix is to read `request.allHeaders()` in `assertMutationHeaders`.
- **Fixture side-effect during diagnosis**: the teacher `can_create_course` was toggled to `true` (from the provisioning baseline `false`) during isolated diagnostic runs, and a restore attempt was declined at the permission gate. **Fixtures are not at baseline** — the fixture is left with `cp5teacher.can_create_course = true`. No Course rows exist.

### CP-E record — acceptance matrix

- CP5 spec scope / context-bound API usage: **PASS** (static inspection + typecheck, as prior).
- Teacher create/detail, server-ID redirect, exact request contract, keyboard/a11y, desktop overflow: **BLOCKED** (live run never advanced past the admin permission PATCH due to the spec bug).
- Missing-CSRF / disallowed-Origin no-row invariants: **BLOCKED** (never reached).
- Admin revoke → stale teacher `403 FORBIDDEN` curated UI: **BLOCKED** (never reached).
- Archive-only cleanup / permission restore / logout: **NOT EXERCISED** (the run aborted at the first PATCH assertion; cleanup attempted but the restore/logout themselves reported failure).
- Real-browser end-to-end matrix: **NOT ACHIEVED**. CP5 remains **BLOCKED** pending a spec fix (`request.allHeaders()`), fixture re-baselining, and an authorized re-run.

### Decisions

- Stop here per user instruction. Do not restore the fixture, do not modify product code, do not fix the spec, do not re-run, and do not commit — until a new explicit request.
- Fixture state to correct before any future CP5 rerun: set `cp5teacher.can_create_course` back to `false` (CP-C baseline) and confirm `courses = 0`.

### Sanitization / safety

- No credentials, cookies, CSRF tokens, session values, or raw backend messages appear in this record or were committed. The transient env file `/tmp/us-f0-cp5-fixture.env` was **not** deleted (it was not part of an approved destructive step this session); delete it before any later run per the plan, or reuse per explicit approval.

## 2026-08-25 — US-F0 CP5 live run close-out — real-browser acceptance PASS

### Context

- Executed the `2026-08-24` 收尾計畫 checkpoints in sequence with explicit user authorization (CP-A′ spec fix → static gate → CP-B baseline verify → CP-C live run → CP-D docs/commit). CP-A (Origin `allHeaders()` fix) was already committed in a prior session as part of the spec work; the outstanding work below is a second spec locator fix surfaced by the live run.
- The isolated project `smartlearning-cp5-f0-20260824` was healthy (backend 3000, db 55436, UI 3001, `CORS_ORIGIN=http://localhost:3001`), fixtures sourced from `/tmp/us-f0-cp5-fixture.env`.

### CP-B baseline verify — PASS

- `cp5teacher`: role `teacher`, `can_create_course=f`, `status=active`, `must_change_password=f` — matches CP-C baseline.
- `cp5admin`: role `admin`, `status=active`.
- Isolated DB `course` count = **0** (no residual rows). Services healthy; fixture env had all 8 `F0_*` vars.

### CP-A′ spec fix — second locator bug (spec, not product/backend)

- The first live attempt (Origin fix verified) advanced to the revoked-permission step and failed at spec line 1013: `getByRole("alert")` **strict-mode violation** — it resolved to 2 elements because Next.js's route announcer (`__next-route-announcer__`) also carries `role="alert"`, alongside the real `ErrorAlert id="form-error"`.
- **Root cause (confirmed, not a backend/UI defect)**: the product renders the curated `FORBIDDEN` message (`你沒有權限執行此操作。`, mapped in `lib/api/error-messages.ts:20`) via `ErrorAlert id="form-error"` (`CourseCreateForm.tsx:78`). The assertion locator was not unique.
- **Fix**: `teacherPage.getByRole("alert")` → `teacherPage.locator("#form-error")` at spec line 1013.
- **Static gate**: `npm run typecheck` PASS (0 diagnostics); `npm run lint:check` PASS (0 errors, pre-existing `AccountCreateForm.tsx` warning only); `npx prettier --check` PASS; `git diff --check` PASS; scope = only `test/browser/us-f0-course-flow.spec.ts`.

### CP-C live run — PASS

- Ran: `set -a; source /tmp/us-f0-cp5-fixture.env; set +a; node test/browser/run.mjs --workers=1 test/browser/us-f0-course-flow.spec.ts`.
- Result: **1 passed** (Chromium, 2.6s) — `US-F0 real-backend Course flow › teacher creates and reloads a Course, then respects revoked permission`.
- The full matrix now passes end-to-end: teacher create/detail, server-ID redirect, exact request contract (incl. the previously-failing Origin assertion via `allHeaders()`), missing-CSRF / disallowed-Origin no-row invariants, admin revoke → stale teacher `403 FORBIDDEN` curated `#form-error` UI, keyboard/a11y, desktop overflow.

### CP-E record — acceptance matrix (final)

- CP5 spec scope / context-bound API usage: **PASS**.
- Teacher create/detail, server-ID redirect, exact request contract, keyboard/a11y, desktop overflow: **PASS** (live run).
- Missing-CSRF / disallowed-Origin no-row invariants: **PASS** (live run).
- Admin revoke → stale teacher `403 FORBIDDEN` curated UI: **PASS** (live run, `#form-error`).
- Archive-only cleanup / permission restore / logout: **PASS** (live run; post-run fixture at baseline — `cp5teacher.can_create_course=f`, both created course rows `archived`).
- Real-browser end-to-end matrix: **ACHIEVED**. US-F0 CP5 real-backend acceptance is **CLOSED**.

### Decisions

- The spec fix and this close-out are committed as the CP5 resolution. Fixture returned to baseline by the spec's own archive-only cleanup; no manual restore needed.
- Per repo convention, work stops at this checkpoint boundary pending explicit user instruction for any downstream F0 work (F1/F9).

### Sanitization / safety

- No credentials, cookies, CSRF tokens, session values, or raw backend messages appear in this record or were committed. The transient env file `/tmp/us-f0-cp5-fixture.env` remains undeleted (not part of an approved destructive step); reuse per explicit approval or delete before a future unrelated run.

## 2026-09-02 — FE-1.1 Transport contract closure

### Goal and acceptance criteria

- [x] Align account/session role and student course lifecycle types with the approved BE contract.
- [x] Preserve exact student account creation payload semantics (`role: "student"`, `canCreateCourse: false`).
- [x] Add explicit `/me/courses` pagination transport, normalized defaults, and collision-free React Query keys.
- [x] Preserve student-only gating, abort signal forwarding, `retry: false`, inner Page projection, and curated error handling.
- [x] Add direct transport-boundary regression tests without changing `lib/api/client.ts`.
- [x] Keep scope limited to approved FE-1.1 files; routes, layouts, backend, env, dependencies, and non-approved WBS changes were not modified.

### Checkpoint status

- [x] CP0 — provisional contract dispositions recorded (2026-09-02).
- [x] CP1 — existing implementation plus minimum reinforcement approved (2026-09-02).
- [x] CP2 — production diff scope review before verification (approved 2026-09-02).
- [x] CP3 — focused evidence review (4 files / 26 tests passed, 2026-09-02).
- [x] CP4 — static/regression/scope review (full gates and scope approved 2026-09-02).
- [x] CP5 — optional real-backend smoke deferred by user (2026-09-02); no DB/browser mutation run.
- [x] CP6 — final WBS approval; FE-1.1.1–FE-1.1.5 marked `[x]` with explicit user authorization (2026-09-02).

### Risk & Rollback

- Risk: medium-low; no DB/schema/backend change, with role narrowing and pagination cache identity as the main compatibility risks.
- Rollback: revert only the approved FE-1.1 production/test files; restore response fields to `string` or remove pagination parameters if the frozen contract is later rejected. Do not reset unrelated work or delete runtime data.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, React 19, React Query 5, Vitest, and the existing `apiRequest` client.
- Next.js route type generation is already available; no route files are being changed in this slice.
- Backend contract is accepted provisionally; BE-1/BE-2 formal freeze and WBS release acceptance remain outside this implementation.

### Working Notes

- Approved production files: `lib/api/types.ts`, `lib/api/accounts.ts`, `lib/api/query-keys.ts`, `lib/api/enrollments.ts`.
- Approved test files: `test/account-create-form.test.tsx`, `test/my-courses-view.test.tsx`, `test/enrollments-api.test.tsx`, `test/api-client.test.ts`.
- Keep `lib/api/client.ts` unchanged unless a direct regression proves a frozen-contract mismatch; stop and report blast radius before expanding scope.
- Keep account `status: "active"` fixtures unchanged; only course lifecycle status fixtures may change from the old mixed value.

### Checklist

- [x] Implement approved type narrowing and stale-comment/test documentation fixes.
- [x] Implement normalized pagination params and cache-key factory.
- [x] Add student payload, enrollment transport, and API client boundary tests.
- [x] Run scope/diff review and stop at CP2 before verification (approved 2026-09-02).
- [x] Run focused tests and static/regression gates after CP2 approval.
- [x] Record Results and any deferred/blocking items after later checkpoint approvals.

### Results — FE-1.1 Transport contract closure (2026-09-02)

- **What changed:** aligned account/session role and student course lifecycle types; preserved student account creation transport and added exact payload coverage; added pagination-aware `/me/courses` transport with normalized defaults and collision-free query keys; added direct enrollment and API-client boundary regression tests.
- **Production files:** `lib/api/types.ts`, `lib/api/accounts.ts`, `lib/api/query-keys.ts`, `lib/api/enrollments.ts`.
- **Test files:** `test/account-create-form.test.tsx`, `test/my-courses-view.test.tsx`, `test/enrollments-api.test.tsx`, `test/api-client.test.ts`.
- **Verification:** focused tests 4 files / 26 tests; static gates passed; full unit suite 17 files / 100 tests; Next.js build passed with 12 routes; final `git diff --check` passed.
- **Scope:** no route/layout, backend, schema, env, dependency, config, or `lib/api/client.ts` production changes; no mock/fallback data added.
- **Acceptance:** CP5 real-backend smoke explicitly deferred; FE-1.1.1–FE-1.1.5 WBS checkboxes updated only after explicit user authorization. BE-1/BE-2 formal freeze and release acceptance remain independent and unclaimed.

### Review follow-up

- Fixed the non-student gate assertion to reject any roster request, including the paginated URL.
- Changed the malformed-response boundary test to use a versioned API path rather than the raw health-probe namespace.
- Synchronized the task-log acceptance checklist and CP6 traceability status with the approved WBS update.

### Verification evidence so far

- Focused Vitest: 4 files / 26 tests passed.
- Static gates: `next typegen`, `typecheck`, `lint:check`, and targeted Prettier check passed; one pre-existing React Compiler warning remains.
- Full Vitest: 17 files / 100 tests passed.
- Production build: Next.js 16.3.1 Turbopack passed; 12 routes generated (11 static, 1 dynamic).
- `git diff --check`: passed with no output after the original FE-1.1 documentation update; review-fix diff also passed.
- Review-fix verification: targeted Vitest 2 files / 10 tests, typecheck, lint, and final diff check all passed; existing Vite config and React Compiler warnings remain non-blocking.

### CP6 traceability table — WBS checkbox approval recorded

| WBS item | Production evidence                                                                                                                | Test evidence                                                                                                     | Dependency / acceptance status                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FE-1.1.1 | `lib/api/types.ts`: `AccountRole`, account/session role narrowing, course lifecycle status narrowing                               | `test/account-create-form.test.tsx`, `test/my-courses-view.test.tsx`                                              | CP0 C0-2/C0-3 approved; BE-1/BE-2 formal freeze remains outside this slice |
| FE-1.1.2 | `lib/api/accounts.ts`: existing `POST /admin/accounts` + `mutate: true` preserved; stale comment corrected                         | Exact student payload assertion in `test/account-create-form.test.tsx`                                            | Student payload verified; no client/backend rewrite                        |
| FE-1.1.3 | `lib/api/enrollments.ts`: explicit `page`/`pageSize`, defaults `1/20`, `URLSearchParams`, signal forwarding                        | Default/custom request assertions in `test/enrollments-api.test.tsx` and `test/my-courses-view.test.tsx`          | `/me/courses` transport verified at unit boundary; real smoke deferred     |
| FE-1.1.4 | `lib/api/query-keys.ts`: root `all` plus parameterized `list(page,pageSize)`; hook preserves student gate/no retry/Page projection | Cache identity, gate, projection, signal, retry, and error identity assertions in `test/enrollments-api.test.tsx` | No pagination UI, prefetch, or infinite query added                        |
| FE-1.1.5 | `lib/api/client.ts` unchanged; existing centralized unwrap/error path retained                                                     | Direct boundary assertions in `test/api-client.test.ts`; existing curated error tests remain green                | No raw backend message rendered; no production client mismatch found       |

**BE dependency disposition:** CP0 `ACCEPT-PROVISIONAL`; this implementation verifies FE transport against current runtime/reference evidence and does not claim BE-1/BE-2 formal contract freeze.

**Real-backend evidence:** CP5 explicitly deferred; no authenticated browser or database-writing smoke was executed for FE-1.1.

**Remaining boundary:** WBS FE-1.1.1–FE-1.1.5 checkboxes were explicitly approved and updated; BE-1/BE-2 release acceptance remains independent and is not closed by this UI verification.

## 2026-09-03 — FE-1.2 Routing／authorization

### Goal and acceptance criteria

- [ ] Student login without a valid `next` uses `router.replace("/student")`.
- [ ] Session loading renders no protected children.
- [ ] Missing sessions redirect to `/login?next=<encoded pathname>`.
- [ ] Admin/teacher sessions never render Student children.
- [ ] `mustChangePassword=true` takes precedence and redirects to `/settings/password`.
- [ ] Any authenticated role, including a forced-password user, can remain on the role-neutral password settings route.
- [ ] Logout keeps the CSRF-aware mutation, clears the complete local QueryClient cache on success and failure, preserves failure UI, and replaces history with `/login`.
- [ ] StudentLayout, ProtectedLayout, and logout success/failure paths have direct regression coverage.
- [ ] Targeted/full unit, typegen, typecheck, lint, build, and diff checks pass; browser cases are explicitly classified before WBS closeout.

### Checkpoint status

- [x] CP0 — baseline and scope audit completed (2026-09-03).
- [x] CP1 — minimal implementation and focused regression review completed after user confirmation (2026-09-03).
- [x] CP2 — full static verification completed; browser matrix constrained by missing fixtures (2026-09-03).
- [x] CP3 — task Results closeout completed with user-accepted constrained browser evidence; WBS intentionally unchanged (2026-09-03).

### FE-1.2.1–FE-1.2.6 audit matrix

| WBS item                            | Existing production evidence                                                                                                     | Existing test evidence                                                                                                       | Gap / disposition                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| FE-1.2.1 Student login redirect     | `features/auth/LoginForm.tsx` resolves role `student` to `/student` and uses `router.replace`; invalid/absent `next` is guarded. | `test/login-form.test.tsx` covers role-based redirect behavior.                                                              | No production change; retain direct login regression and real-browser proof.                          |
| FE-1.2.2 Student route group/layout | `app/(student)/layout.tsx` and `app/(student)/student/page.tsx` provide the `/student` route group and shell.                    | No direct StudentLayout suite.                                                                                               | Add `test/student-layout.test.tsx`.                                                                   |
| FE-1.2.3 Session gate               | Student and protected layouts render loading state, suppress children, and redirect missing sessions with encoded pathname.      | `test/teacher-layout.test.tsx` demonstrates the established gate-test pattern; no direct Student/Protected suites.           | Add direct StudentLayout and ProtectedLayout coverage.                                                |
| FE-1.2.4 Student role gate          | Student layout checks `session.role === "student"` and redirects other roles without rendering children.                         | No direct StudentLayout role-negative suite.                                                                                 | Add admin/teacher wrong-role tests; backend remains authorization authority.                          |
| FE-1.2.5 `mustChangePassword` gate  | Student layout redirects forced users before role check; protected layout intentionally allows them to use `/settings/password`. | Teacher layout has precedence coverage; ProtectedLayout lacks direct regression coverage.                                    | Add precedence and role-neutral ProtectedLayout tests.                                                |
| FE-1.2.6 Logout cache clear         | `lib/api/auth.ts` currently clears QueryClient only in `onSuccess`; `LogoutButton` navigates to `/login` on both resolve/reject. | `test/logout.test.tsx` covers CSRF mutation, success clear, failure message, and navigation, but not failure cache clearing. | Move clear to `onSettled`, update lifecycle comments, and add success/failure whole-cache assertions. |

### Risk & Rollback

- **Risk: medium** — auth-adjacent redirect ordering and local cache lifecycle; no backend/schema/DB/API changes.
- `onSettled` is intentionally fail-closed because the UI navigates away even when logout fails; local protected data must not remain in the cache.
- Gate tests must preserve loading → must-change → session/role → render ordering to prevent content flash or redirect loops.
- Roll back by reverting the logout hook/comments/tests and, separately, task/WBS documentation. No data rollback is involved.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, React 19, TanStack React Query 5, Vitest/jsdom, and Playwright.
- Run `npx next typegen` before typecheck once route/test implementation changes are made.
- Real-browser verification requires a running frontend/backend, migrated isolated backend test DB, explicit CORS origin, and isolated student/admin/teacher fixtures; no mock or placeholder endpoint is allowed.
- Frontend layouts are UX/navigation gates only; backend session and role guards remain the authorization authority.

### Working Notes

- CP0 baseline working tree was clean on branch `docs/tasks-us-f0-cp1-disposition`, HEAD `9745e5adbf0a743cd8ef25415f4546ec22c29d9c` (`docs: update frontend README`).
- Baseline target suite: 4 files / 31 tests passed; 0 failures and 0 skips. `npm run typecheck` passed with no diagnostics. A non-failing Vite `configLoader` warning was observed.
- Existing route/layout behavior is sufficient for this story; do not rewrite `app/(student)/layout.tsx`, `app/(protected)/layout.tsx`, or `features/auth/LoginForm.tsx`.
- Expected CP1 files only: `lib/api/auth.ts`, `components/auth/LogoutButton.tsx`, `test/logout.test.tsx`, new `test/student-layout.test.tsx`, new `test/protected-layout.test.tsx`.
- Explicit exclusions: FE-1.3 course UI, backend/API/DB/schema/migrations, `proxy.ts`/`middleware.ts`, role-neutral `next` policy changes, shared routing refactor, and premature WBS edits.

### CP0 Results

- **What changed:** task record only; no production or test files were edited.
- **Baseline verification:** targeted Vitest command passed (4 files / 31 tests, 0 failed, 0 skipped); `npm run typecheck` passed.
- **Current state:** CP0 was accepted by the user; CP1 production/test changes and focused verification are recorded below.

### CP1 Results — focused implementation review (2026-09-03)

- **What changed:** moved `useLogout` cache clearing from `onSuccess` to `onSettled` in `lib/api/auth.ts`; updated `LogoutButton` lifecycle comments; added direct StudentLayout and ProtectedLayout gate suites; extended logout tests to prove whole-cache cleanup on success and rejection.
- **Changed files:** `lib/api/auth.ts`, `components/auth/LogoutButton.tsx`, `test/logout.test.tsx`, `test/student-layout.test.tsx`, `test/protected-layout.test.tsx`, and this task record.
- **Focused tests:** `npm test -- test/student-layout.test.tsx test/protected-layout.test.tsx test/logout.test.tsx test/login-form.test.tsx test/change-password-form.test.tsx test/teacher-layout.test.tsx` → 6 files / 45 tests passed; 0 failures and 0 skips.
- **Static gates:** `npm run typecheck` passed; `npm run lint:check` passed with one existing non-blocking React Compiler warning in `features/admin/AccountCreateForm.tsx:68`; `git diff --check` passed.
- **Scope:** no route/layout production rewrites, backend/API/DB/schema/migration, proxy/middleware, dependency, or FE-1.3 changes. Browser verification and WBS updates remain deferred to later checkpoints.
- **Current state:** CP1 was accepted by the user; CP2 full verification and browser disposition are recorded below.

### CP2 Results — full verification and browser disposition (2026-09-03)

- **Full static verification:** `npx next typegen` passed; `npm test` passed with 19 files / 114 tests, 0 failures and 0 skips; `npm run typecheck` passed; `npm run lint:check` passed with 0 errors and one existing React Compiler warning at `features/admin/AccountCreateForm.tsx:68`; `npm run build` passed with 12/12 static generation; `git diff --check` passed.
- **Route evidence:** required `/login`, `/student`, and `/settings/password` routes remain present in the source/build route set.
- **Scope evidence:** changes remain limited to the five CP1 production/test files plus `tasks/todo.md`; no `proxy.ts`/`middleware.ts`, backend, DB, schema, migration, dependency, or FE-1.3 changes.
- **Browser preflight:** `npm run test:browser -- --list` passed and listed only the existing US-F0/US-F16 real-backend specs. The required FE-1.2 fixture variables (`F0_*`/`F16_*`) were all unset; no backend-backed authenticated browser mutation was attempted.
- **Browser matrix disposition:** **CONSTRAINED**, not PASS. Student/admin/teacher login, unauthenticated preservation, forced-password transition, password settings, logout Back-cache behavior, and failed/expired logout could not be safely exercised without explicit isolated credentials/backend fixture configuration. Automated unit evidence covers the rejection-path cache guarantee.
- **Current state:** User accepted the constrained browser evidence; task record closeout is recorded below and WBS remains intentionally unchecked.

### CP3 Results — documentation closeout (2026-09-03)

- **User disposition:** accepted the constrained browser evidence; no authenticated backend browser run was claimed.
- **Documentation:** task checklist, audit matrix, acceptance criteria, risk/rollback, dependencies/environment, working notes, and CP0–CP2 evidence are recorded in this file.
- **WBS disposition:** `docs/智學互動平台/00_專案規劃/智學互動平台剩餘工作WBS.md` was not modified. FE-1.2.1–FE-1.2.6 remain unchecked because real-browser acceptance was constrained, not passing.
- **Final scope:** only `lib/api/auth.ts`, `components/auth/LogoutButton.tsx`, `test/logout.test.tsx`, `test/student-layout.test.tsx`, `test/protected-layout.test.tsx`, and `tasks/todo.md` changed; existing route implementations were preserved.
- **Rollback:** revert the five implementation/test files independently from this task record; no backend/API/DB/schema/migration rollback is required.
- **Final state:** FE-1.2 implementation and static/unit verification are complete; real-backend browser acceptance remains an explicit follow-up requiring isolated fixtures.

### CP4 Results — isolated real-browser acceptance (2026-09-03)

- **Fixture:** created a fresh Compose project `smartlearning-fe12-20260903110000-7f2a4b` with a new PostgreSQL volume/database, one-shot migration, and backend bound only to `127.0.0.1:3000`; no existing project or volume was reused. The exact containers were stopped after evidence capture; the disposable volume was preserved for inspection.
- **Runtime hardening:** the browser fixture used same-host `localhost` for API/UI cookies and `SESSION_COOKIE_SECURE=true` so the real browser accepted the `__Host-session`/`__Host-csrf` cookies. Credentials were generated and retained only in the provisioning shell; no passwords, cookies, CSRF values, raw bodies, or secrets were recorded.
- **Provisioning:** migration exited 0; `/health/live` and `/health/ready` passed; bootstrap admin creation passed; teacher, normal student, and forced-password student were created through the real API; teacher and normal student completed the real password-change flow; forced student remained forced until browser acceptance.
- **Browser matrix:** **PASS** — the ephemeral Playwright Chromium harness passed all 8 groups: student default redirect, valid `next`, invalid `next` fallback, unauthenticated destination preservation, admin/teacher Student denial, forced-password precedence plus real change, role-neutral password settings for admin/teacher/student, and logout CSRF/Origin plus browser-back protection.
- **Constrained disposition:** failed/expired logout remains **CONSTRAINED** by design; no unsafe DB mutation, mock, or forced expiry was used to manufacture that case. This does not weaken the unit-level rejection-path cache-clear coverage.
- **Harness-only corrections:** same-host API cookie targeting, secure localhost cookie fixture, exact `新密碼` label matching, and asynchronous visibility waits were temporary acceptance-harness changes outside the repositories; no permanent browser spec/config was added.
- **WBS disposition:** FE-1.2.1–FE-1.2.6 were marked `[x]` with explicit user acceptance of the CP4 real-browser evidence (2026-09-03). The prior constrained evidence is superseded by this CP4 PASS for the covered matrix.

## 2026-09-03 FE-1.3 我的課程

### Goal and acceptance criteria

- [x] Render the real student course roster from `GET /api/v1/me/courses?page&pageSize` only; no mock, placeholder, fallback data, client filtering, or client reordering.
- [x] Show course name, nullable description, lifecycle status (`draft → 草稿`, `archived → 已封存`), and Taipei-localized enrollment time in semantic `<time dateTime>` markup.
- [x] Keep loading, empty, error, and data states mutually exclusive with accessible semantics; never expose raw backend error detail.
- [x] Use server pagination metadata with fixed `pageSize=20`, page controls, and page contraction handling; empty controls appear only for valid empty first page.
- [x] Archived active enrollments remain visible; removed enrollments disappear after refetch/reload.
- [x] Mobile 390×844 and desktop 1280×800 have no horizontal overflow; long names/descriptions wrap completely.
- [x] Do not add Course detail, active-session, join CTA, student enrollment mutation, or backend/schema changes.
- [x] Dedicated real-backend browser acceptance passes with zero skip and fail-closed cleanup, subject to explicit isolated fixture availability.

### Checkpoint status

- [x] CP0 — baseline and provisional contract record.
- [x] CP1 — minimal UI completion.
- [x] CP2 — focused regression coverage.
- [x] CP3 — full frontend verification.
- [x] CP4 — dedicated isolated real-backend browser acceptance (PASS: 1 Chromium test, 0 skipped, cleanup PASS).
- [x] CP5 — evidence mapping and WBS closeout accepted by user (2026-09-03).

### Acceptance matrix

| Area                  | Evidence                              | Expected result                                                                     |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Transport boundary    | `enrollments-api.test.tsx` regression | Explicit `page=1&pageSize=20`, query key identity, student gate, no retry preserved |
| Loading               | `my-courses-view.test.tsx`            | `role=status`, `aria-live=polite`, no list/empty/error                              |
| Empty                 | `my-courses-view.test.tsx`            | `total=0,totalPages=0`, guidance only, no pagination or self-enroll CTA             |
| Data/presentation     | component tests + browser             | full text, nullable description, Chinese lifecycle labels, Taipei `<time>`          |
| Pagination            | component tests + browser             | page 1↔2, metadata, disabled boundaries, server ordering                            |
| Contraction           | component test                        | out-of-range response returns to effective page, no false global empty              |
| Error/privacy         | component tests + browser UI          | curated `ErrorAlert`, raw backend message absent                                    |
| Responsive            | browser                               | no document/body horizontal overflow at mobile and desktop                          |
| Persistence/semantics | browser                               | reload retains roster; archive remains; removed enrollment disappears               |
| Cleanup               | browser finally block                 | only verified UUIDs, enrollment removal before course archive, aggregate failures   |

### Risk & Rollback

- **Risk: medium** — UI/test/browser harness only; no backend, schema, migration, dependency, or shared-data changes.
- Provisional contract drift, zero-page versus contraction confusion, status/enrollment semantic mix-up, timezone nondeterminism, and fixture contamination are stop-the-line conditions.
- Roll back `MyCoursesView`, focused tests, browser spec, and this task record independently; never reset the working tree, truncate data, or delete shared rows.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, React 19, TanStack React Query 5, Vitest/jsdom, Playwright.
- Run `npx next typegen` before typecheck. Real browser requires a running frontend/backend, migrated disposable DB, explicit CORS origin, same-host UI/API URLs, secure localhost `__Host-*` cookies, and isolated credentials.
- Browser fixture variables are feature-specific `FE13_*`; missing prerequisites must be reported as FAIL/BLOCKED or CONSTRAINED, never hidden with `test.skip`.

### Working Notes

- FE-1.1 transport and FE-1.2 routing/session gates are existing boundaries and must remain unchanged.
- Backend contract evidence: active enrollments only, archived course visible, removed absent, `enrolledAt DESC, id DESC`, one-based pagination, empty `totalPages=0`.
- Existing browser conventions in `test/browser/us-f0-course-flow.spec.ts`: `allHeaders()` for Origin assertions, secure same-host cookies, verified UUID tracking, reconciliation for uncertain creates, and aggregate fail-closed cleanup.
- No WBS checkbox changes until zero-skip browser PASS, cleanup PASS, and user acceptance.

### Results — static implementation and real-browser acceptance PASS; WBS closeout accepted (2026-09-03)

- **What changed:** completed the real student roster in `MyCoursesView` using the existing `useMyCourses` transport; added fixed `pageSize=20` pagination, server-metadata presentation, contraction handling, localized lifecycle labels, Taipei enrollment times, accessible loading/error/empty states, and responsive long-text wrapping. No client filtering/reordering, placeholder/fallback data, enrollment mutation, Course detail, or backend change was added.
- **Regression coverage:** expanded `test/my-courses-view.test.tsx` to 7 tests covering four-state exclusivity, nullable descriptions, lifecycle labels, semantic times, curated errors, pagination boundaries, page contraction, and non-student query gating. Added `test/browser/fe-1-3-my-courses.spec.ts` for isolated real-backend acceptance with fail-closed fixture preflight and aggregate cleanup. Corrected the enrollment-removal assertion to HTTP 200, matching the backend `DELETE` controller contract.
- **Browser hardening:** forced-password login now accepts the `/settings/password` intermediate route and records successful login before navigation completes; server ordering ties compare `enrollmentId`; cached page-1 navigation waits on rendered metadata rather than assuming a network request; contraction invalidates the effective page cache before returning to it; uncertain Course create responses with 5xx/unknown status remain eligible for reconciliation. The cleanup disables the verified disposable student account through the existing admin step-up endpoint and reports unverified account identity as a cleanup failure.
- **Session safety:** successful login clears prior `my-courses` query entries, and `MyCoursesView` renders no roster for a non-student session so disabled queries cannot expose cached student data.
- **Static verification:** `npx next typegen` → PASS; `npm test` → PASS (19 files / 117 tests, 0 failures); `npm test -- test/my-courses-view.test.tsx` → PASS (1 file / 7 tests); `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, one pre-existing React Compiler warning at `features/admin/AccountCreateForm.tsx:68`); `npm run build` → PASS (Next.js 16.3.1, 12/12 pages); `npm run test:browser -- --list` → PASS (discovery only); targeted Prettier check → PASS; `git diff --check` → PASS. The repository has no `format:check` script, so that documented backend-style command is unavailable for the frontend; the equivalent targeted Prettier checks passed.
- **Warnings:** Vitest reports the existing Vite config-loader/ESM warning; ESLint reports the existing React Hook Form `watch()` compatibility warning. Neither is introduced by FE-1.3.
- **Real-browser status:** **PASS**. With the authorized isolated FE13 backend/database, same-host UI/API runtime, secure `__Host-*` cookies, and disposable admin fixture, `set -a; source /tmp/fe13-20260903.env; set +a; npm run test:browser -- --workers=1 test/browser/fe-1-3-my-courses.spec.ts` passed: 1 Chromium test, 0 skipped, 4.9 seconds. The test's aggregate cleanup completed with no errors; no unrelated browser suite ran.
- **Acceptance:** CP0–CP4 evidence was accepted by the user on 2026-09-03; CP5 is complete and the authoritative WBS FE-1.3.1–FE-1.3.6 entries are now synchronized. This closes FE-1.3 only; BE-1/BE-2 formal contract freeze and broader release acceptance remain independent.

### CP5 Results — evidence mapping and WBS closeout (2026-09-03)

- **FE-1.3.1 Course list UI:** `features/student/MyCoursesView.tsx`, `test/my-courses-view.test.tsx`, and the isolated browser flow verify server-backed course cards, complete text, nullable descriptions, lifecycle labels, and no client filtering/reordering.
- **FE-1.3.2 Loading state:** component regression verifies `role="status"`, `aria-live="polite"`, and mutual exclusion from list, empty, and error content.
- **FE-1.3.3 Empty state:** component regression and browser evidence verify valid `total=0,totalPages=0` guidance without pagination or self-enrollment controls.
- **FE-1.3.4 Error state:** component regression and browser UI evidence verify curated `ErrorAlert` output with raw backend detail excluded.
- **FE-1.3.5 Responsive layout:** isolated browser evidence verifies mobile `390×844` and desktop `1280×800` overflow constraints and long-text wrapping.
- **FE-1.3.6 Real-backend browser smoke:** `npm run test:browser -- --workers=1 test/browser/fe-1-3-my-courses.spec.ts` passed 1 Chromium test with 0 skipped; aggregate fail-closed cleanup passed.
- **WBS acceptance:** the user accepted the recorded CP4 real-browser result and authorized FE-1.3.1–FE-1.3.6 closeout. Only the corresponding six authoritative WBS checkboxes were updated; no BE-1/BE-2, QA-2.1, FE-2, backend, schema, or runtime acceptance was implied.
- **Boundary retained:** the run used an isolated disposable FE13 environment and the existing task record as evidence; no new mutation run, mock/fallback, shared-data reset, or fixture teardown was performed for this documentation closeout.

## 2026-09-03 — FE-2.1 Teacher Enrollment Roster Transport

### Context and goal

Implement the five frontend transport concerns for the teacher enrollment roster: course-scoped list/pagination, teacher/admin student search, add/reactivate, idempotent remove, and precise React Query invalidation. Extend the existing `apiRequest`, wire types, query-key factory, and React Query/Vitest patterns only; do not add a client, Route Handler, dependency, mock, or UI.

### Acceptance criteria

- [x] Course roster query preserves active and removed rows, server ordering, and pagination metadata; defaults to `page=1&pageSize=20`.
- [x] Teacher/admin student-search query matches the frozen BE-2 contract, including normalization, pagination, projection, authorization, and membership semantics.
- [x] Add sends only `{ studentAccountId }`, returns the server-authoritative `EnrollmentDto`, and does not optimistically insert or infer create/duplicate/reactivation from HTTP 201.
- [x] Remove uses the exact bodyless DELETE contract, returns `null`, preserves removed roster rows, remains idempotent, and is not client-blocked for archived courses.
- [x] Successful mutations invalidate only the affected course roster caches and the affected search root because search membership/projection is enrollment-dependent; failures preserve the original `ApiRequestError` and do not invalidate authoritative caches.
- [x] Focused/static/full verification passes; FE-2.2 UI/browser work and WBS checkbox updates remain outside this slice until separately authorized.

### Explicit exclusions

- FE-2.2 roster UI, search debounce/combobox, confirmation dialog, accessibility, error copy, and browser acceptance.
- Backend implementation, schema/migration changes, environment changes, mock/placeholder endpoints, Next.js Route Handlers, new HTTP clients, dependencies, and lockfiles.
- Reuse of admin-only `GET /admin/accounts` for teacher student search.
- WBS checkbox closure without complete frozen-contract evidence and explicit closeout authorization.

### Checkpoint checklist

- [x] CP0 — audit existing enrollment contracts and gate student-search contract.
- [x] CP1 — record implementation checklist after CP0 is unblocked.
- [x] CP2 — add frozen wire types and collision-free query keys.
- [x] CP3 — add roster/search query options and hooks.
- [x] CP4 — add enrollment mutations and targeted invalidation.
- [x] CP5 — add focused transport and shared-client boundary tests.
- [ ] CP6 — run verification, record results, and obtain explicit closeout authorization.

### Risk & Rollback

- **Risk: medium** — authenticated roster mutations, cache identity, and contract drift are the main risks; no schema or runtime data change is planned.
- **Rollback:** revert only FE-2.1 types/keys/hooks/tests and this task record after implementation. No database, backend, or runtime rollback is needed. While CP0 is blocked, only this task record is changed.
- **Safety:** do not optimistically rewrite server state, expose admin account fields through search, or run authenticated browser/database mutations for this transport-only slice.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, React 19, TanStack React Query 5, Vitest, and the existing `apiRequest` client.
- Existing backend roster endpoints are available in the checked-out backend source/reference; BE-2 must formally freeze or add the dedicated teacher-accessible student-search contract before product implementation.
- `lib/api/client.ts` already supplies credentials, Origin/CSRF, JSON serialization, envelope unwrapping, abort signals, and typed `ApiRequestError`; change it only if a direct boundary test proves a contract mismatch.

### Working Notes

- Existing roster contract: `GET /courses/:courseId/enrollments?page&pageSize` returns `Page<EnrollmentDto>`, includes active + removed, and orders `createdAt ASC, id ASC`.
- Existing add contract: `POST /courses/:courseId/enrollments` with body `{ studentAccountId }` returns 201 `EnrollmentDto`; active duplicates return the existing row and removed rows reactivate.
- Existing remove contract: `DELETE /courses/:courseId/enrollments/:studentAccountId` returns 200 with `data: null`, transitions status to `removed`, is idempotent, and remains allowed for archived courses.
- Frontend must not filter removed rows, reorder server data, recompute pagination, or infer enrollment state from HTTP status.
- Future implementation must preserve existing `useMyCourses` behavior and use a course parent key so every page for one course can be invalidated without touching other courses.

### CP0 Results — BLOCKED-CONTRACT (2026-09-03)

- **Baseline:** UI branch `docs/tasks-us-f0-cp1-disposition`, HEAD `f7791035217ae6ec57d9285467dc5a73237b3a54`; working tree was clean before this task-record update.
- **Confirmed backend evidence:** `smartLearning-backend/src/modules/enrollments/api/enrollments.controller.ts` exposes the roster GET/POST/DELETE routes and status decorators; `.../api/dto/enrollment.dto.ts` defines `EnrollmentDto`, `EnrollmentStudentDto`, and the add payload; `.../application/enrollment.service.ts` confirms owner/admin access, active+removed listing, `createdAt ASC, id ASC`, duplicate/reactivation, idempotent removal, and archived removal behavior; `smartLearning-backend/docs/frontend-api-reference.md:380-385` documents the same three enrollment routes and semantics.
- **Blocking finding:** no dedicated teacher-accessible student-search controller, DTO, OpenAPI path, or frontend API-reference entry exists in the checked-out backend/reference. The WBS still leaves BE-2 contract-freeze work unchecked and states FE-2 depends on BE-2. `GET /admin/accounts` is admin-only, has different authorization, and exposes admin account fields, so it is not an acceptable substitute.
- **Required BE-2 freeze:** define the search path/scope, query name and trim/case/matching rules, empty/minimum behavior, pagination and deterministic ordering, disabled/non-student and active/removed membership filtering, minimal projection, owner/admin/non-owner/student/unauthenticated and archived semantics, stable errors, and whether add/remove changes search membership or projection (invalidation consequence).
- **Disposition:** **BLOCKED-CONTRACT**. No product source, types, query keys, hooks, tests, backend files, WBS checkboxes, dependencies, mocks, placeholders, or runtime/database state were changed. CP1–CP6 remain pending; FE-2.1 is not complete.
- **Next action:** obtain the frozen BE-2 student-search contract and explicit authorization to continue past CP0. Until then, do not start CP1 implementation or claim FE-2.1 closeout.

### CP0 verification

- Read-only route/DTO/service/reference/WBS inspection confirmed the original disposition above.
- User-provided frozen contract superseded the CP0 blocker: `GET /courses/:courseId/students/search?q&page&pageSize` is course-scoped, owner/admin readable (including archived courses), normalized with NFC + trim, constrained to 2–100 Unicode code points, and returns `StudentSearchResultDto` with course-relative `enrollmentStatus`.
- CP0 was reopened and unblocked for CP1–CP5 implementation; the original read-only scope statement applies only to the blocked pre-implementation attempt.

### CP1–CP5 Results — implementation and focused evidence (2026-09-03)

- **CP1/CP2:** added frozen enrollment/search wire types and collision-free course-scoped query-key hierarchies. `EnrollmentDto` preserves active/removed status and the safe nested student projection; search preserves only the approved fields plus nullable course-relative `enrollmentStatus`.
- **CP3:** added `courseEnrollmentsQueryOptions`/`useCourseEnrollments` and `studentSearchQueryOptions`/`useStudentSearch`. Both use explicit URLSearchParams, forward `AbortSignal`, set `retry:false` and `staleTime:30_000`, and gate teacher/admin sessions. Search shares NFC+trim normalization between URL and key and disables empty/short/overlong terms.
- **CP4:** added `useAddEnrollment` and `useRemoveEnrollment`. Add sends only `{ studentAccountId }`; remove sends bodyless DELETE and returns `null`; neither performs optimistic cache edits. Successful mutations invalidate only the target course roster parent and target course search parent because search includes enrollment-dependent status. Failures preserve the original `ApiRequestError` and do not invalidate.
- **CP5 focused tests:** `test/enrollments-api.test.tsx` now covers roster/search pagination, gates, signal/no-retry/error identity, Unicode normalization/encoding, server projection/order/meta preservation, exact mutation boundaries, no optimistic edits, archived-removal non-blocking, and target-only invalidation. `test/api-client.test.ts` covers POST 201 and bodyless DELETE 200 envelope boundaries with credentials, Origin, CSRF, and JSON semantics.

### Verification and scope

- `npm test -- test/enrollments-api.test.tsx test/api-client.test.ts test/login-form.test.tsx` → PASS (3 files / 45 tests; includes new login cache-clearance and role-gate regression tests).
- `npx next typegen` → PASS.
- `npm run typecheck` → PASS (0 diagnostics).
- `npm run lint:check` → PASS (0 errors; one pre-existing React Compiler warning at `features/admin/AccountCreateForm.tsx:68`).
- `npm test` → PASS (19 files / 138 tests).
- `npm run build` → PASS (Next.js production build and static generation).
- `npx prettier --check lib/api/auth.ts lib/api/enrollments.ts lib/api/types.ts lib/api/query-keys.ts test/enrollments-api.test.tsx test/api-client.test.ts test/login-form.test.tsx tasks/todo.md` → PASS.
- `git diff --check` → PASS (both repositories).
- Final changed-file scope is limited to `lib/api/types.ts`, `lib/api/query-keys.ts`, `lib/api/enrollments.ts`, `lib/api/auth.ts`, `test/enrollments-api.test.tsx`, `test/api-client.test.ts`, `test/login-form.test.tsx`, and this task record. No routes/features/client/dependencies/env/browser/WBS files changed; no commit was created.

### CP6 review hardening (2026-09-03)

Review findings were triaged and the following fixes landed before closeout:

- **Cross-account cache leak (high):** `useLogin` now removes the `enrollments` and `studentSearch` roots in addition to `myCourses` so a new login cannot reuse a prior account's roster/search cache; regression-asserted in `test/login-form.test.tsx`.
- **Stale authorized data (high):** `useCourseEnrollments`/`useStudentSearch` now conceal cached `data` when the teacher/admin role gate closes (React Query retains data on `enabled:false`); regression-asserted in `test/enrollments-api.test.tsx`.
- **Typed query errors (medium):** both new `queryOptions` carry the `ApiRequestError` error generic so `query.error` is typed for FE-2.2 without casts.
- **Mutation refetch race (medium):** `invalidateCourseEnrollmentCaches` awaits `Promise.all` of both invalidations, and both mutation `onSuccess` callbacks await it, so `mutateAsync` no longer resolves before active roster/search refetches.
- **Test conventions:** removed the `as never` cast in the mutation boundary test (structural `Object.assign` instead).

### CP6 disposition

- **Implementation/static verification complete.** FE-2.2 UI/browser work and WBS checkbox closure remain outside this request and are not claimed.
- **Committed:** UI commit `025e794` (`feat(api): complete FE-2.1 enrollment roster transport`) on `docs/tasks-us-f0-cp1-disposition`; backend commit `1c38d9c` (`feat(enrollments): add teacher student-search contract (BE-2)`) on backend `main`. Backend `tasks/todo.md` record intentionally left uncommitted with the working tree.
- FE-2.1 transport items are complete against the frozen BE-2 contract; authoritative WBS checkboxes remain unchecked pending explicit closeout authorization.

## FE-2.2 Roster UI — Results (2026-09-03)

### What changed

- `features/enrollments/CourseRosterSection.tsx`（新）：課程詳情名冊區塊 — paginated roster table（active/removed 文字+符號、加選時間、僅 active row 有移除鈕）、student search（300ms debounce、2–100 code points client 校驗、課程相對 enrollmentStatus 顯示）、加選成功回饋依 mutation 前快照區分「已加入／已在名冊中（duplicate idempotent）／已重新加選」，409 `COURSE_NOT_EDITABLE` 顯示「課程已封存，無法修改名冊」；移除走 `role="dialog"` 確認（Esc 關閉、focus trap、失敗時 ErrorAlert 留在對話內）。404 roster 呈現 course-generic「無法存取這門課程的名冊」（existence-hiding），403/其他走 stable-code ErrorAlert。
- `app/(teacher)/courses/[courseId]/page.tsx`：於 `CourseDetailView` 下方掛載 `CourseRosterSection`。
- `lib/api/error-messages.ts`：新增 `COURSE_NOT_EDITABLE`、`VALIDATION_ERROR` 中文文案。
- `test/roster-section.test.tsx`（新，16 tests）：loading/empty/404/403/409、active+removed 表格、分頁邊界、搜尋最短長度、new/duplicate/reactivation 回饋、移除確認（取消不 DELETE、Esc 關閉、失敗留對話）。
- `test/course-detail-route.test.tsx`：route shell 測試改以 QueryClientProvider 包裹並斷言 roster section 掛載。
- `test/browser/fe-2-2-roster.spec.ts`（新，Playwright real-backend）：搜尋→加選→duplicate→移除確認→reactivation→archived 409→student 403 全流程 + admin cleanup（archive courses、disable accounts），沿用 FE-1.3 fixture 模式（FE22_* 環境變數，不 skip）。

### Verification

- `npm test` → 20 files / 154 tests PASS（含新 16 tests）。
- `npx next typegen` → PASS；`npm run typecheck` → PASS。
- `npm run lint:check` → 0 errors（僅既有 `AccountCreateForm.tsx:68` React Compiler warning）。
- `npm run build` → PASS。
- `npx prettier --check`（所有新/改檔）→ PASS；`git diff --check` → PASS。

### Not closed

- FE-2.2.9 real-browser acceptance：BLOCKED — 需使用者提供隔離 real backend 與 `FE22_API_BASE / FE22_UI_ORIGIN / FE22_ADMIN_USERNAME / FE22_ADMIN_PASSWORD / FE22_COURSE_NAME_PREFIX`（可選 `FE22_TEACHER_USERNAME / FE22_TEACHER_PASSWORD`，未提供時 spec 自建一次性 teacher）。執行：`node test/browser/run.mjs test/browser/fe-2-2-roster.spec.ts`（先 `npm run dev` 於同 host）。
- FE-2.2.8 a11y 的鍵盤走查已由單元測試涵蓋 Tab/Enter/Escape 與 aria 標記；screen-reader sanity 留 QA-2.2。
- WBS checkboxes 未勾選（待使用者授權 closeout）。

### Commit

- UI commit `7cbcc46`（`feat(teacher): complete FE-2.2 enrollment roster UI`）on `docs/tasks-us-f0-cp1-disposition`，6 files / +1786 −16；`tasks/todo.md` 紀錄依慣例保留於工作樹。

## FE-3.1 Live Session transport — CP1 confirmation (2026-09-03)

### Goal and acceptance criteria

- [x] `useLiveSession(id)` fetches `GET /live-sessions/:id`, unwraps the envelope, and preserves `joinedCount`/`votedCount` plus `sessionQuestions[]`/`questionSelections[]`.
- [x] Query key `liveSessions.detail(id)` is collision-free; empty id disables the query; `retry:false`; typed `ApiRequestError` preserved.
- [x] Wire types (`LiveSession`, `SessionQuestion`, `QuestionSelection`, `SessionQuestionOption`, `QuestionSnapshotType`, statuses) align with the frozen BE-3 contract.
- [x] Focused/static/full verification passes; CP2 mutations are not yet implemented.

### Checkpoint status

- [x] CP1 — detail + counts transport confirmed (2026-09-03).

### Verification

- `npx next typegen` → PASS.
- `npm run typecheck` → PASS (0 diagnostics).
- `npm test -- test/live-sessions-api.test.tsx` → PASS (1 file / 3 tests).
- `npm run lint:check` → PASS (0 errors; 4 pre-existing warnings in `test/browser/fe-2-2-roster.spec.ts` — unused vars, not introduced here).
- `npx prettier --check` (live-sessions/types/query-keys/error-messages/test) → PASS.
- `npm test` → PASS (21 files / 157 tests).
- `git diff --check` → PASS.

### Working notes

- `lib/api/live-sessions.ts` currently exports only `liveSessionQueryOptions`/`useLiveSession` (CP1 scope). `types.ts`/`query-keys.ts`/`error-messages.ts` already carry some CP3 result types/keys/codes; CP2 will add the lifecycle + open/close mutations and their focused tests.
- FE-3.1.1 session-list remains blocked (no backend list endpoint); only detail is implemented per the confirmed decision.

### Decision

CP1 confirmed. Proceeding to CP2 (lifecycle + open/close question mutations) per the plan's manual-confirmation checkpoint.

## FE-3.1 Live Session transport — CP2 lifecycle + open/close mutations (2026-09-03)

### Goal and acceptance criteria

- [x] `useCreateLiveSession` sends only `{ courseId, questionIds }` via `POST /live-sessions` (`mutate:true`), returns the server-authoritative `LiveSession`, and invalidates the created session's detail cache.
- [x] `useStartLiveSession` / `useCloseLiveSession` / `useCancelLiveSession` send bodyless `POST` to `/live-sessions/:id/{start|close|cancel}`, return `LiveSession`, and invalidate that session's detail cache.
- [x] `useOpenSessionQuestion` / `useCloseSessionQuestion` send bodyless `POST` to `/live-sessions/:id/questions/:sqId/{open|close}`, return `SessionQuestion`, and invalidate the session detail cache.
- [x] All mutations use `mutate:true` (CSRF/Origin attached), await invalidation (FE-2.1 review-hardening convention), and preserve the original `ApiRequestError` on failure without invalidating.
- [x] Focused/static/full verification passes; CP3 (results transport) is not yet implemented.

### Checkpoint status

- [x] CP2 — lifecycle + open/close question mutations complete (2026-09-03).

### Verification

- `npm test -- test/live-sessions-api.test.tsx` → PASS (1 file / 10 tests: 3 CP1 + 7 CP2).
- `npm run typecheck` → PASS (0 diagnostics).
- `npm run lint:check` → PASS (0 errors; 4 pre-existing warnings in `test/browser/fe-2-2-roster.spec.ts`).
- `npx prettier --check` (live-sessions/types/query-keys/error-messages/test) → PASS.
- `npm test` → PASS (21 files / 164 tests).
- `npm run build` → PASS (Next.js production build).
- `git diff --check` → PASS.

### Working notes

- All mutations return 201 (classify by envelope `data`, not status); session lifecycle returns `LiveSessionDto`, open/close question returns `SessionQuestionDto`.
- `useCreateLiveSession` uses `CreateLiveSessionPayload` directly as its variables type (an empty `extends` interface tripped `@typescript-eslint/no-empty-object-type`).
- Test convention: mutations are driven with `act(() => mutate(...))` + `await waitFor(isSuccess)` — the `mutateAsync` pattern does not flush `result.current.data` synchronously in this harness.

### Decision

CP2 complete and verified. Stopping at the CP2 manual-confirmation checkpoint; CP3 (teacher result transport) will not start without explicit user confirmation.

## FE-3.1 Live Session transport — CP3 teacher result transport (2026-09-03)

### Goal and acceptance criteria

- [x] `useSessionQuestionResults(id, sessionQuestionId)` fetches `GET /live-sessions/:id/questions/:sessionQuestionId/results`, unwraps the envelope, and preserves the discriminated union (`poll` / `quiz` + correctness / `open_text`).
- [x] Query key `liveSessions.results(id, sqId)` is collision-free; empty session/question id disables the query; `retry:false`; typed `ApiRequestError` preserved.
- [x] Focused/static/full verification passes; FE-3.2 realtime and FE-3.3 teacher UI are not yet implemented.

### Checkpoint status

- [x] CP3 — teacher result transport complete (2026-09-03).

### Verification

- `npm test -- test/live-sessions-api.test.tsx` → PASS (1 file / 13 tests: 3 CP1 + 7 CP2 + 3 CP3).
- `npx next typegen` → PASS.
- `npm run typecheck` → PASS (0 diagnostics).
- `npm run lint:check` → PASS (0 errors; 4 pre-existing warnings in `test/browser/fe-2-2-roster.spec.ts` — unused vars, not introduced here).
- `npx prettier --check` (live-sessions/types/query-keys/error-messages/test) → PASS.
- `npm run build` → PASS (Next.js production build).
- `npm test` → PASS (21 files / 167 tests).
- `git diff --check` → PASS.

### Working notes

- The teacher results route lives in the **participants controller** (`@Get(':liveSessionId/questions/:sessionQuestionId/results')`, `ParticipantOrSessionGuard`), not the live-sessions controller; a teacher/admin Web session sees the anonymous aggregate at any time, quiz correctness always revealed to the teacher.
- There is no session-wide overview endpoint — callers aggregate per question (FE-3.3).
- `SessionQuestionResults` discriminated-union types, `liveSessions.results` query key, and result error codes were already present in the working tree from CP1/CP2; CP3 added only the `sessionQuestionResultsQueryOptions`/`useSessionQuestionResults` hook and its focused tests.

### Decision

CP3 complete and verified. Stopping at the CP3 manual-confirmation checkpoint; FE-3.2 realtime and FE-3.3 teacher UI will not start without explicit user confirmation.

## FE-3.2 Realtime adapter + FE-3.3 Teacher UI — Results (2026-09-03)

### What changed

- **FE-3.2 (realtime adapter, Lite):** added `socket.io-client@4.8.3` (exact, matches the backend `socket.io@4.8.3` server). New `lib/live/realtime-types.ts` (durable envelope + typed event map), `lib/live/socket-client.ts` (`createLiveSocket` with `auth.liveSessionId` + `websocket` transport + `withCredentials`; `useLiveConnection` owning the socket lifecycle and exposing `status`/`errorCode`/`sendSnapshotFetch`/`socket`), and `lib/live/use-live-session-events.ts` (maps `session.snapshot`/`question.opened`/`question.closed`/`session.state_changed`/`result.updated`/`counts.updated`/`sync.required`/`session.closed` to authoritative React Query cache invalidation/seed, deduped by `(liveSessionId, eventSeq)`).
- **FE-3.3 (teacher UI):** new protected deep-link route `app/(teacher)/live/[liveSessionId]/` (page + loading/error/not-found boundaries) and `features/live-teacher/` — `LiveClassroomView` (status + session code + connection badge, joined/voted indicators, question queue, per-question result dashboard, close/cancel dialogs), `QuestionQueue` (open/close controls), `ResultPanel` (poll/quiz/open_text discriminated union with semantic CSS bars), `CloseCancelDialog`. Extracted the shared `components/ui/ConfirmDialog` from `CourseRosterSection` (roster removal now reuses it; behavior unchanged). Added realtime error codes to `lib/api/error-messages.ts`.
- **Entry point:** the dashboard is reached **solely by deep link** to `/live/:liveSessionId` (no session-list endpoint; no create/picker because F9 question authoring is blocked; the course detail view has no way to learn a session id). No session-picker/create entry was added.

### Where

New: `lib/live/{realtime-types,socket-client,use-live-session-events}.ts`, `features/live-teacher/{LiveClassroomView,QuestionQueue,ResultPanel,CloseCancelDialog}.tsx`, `components/ui/ConfirmDialog.tsx`, `app/(teacher)/live/[liveSessionId]/{page,loading,error,not-found}.tsx`, `test/{realtime-adapter,confirm-dialog,question-queue,result-panel,live-classroom-view,live-classroom-route}.test.tsx`. Modified: `features/enrollments/CourseRosterSection.tsx` (ConfirmDialog refactor), `lib/api/error-messages.ts`, `package.json`/`package-lock.json` (socket.io-client).

### How verified

- `npx next typegen` → PASS (route types generated, incl. `/live/[liveSessionId]`).
- `npm run typecheck` → PASS (0 diagnostics).
- `npm run lint:check` → PASS (0 errors; 4 pre-existing warnings: `AccountCreateForm.tsx:68` React Compiler + 3 unused vars in `test/browser/fe-2-2-roster.spec.ts`).
- `npm test` → PASS (27 files / 199 tests, 0 failures). New: realtime-adapter 10, confirm-dialog 6, question-queue 5, result-panel 5, live-classroom-view 5, live-classroom-route 1. Existing roster (16) and live-sessions-api (13) still pass after the ConfirmDialog refactor.
- `npm run build` → PASS (Next.js production build; `/live/[liveSessionId]` dynamic route present).
- `npx prettier --check` (all new/changed files) → PASS; `git diff --check` → PASS.

### WBS mapping

- FE-3.2.1 socket wrapper → `lib/live/socket-client.ts`; FE-3.2.2 Web Session handshake → `createLiveSocket` (`withCredentials` + cookie); FE-3.2.3 teacher room subscription → server-side via `auth.liveSessionId`; FE-3.2.4 snapshot on connect/reconnect → `useLiveConnection` + `snapshot.fetch`; FE-3.2.5 stale-state refetch → `sync.required` handling + REST refetch; FE-3.2.6 error/disconnect state → `useLiveConnection` status/error.
- FE-3.3.1–3.3.6 → the view components; FE-3.3.7 responsive + keyboard → Tailwind responsive + dialog focus trap + a11y.

### Not closed / deferred

- **FE-3.3.8 real-backend browser acceptance: BLOCKED** — requires an isolated backend + a live session to exist (which needs F9 question authoring to create one). Recorded as blocked, not claimed, per the no-mock convention.
- WBS checkboxes not updated (awaiting explicit closeout authorization).
- No commit created (per repo convention, work stops at the checkpoint boundary pending user instruction).
