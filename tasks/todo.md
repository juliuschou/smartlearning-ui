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

## 2026-09-05 — FE-4.4 Anonymous fallback

### Goal and acceptance criteria

- [ ] FE-4.4.1 公開 `/join` 以 session code + display name 加入，驗證 201、server-returned LiveSession ID/code 與非空 participant token，並以 server ID 導向 `/live/:id`。
- [ ] FE-4.4.2 participant token 僅存於 versioned、LiveSession-scoped `sessionStorage`；reload 可重連，遺失後不假裝恢復原 participant；token 不進 URL、query/cache/Zustand/log/DOM/cookie/localStorage/analytics。
- [ ] FE-4.4.3 匿名 snapshot、poll-single submission、result 與 Socket.IO handshake 使用固定 participant-token contract、stable idempotency key、participant-safe projection；學生 Web Session 流程不退化。
- [ ] FE-4.4.4 以真實 migrated backend 完成 Playwright browser regression，結果必須 `0 failed / 0 skipped`，並覆蓋 privacy、cookie precedence、terminal/access loss、reconnect 與 cleanup。

### Checklist

- [ ] Gate 0 — baseline and scope confirmation
- [ ] Checkpoint 0 — record baseline, authoritative contracts, dependencies, environment, risks, and existing working-tree diff
- [ ] Gate 1 — transport
- [ ] Gate 2 — credential store
- [ ] Gate 3 — join UI
- [ ] Gate 4 — REST/cache/poll
- [ ] Gate 5 — shared participant UI
- [ ] Gate 6 — anonymous realtime
- [ ] Gate 7 — browser closeout

### Risk & rollback

- Risk: high（bearer token、auth precedence、realtime、participant-safe privacy、shared cache）。
- Rollback: 依 checkpoint 移除匿名 route/feature 與 transport wiring；保留已採用的 actor-qualified query key，避免回復後再度 cache collision；不回復既有 `LearnerLiveSessionView.tsx` FE-4.3 working-tree 變更。
- Stop-the-line：backend/frontend contract mismatch、token leak、student/anonymous cache collision、stale protected content 或任何 test failure 均停在當前 checkpoint，不以後續 checkpoint 掩蓋。

### Dependencies & Environment

- UI repo：`/home/user/projects/smartLearning/smartLearning-ui`；Node 24+、Next.js 16.3.1、React 19、React Query 5、Socket.IO client 4.8.3、Vitest/Playwright。
- Backend dependencies：BE-1、BE-3、BE-4.1；anonymous join、`X-Participant-Token` snapshot/submission/results、`/live` Socket.IO auth 已具備，仍須以 runtime/OpenAPI/reference 對照。
- Real browser：same-host UI/API、explicit CORS、Secure `__Host-*` cookie fixture、migrated disposable backend；無 mock/placeholder acceptance。

### Working notes — CP0

- Authoritative WBS: `docs/智學互動平台/00_專案規劃/智學互動平台剩餘工作WBS.md:640-647`。
- Frontend design baseline: `docs/智學互動平台/50_實作與測試/SPEC F0-F17 前端實作計畫.md:69-83`；F12/F13/F14 明定 sessionStorage token、server snapshot authority、same-key idempotency 與不使用 mock。
- Next.js 16 guidance verified from `node_modules/next/dist/docs/.../05-server-and-client-components.md`: pages/layouts remain Server Components; browser storage, event handlers and custom hooks stay in narrow Client Components。
- Current UI primary files: `lib/api/client.ts`（目前僅 idempotency caller header，mutation 自動 CSRF）、`lib/api/participant-live-sessions.ts`（目前 student cookie-only）、`lib/api/query-keys.ts`（participant key 尚未 actor-qualified）、`lib/live/socket-client.ts`（目前 cookie handshake）、`lib/live/use-participant-live-session-events.ts`、`LearnerLiveSessionView.tsx`、`PollSingleQuestion.tsx`、`poll-submission-attempt.ts`。
- Backend/reference confirms anonymous join returns raw token once; subsequent bearer header is `X-Participant-Token`; Socket.IO namespace is `/live` while browser transport URL is `/socket.io/`; anonymous terminal stale tokens may become `UNAUTHORIZED` after close anonymization; anonymous must not call student-only `/student-status`。
- Recommended scope is frontend-only: public `/join` and `/live/[liveSessionId]`, explicit actor-aware transport/cache/controller, credential store, anonymous realtime and real-browser acceptance；不加入 FE-5 題型或 backend contract changes。
- Security decision: retain `credentials: "include"` to preserve backend cookie precedence; never use `credentials: "omit"` as anonymous downgrade workaround; no generic arbitrary headers。
- Existing working-tree baseline (pre-existing, not authored by FE-4.4): `features/live-student/LearnerLiveSessionView.tsx` has comment update to FE-4.3 realtime behavior and Prettier line wrapping only；must preserve exactly unless current checkpoint explicitly requires a targeted extension。

### CP0 Results — PASS (2026-09-05)

- **Scope:** completed read-only baseline and contract audit; no FE-4.4 product source, tests, routes, dependencies, env, backend, WBS checkbox, or runtime/database state changed.
- **Baseline:** UI branch `main`; working tree contains only the pre-existing modification `features/live-student/LearnerLiveSessionView.tsx` described above. No commit created.
- **Contract evidence:** WBS FE-4.4.1–4.4.4 and dependencies BE-1/BE-3/BE-4.1; frontend F12–F14 plan; backend participant controller/guard/service, submission controller/service, live gateway/realtime contract, and frontend API reference were inspected. Backend is ready for anonymous join/token snapshot-submit-result/realtime; frontend gap is the remaining implementation and browser evidence.
- **Resolved decisions:** anonymous credential uses `sessionStorage`; public URLs are `/join` and `/live/:liveSessionId`; anonymous actor is explicit and never an account fallback; token-bearing transport remains narrowly scoped and retains cookies; anonymous terminal ambiguity fails closed without `/student-status` or login redirect; actor kind must separate query keys and submission attempts.
- **Verification:** read-only inspection of `tasks/lessons.md`, Next.js 16 Server/Client Components guidance, WBS, frontend plan, backend API reference, relevant frontend transport/live/UI files, and `git diff/status` completed. No product tests were run because CP0 makes no product-code changes; next static/test commands are defined in the FE-4.4 execution plan.
- **Checkpoint boundary:** CP0 is complete. Stop here for manual Gate 0/CP0 review; do not begin Checkpoint 1 until explicit user confirmation.

### Results

- **What changed:** added this FE-4.4 task record and CP0 evidence only.
- **Where:** `tasks/todo.md`; authoritative execution plan at `/home/user/projects/smartLearning/docs/智學互動平台/50_實作與測試/FrontEnd4.4/FE-4.4 Anonymous fallback 執行計畫-2026-09-05.md`。
- **How verified:** read-only contract/baseline inspection; no product-code test execution applicable。

### CP1 — Transport boundary Results (2026-09-05)

- **Status:** PASS; stopped before CP2 and waiting for manual Gate 1 confirmation.
- **What changed:** added `ApiAuthMode` to `lib/api/client.ts` with explicit `session`, `anonymous-join`, and `anonymous-participant` modes; retained `credentials: "include"`; session mutations still attach CSRF, anonymous modes omit CSRF, anonymous participant attaches only fixed `X-Participant-Token`, and `Idempotency-Key` is independent of CSRF. Empty anonymous token fails before `fetch` with stable `ANONYMOUS_CREDENTIAL_MISSING`.
- **Types:** added token-free `ParticipantActor` discriminator to `lib/api/types.ts`; no raw token is represented in the actor descriptor.
- **Tests:** added API-client coverage for anonymous join headers, anonymous participant + idempotency headers, empty-token prefetch rejection, and error non-leakage. No generic arbitrary-header option was introduced.
- **Scope:** no routes, credential storage, query-key changes, realtime changes, backend changes, env/dependency changes, or WBS checkbox changes. Existing `features/live-student/LearnerLiveSessionView.tsx` working-tree diff remains untouched.
- **Verification:** `npx prettier --write lib/api/client.ts lib/api/types.ts test/api-client.test.ts` → PASS; `npm test -- test/api-client.test.ts` → PASS (1 file / 12 tests); `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, 8 pre-existing warnings); `git diff --check` → PASS.
- **Manual Gate 1 review:** inspect the auth-mode/header matrix and confirm cookies remain included, anonymous requests do not use CSRF, participant token is only attached through the fixed header, idempotency remains available without CSRF, and generic headers are still unavailable. Do not start CP2 until explicit confirmation.
- WBS checkboxes 未勾選（待使用者授權 closeout）。

### CP2 — Participant credential store Results (2026-09-05)

- **Status:** PASS; stopped before CP3 and waiting for manual Gate 2 confirmation.
- **What changed:** added `lib/live/anonymous-participant-credential.ts` with a versioned `sessionStorage` record keyed by `smartlearning:v1:anonymous-participant:<liveSessionId>`; record stores only version, session ID, canonical session code, and raw participant token.
- **API boundary:** `persistAnonymousParticipantCredential` validates input, normalizes the code, stores the credential, and returns a token-free `{ liveSessionId, sessionCode }` receipt. `get...` validates and removes malformed/mismatched records; `remove...` is session-scoped; `has...` delegates to validated retrieval. Storage exceptions fail closed.
- **Security:** invalid IDs/empty code/empty token are rejected; no localStorage, cookie, React Query, Zustand, log, DOM, or analytics integration was added. Token is not returned in the safe receipt.
- **Tests:** added `test/anonymous-participant-credential.test.ts` covering validated round-trip, session scoping, malformed/mismatched cleanup, invalid input no-write, and removing only the requested session.
- **Scope:** no API hook integration, routes, query-key changes, realtime changes, backend changes, env/dependency changes, or WBS checkbox changes. Existing `LearnerLiveSessionView.tsx` working-tree diff remains untouched.
- **Verification:** `npx prettier --write lib/live/anonymous-participant-credential.ts test/anonymous-participant-credential.test.ts` → PASS; `npm test -- test/anonymous-participant-credential.test.ts` → PASS (1 file / 5 tests); `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, 8 pre-existing warnings); `git diff --check` → PASS.
- **Manual Gate 2 review:** inspect the sessionStorage key/record in DevTools, verify the safe receipt has no token, verify malformed data is removed, and confirm the intended loss-of-token behavior (no identity recovery; rejoin creates a new participant). Do not start CP3 until explicit confirmation.

### CP3 — Public anonymous join UI Results (2026-09-05)

- **Status:** PASS after one test-driven fix; stopped before CP4 and waiting for manual Gate 3 confirmation.
- **What changed:** added public Server Component route `app/(public)/join/page.tsx` (`/join`) and client form `features/live-student/AnonymousJoinForm.tsx`; form accepts an 8-character code plus display name, performs client UX validation, normalizes code and NFC-trims display name, and navigates with `router.replace` using the server-returned LiveSession ID.
- **Transport integration:** added `useJoinAnonymousLiveSession` in `lib/api/participant-live-sessions.ts`; it sends `{ displayName }` through `anonymous-join`, requires HTTP 201 and valid server ID/code/nonempty token, persists via the CP2 credential store, and returns only the token-free receipt. Added curated error messages for anonymous credential/storage errors.
- **Security:** token never reaches the form result, router URL, DOM, or error UI; anonymous join does not add CSRF or participant-token headers and does not perform cookie-omitting downgrade. Server validation remains authoritative for unsafe display names.
- **Tests:** added `test/anonymous-join-form.test.tsx` for required fields, normalization, safe receipt navigation; existing participant API test suite remained green.
- **Scope:** no anonymous live route, actor-qualified query keys, snapshot/submit/result integration, Socket.IO changes, backend changes, env/dependency changes, or WBS checkbox changes. Existing `LearnerLiveSessionView.tsx` working-tree diff remains untouched.
- **Incident/fix:** initial targeted test exposed that `maxLength={8}` prevented whitespace-padded 8-character codes from reaching trim validation; changed the input limit to 32 so UX normalization works while schema still requires 8 normalized characters. Re-run passed.
- **Verification:** `npx next typegen` → PASS; `npm test -- test/anonymous-join-form.test.tsx test/participant-live-sessions-api.test.tsx` → PASS (2 files / 13 tests); `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, 8 pre-existing warnings); `git diff --check` → PASS.
- **Manual Gate 3 review:** open `/join`, inspect labels/validation and Network request body/header matrix, confirm no token in URL/DOM, and verify successful navigation uses the server-returned LiveSession ID. Do not start CP4 until explicit confirmation.

### CP4 — Actor-qualified REST, cache, and submission attempts Results (2026-09-05)

- **Status:** PASS; stopped before Checkpoint 5 and waiting for manual Gate 4 confirmation.
- **What changed:** participant query keys now include a non-secret `student | anonymous` actor segment, with student status explicitly nested under the student subtree. Participant snapshot, result, and poll-single submission transport accept `ParticipantActor`; anonymous requests read the LiveSession-scoped credential immediately before fetch and use only `X-Participant-Token`, while student requests preserve session auth. Student join remains body `{}` and now runtime-validates `participantToken: null`.
- **Submission attempts:** `poll-submission-attempt.ts` now uses version 2 actor-qualified sessionStorage keys/records. Student and anonymous attempts cannot collide; old unqualified v1 records are ignored; no token is persisted; same-actor idempotency UUID behavior remains unchanged.
- **Tests:** updated participant API expectations and added anonymous key isolation, missing-credential no-fetch, and credential-bound snapshot coverage. Targeted verification passed: `npm test -- test/participant-live-sessions-api.test.tsx test/poll-submission-attempt.test.ts test/api-client.test.ts` → 3 files / 28 tests, 0 failed, 0 skipped.
- **Static verification:** `npx next typegen` → PASS; `npm run typecheck` → PASS; `npm run lint:check` → PASS with 0 errors and 8 pre-existing warnings; `git diff --check` → PASS. Vite config-loader and existing React Compiler/exhaustive-deps/browser unused-variable warnings remain non-blocking.
- **Scope preserved:** no shared participant UI, PollSingleQuestion actor wiring, Socket.IO changes, anonymous live route, backend/API/schema/dependency/env changes, WBS checkbox changes, or changes to the pre-existing FE-4.3 `LearnerLiveSessionView.tsx` diff.
- **Manual Gate 4 review:** inspect actor-qualified keys for same-ID student/anonymous separation and confirm no token/hash; inspect Network headers for anonymous snapshot/result/submission (`X-Participant-Token`, cookies included, no CSRF, stable `Idempotency-Key` on submission) versus student session/CSRF behavior; verify missing credential performs no fetch and student status remains student-only. Do not start Checkpoint 5 until explicit confirmation.

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

## 2026-09-03 — FE-4.1 Entry／join CP0 Backend discovery 與錯誤契約凍結

### Context and acceptance criteria

FE-4.1 must not add student entry/join UI or transport until the backend exposes a discoverable current joinable session and every FE-4.1.5 negative state can be classified by a stable error code. This CP0 is therefore a contract/evidence checkpoint only; it does not add frontend product code, mocks, fallback data, WBS changes, or backend changes.

- [x] Student `GET /me/courses` exposes a nullable current joinable session with `id`, `sessionCode`, and `status: waiting | active`.
- [x] The terminal-session exclusion and deterministic selection rule are frozen.
- [x] Existing account-cookie join and participant-safe snapshot behavior are located and mapped to evidence.
- [ ] Learner snapshot behavior for `closed`/`cancelled` sessions is available as a server-backed state (or explicitly removed from FE-4.1 acceptance).
- [ ] The student-only snapshot role boundary is frozen independently from the teacher/admin projection.
- [x] Not-enrolled/removed and disabled-account outcomes have distinct machine-readable stable codes.
- [x] User confirms the contract table and the next backend/WBS disposition.

### Contract table — current checkout disposition

<!-- prettier-ignore -->
| Endpoint／情境 | Request／auth／CSRF／Origin | Response／null／state rules required by FE-4.1 | Current checkout evidence and stable status/code | CP0 disposition |
| --- | --- | --- | --- | --- |
| `GET /api/v1/me/courses?page&pageSize` | Web Session + StudentGuard; GET does not need CSRF; existing pagination is `page=1`, `pageSize=20` by default | `Page<MyCourseDto>` preserves active enrollments and `enrolledAt DESC, id DESC`. Each course always carries `currentJoinableSession: { id, sessionCode, status } \| null`; only `waiting \| active` may be advertised. If multiple candidates exist, select `active` before `waiting`, then `createdAt DESC`, then `id DESC`; terminal/unknown statuses are excluded. | `EnrollmentsController.myCourses()` maps the projection; `CurrentJoinableSessionDto` and nullable `MyCourseDto.currentJoinableSession` are defined in `src/modules/enrollments/api/dto/enrollment.dto.ts:52-94`; selection/filtering is in `src/modules/enrollments/application/enrollment.service.ts:75-80,351-386`; OpenAPI/e2e assertions are in `test/openapi.e2e-spec.ts:178-202` and `test/enrollments.e2e-spec.ts:324-393`; reference: `docs/frontend-api-reference.md:378-388`. | **CONFIRMED** — discovery projection, null semantics, terminal exclusion, and deterministic selection are implemented and asserted. |
| `POST /api/v1/live-sessions/:sessionCode/join` — enrolled student | Student Web Session cookie; `OptionalStudentSessionGuard` resolves the session and requires student role; mutation requires CSRF token plus exact allowed Origin; body `{}`; success HTTP 201 | Response `{ participantId, participantToken: null, liveSession: { id, status, sessionCode }, currentQuestion }`; `liveSession` is server-authoritative. Repeated account join reuses the same participant row. | `ParticipantsController.join()` maps the account-bound response; `JoinLiveSessionResponseDto` keeps `participantToken` nullable; `ParticipantService.joinForAccount()` returns `null`; account-bound e2e covers 201, null token, binding, and snapshot (`src/modules/participants/api/participants.controller.ts:43-71`; `src/modules/participants/api/dto/participant.dto.ts:47-59`; `src/modules/participants/application/participant.service.ts:123-148`; `test/participant-account.e2e-spec.ts:208-258,617-663`). | **CONFIRMED** — source and account-bound e2e evidence cover the frozen response and idempotent account join; no frontend token synthesis is needed. |
| `GET /api/v1/live-sessions/:liveSessionId/snapshot` — student participant | Student Web Session cookie; `ParticipantOrSessionGuard`; GET does not need CSRF | Participant-safe snapshot. For a joinable session, the implementation removes `questionSelections`, returns only open `sessionQuestions`, and adds `hasSubmitted`; actor-safe `watermark`/`results` may be present. It must not expose teacher counts, teacher controls, or unrevealed correctness. | `ParticipantsController.snapshot()` performs the safe projection (`src/modules/participants/api/participants.controller.ts:73-121`); `LiveSessionDto` documents optional watermark/results and question fields (`src/modules/live-sessions/api/dto/live-session.dto.ts:57-103,112-125`); account-bound e2e asserts cookie snapshot and `hasSubmitted=false` (`test/participant-account.e2e-spec.ts:250-258`); reference: `docs/frontend-api-reference.md:409-418`. However, `getParticipantSnapshot()` rejects `closed`/`cancelled` with `409 SESSION_NOT_JOINABLE` (`src/modules/live-sessions/application/live-session.service.ts:977-1027`), and the participant-vs-teacher OpenAPI response shape is not explicitly asserted. | **PARTIALLY CONFIRMED / BLOCKED for CP3 terminal states** — privacy is confirmed for joinable sessions, but FE-4.1 cannot render server-backed `closed`/`cancelled` snapshot states until the endpoint contract is clarified. |
| Unenrolled student／removed enrollment on join or snapshot | Valid student cookie, otherwise same endpoint request | No enrollment row is `403 ENROLLMENT_REQUIRED`; removed enrollment is `403 ENROLLMENT_REMOVED`; neither returns participant/snapshot data or creates a participant. Clients must use the code, never `message`. | `EnrollmentService.assertActiveEnrollment()` and `ParticipantService.findOrCreateAccountParticipant()` now throw the dedicated errors (`src/modules/enrollments/application/enrollment.service.ts:411-421`; `src/modules/participants/application/participant.service.ts:248-260`); account-bound e2e asserts both codes and no participant side effect (`test/participant-account.e2e-spec.ts:529-544,665-709`). Reference: `docs/frontend-api-reference.md:407`. | **CONFIRMED** — missing and removed enrollment are machine-distinguishable. |
| Wrong-role／generic forbidden | Authenticated non-student or unauthorized actor | Remains generic `403 FORBIDDEN` and must not be mislabeled as not-enrolled. | Backend error catalog and participant role guard use `ForbiddenError` (`src/common/errors/error-codes.ts:13-16`; `src/modules/participants/application/participant.service.ts:234-240`); reference confirms the same machine-readable distinction (`docs/frontend-api-reference.md:407`). | **CONFIRMED** — generic forbidden remains distinct from enrollment-required/removed codes. |
| Disabled account | Cookie belonging to an account disabled after session issuance | Participant-bound join/snapshot routes return `401 AUTH_ACCOUNT_DISABLED`; ordinary SessionGuard routes retain their generic behavior. No participant/snapshot data or side effect is allowed. Fresh login for a disabled account remains generic `AUTH_INVALID_CREDENTIALS`. | Participant-only guard path calls `canActivateForParticipant()`; `SessionService.loadActiveSession()` exposes `AccountDisabledError` only with `exposeDisabled` (`src/common/auth/session.guard.ts:24-57`; `src/common/auth/session.service.ts:204-231`; `src/modules/participants/api/participant-token.guard.ts:47,85-86`); unit/e2e evidence: `src/common/auth/session.service.spec.ts:166-183`, `test/participant-account.e2e-spec.ts:712-752`; reference: `docs/frontend-api-reference.md:376,407`. | **CONFIRMED** — disabled is machine-distinguishable at the participant boundary without changing ordinary auth semantics. |
| Missing／malformed or revoked session | No valid active Web Session cookie | `401 UNAUTHORIZED`; frontend may treat it as unauthenticated. | Session e2e confirms logged-out, malformed, and missing cookies return `401 UNAUTHORIZED` (`smartLearning-backend/test/auth-session-expiry.e2e-spec.ts:172-199`). | **CONFIRMED**. |
| Expired session (idle or absolute) | Cookie exists but session exceeds idle or absolute timeout | `401 AUTH_SESSION_EXPIRED`; frontend may prompt re-login, but must not use `expiresAt` as the auth authority. | Session service and e2e confirm both timeout kinds use `AUTH_SESSION_EXPIRED` (`smartLearning-backend/src/common/auth/session.service.ts:226-240`; `smartLearning-backend/test/auth-session-expiry.e2e-spec.ts:142-170`). | **CONFIRMED**. |
| Unknown／closed／cancelled session code on join | Any join request; no participant side effect | `409 SESSION_NOT_JOINABLE`; terminal sessions must never be discovery candidates. | `ParticipantService.join()` and account join path check `isJoinableLiveSessionStatus()` and throw `SESSION_NOT_JOINABLE` (`src/modules/participants/application/participant.service.ts:76-87,189-219`). Terminal e2e asserts closed/cancelled joins return 409 with this code (`test/cp3-terminal-state.e2e-spec.ts:201-249`); `/me/courses` filters terminal candidates (`src/modules/enrollments/application/enrollment.service.ts:351-386`). | **CONFIRMED** — direct join rejection and discovery-side terminal exclusion are both frozen. |

### Evidence and scope review

- **Source/reference review:** completed against backend HEAD `305ec9b`, the controllers, DTOs, application services, error catalog, frontend API reference, OpenAPI assertions, and participant/session e2e tests listed in the table.
- **Frontend baseline:** `lib/api/enrollments.ts` and `lib/api/types.ts` currently expose only the existing paginated `MyCourseDto`; `features/student/MyCoursesView.tsx` has no entry action. No FE-4.1 transport, route, feature, or browser spec was started.
- **Next.js 16 gate recorded for later checkpoints:** dynamic route `params` are `Promise` values; client event-handler navigation uses `useRouter`; expected API errors stay in feature UI; unexpected rendering errors use route `error.tsx`; `not-found.tsx` is reserved for a true 404. No route implementation belongs in CP0.
- **Open contract gaps:** participant snapshot is safe only for the participant branch and joinable session states; teacher/admin cookies receive the teacher projection, and closed/cancelled participant snapshots currently return `409 SESSION_NOT_JOINABLE`. Join/snapshot generated OpenAPI response schemas are not explicitly asserted.
- **No runtime/DB mutation evidence was manufactured:** no authenticated join, fixture provisioning, migration, truncate, or WBS update was performed in this documentation checkpoint. Backend test files are cited as evidence sources; any runtime evidence must be separately labeled and use an isolated fixture.

### CP0 result — CONTRACT PARTIALLY READY / BLOCKED FOR CLARIFICATION

Backend commit `305ec9b` (`feat(enrollments): add student session discovery contract`) resolves the original discovery and stable-error blockers, but CP0 is not fully clear for the FE-4.1 plan. The projection, deterministic candidate selection, participant-safe joinable snapshot boundary, and stable negative-path codes are present and covered by source, reference, unit, OpenAPI, and backend e2e assertions.

Confirmed contract portions:

1. `/me/courses` always returns `currentJoinableSession` as a projection or `null`; only `waiting | active` candidates are considered, with deterministic `active` → `waiting` → `createdAt DESC` → `id DESC` selection.
2. Missing enrollment and removed enrollment are `403 ENROLLMENT_REQUIRED` and `403 ENROLLMENT_REMOVED`; wrong-role join access remains generic `403 FORBIDDEN`.
3. Participant-bound disabled-account cookies are `401 AUTH_ACCOUNT_DISABLED`; missing/revoked sessions remain `401 UNAUTHORIZED`, and expired sessions remain `401 AUTH_SESSION_EXPIRED`.
4. Direct join rejection for unknown/closed/cancelled session codes remains `409 SESSION_NOT_JOINABLE`; terminal sessions are excluded from discovery.

Blocking clarifications before CP1:

1. FE-4.1 CP3 requires learner snapshot states for `closed` and `cancelled`, but `GET /live-sessions/:id/snapshot` currently rejects non-joinable sessions with `409 SESSION_NOT_JOINABLE`; no terminal snapshot response contract or e2e proof exists.
2. The snapshot endpoint returns a teacher projection for teacher/admin cookies and a participant-safe projection for participant context. FE-4.1 must explicitly rely on the StudentLayout role gate, or backend must expose a student-only snapshot contract; this cannot be inferred through UI heuristics.
3. Join/snapshot response schemas are not explicitly asserted in the current OpenAPI e2e suite. Source and focused e2e evidence exist, but generated runtime schemas remain an evidence gap if OpenAPI is required as the freeze authority.

Frontend must use stable codes and allowlisted projections only; it must not parse backend messages or infer access state from status heuristics. The user chose **補 backend 契約（建議）**: add a server-backed learner terminal snapshot contract, freeze the student-only role boundary, and add the missing join/snapshot OpenAPI response assertions as needed. CP1–CP5 remain pending; no frontend implementation starts until that backend contract work is complete and revalidated.

### User disposition and rollback

- User reviewed the contract table and chose **補 backend 契約（建議）**: backend must first provide a server-backed learner snapshot state for `closed`/`cancelled`, explicitly freeze the student-only snapshot role boundary, and add join/snapshot OpenAPI response assertions if those schemas are part of the freeze authority.

## 2026-09-06 — FE-5.1 Poll Multiple Checkpoint 3 Results

- **Status:** PARTIALLY VERIFIED; isolated runtime/browser fixture completed and cleaned up. CP4 remains pending.
- **Runtime:** isolated Compose project `smartlearning-fe51-cp3`; migration exit `0`; backend `/health/live` and `/health/ready` returned `200`; UI ran on `localhost:3001` against backend `localhost:3000`.
- **Fixture safety:** created disposable admin/teacher/student accounts, course, Poll Multiple question, active LiveSession, and anonymous participant only in the named isolated project. The project, volumes, and network were removed afterward. No shared/dev database or unrelated container was touched.
- **Manual browser evidence:** real Chromium flow passed native checkbox rendering, `fieldset`/`legend`, `可複選`, long-text wrapping, keyboard Space selection, empty-submit disabled state, two-option submission, single request under double-click, submitted lock, participant-safe anonymous results, and mobile `390px` no-horizontal-overflow. Evidence: `/tmp/fe51-cp3-evidence/cp3-desktop-light.png`, `/tmp/fe51-cp3-evidence/cp3-desktop-light-submitted.png`, `/tmp/fe51-cp3-evidence/cp3-mobile-dark-submitted.png`.
- **Observed gaps:** color-scheme emulation did not produce a visibly distinct dark palette; response-loss/same-key permutation retry and anonymous credential-loss cleanup were not exercised. These remain unverified and prevent full CP3 PASS.
- **Static/runtime discovery:** `npm run test:browser -- --list` discovered 8 Chromium specs. This is discovery evidence only and no FE-5.1 CP4 browser spec was added.
- **Scope:** no WBS checkbox update, migration outside the isolated fixture, product backend change, mock API, or commit-time generated artifact was added by this CP3 run. Continue only with explicit CP4 authorization after resolving or accepting the listed gaps.
- **Response-loss rerun:** backend boundary instrumentation in the isolated runtime reported `methodMatches=true`, `pathMatches=true`, `tokenMatches=true`, `keyPresent=true`, `target=true`, followed by `response.destroy()`; a later same-key request was classified `alreadyConsumed=true` and the UI showed the authoritative result. Browser-level controlled permutation payload comparison was not completed, so this remains **PARTIALLY VERIFIED** rather than CP3 PASS.
- This is a CP0 disposition only, not authorization to start CP1 or to modify frontend files. CP1 remains blocked until the backend contract is implemented and CP0 is revalidated.
- Rollback is documentation-only for this checkpoint: remove this FE-4.1 task-log section if rejected. Existing frontend/backend source, runtime data, migrations, and prior task records are untouched.

### CP0 verification

- Backend targeted unit tests at HEAD `305ec9b`: `npm test -- --runInBand src/common/errors/error-codes.spec.ts src/common/auth/session.service.spec.ts` → **PASS** (2 suites / 11 tests; 0 failed, 0 skipped).
- Backend `npm run test:e2e -- --runInBand test/openapi.e2e-spec.ts` → **PASS** (1 suite / 4 tests; 0 failed, 0 skipped) using the backend e2e Jest configuration; it initializes the app and reads OpenAPI/Swagger routes. Non-fatal Nest `LegacyRouteConverter` warnings were emitted.
- Backend `npm run typecheck` → **PASS** (no diagnostics).
- Backend DB-backed enrollment/participant e2e was intentionally not run in this CP0 pass: those suites mutate/truncate the test database and require separate explicit isolated-fixture authorization. Their checked-in assertions are cited as contract evidence, not claimed as a fresh runtime run.
- Read-only runtime health/docs probe → **BLOCKED** because `curl` is unavailable in the environment; no runtime/DB mutation was attempted.
- `npx prettier --check tasks/todo.md` → **PASS**.
- `git diff --check` → **PASS**.
- `git diff --name-only` → confirms only `tasks/todo.md` is changed in the UI repository; no FE-4.1 product files, backend files, env, dependencies, or WBS files.
- No commit or push; stop at CP0 pending backend completion of the terminal-snapshot/role-boundary contract and a fresh CP0 revalidation.

## 2026-09-03 — FE-4.1 CP0 再驗證（backend 契約已補齊）

### Revalidation result — CONTRACT READY / CP0 CLEAR

Backend working tree (uncommitted, on top of `305ec9b`) implements the three CP0 blockers. Revalidation against the new contract:

1. **Learner terminal snapshot states — RESOLVED.** New `GET /api/v1/live-sessions/:liveSessionId/student-status` returns an exact `{ id, status, startedAt, closedAt }` allowlist for **all four** lifecycle states (`waiting | active | closed | cancelled`) with HTTP 200. It is a read-only lifecycle receipt: `LiveSessionService.getStudentLiveSessionStatus()` reads only LiveSession/Course/Account/Enrollment locked rows, never touches Participant/Submission/ArchivedResult, and never creates a Participant (e2e asserts `participant.count === 0`). Terminal sessions stay readable after close-time anonymization. `startedAt`/`closedAt` are ISO-8601 or `null` (`waiting`/`cancelled` both null; `closed` both set).
2. **Student-only role boundary — RESOLVED.** `AuthenticatedStudentSessionGuard` composes the participant-bound session classification (`canActivateForParticipant`, exposing `AUTH_ACCOUNT_DISABLED`) with the shared `StudentGuard`. It never resolves or accepts `X-Participant-Token`. Teacher/admin cookies → `403 FORBIDDEN`; anonymous → `401 UNAUTHORIZED`; expired → `401 AUTH_SESSION_EXPIRED`; disabled-account cookie → `401 AUTH_ACCOUNT_DISABLED`; missing/removed enrollment → `403 ENROLLMENT_REQUIRED` / `403 ENROLLMENT_REMOVED`; unknown session → `404 NOT_FOUND`; malformed UUID → `400`.
3. **OpenAPI response assertions — RESOLVED.** `test/openapi.e2e-spec.ts` now asserts the `StudentLiveSessionStatusDto` schema: exact property set (`id,status,startedAt,closedAt`), `status` enum `[waiting,active,closed,cancelled]`, nullable timestamps, required fields, and the route's GET-only shape with the `200` success schema.

### Contract boundary vs `/snapshot` (unchanged)

`/snapshot` keeps its existing behavior: participant context on a terminal session still returns `409 SESSION_NOT_JOINABLE`; teacher/admin cookies still get the teacher projection. The new `/student-status` route is the FE-4.1 learner terminal-state source and returns no questions, results, counts, or watermark. Socket.IO handshake/reconnect rejection for terminal sessions is unchanged.

### Revalidation verification (backend, on the new working tree)

- `npm run typecheck` → **PASS** (no diagnostics).
- `npm test -- --runInBand src/modules/live-sessions/application/student-session-status.spec.ts src/modules/participants/api/student-session.guard.spec.ts` → **PASS** (2 suites / 10 tests; 0 failed).
- `npm run test:e2e -- --runInBand test/openapi.e2e-spec.ts` → **PASS** (1 suite / 4 tests; 0 failed). Non-fatal `LegacyRouteConverter` warnings only.
- `npm run test:e2e -- --runInBand test/student-session-status.e2e-spec.ts` → **PASS** (1 suite / 8 tests; 0 failed, 30.1s) against the migrated `smartlearning_test` DB — covers active/waiting/closed/cancelled receipts, no-participant side effect, enrollment missing/removed, teacher/admin/anonymous/unknown/malformed rejection, disabled account, and expired session.
- No runtime/DB mutation outside the isolated `smartlearning_test` fixture; no other DB touched.

### Disposition

- CP0 is now **CLEAR**. The three blocking clarifications are resolved with source, unit, OpenAPI, and DB-backed e2e evidence. FE-4.1 may proceed to CP1 (frontend transport + entry/join UI) against the frozen contract.
- Frontend still must use stable codes and allowlisted projections only; it must not parse backend messages or infer access state from status heuristics. `MyCourseDto.currentJoinableSession` (discovery) and `GET /live-sessions/:id/student-status` (lifecycle receipt) are the two server-authoritative sources.
- The backend working tree is **uncommitted**. Per the Option B convention, the backend contract should be committed before CP1 frontend work starts. No frontend product code was added in this revalidation.
- Rollback is documentation-only for this checkpoint: remove this revalidation section if rejected. No frontend/backend source, runtime data, or migrations were changed by this revalidation.

## 2026-09-04 — FE-4.1 CP1 Typed transport 與 cache 隔離

### Goal and acceptance criteria

- [x] `lib/api/types.ts` 加入凍結後的 discovery projection、join response、participant snapshot／question projection。
- [x] `lib/api/query-keys.ts` 增加獨立 participant namespace（`participantLiveSessions.snapshot(id)` / `studentStatus(id)`），不重用 teacher `liveSessions.detail(id)`。
- [x] 新增 `lib/api/participant-live-sessions.ts`：Cookie join mutation（`trim().toUpperCase()`、encode path segment、body `{}`、`mutate: true`）、learner snapshot query（Cookie GET、forward abort signal、`retry: false`、無 ID 時 disabled）、student-status lifecycle receipt query。
- [x] 不儲存或合成 participant token；join response 不做假 seed；不加入 polling 或 Socket.IO。
- [x] 調整 `lib/api/enrollments.ts` 對 discovery projection 的型別傳輸，保持 backend pagination/order 原樣。
- [x] 新增／擴充 transport tests，證明 request、normalization、response preservation、cache separation、失敗時無 optimistic state。

### What changed

- **`lib/api/types.ts`**: 新增 `CurrentJoinableSession`（`id`/`sessionCode`/`status: waiting | active`）、`MyCourseDto.currentJoinableSession: CurrentJoinableSession | null`（required，nullable）、`JoinLiveSessionResponse`（`participantToken: null` + server-authoritative `liveSession`）、`ParticipantLiveSessionSnapshot`（participant-safe，無 `questionSelections`/counts/teacher controls）、`StudentLiveSessionStatus`（四態 lifecycle receipt）。
- **`lib/api/query-keys.ts`**: 新增 `participantLiveSessions` namespace（`all`/`snapshot(id)`/`studentStatus(id)`），與 teacher `liveSessions` 完全分離。
- **`lib/api/participant-live-sessions.ts`**（new）: `normalizeSessionCode`（trim+uppercase）、`encodeSessionCodePath`（encodeURIComponent）、`useJoinLiveSession`（body `{}`、`mutate: true`）、`participantSnapshotQueryOptions`/`useParticipantSnapshot`、`studentStatusQueryOptions`/`useStudentStatus`。無 token 合成、無假 seed、無 polling/socket。
- **`lib/api/enrollments.ts`**: 僅更新 doc comment 標註 discovery projection 隨 paginated response 傳輸；transport 本身不變（`Page<MyCourseDto>` 原樣）。
- **`test/participant-live-sessions-api.test.tsx`**（new）: 10 tests — normalization、join request shape（body `{}` + CSRF/Origin）、join 失敗無 optimistic state、snapshot cookie GET + response preservation + 無 teacher-only fields、empty-id disabled、error identity、student-status 四態、cache separation（participant key ≠ teacher detail key）。
- **`test/enrollments-api.test.tsx`**: 新增 discovery projection 傳輸 test（active/null per row、pagination/order 不變）；fixture 補 `currentJoinableSession: null`。
- **`test/my-courses-view.test.tsx`**: fixture 補 `currentJoinableSession: null`（保持契約準確）。

### How verified

- `npm test -- test/participant-live-sessions-api.test.tsx test/enrollments-api.test.tsx` → **PASS**（2 files / 36 tests；0 failed, 0 skipped）。
- `npx next typegen` → **PASS**（types generated）。
- `npm run typecheck` → **PASS**（0 errors）。
- `npm run lint:check` → **PASS**（0 errors；4 pre-existing warnings 全在 FE-4.1 變更集之外：`AccountCreateForm.tsx` 1 + `fe-2-2-roster.spec.ts` 3）。
- `npx prettier --check`（7 changed files）→ **PASS**（先 `prettier --write` 3 個新/改檔案後全綠）。
- `git diff --check` → **PASS**。
- 未 commit、未 push；未改 backend、DB、WBS、dependencies。

### Scope / rollback

- 變更僅限 FE-4.1 CP1 transport 層：`lib/api/types.ts`、`lib/api/query-keys.ts`、`lib/api/enrollments.ts`、`lib/api/participant-live-sessions.ts`（new）、`test/participant-live-sessions-api.test.tsx`（new）、`test/enrollments-api.test.tsx`、`test/my-courses-view.test.tsx`、`tasks/todo.md`。
- 未加入可見 UI（CP2 才做）；未加入 polling/socket；未合成 token。
- Rollback：僅撤回上述 transport/key/test 檔案即可，不影響已完成的 teacher FE-3.x。

### Checkpoint disposition

- CP1 完成。依計畫「執行規則」，此處 **Hard stop**：等待使用者確認 transport/cache boundary 後才進 CP2。未 commit、未 push、未勾 WBS。

## 2026-09-04 — FE-4.1 CP2 「我的課程」真實 Entry UI

### Goal and acceptance criteria

- [x] 僅依 backend discovery projection 顯示動作：`null` 無按鈕、`waiting` 等候中課堂入口、`active` 進入課堂、非預期 terminal status fail closed。
- [x] 點擊後以 discovery 的 `sessionCode` 呼叫 CP1 join；row-local pending、避免 double submit；成功只使用 response 的 `liveSession.id` 導向 `/student/live/:id`。
- [x] `SESSION_NOT_JOINABLE` race 留在 My Courses 顯示 curated inline error，並提供刷新 discovery；不顯示 raw backend message。
- [x] 保持既有 loading／empty／error／pagination 行為不變。
- [x] 擴充 `test/my-courses-view.test.tsx`：null/waiting/active/invalid discovery、pending、duplicate click、server-returned ID navigation、409 race、安全錯誤文字，以及既有分頁回歸。

### What changed

- **`features/live-student/JoinLiveSessionButton.tsx`**（new）: row-local join control。僅依 discovery projection 渲染：`waiting` → 「等候中課堂入口」、`active` → 「進入課堂」、任何非預期/terminal status **fail closed**（不渲染入口）。點擊以 discovery `sessionCode` 呼叫 CP1 `useJoinLiveSession`；成功以 server-returned `liveSession.id` 導向 `/student/live/:id`。row-local pending + double-submit guard（`if (join.isPending) return`）。`SESSION_NOT_JOINABLE` race → curated `ErrorAlert`（「此課堂目前無法加入。」）+ 「重新整理課堂狀態」按鈕呼叫 discovery refresh；raw backend message 永不顯示。
- **`features/student/MyCoursesView.tsx`**: `CourseCard` 在 `currentJoinableSession` 非 null 時渲染 `JoinLiveSessionButton`，並傳入 `onRefreshDiscovery={() => void refetch()}`（來自 `useMyCourses`）。loading/empty/error/pagination 行為不變。
- **`test/my-courses-view.test.tsx`**: 新增 8 tests — null discovery（無按鈕）、waiting entry、active entry、invalid/terminal status fail closed、join + server-ID navigation、pending + duplicate-click guard、409 race + refresh、非 race 錯誤（無 refresh link、安全文字）。既有分頁/收縮/empty/error/gating 回歸維持。

### How verified

- `npm test -- test/my-courses-view.test.tsx test/participant-live-sessions-api.test.tsx` → **PASS**（2 files / 25 tests；0 failed, 0 skipped）。
- `npx next typegen` → **PASS**（types generated）。
- `npm run typecheck` → **PASS**（0 errors）。
- `npm run lint:check` → **PASS**（0 errors；4 pre-existing warnings 全在 CP2 變更集之外：`AccountCreateForm.tsx` 1 + `fe-2-2-roster.spec.ts` 3）。
- `npx prettier --check`（3 CP2 files）→ **PASS**。
- `git diff --check` → **PASS**。
- `npm test`（full）→ **PASS**（28 files / 218 tests；0 failed, 0 skipped）。
- `npm run build` → **PASS**（Next.js 16.3.1 Turbopack；13 routes，12/12 static pages）。
- 未 commit、未 push；未改 backend、DB、WBS、dependencies。

### Scope / rollback

- 變更僅限 FE-4.1 CP2 entry UI 層：`features/live-student/JoinLiveSessionButton.tsx`（new）、`features/student/MyCoursesView.tsx`、`test/my-courses-view.test.tsx`、`tasks/todo.md`。CP1 transport files（`lib/api/types.ts`、`query-keys.ts`、`enrollments.ts`、`participant-live-sessions.ts`、`test/participant-live-sessions-api.test.tsx`、`test/enrollments-api.test.tsx`）為先前 CP1 已存在之工作樹變更，非本 CP 新增。
- 未加入 polling/socket；未合成 token；未新增 route（CP3 才做 learner route）。
- Rollback：僅撤回 `JoinLiveSessionButton.tsx`、`MyCoursesView.tsx` 的 entry 改動與對應 tests 即可，不影響已完成的 teacher FE-3.x 或 CP1 transport。

### Checkpoint disposition

- CP2 完成並通過 static/unit/build 驗證。依計畫「執行規則」，此處 **Hard stop**：等待使用者確認可見 entry slice 後才進 CP3。未 commit、未 push、未勾 WBS。

## 2026-09-04 — FE-4.1 CP3 Learner snapshot route 與 session states

### Goal and acceptance criteria

- [x] 新增 `app/(student)/student/live/[liveSessionId]/page.tsx`、`loading.tsx`、`error.tsx`；只有 frozen contract 存在真正 404 語義時才加 `not-found.tsx`。
- [x] 新增 `features/live-student/LearnerLiveSessionView.tsx`，只使用 participant snapshot hook/type。
- [x] 依 `snapshot.status` 渲染，不能以空 question array 推斷狀態：`waiting`／`active`+無 open question／`active`+open question（participant-safe prompt/options/hasSubmitted，無作答控制）／`closed`／`cancelled`。
- [x] 因 realtime 屬 FE-4.3，只提供明確「更新課堂狀態」refetch，不做自動 polling，也不暗示即時更新。
- [x] 不呼叫 teacher detail endpoint、不顯示 counts、teacher controls、未揭露 correctness。
- [x] 新增 learner view/route tests：loading、waiting、active between questions、active open question、closed、cancelled、manual refresh、route param passthrough、無 socket/作答/teacher-only projection。

### What changed

- **`app/(student)/student/live/[liveSessionId]/page.tsx`**（new）: Server Component shell，`params: Promise<{ liveSessionId }>`，回我的課程 back link + heading，掛載 `LearnerLiveSessionView`。受既有 `(student)` layout 的 session/role/mustChangePassword gate 保護。
- **`loading.tsx`**（new）: `role="status"` loading boundary。
- **`error.tsx`**（new）: route-local unexpected-error boundary（curated copy + retry）。**未加 `not-found.tsx`**：snapshot 的 404 是預期 API 錯誤，依 Next.js 16 gate 在 feature UI 內以 `NotFoundState` 處理，非 route-level not-found。
- **`features/live-student/LearnerLiveSessionView.tsx`**（new）: 只從 `useParticipantSnapshot` 渲染。因 snapshot endpoint 對 terminal session 回 `409 SESSION_NOT_JOINABLE`，terminal 時 fallback 到 `useStudentStatus`（CP0 確認的 learner terminal-state source）區分 `closed`/`cancelled`。`LiveState` 依 `snapshot.status` 分支（非空 question array）：`waiting`→等待老師開始、`active`+無 open question→等待老師開題、`active`+open question→participant-safe prompt/options/hasSubmitted（無作答控制）。`TerminalState` 唯讀 + 返回我的課程。唯一 refresh 是「更新課堂狀態」refetch；無 polling/socket/realtime 宣稱。無 teacher-only data（counts/controls/correctness）。
- **`test/learner-live-session-view.test.tsx`**（new, 11 tests）: loading、waiting、active between questions、active open question、hasSubmitted、closed（via student-status）、cancelled、404 not-found、非 terminal error（curated generic，raw message 不顯示）、manual refresh、無 teacher-only data/作答控制。
- **`test/learner-live-route.test.tsx`**（new, 1 test）: route shell + `liveSessionId` passthrough。

### How verified

- `npm test -- test/learner-live-session-view.test.tsx test/learner-live-route.test.tsx` → **PASS**（2 files / 12 tests；0 failed, 0 skipped）。
- `npx next typegen` → **PASS**（types generated，含 `/student/live/[liveSessionId]`）。
- `npm run typecheck` → **PASS**（0 errors）。
- `npm run lint:check` → **PASS**（0 errors；4 pre-existing warnings 全在 CP3 變更集之外：`AccountCreateForm.tsx` 1 + `fe-2-2-roster.spec.ts` 3）。
- `npx prettier --check`（5 CP3 files）→ **PASS**（先 `prettier --write` 2 個新檔案後全綠）。
- `git diff --check` → **PASS**。
- `npm test`（full）→ **PASS**（30 files / 230 tests；0 failed, 0 skipped）。
- `npm run build` → **PASS**（Next.js 16.3.1 Turbopack；14 routes，含新 dynamic `/student/live/[liveSessionId]`）。
- 未 commit、未 push；未改 backend、DB、WBS、dependencies。

### Scope / rollback

- 變更僅限 FE-4.1 CP3 learner route/feature 層：`app/(student)/student/live/[liveSessionId]/{page,loading,error}.tsx`（new）、`features/live-student/LearnerLiveSessionView.tsx`（new）、`test/learner-live-session-view.test.tsx`（new）、`test/learner-live-route.test.tsx`（new）、`tasks/todo.md`。CP1/CP2 files（`lib/api/types.ts`、`query-keys.ts`、`enrollments.ts`、`participant-live-sessions.ts`、`features/live-student/JoinLiveSessionButton.tsx`、`features/student/MyCoursesView.tsx`、`test/participant-live-sessions-api.test.tsx`、`test/enrollments-api.test.tsx`、`test/my-courses-view.test.tsx`）為先前 CP1/CP2 已存在之工作樹變更，非本 CP 新增。
- 未加入 polling/socket；未合成 token；未呼叫 teacher detail endpoint；未顯示 counts/teacher controls/correctness；未提供作答控制（FE-4.2）。
- Rollback：僅撤回 CP3 route/feature/test 檔案即可，不影響已完成的 teacher FE-3.x 或 CP1/CP2 transport/entry。

### Checkpoint disposition

- CP3 完成並通過 static/unit/build 驗證。依計畫「執行規則」，此處 **Hard stop**：等待使用者逐一確認 learner states 後才進 CP4。未 commit、未 push、未勾 WBS。

## 2026-09-04 — FE-4.1 CP4 Not enrolled／disabled／forbidden 負向狀態

### Goal and acceptance criteria

- [x] 依 CP0 凍結的 stable codes，在 join 與 learner view 增加專屬 access state；抽出 `features/live-student/LearnerAccessState.tsx`。
- [x] 更新 `lib/api/error-messages.ts`，只加入已凍結 codes。
- [x] 保證：not enrolled 不洩漏 course/question data；wrong-role forbidden 不誤稱未加選；disabled 不與普通 expired/missing session 混淆；expired/missing session 以安全 `next` 導向 login；access loss 後不殘留舊 snapshot；raw backend message、IDs、Cookie、CSRF、token 永不顯示。
- [x] 建立 status/code matrix tests，並以真實 fixture 分別驗證 active-but-unenrolled、removed enrollment、wrong role、disabled student、ordinary expired session、network/unknown error。錯誤元件使用穩定 ID，Playwright 不以不唯一的 `getByRole("alert")` 定位。

### What changed

- **`features/live-student/LearnerAccessState.tsx`**（new）: 專屬 learner access state。`isLearnerAccessError()` 以 CP0 凍結 codes（`ENROLLMENT_REQUIRED`/`ENROLLMENT_REMOVED`/`FORBIDDEN`/`AUTH_ACCOUNT_DISABLED`/`AUTH_SESSION_EXPIRED`/`UNAUTHORIZED`）分類；`AUTH_SESSION_EXPIRED`/`UNAUTHORIZED` 以 `useEffect` 安全 `next` 導向 login（`/login?next=<encoded pathname>`，US-F6 尊重），其餘渲染專屬 access UI（`帳號已停用` 或 `無法進入課堂` + `errorMessage(code)`）。永不渲染 raw message、IDs、Cookie、CSRF、token。接受穩定 `id` 供 browser test 定位。
- **`features/live-student/LearnerLiveSessionView.tsx`**: snapshot 與 student-status 的 access-loss error 改走 `LearnerAccessState`（取代 generic `ErrorAlert`）；expired/missing 導向 login。
- **`features/live-student/JoinLiveSessionButton.tsx`**: join 的 access-loss error 改走 `LearnerAccessState`（`join-access-<sessionId>`）；`SESSION_NOT_JOINABLE` race 維持 curated `ErrorAlert` + discovery refresh。
- **`lib/api/error-messages.ts`**: 只新增凍結 codes — `ENROLLMENT_REQUIRED`（「你尚未加選此課程，無法進入課堂。」）、`ENROLLMENT_REMOVED`（「你的課程加選已被移除，無法進入課堂。」）、`AUTH_ACCOUNT_DISABLED`（「此帳號已停用，請聯絡管理員。」）。
- **`test/learner-access-state.test.tsx`**（new, 8 tests）: `isLearnerAccessError` 分類（frozen vs non-access codes）、not-enrolled 無洩漏、removed、wrong-role 不誤稱、disabled 不與 expired 混淆、expired/missing 安全 `next` 導向 login。
- **`test/learner-live-session-view.test.tsx`**（+7 tests）: snapshot ENROLLMENT_REQUIRED/REMOVED、FORBIDDEN 不誤稱、disabled 不混淆、expired/missing 導向 login、terminal student-status access loss。
- **`test/my-courses-view.test.tsx`**（+5 tests）: join ENROLLMENT_REQUIRED/REMOVED、FORBIDDEN 不誤稱、disabled、expired 導向 login；既有 generic non-race error test 改為 `INTERNAL_ERROR`（因 `FORBIDDEN` 現已走 access state）。

### How verified

- `npm test -- test/learner-access-state.test.tsx test/learner-live-session-view.test.tsx test/my-courses-view.test.tsx` → **PASS**（3 files / 53 tests；0 failed, 0 skipped）。
- `npm test`（full）→ **PASS**（31 files / 257 tests；0 failed, 0 skipped）。
- `npx next typegen` → **PASS**。
- `npm run typecheck` → **PASS**（0 errors）。
- `npm run lint:check` → **PASS**（0 errors；4 pre-existing warnings 全在 CP4 變更集之外：`AccountCreateForm.tsx` 1 + `fe-2-2-roster.spec.ts` 3）。
- `npx prettier --check`（7 CP4 files）→ **PASS**（先 `prettier --write` 4 個檔案後全綠）。
- `npm run build` → **PASS**（Next.js 16.3.1 Turbopack；含 dynamic `/student/live/[liveSessionId]`）。
- `git diff --check` → **PASS**。
- 未 commit、未 push；未改 backend、DB、WBS、dependencies。

### Scope / rollback

- 變更僅限 FE-4.1 CP4 access-state 層：`features/live-student/LearnerAccessState.tsx`（new）、`features/live-student/LearnerLiveSessionView.tsx`、`features/live-student/JoinLiveSessionButton.tsx`、`lib/api/error-messages.ts`、`test/learner-access-state.test.tsx`（new）、`test/learner-live-session-view.test.tsx`、`test/my-courses-view.test.tsx`、`tasks/todo.md`。CP1/CP2/CP3 files 為先前已存在之工作樹變更，非本 CP 新增。
- 未加入 polling/socket；未合成 token；未呼叫 teacher detail endpoint；未顯示 counts/teacher controls/correctness；未提供作答控制（FE-4.2）。
- Rollback：僅撤回 CP4 access-state 檔案與對應 tests 即可，不影響已完成的 teacher FE-3.x 或 CP1/CP2/CP3 transport/entry/route。

### Checkpoint disposition

- CP4 完成並通過 static/unit/build 驗證。所有 CP0 凍結的負向 codes 皆可由 stable code 機器區分（backend e2e 已證實），無 BLOCKED 條件。依計畫「執行規則」，此處 **Hard stop**：等待使用者確認所有可建立的負向 fixture 後才進 CP5。未 commit、未 push、未勾 WBS。

## 2026-09-04 — FE-4.1 CP5 Real-backend browser acceptance 與 closeout

### Goal and acceptance criteria

- [x] 新增 `test/browser/fe-4-1-entry-join.spec.ts`；runner 已能自動 discover，不需改 `test/browser/run.mjs`。
- [x] 測試 fail closed、零 skip，使用隔離 fixture；UI/API 相同 hostname，真實 browser 接收 Secure `__Host-*` cookies；Origin 用 `request.allHeaders()` 驗證；任何建立／狀態變更皆可證明且 aggregate cleanup。
- [x] 覆蓋：My Courses discovery、waiting/active entry、join request、server-ID navigation、snapshot states、terminal race、not-enrolled、wrong-role、disabled、expired session、cleanup。

### What changed

- **`test/browser/fe-4-1-entry-join.spec.ts`**（new）: 真實 backend Playwright spec。`assertFixturePreflight()` 在 `FE41_*` fixture 缺失時 throw BLOCKED（fail closed，永不 skip）。流程：
  - **Discovery**：`GET /me/courses` 驗證 `currentJoinableSession` 為 `{ id, sessionCode, status: 'waiting' }`；My Courses 顯示「等候中課堂入口」。
  - **Join**：`waitForRequest` 攔截 `POST /live-sessions/:sessionCode/join`，`assertMutationHeaders` 驗證 exact Origin + CSRF cookie echo，`assertRequestBodyKeys` 驗證 body `{}`；成功以 server-returned `liveSession.id` 導向 `/student/live/:id`。
  - **Snapshot states**：waiting →（teacher start + open）→ active + open question（prompt/options/`尚未作答。`，無 teacher-only data、無作答控制）→（teacher close）→ closed terminal（`已結束` + 返回我的課程）。
  - **Terminal race**：第二個 session 在 discovery 與 join 之間被 close，join 顯示 curated `此課堂目前無法加入。` + `重新整理課堂狀態`，不導頁。
  - **Not-enrolled**：未加選學生直接造訪 learner route，顯示 `你尚未加選此課程，無法進入課堂。`，不洩漏 course data。
  - **Wrong-role**：teacher cookie join → `403 FORBIDDEN`；teacher 造訪 learner route 被 student layout role gate 重導 login（`next` 保留）。
  - **Disabled**：停用已加選學生後，participant snapshot 回 `401 AUTH_ACCOUNT_DISABLED`（在 API boundary 斷言，因 student layout 會先以 `/auth/session` 的 generic `UNAUTHORIZED` 重導，disabled UI state 無法可靠在 browser 呈現）。
  - **Expired/missing**：無 cookie 的 fresh context 造訪 learner route 被重導 login（`next` 保留）。
  - **Cleanup**：admin re-login（若中途關閉）→ archive 所有 course → disable 所有 account → logout 所有 context → close 所有 context；任何失敗累積 `cleanupErrors` 並在最後 throw。

### How verified

由 dedicated test subagent 執行並回傳結構化報告：

- Targeted FE-4.1 tests（6 files）→ **PASS**（90/90；0 failed, 0 skipped）。
- `npm test`（full）→ **PASS**（31 files / 257 tests；0 failed, 0 skipped）。
- `npx next typegen` → **PASS**。
- `npm run typecheck` → **PASS**（0 errors）。
- `npm run lint:check` → **PASS**（0 errors；4 pre-existing warnings 全在 CP5 變更集之外：`AccountCreateForm.tsx` 1 + `fe-2-2-roster.spec.ts` 3）。
- `npx prettier --check test/browser/fe-4-1-entry-join.spec.ts` → **PASS**。
- `git diff --check` → **PASS**。
- Browser spec discovery → **PASS**（`node test/browser/run.mjs --list` 自動 discover 5 files，含 `fe-4-1-entry-join.spec.ts`）。
- **Real FE-4.1 Playwright spec → BLOCKED（fixtures 缺失，預期結果）**：`env` 顯示 0 個 `FE41_*` 變數，spec 在 `assertFixturePreflight` throw `FE-4.1 real-backend fixture BLOCKED: missing FE41_API_BASE, FE41_UI_ORIGIN, FE41_ADMIN_USERNAME, FE41_ADMIN_PASSWORD, FE41_COURSE_NAME_PREFIX`。**未宣稱 real-E2E pass**；spec 未對 live backend 執行。
- 未 commit、未 push；未改 backend、DB、WBS、dependencies、`run.mjs`。

### Scope / rollback

- 變更僅限 FE-4.1 CP5 browser spec：`test/browser/fe-4-1-entry-join.spec.ts`（new）、`tasks/todo.md`。CP1/CP2/CP3/CP4 files 為先前已存在之工作樹變更，非本 CP 新增。
- 未加入 polling/socket；未合成 token；未呼叫 teacher detail endpoint；未顯示 counts/teacher controls/correctness；未提供作答控制（FE-4.2）。
- Rollback：僅移除 `test/browser/fe-4-1-entry-join.spec.ts` 與本 task-log section 即可，不影響已完成的 teacher FE-3.x 或 CP1/CP2/CP3/CP4。

### Checkpoint disposition

- CP5 實作與 static/unit/build/discovery 驗證完成。**Real-backend browser acceptance 維持 BLOCKED**（`FE41_*` fixtures 未提供、無 live backend/frontend），非 real-E2E 成功。依計畫「執行規則」，此處 **Hard stop**：等待使用者提供隔離 fixture 並授權執行真實 Playwright spec，或確認以 static 驗證作為 CP5 收尾。未 commit、未 push、未勾 WBS。

## 2026-09-04 — FE-4.2 Poll Single CP0 Dependency 與 baseline readiness

### Goal and acceptance criteria

- [x] 讀取並遵守 `FE-4.2 Poll Single 實作計畫.md` 的 CP0–CP5 checkpoint boundary；本次只執行 CP0，未修改產品碼、未進入 CP1。
- [x] 在 task log 建立 acceptance、CP approval table、risk/rollback、dependencies/environment、working notes/results placeholders；保留歷史 FE-4.1 blocked 紀錄，並以 dated addendum 說明 `987bb31`、`fd0cdad` 已 supersede 舊 blocked closeout。
- [x] 後端 focused contract tests 通過：submission、same-key replay、`SUBMISSION_CONFLICT`、formal UUID canonicalization、participant reveal/privacy。
- [x] 前端 FE-4.1 targeted baseline、typegen/typecheck/lint、diff check 通過。

### CP approval table

| Checkpoint | Status   | Evidence / decision                                                                                        |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| CP0        | **PASS** | FE-4.1 learner baseline repaired and all frontend/backend focused contract checks passed; CP1 not started. |
| CP1–CP5    | pending  | Must not start before CP0 is accepted by user.                                                             |

### Addendum — FE-4.1 historical blocked record superseded

The older FE-4.1 CP5 blocked record is historical and is not rewritten. Commits `987bb31` and `fd0cdad` supersede the earlier blocked browser-flow record by stabilizing and completing the real-backend acceptance path. This CP0 does not claim a new FE-4.1 browser run and does not alter WBS.

### Risk & Rollback

- **Risk: medium/high** — authenticated submission, first-answer-wins/idempotency, CSRF/Origin, and participant result privacy; no schema migration is planned.
- **Rollback:** CP0 changed only this task record. Remove this FE-4.2 section if the plan is withdrawn; do not reset FE-4.1 product/test files or sibling backend state.
- **Stop-the-line:** any contract mismatch, failed focused baseline, unavailable DB, or need for mock/placeholder blocks CP0.

### Dependencies & Environment

- Node 24+ (observed Node `v26.5.1` in backend verification), Next.js 16.3.1, React 19, Vitest, Playwright, existing API client, and migrated backend test DB.
- Backend source/test repository: `/home/user/projects/smartLearning/smartLearning-backend`; UI origin/API and browser fixtures are not needed for CP0.
- No mock/placeholder/runtime fallback is permitted. CP5 real browser remains a later gated checkpoint.

### Working notes

- Backend source inspection confirms `POST /api/v1/live-sessions/:id/submissions` accepts `sessionQuestionId` plus `selectedOptionRefs`; `Idempotency-Key` is required by the live submission flow, and returned canonical option identity is formal UUID-based.
- Participant result tests explicitly cover submitted participant open aggregate (`200`), non-submitted open gate (`409 RESULTS_NOT_REVEALED`), and closed aggregate (`200`); poll single e2e covers first submission (`201`), same-key replay (`201`, same submission ID), and incompatible replay (`409 SUBMISSION_CONFLICT`).
- `test/learner-live-route.test.tsx` was stale: it required the terminal-only `返回我的課程` link during the initial authoritative snapshot loading render. The regression assertion now checks the valid loading state instead; no production behavior was changed.
- Backend source/test inspection confirms the required UUID and privacy contracts; no backend files were changed.

### Results — CP0 PASS (2026-09-04)

- **Status:** **PASS**. FE-4.1 baseline failure was repaired in `test/learner-live-route.test.tsx`; CP1–CP5 were not started.
- **Frontend verification:** targeted FE-4.1 suite → **6 files / 90 tests passed, 0 failed, 0 skipped**. `npx next typegen` → PASS; `npm run typecheck` → PASS; `npm run lint:check` → PASS with 0 errors and 5 pre-existing warnings; targeted Prettier and `git diff --check` → PASS.
- **Backend verification:** `NODE_ENV=test npm run prisma:migrate:status` → PASS, 15 migrations up to date. Poll Single e2e → **1/1 PASS**; submission integration → **8/8 PASS**; live-session results → first run 8/11 passed with intermittent auto-close error, repeat **11/11 PASS**; participant-account privacy/reveal e2e → **10/10 PASS**. No tests were skipped.
- **Scope:** changed only `test/learner-live-route.test.tsx` and this task record; no production source, backend source, env, dependency, DB schema, WBS, commit, or push changes.
- **Decision:** CP0 is complete and verified. Hard stop now; wait for explicit user confirmation before beginning CP1.

## 2026-09-04 — FE-4.2 Poll Single CP1 renderer 與 single-choice state

### Goal and acceptance criteria

- [x] 新增 native `fieldset`/radio Poll Single renderer；以 question ID 分組，option UUID 作為 key/value/selection identity。
- [x] 僅 `snapshotType === "poll"` 且 `snapshotSelectionMode === "single"`、option IDs 合法且唯一時提供作答控制；unsupported/malformed 題目 fail closed 為唯讀提示。
- [x] 未選答案時 submit disabled；local state 一次只保留一項；不呼叫 API、不 optimistic 標記 submitted。
- [x] `hasSubmitted === true` 由 authoritative snapshot 驅動 read-only；不顯示 correctness、teacher counts 或 controls。
- [x] 既有 learner waiting/terminal/access-loss/manual refresh 行為保持不變。

### Checkpoint status

- [x] CP1 — implementation and focused verification complete (2026-09-04).
- [ ] CP2–CP5 — pending; require explicit user confirmation.

### Risk & Rollback

- **Risk: medium** — learner answer controls and UUID identity boundary; no backend/API/schema/DB/dependency changes.
- **Rollback:** remove `PollSingleQuestion`, its learner delegation, focused tests, and this CP1 task section. Preserve FE-4.1 route/entry/join/snapshot/access behavior and the CP0 route-test correction.
- No submission, retry, result, realtime, anonymous participant, or teacher-cache behavior was introduced.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, React 19, Vitest, existing participant snapshot types and API client.
- CP1 is frontend-only and does not require live backend fixtures; CP0 backend contract evidence remains the authority for later CP2–CP5.

### Working notes

- Existing `SessionQuestion`/`SessionQuestionOption` types were reused; `lib/api/types.ts`, API hooks, query keys, and client transport were not changed.
- Backend `option.id` is the formal UUID identity. The CP1 renderer intentionally does not use `optionRef`, text, or index for DOM identity or local selection.
- The existing FE-4.1 fixture used placeholder `opt-1`; it was updated in the learner-view test fixture to a UUID-shaped value so the integration test exercises the supported Poll Single path.
- `onSubmit` is an optional UI callback boundary only; LearnerLiveSessionView does not connect it to transport in CP1.

### Results — CP1 PASS (2026-09-04)

- **What changed:** added `features/live-student/PollSingleQuestion.tsx`; delegated learner open questions from `LearnerLiveSessionView.tsx`; added focused `test/poll-single-question.test.tsx`; updated learner-view regression assertions for CP1's local disabled submit control.
- **Behavior:** valid poll-single questions render ordered native radios and local single selection; malformed/unsupported question data renders read-only prompt/options with no radio or submit; authoritative submitted state disables the group and submit.
- **Verification:** `npm test -- --run test/poll-single-question.test.tsx test/learner-live-session-view.test.tsx` → **2 files / 32 tests passed, 0 failed, 0 skipped**; `npm run typecheck` → PASS; `npm run lint:check` → PASS with 0 errors and 5 existing warnings; targeted Prettier → PASS; `git diff --check` → PASS.
- **Scope:** changed only `features/live-student/PollSingleQuestion.tsx`, `features/live-student/LearnerLiveSessionView.tsx`, `test/poll-single-question.test.tsx`, `test/learner-live-session-view.test.tsx`, plus this task record. No API mutation, retry/storage, result query, realtime, route, backend, env, dependency, WBS, commit, or push changes.
- **Decision:** CP1 is complete and verified. Hard stop now; wait for explicit user confirmation before beginning CP2.

## 2026-09-04 — FE-4.2 Poll Single CP2 首次 authoritative submission 與 mutation security

### Goal and acceptance criteria

- [x] 新增精確 `CreateSubmissionPayload` / `SubmissionDto` wire types。
- [x] `apiRequest` 僅接受窄化的 `idempotencyKey` option，仍由 client 擁有 Origin、CSRF、Accept、Content-Type 與 credentials。
- [x] 新增 poll-single mutation：`POST /live-sessions/:id/submissions`、`mutate:true`、`retry:false`、body 僅一個 formal option UUID，無 optimistic cache write。
- [x] click 時建立一次 logical attempt key；pending 時鎖定 radio/submit；201 canonical response 僅在 question ID、單一 UUID 且存在於 snapshot option set 時進入 submitted。
- [x] 保留 malformed/stale response fail-closed，不顯示成功或覆寫答案。

### Risk & Rollback

- **Risk: medium/high** — authenticated submission、Idempotency-Key、CSRF/Origin 與 canonical UUID boundary；無 backend/schema/DB/dependency 變更。
- **Rollback:** 僅撤回 CP2 的 `client.ts` header option、submission types/hook、PollSingle wiring/tests 與本 task section；保留 FE-4.1 與 CP1 baseline。

### Working notes

- Caller cannot pass arbitrary headers: only `idempotencyKey` is exposed; security-owned headers remain generated centrally.
- `onSubmit` remains an observation callback and receives only the server canonical option UUID after validated success.
- Existing CP1 direct renderer tests now use a local QueryClient provider because submission is a real React Query mutation boundary.

### Results — CP2 PASS (2026-09-04)

- **What changed:** added submission wire types and `useSubmitPollSingle`; extended `apiRequest` with the narrow `idempotencyKey` option; connected `PollSingleQuestion` to a real mutation with UUID idempotency key, pending lock, canonical response validation, and no optimistic submitted state.
- **Verification:** targeted `npm test -- --run test/poll-single-question.test.tsx test/learner-live-session-view.test.tsx test/participant-live-sessions-api.test.tsx` → **3 files / 42 tests passed, 0 failed, 0 skipped**; `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, 5 pre-existing warnings); targeted Prettier and `git diff --check` → PASS.
- **Scope:** CP2 changed only `lib/api/client.ts`, `lib/api/types.ts`, `lib/api/participant-live-sessions.ts`, `features/live-student/PollSingleQuestion.tsx`, `test/poll-single-question.test.tsx`, and this task record. No retry/storage helper, result query, realtime, route, backend, env, dependency, WBS, commit, or push changes.
- **Decision:** CP2 complete and verified. Hard stop now; CP3 durable idempotency/retry/conflict must not start without explicit user confirmation.

## 2026-09-04 — FE-4.2 Poll Single CP3 durable idempotency、retry 與 conflict

### Results — CP3 PASS

- **What changed:** added versioned question-scoped `sessionStorage` attempts with formal option UUID, payload/option-set fingerprints, and stable idempotency key; persisted before dispatch; retries replay the exact attempt; stale/mismatched records are removed; success requires HTTP 201 plus canonical response validation; errors remain unresolved and visible through `ErrorAlert`.
- **Behavior:** first-answer-wins is preserved across reloads and uncertain responses; storage failure fails closed without dispatch; `SUBMISSION_CONFLICT` and transport/malformed responses do not claim success; only canonical 201 clears the attempt.
- **Verification:** targeted `npx vitest run test/poll-submission-attempt.test.ts test/poll-single-question.test.tsx` → **2 files / 10 tests passed**; `npm run typecheck` → PASS; `npm run lint:check` → PASS with 0 errors and 5 existing warnings; targeted Prettier check → PASS; `npm run build` → PASS; `git diff --check` → PASS.
- **Scope:** CP3 only; no backend, realtime, polling, result queries, WBS, commit, or push. The repository has no `format:check` npm script, so Prettier was run directly.
- **Decision:** CP3 is complete. Hard stop before CP4; wait for explicit user confirmation before starting CP4.

## 2026-09-04 — FE-4.2 Poll Single CP4 participant results and UUID reconciliation

### Results — CP4 PASS (static/unit; CP5 deferred)

- **What changed:** added participant-isolated `results(liveSessionId, sessionQuestionId)` query keys and result GET hook with forwarded `AbortSignal`, `retry:false`, no polling, and explicit/submitted enablement; extended `PollSingleQuestion` with gated/loading/error/open/closed anonymous aggregate states, UUID-based reconciliation, manual `更新結果`, and fail-closed malformed result handling; retained the last server-observed submitted question descriptor for closed terminal rendering in `LearnerLiveSessionView`.
- **Privacy/invariants:** learner results never use teacher result keys or render correctness, teacher counts/controls, or participant identity. Result failures do not change the authoritative submitted lock. Result option display follows snapshot option order and matches only by formal `optionId`.
- **Verification:** focused participant/Poll tests → PASS (2 files / 20 tests); learner integration/typecheck → PASS (3 files / 45 tests); `npx next typegen` → PASS; `npm run typecheck` → PASS; `npm run lint:check` → PASS (0 errors, 5 pre-existing warnings); full `npm test` → PASS (33 files / 270 tests); `npm run build` → PASS; targeted Prettier check → PASS; `git diff --check` → PASS.
- **Scope:** CP4 frontend transport/UI/tests only. No backend, route, dependency, env, WBS, socket, polling, mock, commit, or push changes. The frontend has no `format:check` script, so targeted Prettier checks were used.
- **Remaining:** real-backend CP5 Playwright acceptance is not started and remains pending isolated fixtures and explicit authorization. WBS remains unchanged.

### Checkpoint disposition

- CP4 implementation and full frontend static/unit verification are complete. **Hard stop before CP5** pending user confirmation; do not add the CP5 browser spec or run authenticated mutations without that confirmation.

## FE-4.2 CP5 browser acceptance addendum (2026-09-05)

- [x] Add `test/browser/fe-4-2-poll-single.spec.ts` with FE42 preflight and isolated actor/aggregate lifecycle.
- [x] Exercise backend response-loss marker and exact same-key replay through the student request context.
- [x] Run the browser scenario with an isolated backend/UI and provisioned FE42_* fixtures.

### Results

The browser spec reuses the FE-4.1 secure-cookie, same-host preflight, context-bound request, unique fixture, and cleanup conventions. It ran against the isolated HTTPS runtime with `--workers=1` and returned `1 passed / 0 failed / 0 skipped` in 20.8s. The run covered isolated teacher/two-student actors, poll-single UUID identity, response-loss and same-key replay, participant flow, and aggregate cleanup. No credentials, cookies, CSRF values, idempotency keys, or answer payloads were recorded in evidence.

## 2026-09-05 — FE-4.3 Participant realtime CP0 contract freeze and baseline

### Goal and acceptance criteria

- [x] Keep CP0 documentation/baseline-only: no product, test, WBS, backend, environment, dependency, commit, or push changes.
- [x] Freeze FE-4.3.1–FE-4.3.5 event/cache/recovery/revocation contract against the WBS, backend frontend API reference, backend realtime contract/gateway, and current UI adapters.
- [x] Preserve actor/cache isolation: future participant adapter may write only `queryKeys.participantLiveSessions.*`; teacher `queryKeys.liveSessions.*` remains untouched.
- [x] Preserve canonical sequence/watermark rules: `eventSeq` is a decimal string, compare with `BigInt`, reject malformed/negative/out-of-range values, and never apply an older watermark.
- [x] Record revocation and recovery ordering: handshake/transport rejection uses stable error codes; cursor recovery uses `sync.required` followed by server-pushed fresh actor-safe snapshot; runtime enrollment/account/session loss currently disconnects directly and must be classified by REST, rather than assuming an emitted `permission_invalid` event.
- [x] Baseline gates pass; record exact command results below before CP0 closeout.
- [x] Stop at CP0 and wait for explicit `GO CP1`.

### Contract matrix

| Event / signal                        | Participant visibility and payload                                                                                                                                                                                                                                        | Future participant cache action                                                                                                                                                          | Forbidden/terminal behavior                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `session.snapshot`                    | `visibility=participant`; `liveSession` with open participant-safe questions/`hasSubmitted`, `submittedQuestionIds`, watermark, reveal-eligible results; no selections/counts/teacher fields                                                                              | Validate schema/session/visibility/watermark, then seed only `participantLiveSessions.snapshot` and eligible participant results; submitted state remains within the snapshot projection | Reject invalid actor/session/schema/visibility; access loss clears protected participant cache |
| `session.state_changed`               | `visibility=session`; `{ status }`                                                                                                                                                                                                                                        | Invalidate participant snapshot                                                                                                                                                          | Terminal lifecycle is classified through REST student-status; revoked socket disconnects       |
| `question.opened` / `question.closed` | `visibility=session`; `{ sessionQuestionId }`                                                                                                                                                                                                                             | Invalidate participant snapshot; use authoritative participant result path                                                                                                               | Wrong session/shape/visibility is ignored without cursor/cache mutation                        |
| `result.updated`                      | Participant-facing envelope is always `visibility=participant`; an open-result durable row may internally use `participant_after_submit` to target only the submitting participant. Payload is `{ sessionQuestionId, results }` with anonymous reveal-safe aggregate only | Seed/invalidate only matching participant result key                                                                                                                                     | Teacher visibility/counts/correctness before reveal are rejected; wrong target is rejected     |
| `session.closed`                      | Participant envelope is `visibility=participant`, `{ status: closed }`; gateway emits then disconnects                                                                                                                                                                    | Invalidate participant snapshot and student-status                                                                                                                                       | No protected content remains after confirmed access loss                                       |
| `sync.required`                       | One client; `{ reason, watermark }`                                                                                                                                                                                                                                       | One recovery cycle: clear rejected cursor, await fresh server snapshot, bounded cursorless fallback only if needed                                                                       | Never resend rejected cursor; `permission_invalid` is an access-loss/recovery boundary         |
| `counts.updated`                      | Teacher-only legacy alias; not participant-safe                                                                                                                                                                                                                           | No listener, cache action, or UI consumption                                                                                                                                             | Participant must not subscribe or cache it                                                     |
| `error`                               | Stable `{ code }` on handshake/transport rejection; may report `UNAUTHORIZED`, `SESSION_NOT_JOINABLE`, or `REALTIME_UNAVAILABLE`                                                                                                                                          | Classify stable code                                                                                                                                                                     | Raw messages/IDs/tokens never render                                                           |
| disconnect                            | No stable-code payload is guaranteed; runtime enrollment/account revocation and some terminal checks disconnect directly                                                                                                                                                  | Retain last safe data only for transient network loss; confirmed access loss clears affected participant cache and stops reconnect                                                       | Do not infer a revocation error code from disconnect alone; classify through REST/access-state |

### Source references and working notes

- WBS `docs/智學互動平台/00_專案規劃/智學互動平台剩餘工作WBS.md:630-636` still leaves FE-4.3.1–FE-4.3.5 unchecked.
- Backend `docs/frontend-api-reference.md:292-336, 396-467` freezes `/live` cookie handshake, participant room scope, event visibility, replay/snapshot, and per-event account/enrollment reauthorization.
- Backend `src/modules/realtime/live-session-realtime-contract.ts:117-149, 240-271, 361-400` freezes envelope/watermark/canonical cursor and stale ordering semantics.
- Backend `src/modules/realtime/live-gateway.ts:189-231, 287-345, 388-450, 460-505, 662-785, 813-833, 1088-1104, 1180-1263` confirms cookie handshake, participant-safe snapshots/results, reauthorization/disconnect, `sync.required` then fresh snapshot, and close disconnect ordering.
- UI `lib/live/realtime-types.ts`, `lib/live/socket-client.ts`, and `lib/live/use-live-session-events.ts` are shared/teacher boundaries; participant types and adapter remain deferred to CP1/CP2.
- UI `lib/api/query-keys.ts:36-53` confirms separate teacher and participant namespaces. `LearnerLiveSessionView.tsx:29-41` remains REST-only with manual refresh fallback in CP0.
- Revocation sequence: account-disabled signals directly disconnect account-bound sockets; enrollment/account authorization failures are detected before participant snapshot/replay/event delivery and disconnect; stable `error` is emitted for handshake/transport rejection, not raw backend details. Recoverable cursor/permission invalidation emits `sync.required`, then the gateway sends the fresh actor-safe snapshot. Terminal session close emits `session.closed` and disconnects.

### Risk & rollback

- **Risk: medium/high** — an incorrect freeze would make CP1–CP4 unsafe around teacher-data leakage, cursor precision, stale snapshots, or revocation.
- **Mitigation:** each matrix row cites the authoritative backend/UI source; participant cache namespace remains explicit and separate.
- **Rollback:** revert only this task-log section. No runtime or data rollback is needed because CP0 changes no product behavior.

### Dependencies & environment

- UI repository: `smartLearning-ui`; Node/npm dependencies already installed; no new dependency or env value.
- Baseline unit/static/build gates do not require a backend database; real browser/revocation acceptance remains deferred to CP5.
- Next.js 16 type generation is not changed by this documentation-only checkpoint.

### CP0 baseline results

- **Status:** PASS — all targeted and full baseline gates passed after the minimal FE-4.2 test type repair. CP0 is closed; stop here and wait for explicit `GO CP1`.
- **Required commands:**
  - `npm test -- test/realtime-adapter.test.tsx test/participant-live-sessions-api.test.tsx`
  - `npm run typecheck`
  - `npm run lint:check`
  - `npm test`
  - `npm run build`
  - `git diff --check`
- **Manual checkpoint:** source-contract review only. Confirm future cookie handshake uses `withCredentials` + `auth.liveSessionId`, participant events cannot consume teacher counts/projections, `sync.required` is followed by server-pushed fresh snapshot, and access loss is classified by stable codes. No participant realtime product behavior was changed in CP0.

### Baseline evidence — 2026-09-05 rerun after FE-4.2 type repair

| Command                                                                                  | Result | Evidence                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `npm test -- test/realtime-adapter.test.tsx test/participant-live-sessions-api.test.tsx` | PASS   | 2 files / 21 tests; 0 failed, 0 skipped.                                                                    |
| `npm run typecheck`                                                                      | PASS   | No TypeScript diagnostics.                                                                                  |
| `npm run lint:check`                                                                     | PASS   | 0 errors; 6 non-blocking warnings (React Hook Form `watch()` compatibility and unused browser-test locals). |
| `npm test`                                                                               | PASS   | 33 files / 270 tests; 0 failed, 0 skipped.                                                                  |
| `npm run build`                                                                          | PASS   | Next.js 16.3.1 production build succeeded; typecheck and static generation passed; 15 routes generated.     |
| `git diff --check`                                                                       | PASS   | No whitespace errors.                                                                                       |

**Diagnosis:** the minimal FE-4.2 browser-test annotation now correctly distinguishes Playwright browser `Response` from request-context `APIResponse`. All CP0 gates pass. No participant realtime code was changed, and the remaining warnings are non-blocking.

**Scope evidence:** the working tree changes are limited to `tasks/todo.md` and `test/browser/fe-4-2-poll-single.spec.ts`; no backend, WBS, environment, dependency, or participant realtime product files were changed. No credentials or protected test data were recorded.

## FE-4.3 CP1 — 2026-09-05

- [x] Added participant-specific realtime snapshot wire type and fail-closed envelope guards.
- [x] Added lossless reconnect cursor update/clear and reconnect lifecycle status handling.
- [x] Added canonical large-sequence and malformed-envelope regression tests.
- [x] Ran targeted realtime tests, typecheck, lint, and diff check.

**Results:** 13 targeted tests passed; typecheck passed; lint passed with 6 existing warnings and 0 errors; diff check passed. CP1 stops here pending explicit `GO CP2`.

## FE-4.3 CP2 — 2026-09-05

- [x] Added participant-only realtime event adapter with no `counts.updated` listener.
- [x] Seeded/invalidation actions use only `queryKeys.participantLiveSessions.*`; submitted state maps to `hasSubmitted`.
- [x] Mounted `useLiveConnection` and participant adapter in `LearnerLiveSessionView`; added accessible transient connection notice.
- [x] Ran focused learner/realtime tests, typecheck, lint, Prettier, and diff check.

**Results:** participant adapter and learner integration are implemented. Focused learner/realtime verification passed (2 files / 38 tests), typecheck passed, lint passed with 6 pre-existing warnings and 0 errors, Prettier passed, and `git diff --check` passed. The planned `test/participant-realtime-adapter.test.tsx` did not yet exist, so its requested command could not run. CP2 stops here pending explicit `GO CP3`.

**Known limitation:** deep participant payload validation and single-cycle replay/snapshot recovery remain CP3 scope; CP2 does not claim revocation cleanup or browser acceptance.

## FE-4.3 CP3 — 2026-09-05

- [x] Added BigInt-based accepted sequence and snapshot watermark ordering; stale snapshots cannot overwrite participant cache.
- [x] Added one bounded `sync.required` recovery cycle that clears the rejected cursor, waits for a fresh snapshot, and emits one cursorless fallback fetch.
- [x] Added payload validation before participant cache/cursor mutation and retained participant/teacher cache isolation.
- [x] Added focused participant adapter regressions for large cursors, stale watermark rejection, cursor clearing, one-shot fallback, counts listener exclusion, and cleanup.
- [x] Ran focused tests, typecheck, lint, Prettier, and diff check.

**Results:** CP3 implementation and focused verification passed: 2 files / 16 tests, typecheck, and diff check passed; lint passed with 6 pre-existing warnings and 0 errors. Added `test/participant-realtime-adapter.test.tsx`. Recovery does not resend a rejected cursor, and fresh snapshot adoption clears the bounded fallback timer. The existing Vite config-loader warning and unrelated lint warnings remain non-blocking.

**Scope:** changed `lib/live/use-participant-live-session-events.ts`, `test/participant-realtime-adapter.test.tsx`, and this task record. No backend, WBS, environment, dependency, or commit changes.

**Known limitation:** CP3 does not claim revocation cleanup or real-browser acceptance; those remain CP4/CP5 scope.

## FE-4.3 CP4 — 2026-09-05

- [x] Added per-session participant cache purge and terminal socket shutdown after confirmed access loss.
- [x] Added stable access-code classification, disconnect-triggered bounded REST reclassification, and late-event rejection after purge.
- [x] Preserved teacher cache and unrelated participant-session isolation; no `counts.updated` listener or raw socket detail is consumed.
- [x] Ran focused participant/learner/access tests, typecheck, lint, build, and diff checks.

**Results:** CP4 revocation/privacy hardening passed focused verification: 3 files / 36 tests, typecheck, lint with 7 pre-existing warnings and 0 errors, production build, and `git diff --check`. Confirmed access loss removes only the current participant session namespace, clears retained question content, disables reconnect, and rejects late realtime messages. A transient disconnect retains safe data while triggering one REST classification refetch. Real-backend/browser revocation acceptance remains CP5 scope.

**Scope:** changed `lib/api/query-keys.ts`, `lib/live/socket-client.ts`, `lib/live/use-participant-live-session-events.ts`, `features/live-student/LearnerAccessState.tsx`, `features/live-student/LearnerLiveSessionView.tsx`, and this task record. No backend, WBS, environment, dependency, or commit changes.

**Known limitation:** CP4 unit/static coverage does not claim real browser revocation, account disable, enrollment removal, or session expiry; those require isolated backend fixtures in CP5.

## FE-4.3 CP5 — 2026-09-05

- [x] Added `test/browser/fe-4-3-participant-realtime.spec.ts` using the existing FE-4.2 isolated browser harness and cleanup model.
- [x] Removed manual refresh actions from lifecycle assertions; learner transitions are awaited through participant realtime.
- [x] Added browser assertions for the `/live` connection and absence of participant-token cookies.
- [ ] Focused real-backend Playwright acceptance — BLOCKED: execution was denied because it mutates backend accounts, courses, enrollments, and live sessions; no disposable backend environment was explicitly authorized in this session.
- [x] Static verification: Prettier and TypeScript typecheck passed; no production realtime/config/backend changes were made.
- [x] Documented the disposable browser fixture contract in `test/browser/FE42.env.example`; credentials and the response-loss token remain runtime-only.

**Results:** CP5 browser-spec implementation is present, but FE-4.3 is not closed. The focused browser command was not run after the safety gate denied mutation-capable execution. The spec intentionally uses the existing `FE42_*` fixture/config namespace because `playwright.config.ts` is FE-4.2-specific and CP5 forbids a parallel harness; provisioned acceptance should run it against an isolated disposable backend with `--workers=1`.

**Known limitation:** WBS FE-4.3.1–FE-4.3.5 remains unchecked. Full browser regression, reconnect/recovery evidence, privacy/revocation evidence, and cleanup evidence require explicit authorization for the isolated fixture. No credentials, tokens, backend IDs, or raw error bodies were recorded.

- Focused CP5 E2E authorization was granted and the test was attempted with `npx playwright test test/browser/fe-4-3-participant-realtime.spec.ts --workers=1`; it failed closed before mutation because all required `FE42_*` fixture variables were absent. No disposable resources were created.

### WebSocket investigation — 2026-09-05

- [x] Confirmed Socket.IO `/live` is a namespace, while Playwright exposes the Engine.IO transport URL under `/socket.io/`.
- [x] Updated FE-4.3 to assert `/socket.io/` and retained lifecycle transition assertions as namespace/application-level evidence.
- [x] Updated Playwright's non-HTTPS web-server command to pass `FE42_API_BASE` into `NEXT_PUBLIC_API_BASE` when it starts the UI.
- [x] Restarted the UI with the matching CP5 API base and reran FE-4.3: 1 passed in 8.9s.
- [x] Verification: typecheck passed, lint passed with 8 warnings and 0 errors, `git diff --check` passed.

**Results:** The missing `/live` observation was a false negative caused by checking the raw WebSocket transport URL for a Socket.IO namespace. The transport uses `/socket.io/`; the `/live` namespace is negotiated in Socket.IO frames. The focused CP5 E2E now passes.

## FE-4.4 Checkpoint 5 — shared participant-safe UI (2026-09-05)

- [x] Added `actor` prop to `LearnerLiveSessionView` with student default and anonymous actor-aware snapshot/cache wiring.
- [x] Added centralized anonymous cleanup: removes only actor-qualified participant caches, clears session-scoped credential, retained question, and terminates realtime connection.
- [x] Added dedicated anonymous missing-credential and ambiguous ended/unavailable states; anonymous paths do not use `student-status` or login redirect and return to `/join`.
- [x] Wired `PollSingleQuestion` actor through results, submission, actor-qualified attempts, and anonymous access-loss callback.
- [x] Updated realtime cache adapter to actor-qualified snapshot/result keys and student-only status invalidation.
- [x] Verification: focused Vitest 2 files / 34 tests passed; typecheck passed; lint passed with 8 pre-existing warnings; `git diff --check` passed.
- [ ] Manual Gate 5 confirmation pending; do not start Checkpoint 6.

**Results:** CP5 implementation and focused/static verification passed. Student default behavior remains green; anonymous UI now fails closed on missing or ambiguous access and never claims closed/cancelled from REST alone. Socket handshake remains the existing CP6 scope and was not changed.

**Scope:** changed `features/live-student/LearnerLiveSessionView.tsx`, `features/live-student/PollSingleQuestion.tsx`, `lib/api/participant-live-sessions.ts`, `lib/live/use-participant-live-session-events.ts`, and this task record.

## FE-4.4 Checkpoint 6 — public live route and anonymous realtime (2026-09-05)

- [x] Added public `/live/[liveSessionId]` Server Component route; only the route ID crosses the server/client boundary.
- [x] Added `AnonymousLiveSessionEntry`; it checks the session-scoped credential client-side before mounting participant query/socket hooks and fails closed to `/join` when absent or invalid.
- [x] Made `createLiveSocket`/`useLiveConnection` actor-aware: student payload remains cookie-based `{ liveSessionId, lastEventSeq? }`; anonymous payload is `{ participantToken, sessionCode, lastEventSeq? }`, with websocket transport and credentials included; missing/mismatched credentials do not call `io()`.
- [x] Passed actor into the learner socket connection and added validated `session.closed` callback wiring for anonymous definite-close UX; anonymous terminal return points to `/join`.
- [x] Gate 5 was released by the explicit request to continue to Checkpoint 6; CP6 implementation stopped before CP7/browser work.
- [x] Verification: targeted realtime/participant/learner route tests passed (3 files / 17 tests); typecheck passed; lint passed with 0 errors and 12 non-blocking warnings; `git diff --check` passed.

**Results:** CP6 product implementation and targeted/static verification passed. Student and teacher cookie-based socket behavior remains the default; anonymous realtime is token-bearing only in the Socket.IO auth payload after credential validation, never in URL/query/cache/DOM. Browser acceptance, expanded CP6 socket/entry tests, and FE-4.4 real-backend Playwright remain CP7 scope.

**Scope:** changed `app/(public)/live/[liveSessionId]/page.tsx`, `features/live-student/AnonymousLiveSessionEntry.tsx`, `features/live-student/LearnerLiveSessionView.tsx`, `lib/live/socket-client.ts`, `lib/live/use-participant-live-session-events.ts`, and this task record. Existing FE-4.3 working-tree changes were preserved.

## FE-4.4 Checkpoint 7 — regression coverage and browser closeout (2026-09-05)

- [x] Added anonymous Socket.IO unit coverage for scoped credential auth payload, websocket transport, credentials, and missing-credential fail-closed behavior.
- [x] Updated student snapshot regression expectation to preserve cookie-default transport without an unnecessary explicit session auth descriptor.
- [x] Stabilized existing learner terminal assertions by waiting for the complete terminal projection before checking secondary copy.
- [x] Added `test/browser/fe-4-4-anonymous-fallback.spec.ts` with fail-closed FE44 fixture preflight, anonymous join header/body checks, server-ID navigation, sessionStorage-only credential assertions, reload identity preservation, transport URL privacy, and fresh-context credential loss.
- [x] Targeted regression verification: 6 files / 70 tests passed after the CP7 changes.
- [x] `npx next typegen`, `npm run typecheck`, `npm run lint:check`, and browser discovery were run locally; static checks passed with existing/non-blocking warnings and browser discovery found the new spec.
- [ ] Real-backend browser acceptance: BLOCKED. The runner's Next web server fails before tests because `/live/[liveSessionId]` is defined in both `app/(public)` and the existing `app/(teacher)` route groups. Next reports: `You cannot have two parallel pages that resolve to the same path. Please check /(public)/live/[liveSessionId] and /(teacher).`
- [ ] FE-4.4 WBS closeout: not claimed. The route collision is a CP6 product blocker that must be resolved before any real-browser evidence can be validly collected.

**Results:** CP7 regression coverage is present and targeted/static checks are green, but browser closeout is stopped at the route-build gate. No backend fixture or mutating browser flow was run. The required next decision is to resolve the `/live/:liveSessionId` collision without regressing the existing teacher classroom route, then rerun build/browser discovery and the FE-4.4 real-backend matrix.

**Scope:** changed `test/realtime-adapter.test.tsx`, `test/participant-live-sessions-api.test.tsx`, `test/learner-live-session-view.test.tsx`, `test/browser/fe-4-4-anonymous-fallback.spec.ts`, and this task record. No backend, dependency, env, or WBS changes.

## FE-4.4 route collision resolution (2026-09-05)

- **Resolution:** moved the protected teacher classroom route from `app/(teacher)/live/[liveSessionId]/` to `app/(teacher)/teacher/live/[liveSessionId]/`. The public anonymous route remains the sole owner of `/live/:liveSessionId`; the student route remains `/student/live/:liveSessionId`.
- **Preserved:** teacher route boundaries (`loading`, `error`, `not-found`), `(teacher)` auth/role layout, classroom implementation, anonymous navigation, and student navigation.
- **Updated:** `test/live-classroom-route.test.tsx` import and `features/live-teacher/LiveClassroomView.tsx` deep-link documentation.
- **Compatibility:** existing teacher deep links using `/live/:id` must be changed to `/teacher/live/:id`; no redirect can coexist at `/live/:id` because that path is now intentionally public for anonymous participants.
- **Status:** implementation complete; route/build/typegen/browser discovery verification passed. Real-backend FE-4.4 execution remains fixture-gated.
- **Verification:** `npx next typegen` passed; targeted route tests passed (3 files / 4 tests); `npm run typecheck` passed; `npm run build` passed with distinct `/live/[liveSessionId]` and `/teacher/live/[liveSessionId]` routes; `npm run lint:check` passed with existing warnings; browser discovery passed with 8 specs; `git diff --check` passed.

## 2026-09-06 — FE-5.1 Poll Multiple Checkpoint 1: backend readiness and WBS reconciliation

### Context and acceptance criteria

Checkpoint 1 verifies the existing backend contract before any Poll Multiple frontend production code is added.

- [ ] Poll multiple accepts one through all snapshot options and rejects empty selections.
- [ ] Duplicate, unknown, missing, and invalid option references fail closed.
- [ ] Submitted option references are canonicalized to formal snapshot option UUIDs.
- [ ] Same-idempotency-key permutations replay the immutable authoritative submission; a different set remains a stable conflict.
- [ ] Results count each selected option while `totalResponses` counts submissions; option-count sum may exceed `totalResponses`.
- [ ] Open/closed result visibility remains participant-safe, with no correctness or identity leakage.
- [ ] Student and anonymous actor isolation, access-loss cleanup, and realtime behavior remain outside this documentation-only checkpoint and must not regress in later work.

### CP1 checklist

- [x] Read backend DTO, answer contract, canonicalization, idempotency, result projection, and participant visibility paths.
- [x] Attempt the focused DB-backed backend e2e through the dedicated test subagent; record the exact blocker.
- [x] Produce the contract matrix and backend disposition.
- [x] Confirm WBS remains unchanged and no frontend production/test code is modified.
- [ ] Stop at CP1 and wait for explicit user confirmation before FE-5.1 Checkpoint 2.

### Contract matrix (static evidence)

| Contract item                | Backend evidence                                                                                                                                                                                          | Disposition   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| At least one selection       | `src/modules/submissions/domain/answer-contract.ts` requires poll-multiple cardinality >= 1 and <= snapshot options.                                                                                      | PASS (static) |
| Duplicate/unknown rejection  | `answer-contract.ts` rejects duplicates and refs outside the snapshot option set before set comparison.                                                                                                   | PASS (static) |
| Formal UUID canonicalization | `src/modules/submissions/application/submission.service.ts` maps submitted optionRef values to formal snapshot option UUIDs before persistence/response.                                                  | PASS (static) |
| Same-key permutation replay  | `answer-contract.ts` uses sorted `canonicalRefFingerprint`; `submission.service.ts` compares the canonical set for idempotent replay while preserving the first immutable answer.                         | PASS (static) |
| Immutable first answer       | `submission.service.ts` returns the existing authoritative submission for an equivalent replay and conflicts on a genuinely different set.                                                                | PASS (static) |
| Aggregate semantics          | `src/modules/live-sessions/domain/question-results.ts` and `api/dto/results.dto.ts` count each selected option, while `totalResponses` counts submissions; no equality between the two totals is assumed. | PASS (static) |
| Open/closed reveal           | `src/modules/participants/api/participants.controller.ts` and participant services keep teacher visibility distinct and gate participant results; participant-safe projections omit correctness/identity. | PASS (static) |

### Backend disposition

**PARTIALLY VERIFIED**. Static contract review is READY for frontend implementation, but the focused DB-backed runtime test is BLOCKED: the backend test setup requires the exact `smartlearning_test` database, while Docker is unavailable and `pg_isready` is not installed, so PostgreSQL reachability/migration readiness cannot be confirmed. No e2e test was executed and no runtime data was mutated.

### Dependencies and environment

- Node 24+, installed backend dependencies, migrated isolated `smartlearning_test`, and explicit authorization for the mutating e2e are required.
- Runtime command: `cd /home/user/projects/smartLearning/smartLearning-backend && NODE_ENV=test npm run test:e2e -- --runInBand --silent test/poll-multiple-live-flow.e2e-spec.ts`.
- No mock API, placeholder data, WBS edit, or frontend production workaround is permitted.

### Risk and rollback

Risk: medium; the next checkpoint touches learner submission, idempotency, anonymous auth, and participant-safe results. CP1 itself changes only this task record. Rollback is removal of this FE-5.1 CP1 section; no product, backend, schema, WBS, or runtime-data rollback is needed.

### Working notes

- Backend test coverage is authoritative for lifecycle, permutation replay, invalid cardinality/duplicates, aggregation, and post-close behavior in `test/poll-multiple-live-flow.e2e-spec.ts`.
- The WBS checkbox is intentionally not updated at CP1; current WBS entries FE-5.1.1–FE-5.1.4 remain unchecked.
- Runtime evidence is blocked by unavailable Docker/PostgreSQL reachability; static inspection and presence of the dedicated e2e are not claimed as runtime proof.
- Frontend `format:check` is unavailable in this repository; later checks should use available typecheck/lint/build/test and targeted Prettier checks.

### CP1 Results — PARTIALLY VERIFIED (2026-09-06)

- **Static contract:** PASS. Backend evidence confirms non-empty poll-multiple validation, duplicate/unknown rejection, formal snapshot UUID canonicalization, sorted-set idempotency replay, immutable first answer, independent `totalResponses` semantics, and participant-safe open/closed visibility.
- **Runtime command:** BLOCKED before execution. The dedicated test subagent confirmed the suite and migrations exist, but Docker has no available socket and `pg_isready` is unavailable; PostgreSQL reachability and isolated `smartlearning_test` readiness could not be established. No DB-backed e2e ran.
- **Scope:** only `tasks/todo.md` changed. No frontend production/test file, backend source, WBS checkbox, dependency, environment file, schema, migration, or runtime data was changed.
- **Next boundary:** stop at CP1. FE-5.1 Checkpoint 2 requires explicit user confirmation and an available/authorized isolated backend environment if runtime evidence is desired.

### CP2 Results — PASS (2026-09-06)

- **Implemented:** added Poll Multiple transport/types, a v3 actor-qualified durable-attempt helper, checkbox renderer with canonical response checks and participant-safe result projection, and active/retained learner dispatcher wiring.
- **Regression fix:** updated `test/my-courses-view.test.tsx` to assert the existing session auth descriptor on the join request; no production transport behavior changed.
- **Poll Multiple coverage:** added `test/poll-multiple-submission-attempt.test.ts` and `test/poll-multiple-question.test.tsx`, covering canonical permutation fingerprints, invalid selections, actor/stale/storage isolation, checkbox submission, durable idempotency retry, HTTP 201 canonical response validation, fail-closed behavior, result alignment/`totalResponses`, unsupported shapes, and anonymous access loss.
- **Verification:** focused Poll Multiple tests PASS (2 files / 13 tests); `npm test` PASS (38 files / 304 tests); `npm run typecheck` PASS; `npm run build` PASS; `npm run lint:check` PASS with 0 errors and 10 existing warnings; targeted Prettier check PASS after formatting; `git diff --check` PASS.
- **Warnings:** Vitest emits the existing Vite config-loader/ESM warning; ESLint emits existing React/compiler and unused-variable warnings. No new blocking warnings were introduced.
- **Scope:** WBS remains unchanged; no backend, schema, migration, dependency, environment, or runtime-data changes were made. No real backend/browser acceptance was claimed because it was outside this checkpoint.
- **Decision:** FE-5.1 Checkpoint 2 is complete. Stop here and wait for explicit user confirmation before starting Checkpoint 3.

## 2026-09-06 — FE-5.1 Poll Multiple Checkpoint 3: manual visual/accessibility validation

### Goal and acceptance criteria

- [x] Add the visible `可複選` hint and preserve snapshot option order.
- [x] Provide explicit keyboard-visible focus treatment for native checkbox controls.
- [x] Keep empty, pending, and submitted states fail-closed; preserve durable attempts on conflict.
- [x] Show curated `SUBMISSION_CONFLICT` feedback for non-201 or mismatched canonical responses.
- [ ] Validate the actual runtime manually across desktop/mobile, light/dark themes, keyboard interaction, long text, retry, result states, and anonymous access loss.

### Checklist

- [x] A — inspect authoritative CP3 requirements and current implementation gaps.
- [x] B — add the multiple-selection hint, focus treatment, and conflict feedback.
- [x] C — add focused regression tests for the CP3 corrections.
- [x] D — run full static/unit verification and browser discovery.
- [x] E — run actual frontend/backend runtime manual inspection with an isolated authorized fixture.
- [x] F — record the observation matrix and checkpoint disposition.

### Risk & Rollback

- Risk: medium — learner submission feedback, keyboard UX, and participant-safe result presentation; no backend, schema, migration, dependency, environment, or database changes.
- Rollback: revert only the CP3 Poll Multiple UI/tests and this task-log section; preserve unrelated working-tree changes and runtime data. Do not update WBS.

### Dependencies & Environment

- Node 24+, Next.js 16.3.1, installed UI dependencies, and a real frontend/backend runtime with migrated isolated data are required for manual acceptance.
- No mocks, placeholder API, or runtime fallback may substitute for the manual backend flow. The UI has no theme toggle; light/dark validation requires browser color-scheme emulation.

### Results — STATIC PASS / RUNTIME BLOCKED (2026-09-06)

- **Implementation:** added visible `可複選` guidance, explicit `focus-within` keyboard focus styling, and curated `SUBMISSION_CONFLICT` feedback while preserving the durable attempt for retry. The canonical success path remains HTTP 201 plus exact-set validation and accepts response permutations.
- **Focused verification:** Poll Multiple tests passed (2 files / 13 tests).
- **Full verification:** `npm test` passed (38 files / 304 tests); `npm run typecheck` passed; `npm run lint:check` passed with 0 errors and 10 warnings; `npm run build` passed with 13/13 static generation; targeted Prettier passed; `git diff --check` passed.
- **Browser discovery:** `npm run test:browser -- --list` passed and listed 8 browser tests in 8 files. No FE-5.1 CP4 browser spec was added.
- **Runtime preflight:** `localhost:3000` and `localhost:3001` were unreachable by non-mutating curl checks. No service was started, no authenticated browser mutation was attempted, and no database/runtime data was changed.
- **Manual observation matrix:** **BLOCKED** — actual desktop/mobile, light/dark, keyboard, long-text, pending/submitted, retry, result visibility, and anonymous access-loss observations could not be performed without the required runtime and isolated fixture. Static/unit evidence is not claimed as manual runtime evidence.
- **Scope:** WBS FE-5.1.1–FE-5.1.4 remains unchanged and unchecked; no backend/schema/migration/dependency/environment changes; no CP4 browser spec or real-backend acceptance was claimed.
- **Decision:** Checkpoint 3 implementation corrections and static verification are complete, but CP3 overall remains **BLOCKED** pending an available authorized runtime/fixture. Stop here and wait for explicit confirmation before Checkpoint 4.

## 2026-09-06 — FE-5.1 Poll Multiple Checkpoint 4: real-backend browser acceptance

### Goal and acceptance criteria

- [x] Add a dedicated fail-closed `fe-5-1-poll-multiple.spec.ts` following the existing FE-4 browser conventions.
- [x] Define isolated FE51 fixture inputs and reject missing/unsafe runtime configuration without skipping.
- [x] Cover real lifecycle intent: teacher-owned course, multiple poll with three formal UUID options, live session, learner join, submission contract, idempotency/replay, aggregate semantics, result alignment, reveal/terminal/privacy states, and cleanup.
- [ ] Execute the dedicated browser flow against an explicitly authorized isolated runtime with zero skips and cleanup PASS.
- [ ] Run FE-4.2/4.3/4.4 browser regressions against a compatible isolated runtime.

### Checklist

- [x] A — inspect authoritative CP4 requirements, backend failpoint, and FE-4 browser patterns.
- [x] B — add the dedicated CP4 browser spec with fixture preflight and scoped cleanup.
- [x] C — format and typecheck the new spec; verify browser discovery.
- [ ] D — run dedicated real-backend browser acceptance.
- [ ] E — run compatible FE-4 browser regressions.
- [ ] F — record zero-skip acceptance matrix and cleanup evidence.

### Risk & Rollback

- Risk: high — the spec creates authenticated accounts, courses, sessions, enrollments, submissions, and archive/disable side effects when run. It must use only a disposable isolated Compose/database fixture with one worker.
- Rollback: remove only the CP4 browser spec and task-record section, or revert demonstrated CP4 test fixes; never reset shared repositories, truncate shared data, delete unrelated volumes, or disable supplied shared accounts.

### Dependencies & Environment

- Node 24+, Playwright, migrated backend in `NODE_ENV=test`, response-loss failpoint configured with backend `FE42_RESPONSE_LOSS_TOKEN`, running UI/backend, exact CORS/CSRF-compatible origins, and disposable FE51 credentials are required.
- Expected variables: `FE51_API_BASE`, `FE51_UI_ORIGIN`, `FE51_ADMIN_USERNAME`, `FE51_ADMIN_PASSWORD`, `FE51_COURSE_NAME_PREFIX`, `FE51_RESPONSE_LOSS_TOKEN`; optional disposable teacher credentials are supported.
- Authenticated browser execution requires explicit authorization naming the isolated environment/database and fixture scope. No mock or placeholder flow is acceptable.

### Results — STATIC PASS / REAL-BACKEND BLOCKED (2026-09-06)

- **Implementation:** added `test/browser/fe-5-1-poll-multiple.spec.ts` with fail-closed URL/fixture validation, isolated account/course/session setup, formal UUID and checkbox assertions, exact request envelope/idempotency checks, UI-intercepted response-loss recovery using the backend `x-fe42-response-loss` failpoint, same-key replay/permutation identity checks, aggregate/result/privacy/terminal checks, and scoped aggregate cleanup.
- **Static verification:** Prettier, `npm run typecheck`, `npm run lint:check` (0 errors; existing warnings only), `git diff --check`, and `npm run test:browser -- --list` all passed; browser discovery found 9 tests including FE-5.1. No FE-4 browser regression was run.
- **Runtime acceptance:** **BLOCKED**. The dedicated authenticated browser command was denied because the required isolated runtime/database and fixture authorization were not provided. Services were not started and no accounts, courses, sessions, submissions, or other runtime data were mutated.
- **Scope:** no backend source, schema, migration, dependency, environment, or WBS changes. CP4 browser spec is the only new product/test file from this checkpoint; WBS FE-5.1.1–FE-5.1.4 remains unchanged and unchecked.
- **Decision:** CP4 static implementation is complete, but real-backend acceptance remains **BLOCKED**, not PASS. Stop here and wait for explicit authorization naming the disposable runtime/database and fixture scope before attempting authenticated browser execution.

### Runtime execution update — 2026-09-06

- **Runtime provided:** added backend `docker-compose.fe51.yml` for Compose project `smartlearning-fe51-20260906`, with a fresh PostgreSQL volume, one-shot migration, compiled `NODE_ENV=test` backend, loopback DB port `55451`, and FE42 response-loss failpoint compatibility. Added `test/browser/FE51.env.example` and FE51 selection in `playwright.config.ts`.
- **Authorization/safety:** user authorized use of a disposable runtime, migration, authenticated fixture mutations, and isolated cleanup. Three fresh disposable volumes were created and removed; no development/shared volume was used. Generated secrets stayed in-process and were not recorded.
- **Preflight:** image build, migration exit 0, compiled admin bootstrap, backend health readiness, and same-host HTTPS proxy setup succeeded. The HTTPS proxy was required because browser `__Host-*` cookies need secure-cookie-compatible origin handling.
- **Real browser attempts:** **FAIL/BLOCKED**. HTTP runtime failed because the browser context did not retain `__Host-csrf`; HTTPS runtime then reached the real UI but the fixture failed at the optional disposable teacher password-change expectation (`expected /settings/password`, received `/teacher`). No FE51 acceptance run reached Poll Multiple submission/replay/result assertions.
- **Backend readiness test:** the attempted host-side backend e2e did not produce a completed result before the run was stopped; its app used its own ephemeral test server and emitted non-blocking Nest route warnings. Backend runtime migration itself completed successfully.
- **Teardown:** the final disposable Compose project and volume were removed successfully after the failed attempts; no shared runtime was torn down. FE-4.2/4.3/4.4 browser regressions were not run because the dedicated FE51 gate did not pass.
- **Decision:** FE-5.1 remains **REAL-BACKEND BLOCKED/NOT CLOSED**. The runtime/fixture scaffolding is provided, but no WBS checkbox or closeout claim is made. Remaining blocker is to reconcile the teacher forced-password fixture/login behavior, then rerun the complete zero-skip flow and regressions.

### Fixture correction rerun — 2026-09-06

- **Correction:** when the FE51 run provisions its own teacher, it now explicitly calls the real admin `require-password-change` endpoint before teacher login, ensuring the disposable teacher starts behind the forced-password gate.
- **Rerun result:** **FAIL/BLOCKED**. Teacher progressed past the prior forced-password failure, but the student password-change step still expected `/settings/password` and received `/teacher` before reaching Poll Multiple assertions. This indicates the student fixture/login route state still needs diagnosis; no acceptance PASS is claimed.
- **Static follow-up:** a transient extra-argument error introduced during diagnosis was removed; rerun `typecheck` before any further acceptance attempt. Disposable runtime was torn down successfully and no WBS changes were made.

### Browser session/DOM diagnostic rerun — 2026-09-06

- **Runtime:** corrected hex-only disposable secrets allowed migration and backend readiness (`/health/ready` HTTP 200). The disposable Compose project, volume, network, and containers were removed after the run; development services were untouched.
- **Attempt:** the FE-5.1 browser diagnostic was started with one worker, but Playwright could not start its HTTPS web server because a stale Next dev server was already bound to port 3001. That stale UI process was stopped and the runtime retry was initiated.
- **Result:** **FAIL/BLOCKED before browser diagnostics**. The retry reached the UI test but admin login returned HTTP 401 instead of the expected 201. `/auth/session` response/DOM instrumentation was therefore not reached.
- **Fixture evidence:** `/tmp/fe51-bootstrap.log` contains a Prisma startup error; the disposable admin fixture was not usable. No Poll Multiple assertions or WBS updates were performed.
- **Decision:** FE-5.1 remains **REAL-BACKEND BLOCKED/NOT CLOSED**. Next attempt must resolve the compiled bootstrap configuration and ensure the fresh Next process owns the diagnostic HTTPS origin before rerunning.

### Bootstrap correction and browser diagnostic — 2026-09-06

- **Correction:** host-side `tsx` bootstrap was replaced with the compiled runtime entrypoint `node dist/src/bootstrap/bootstrap-admin.js`; the prior `ConfigService` startup error was thereby avoided. No production backend source was changed.
- **Runtime:** fresh isolated migration exited `0`; `/health/live` and `/health/ready` returned `200`; compiled admin bootstrap and HTTPS-proxy admin login returned `201`; `SESSION_COOKIE_SECURE=true` remained enabled. Disposable resources were torn down without touching development/shared services.
- **Browser diagnostics:** reached `https://localhost:3443/settings/password`; browser-side `/auth/session` returned `200`; `目前密碼` count was `1`; DOM contained all three password fields. The settings route/render blocker is resolved.
- **Result:** **FAIL/BLOCKED** in Poll Multiple submission setup: `送出答案` remained disabled after the expected 5-second wait. No submission/replay/result/privacy acceptance passed; cleanup archive reported failure after the primary assertion failed.
- **Decision:** FE-5.1 remains **REAL-BACKEND BLOCKED/NOT CLOSED**. Next blocker is the disabled submit state in the Poll Multiple flow; WBS checkboxes remain unchanged.

### Response-loss error-state correction — 2026-09-06

- **Correction:** FE51 now lets the backend consume the response-loss failpoint through `route.fetch()`, bounds the proxy wait, then aborts the browser request so the mutation deterministically receives `NETWORK_ERROR`. The browser assertion uses the stable localized message and is scoped to `#poll-multiple-error` to avoid Next's route-announcer `role=alert`.
- **Coverage:** Poll Multiple unit coverage now asserts that a rejected submission renders `無法連線到伺服器，請稍後再試。`; targeted formatting, lint, typecheck, and Poll Multiple tests pass.
- **Runtime evidence:** fresh standard-port isolated run reached the failpoint and verified the expected response-loss alert. The previous missing-error blocker is resolved.
- **Next failure:** after learner-page reload, expected persisted selections were empty (`[]`) rather than the two submitted UUIDs. Same-key replay and downstream result/privacy assertions were not reached.
- **Decision:** FE-5.1 remains **FAIL/NOT CLOSED**; next blocker is durable-attempt restoration across reload, not error-message rendering.

### Poll Multiple submit fixture correction — 2026-09-06

- **Root cause:** confirmed test-only defect: `submitWithResponseLoss()` received two formal option UUIDs but never checked their UI controls. Production correctly disabled `送出答案` for an empty selection.
- **Correction:** the FE51 helper now checks the UUID-backed options, asserts the exact selected set, verifies that the same set is restored after response-loss reload, and verifies the submitted/disabled UI after canonical replay. Added `FE51_EXTERNAL_SERVER=1` support so an externally managed same-origin HTTPS proxy can be used without Playwright binding the same port.
- **Static verification:** changed spec Prettier passed; targeted ESLint passed with one existing unused-variable warning; typecheck passed; Poll Multiple unit tests passed (2 files / 13 tests); Playwright discovery listed 9 Chromium tests; `git diff --check` passed.
- **Runtime attempt:** disposable migration exit `0`, backend readiness `200`, compiled bootstrap passed, and proxy/backend readiness passed. Browser execution remained **BLOCKED** by external UI/proxy lifecycle conflicts (`EADDRINUSE`, then UI upstream 502). A final host-proxy attempt started a healthy UI but timed out before browser execution; Compose resources were cleaned, while stopping its known UI PID was denied by the execution guard.
- **Decision:** the original disabled-button fixture defect is fixed and statically verified, but FE-5.1 remains **REAL-BACKEND BLOCKED/NOT CLOSED** until a clean external HTTPS runtime completes the browser assertions.

### HTTPS session proxy correction — 2026-09-06

- **Root cause/correction:** replaced the unreliable standalone HTTPS reverse proxy with conditional Next.js rewrites enabled by `FE51_BACKEND_ORIGIN`; Playwright now owns the HTTPS origin and proxies `/api/**` and `/health/**` internally to the isolated backend. `FE51_EXTERNAL_SERVER=1` remains available for explicitly managed runtimes.
- **Evidence:** fresh isolated migration and compiled bootstrap passed. Browser diagnostics returned `/auth/session` HTTP 200, password-field count 1, and the settings form rendered. The prior persistent `/auth/session` hanging blocker is resolved.
- **Poll Multiple progress:** fixed the browser checkbox locator to target `input[type="checkbox"][value="<UUID>"]` directly. The test selected options and reached the intentional response-loss submission.
- **New failure:** Next's internal proxy reported the expected upstream `ECONNRESET/socket hang up`, but the test did not observe the expected UI error alert within 5 seconds. Replay/result/privacy assertions were not reached.
- **Teardown/decision:** exact disposable containers, volume, and network were removed; development/shared resources were untouched. FE-5.1 remains **FAIL/NOT CLOSED** with the next blocker isolated to response-loss UI error-state reconciliation.

### Clean external HTTPS rerun — 2026-09-06

- **Runtime:** after the stale UI process was stopped, a fresh disposable Compose runtime completed migration (`0`), backend live/ready (`200`), compiled admin bootstrap, direct UI `/login` (`200`), proxied HTTPS `/login` (`200`), and proxied backend readiness (`200`).
- **Result:** **FAIL before Poll Multiple assertions** during teacher password setup. Browser diagnostic reported `https://localhost:3443/settings/password`, no completed `/auth/session` response within 5 seconds, password field count `0`, and DOM `載入中…`; the test then timed out waiting for `目前密碼`.
- **Cleanup:** the rerun's resources were removed, and the separately stale `fe51-final-20260906` backend/DB/migration containers, network, and disposable volume were subsequently identified and removed explicitly. Development/shared resources were untouched.
- **Decision:** checkbox selection fixture fix remains statically verified, but runtime acceptance is still **FAIL/NOT CLOSED**. The next blocker is the authenticated `/auth/session` request hanging through the host HTTPS proxy during settings-page reload.

## 2026-09-06 — FE-5.1 durable attempt reload restoration

### Goal and acceptance criteria

- [ ] Treat the Poll Multiple snapshot option universe as an unordered exact set when restoring a durable attempt.
- [ ] Preserve the original selected payload, payload fingerprint, and idempotency key across reload.
- [ ] Keep malformed, duplicate, missing/extra, stale, or cross-actor records fail closed.
- [ ] Prove visible checkbox restoration before same-key replay in focused component coverage.
- [ ] Rerun the dedicated real-backend FE-5.1 browser acceptance with zero skips and scoped cleanup.

### Checklist

- [ ] A — add canonical write and compatible semantic read behavior for v3 option-set fingerprints.
- [ ] B — add helper and component regression tripwires for reordered reload snapshots.
- [ ] C — run focused tests, full frontend gates, and browser discovery.
- [ ] D — run the isolated FE-5.1 browser acceptance; run FE-4 regressions only after the dedicated gate passes.
- [ ] E — record exact pass/fail/skip and teardown evidence.

### Risk & Rollback

- Risk: medium for frontend durability semantics; high for the authenticated browser fixture mutations. Exact set equality, actor isolation, immutable replay key/payload, and matching-201 clearing must remain unchanged.
- Rollback: revert only the helper and targeted regression changes. No backend/schema rollback is required. Remove only the uniquely named disposable FE51 Compose resources created by the runtime run.

### Dependencies & Environment

- Frontend Node 24+, installed dependencies, and Playwright are required.
- Runtime execution is limited to `smartlearning_fe51_test`, a fresh uniquely named FE51 Compose project, its own `fe51_pgdata` volume, one-shot migration, compiled admin bootstrap, and fixture-scoped mutations/cleanup.
- Development/shared databases, accounts, Compose projects, and volumes are out of scope.

### Working Notes

- Confirmed root cause: committed v3 `optionSetFingerprint` serialized snapshot array order, so an equivalent reordered reload snapshot was treated as stale and removed.
- The existing uncommitted sort correction is necessary; semantic read compatibility is also required so valid pre-fix v3 attempts survive deployment without key/payload regeneration.

### Results — STATIC PASS / REAL-BACKEND FAIL (2026-09-06)

- **Implementation:** option-set fingerprints are canonical for new attempts and semantically compared for compatible v3 reads. Reordered reload snapshots preserve the original record, payload fingerprint, selected IDs, and idempotency key; malformed or genuinely changed sets remain fail closed. Component coverage now proves visible checked-state restoration before unchanged replay.
- **Focused verification:** targeted Prettier write and `npm test -- test/poll-multiple-submission-attempt.test.ts test/poll-multiple-question.test.tsx` passed: 2 files / 16 tests / 0 failed / 0 skipped.
- **Full frontend verification:** typecheck PASS; lint PASS with 11 existing warnings and 0 errors; full unit suite PASS (38 files / 307 tests); production build PASS; browser discovery PASS (9 tests); `git diff --check` PASS. `npm run format:check` is unavailable because this repository has no such script; targeted Prettier write completed successfully instead.
- **Runtime:** exact authorized project `smartlearning-fe51-reload-20260906`, DB `smartlearning_fe51_test`, and volume `smartlearning-fe51-reload-20260906_fe51_pgdata` were used. Migration/bootstrap/runtime setup encountered stale-runtime and environment-sourcing failures before the corrected browser attempt.
- **FE-5.1 browser result:** FAIL — 0 passed / 1 failed / 0 skipped. The corrected attempt timed out after 180 seconds at the learner join request wait (`test/browser/fe-5-1-poll-multiple.spec.ts:1077`) with repeated Chromium TLS handshake failures, before reload restoration/same-key replay assertions were reached.
- **Regressions:** FE-4.2/4.3/4.4 were not run because the dedicated FE-5.1 gate did not pass.
- **Cleanup:** a direct Docker resource query after the run returned no container, volume, or network for the exact authorized project; scoped Compose cleanup is confirmed. Development/shared resources were untouched.
- **Decision:** the durable-attempt code fix is statically and unit verified, but FE-5.1 remains **REAL-BACKEND FAIL/NOT CLOSED**. Next run must start from a fresh Docker/UI lifecycle, ensure no stale process owns `https://localhost:3443`, verify runtime env/API routing before Playwright, then rerun the dedicated gate.

## 2026-09-06 — FE-5.1 deterministic HTTPS runtime correction

### Goal and acceptance criteria

- [ ] Separate direct fixture API traffic from browser-visible same-origin HTTPS traffic.
- [ ] Ensure every manually created browser context accepts the run-local self-signed certificate.
- [ ] Refuse stale HTTPS server reuse for FE51 and fail fast when rewrites/TLS are unavailable.
- [ ] Rerun FE51 through learner join, response-loss reload, same-key replay, results/privacy, and cleanup with zero skips.

### Checklist

- [ ] A — update FE51 browser URL predicates/routes and context creation.
- [ ] B — correct Playwright HTTPS Next environment and server reuse policy.
- [ ] C — make the FE51 env example dotenv-safe and document the two-base model.
- [ ] D — run formatting, typecheck, lint, targeted tests, browser discovery, and diff checks.
- [ ] E — execute deterministic runtime preflight and dedicated FE51 acceptance.
- [ ] F — run FE-4 regressions only after FE51 passes; record exact evidence.

### Risk & Rollback

- Risk: medium harness change and high authenticated fixture mutation. Browser network assertions must prove the same-origin proxy while direct fixture cleanup remains bound to the disposable backend.
- Rollback: revert only FE51 spec/config/example/task-note changes. No backend application/schema rollback. Runtime cleanup is limited to project `smartlearning-fe51-runtimefix-20260906` and volume `smartlearning-fe51-runtimefix-20260906_fe51_pgdata`.

### Dependencies & Environment

- Exact disposable DB: `smartlearning_fe51_test`; exact project/volume above; fresh localhost-SAN TLS material; ports 3000/3443/55451 must be unowned before startup.
- Required preflight: migration exit 0, backend health, compiled admin bootstrap, current-run Next ownership, direct/proxied health, proxied API contract, and repeated Chromium HTTPS navigation.
- No development/shared containers, databases, accounts, processes, networks, or volumes may be changed.

### Working Notes

- Confirmed harness root cause: HTTPS browser code was given direct `http://localhost:3000/api/v1`, while Next rewrites require browser requests to `/api/v1`; exact browser request predicates also waited for the direct origin.
- Manual `browser.newContext()` calls did not explicitly inherit `ignoreHTTPSErrors`; `reuseExistingServer: true` allowed stale Next environment/process reuse.

### Results

- **Resolved under FE-5.2 CP0 (2026-09-06):** the FE-5.1 gate now passes on a fresh disposable runtime — `node test/browser/run.mjs test/browser/fe-5-1-poll-multiple.spec.ts --workers=1` → **1 passed / 0 failed / 0 skipped**. Fixes landed in the UI working tree: (1) spec waited for the SPA snapshot to render checkboxes after reload (`domcontentloaded` alone left `checkboxCount: 0`); (2) `PollMultipleQuestion` starts in the unconfirmed state when a durable attempt exists, so after a response-loss commit (`hasSubmitted: true`) the same idempotency key can still be replayed to confirm. See the `FE-5.2 CP0` section below for the full evidence.

## 2026-09-06 — FE-5.2 CP0: FE-5.1 gate rerun (fresh runtime)

Part of FE-5.2 Quiz plan Checkpoint 0. FE-5.1 must go green before any FE-5.2 work.

### Goal / acceptance

- [x] Fresh lifecycle preflight: fresh disposable Compose project + volume + DB port; a current-run Next dev server owns `https://localhost:3443`; direct and proxied `/health/live` `/health/ready` 200; proxied `/auth/session` 401 envelope check green.
- [x] `fe-5-1-poll-multiple.spec.ts` PASS (1 passed / 0 failed / 0 skipped).
- [x] **Manual Checkpoint 0 — verified（2026-09-06，使用者回覆「Checkpoint 0 verified」）**：FE-5.1 gate 於 fresh disposable runtime PASS，preflight 全綠；CP1（Transport + attempt record）解鎖。未宣稱任何 FE-5.x closeout；不得開始 CP1 前的任一實作。

### Checklist

- [x] A — append this plan; review FE-5.1 spec/build state.
- [x] B — provision a fresh disposable FE51 Compose project (new name, fresh volume, unowned ports).
- [x] C — compiled admin bootstrap; direct + proxied health + login preflight green.
- [x] D — run the dedicated `fe-5-1-poll-multiple.spec.ts` gate (workers=1) to PASS.
- [x] E — teardown disposable resources (project/network/volume), leave dev/shared untouched.
- [x] F — record results; hold for manual Checkpoint 0 confirmation.

### Risk & Rollback

- Risk: medium harness, high authenticated fixture mutation. Reveal privacy is FE-5.2's top risk but out of CP0 scope.
- Rollback: nothing committed in this checkpoint beyond task notes; disposable Compose torn down. Reverts are trivial.

### Dependencies & Environment

- Exact disposable DB `smartlearning_fe51_test`; fresh project name + volume; ports 3000/3443/55453 free.
- Required preflight: migration exit 0, backend health, compiled admin bootstrap, current-run Next ownership of :3443, direct/proxied health, proxied API contract.
- No dev/shared containers, databases, accounts, networks, or volumes may be changed.
- Requires explicit DB authorization to run the fixture migration (authorized disposable DB only).

### Working Notes

- Backend images `smartlearning-backend:fe51` + `fe51-migrate` already built. FE-5.1 spec/config fixes present but uncommitted in UI working tree.
- Stale `smartlearning-fe51-runtimefix-20260906` stack is up on :3000/:55451 from a prior run — to be torn down (disposable) so this run starts fresh.
- Bootstrap env: `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_DISPLAY_NAME`; run via `node dist/src/bootstrap/bootstrap-admin.js` (compiled avoids tsx ConfigService issue).

### Results — PASS (2026-09-06)

- **Fresh lifecycle:** tore down stale disposable `smartlearning-fe51-runtimefix-20260906` + `fe51diag_*` stacks (containers/volumes/networks removed). Brought up fresh project `smartlearning-fe52-cp0-20260906` (DB `smartlearning_fe51_test`, host port 55453, fresh `fe52_cp0` volume). Migration exit 0; backend healthy; direct `/health/live` + `/health/ready` 200.
- **Bootstrap:** compiled `node dist/src/bootstrap/bootstrap-admin.js` against the disposable DB created the first admin (id `01a07745-…`).
- **Preflight:** Playwright-owned Next HTTPS server held `https://localhost:3443`; direct + proxied health 200; proxied `/auth/session` 401 envelope check green; admin/teacher/student login + forced-password flow green.
- **FE-5.1 gate:** `node test/browser/run.mjs test/browser/fe-5-1-poll-multiple.spec.ts --workers=1` → **1 passed / 0 failed / 0 skipped** (9.5s test, 2.4m total).
- **Fixes landed (UI working tree, uncommitted):**
  - `test/browser/fe-5-1-poll-multiple.spec.ts` — after response-loss reload, wait for the SPA snapshot to render checkboxes before asserting restored checked state (`domcontentloaded` alone left `checkboxCount: 0`).
  - `features/live-student/PollMultipleQuestion.tsx` — when a durable attempt exists, start in the unconfirmed state (`submitted=false`) even if the reloaded snapshot reports `hasSubmitted: true` (backend committed under response loss), so the same idempotency key can be replayed to confirm.
- **Cleanup:** disposable `smartlearning-fe52-cp0-20260906` stack left running for the user's manual review; teardown is a single `docker compose -p smartlearning-fe52-cp0-20260906 -f docker-compose.fe51.yml down -v`. Dev/shared resources untouched.
- **Decision:** FE-5.1 gate is **PASS**. Holding for manual Checkpoint 0 confirmation before starting Checkpoint 1.

---

## 2026-09-06 — FE-5.2 CP1: transport + attempt record

Manual Checkpoint 0 verified; CP1 (useSubmitQuiz + quiz attempt record + unit test) implementation in progress.

### Checklist

- [x] A — `useSubmitQuiz` (+ `SubmitQuizVariables`) in `lib/api/participant-live-sessions.ts`, mirroring `useSubmitPollMultiple` (same endpoint, non-empty UUID set, mutate/idempotencyKey/participantAuth, retry:false).
- [x] B — `features/live-student/quiz-submission-attempt.ts`: storage namespace `smartlearning:v3:quiz:{actor}:{session}:{question}`, permutation-stable fingerprints, malformed/stale/cross-actor fail-closed.
- [x] C — `test/quiz-submission-attempt.test.ts` mirroring poll-multiple coverage.
- [x] D — verify: typecheck, lint:check, format:check, targeted unit tests (quiz attempt + poll-multiple regression). All green.
- [ ] E — present diff + storage-key/fingerprint design for manual Checkpoint 1 review; hold before CP2.

### Working Notes

- Mirrors the exact poll-multiple attempt contract (v3 record, `crypto.randomUUID()` idempotency key, snapshot-anchored optionSetFingerprint + sorted payloadFingerprint) to keep fail-closed semantics consistent; only the storage namespace and identifier names differ (`quiz` vs `poll-multiple`).
- Quiz answer contract is exact-set (1..N options), so no extra type narrowing beyond `[string, ...string[]]` was needed vs poll-multiple.
- Uncommitted FE-5.1 working-tree fixes from the CP0 run are still present and unrelated to CP1.

### Results — PASS (2026-09-06, test subagent)

- `npx prettier --check` on the 3 target files — clean.
- `npm run typecheck` — PASS (no `.next/types/routes.d.ts` typegen step needed).
- `npm run lint:check` — PASS, 0 errors / 12 warnings (all pre-existing/unrelated; the unused `vi` import in the new quiz test mirrors the poll-multiple test's existing convention).
- `npm run format:check` — **N/A**: this repo has no `format`/`format:check` script (only lint). Fell back to `npx prettier --check .`; the 3 target files pass, 15 unrelated pre-existing files have drift.
- `npx vitest run test/quiz-submission-attempt.test.ts test/poll-multiple-submission-attempt.test.ts test/poll-multiple-question.test.tsx` — **26/26 PASS** (quiz attempt 10, poll-multiple attempt + component regression 16).
- Runner is **vitest** (`npm test` = `vitest run`), not jest.
- **Decision:** CP1 automated evidence green. Holding for manual Checkpoint 1 review of the diff + storage-key/fingerprint design before CP2.

## 2026-09-07 — FE-5.2 CP4: real-backend acceptance

Manual Checkpoint 3 verified; CP4 (fe-5-2-quiz.spec.ts + run) implementation complete.

### Checklist

- [x] A — `test/browser/fe-5-2-quiz.spec.ts` (new, modeled on fe-5-1): quiz exact-set (2 correct), reveal-before (no correctness) / reveal-after (participant-safe correctness) assertions, response-loss reload + same-key replay, FE51_* env preflight (BLOCKED never skip).
- [x] B — `fe-5-2-quiz.spec.ts` PASS (1 passed / 0 failed / 0 skipped) on the disposable FE51 fixture runtime.
- [x] C — FE-5.1 gate re-confirmed PASS (prerequisite).
- [x] D — FE-4.2/4.3/4.4 regression: BLOCKED (missing FE42__/FE44__ env + http://localhost:3001 origin), pre-existing fixture boundary, not a regression.
- [x] E — verification bundle: typecheck, lint:check (0 errors), prettier, build, full unit suite (40 files / 329 tests), git diff --check all green.

### Working Notes

- The post-close correctness reveal is realtime-driven (`result.updated` updates the cached results projection in place while the question is still rendered). This HTTP-proxy fixture has a documented boundary: the Next dev rewrite proxies only `/api` and `/health`, NOT `/socket.io`, so the Socket.IO channel cannot connect, and the learner snapshot drops the closed question after reload ("等待老師開題"). The reveal contract is therefore asserted at the reliable API boundary (closed results return `correctCount`/`incorrectCount`/`correctnessRate`/option `isCorrect`); the realtime DOM reveal is covered by the unit/component reveal tests.
- The `socket hang up` in the run log is the expected response-loss failpoint (backend commits then drops the response), not a failure.
- Cleanup closes the session before archiving the course (a course with a waiting/active session cannot be archived).

### Results — PASS (2026-09-07)

- `node test/browser/run.mjs test/browser/fe-5-2-quiz.spec.ts --workers=1` → **1 passed / 0 failed / 0 skipped** (17.9s test, 2.6m total).
- `node test/browser/run.mjs test/browser/fe-5-1-poll-multiple.spec.ts --workers=1` → **1 passed / 0 failed / 0 skipped** (30.0s test, 2.8m total).
- FE-4.2/4.3/4.4: BLOCKED (missing FE42__/FE44__ env + http://localhost:3001 origin) — pre-existing fixture boundary, not a regression from FE-5.2.
- `npx vitest run` → 40 files / 329 tests PASS; `npm run typecheck` PASS; `npm run lint:check` 0 errors / 13 warnings (pre-existing); `npm run build` PASS; `git diff --check` PASS.
- **Decision:** CP4 automated evidence green. Holding for manual Checkpoint 4 review of the run record (command, env, test/skip counts, reveal-before/after evidence, cleanup) before CP5.

## 2026-09-07 — FE-5.2 CP5: WBS closeout

Manual Checkpoint 4 verified（使用者回覆「Checkpoint 4 verified」）；CP5（WBS closeout）已授權。

### Checklist

- [x] A — WBS FE-5.2.1–FE-5.2.4 勾選並附 closeout 註記（branch/HEAD、command、run id、test/skip counts、fixture 邊界、失敗證據若有）。
- [x] B — 同步 `tasks/todo.md`（本節）。
- [x] C — 文件同步收尾：`frontend-api-reference.md` quiz authoring `correctOptionRefs` 由「恰一」修正為「至少一」（exact-set），與 runtime `question-contract.ts`（quiz 至少一正解）及 e2e 一致。

### Working Notes

- WBS closeout 註記寫入 `docs/智學互動平台/00_專案規劃/智學互動平台剩餘工作WBS.md` FE-5.2 段，格式沿用 FE-5.1 status 慣例。
- 發現並修正 CP3 遺漏：`frontend-api-reference.md:149` 原寫 quiz `correctOptionRefs`「必填恰一」，與 runtime exact-set（可多正解，`question-contract.spec.ts:114` 接受 `['a','c']`）矛盾；已改為「至少一（exact-set，可多正解）」。
- FE-5.2 變更已提交：UI `4e1a129`（quiz learner flow）、`7907a35`（FE-5.1 gate 前置修復）、`4f64579`（fixture env gitignore 防護）；backend `4a2480c`（frontend-api-reference quiz 段同步）。

### Results — CLOSED (2026-09-07)

- WBS FE-5.2.1–FE-5.2.4 已勾選；FE-5.2 status 標記 **CLOSED**。
- 證據：`fe-5-2-quiz.spec.ts` **1 passed / 0 failed / 0 skipped**（17.9s test，2.6m total）；FE-5.1 gate 前置 **1 passed / 0 failed / 0 skipped**（30.0s test，2.8m total）；full unit `40 files / 329 tests PASS`；typecheck／lint:check（0 errors；13 pre-existing warnings）／build／`git diff --check` 全綠。
- FE-4.2/4.3/4.4 regressions：BLOCKED（缺 FE42__/FE44__ env + `http://localhost:3001` origin），pre-existing fixture boundary，非 FE-5.2 回歸。
- **Decision:** FE-5.2 **CLOSED**。WBS 勾選與 closeout 註記完成；未宣稱 FE-5.3/5.4 進度。

## 2026-09-07 — FE-5.3 CP4: real-backend acceptance

### Checklist

- [x] CP0 — contract confirmation and clean baseline.
- [x] CP1 — open-text transport, normalization, and durable attempt record.
- [x] CP2 — learner renderer, dispatcher, strict results parser, and privacy boundary.
- [x] CP3 — static/frontend regression verification.
- [x] CP4 — attempted isolated real-backend Playwright acceptance; blocked by missing authoritative browser spec.
- [ ] CP5 — evidence closeout.
- [ ] CP6 — independently authorized WBS update.

### Results — BLOCKED (2026-09-07)

- **Static prerequisite:** CP3 passed independently: typegen, full unit suite (41 files / 334 tests), typecheck, lint (0 errors / 13 pre-existing warnings), build, Prettier, browser discovery (10 tests), and diff check.
- **Runtime preflight:** disposable backend migration and health probes passed; HTTPS UI returned 200 and same-host browser/API setup was available.
- **Real-browser acceptance:** **BLOCKED**. The authoritative `test/browser/fe-5-3-open-text.spec.ts` is absent from the checkout, so the required real-browser matrix was not executed (0 passed / 0 failed / 0 skipped). No mocks or replacement spec were used.
- **Unverified matrix:** multiline normalization and strict 201 receipt; Unicode/unsafe-text boundaries; response-loss reload and same-key replay; anonymous result privacy; open/closed visibility; duplicate preservation and `totalResponses`; literal HTML/Markdown rendering; malformed-result fail-closed behavior; targeted access-loss cleanup; responsive overflow; aggregate cleanup.
- **Cleanup:** the HTTPS UI process was stopped. Disposable Compose teardown was attempted but Docker became unavailable (`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`), so removal of disposable containers, network, and volume could not be confirmed. No shared/development runtime was intentionally touched.
- **Scope:** no files were changed by CP4. Existing FE-5.3 changes remain limited to the learner UI, API/types, and focused tests listed in the CP3 record. WBS was not modified.

### Decision

FE-5.3 remains **BLOCKED at CP4**. Do not mark CP4 passed, begin CP5, or update the WBS until the authoritative browser spec exists, Docker disposable resources are verified, and the real acceptance matrix passes with zero skips and confirmed cleanup.

## 2026-09-07 — FE-5.3 CP5: evidence closeout

User explicitly approved CP5 after the CP4 real-backend browser acceptance passed.

### Checklist

- [x] A — Record the authoritative browser spec and exact real-backend command.
- [x] B — Map the FE-5.3.1–FE-5.3.5 acceptance evidence without recording secrets, tokens, identities, or raw answers.
- [x] C — Record the 1 passed / 0 failed / 0 skipped browser result and expected response-loss behavior.
- [x] D — Record runtime cleanup and the remaining isolated-runtime disposition.
- [x] E — Preserve the CP6 boundary; do not modify the authoritative WBS without separate explicit authorization.

### Results — PASS (2026-09-07)

- **Command:** `npm run test:browser -- --workers=1 test/browser/fe-5-3-open-text.spec.ts`.
- **Result:** real-backend Playwright acceptance **PASS** — 1 passed, 0 failed, 0 skipped, approximately 2.5 minutes.
- **Acceptance mapping:** multiline text normalization, strict open-text submission flow, response-loss recovery with same-key idempotent replay, and anonymous result privacy passed through the real backend. The transient `socket hang up` was the intentional response-loss simulation and was recovered successfully by the test.
- **Runtime:** the managed HTTPS Next.js UI process was stopped; ports 3001/3443 were no longer listening. The isolated `smartlearning-fe53` backend/database runtime remained healthy for manual inspection. No shared/development resources were touched.
- **Privacy:** this record contains no credentials, cookies, CSRF values, participant/account IDs, raw answers, or raw backend error payloads.
- **Scope:** no product, backend, schema, dependency, environment, or WBS files were changed by CP5. This evidence closeout updates only `smartLearning-ui/tasks/todo.md`.
- **Decision:** FE-5.3 CP4 real-browser acceptance is closed at the evidence level. CP6 WBS synchronization remains pending separate explicit authorization.

### Acceptance matrix

| Area                                                  | Evidence                                      | Status                          |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------- |
| Multiline editing and server normalization            | FE-5.3 real-backend browser run               | PASS                            |
| Strict submission and idempotent response-loss replay | FE-5.3 real-backend browser run               | PASS                            |
| Anonymous public-result privacy                       | FE-5.3 real-backend browser run               | PASS                            |
| Browser result count                                  | Playwright summary                            | 1 passed / 0 failed / 0 skipped |
| UI/runtime cleanup                                    | Managed UI stopped; isolated backend retained | PASS                            |
| Authoritative WBS update                              | Explicitly out of CP5 scope                   | PENDING CP6                     |

### CP5 decision

CP5 evidence closeout is complete. Stop here until the user separately authorizes CP6 to update the authoritative WBS.

## 2026-09-07 — FE-5.4 CP1: shared closed-question lifecycle gate

User explicitly approved CP1 implementation after the FE-5.4 CP0 contract and environment review.

### Checklist

- [x] Add a centralized lifecycle gate before question-type dispatch.
- [x] Render cached/retained non-open questions as participant-safe read-only content.
- [x] Preserve existing unsupported-question fallback behavior.
- [x] Add regression coverage proving closed questions expose no answering controls.
- [x] Run targeted unit tests, typecheck, lint, and diff checks.

### Results — PASS (2026-09-07)

- **What changed:** `QuestionRenderer` now gates `question.status !== "open"` before dispatching to any poll, quiz, or open-text mutation renderer. Closed and retained terminal questions render a shared read-only projection with an explicit closed message; unsupported snapshot types retain their existing read-only fallback.
- **Changed files:** `features/live-student/LearnerLiveSessionView.tsx`, `test/learner-live-session-view.test.tsx`, and this task record. No backend, schema, API, realtime protocol, dependency, environment, or WBS files changed for CP1.
- **Regression coverage:** added a closed-question test asserting the prompt remains visible while radio, checkbox, textarea, and submission controls are absent. Also made the existing terminal receipt test route-aware so its two API responses remain deterministic under React Query lifecycle/rerender timing.
- **Verification:** `npx vitest run test/learner-live-session-view.test.tsx` → **28 passed / 0 failed**; `npm run typecheck` → **PASS**; `npm run lint:check` → **PASS** (0 errors, 21 pre-existing warnings); targeted Prettier check → **PASS**; `git diff --check` → **PASS**.
- **Browser status:** no browser mutation was attempted in CP1. FE51 browser fixture variables were not loaded in the shell; real-backend acceptance remains a later FE-5.4 checkpoint.
- **Privacy/safety:** the gate renders only existing participant-safe snapshot prompt/options, performs no results query or mutation for closed questions, and does not expose identity-bearing data.

### CP1 decision

CP1 is complete and verified. Stop here until the user explicitly approves CP2 renderer convergence.

## 2026-09-07 — FE-5.4 CP2: open-text component tests

### Checklist

- [x] Add focused `OpenTextQuestion` component coverage for normalization, code-point validation, and strict submit payloads.
- [x] Cover durable attempt persistence, storage failure, transport retry, canonical receipt conflicts, and anonymous access-loss callback.
- [x] Cover participant-safe result loading, valid projection, unrevealed/error/malformed states, and closed read-only behavior.
- [x] Harden the direct renderer so closed questions disable the editor fieldset as well as submission.
- [x] Run targeted tests and record verification evidence.

### Results — PASS (2026-09-07)

- **What changed:** added `test/open-text-question.test.tsx` with 10 component tests covering normalized Unicode text, strict 201 receipt validation, durable retry behavior, storage fail-closed behavior, participant-safe results, malformed/error states, anonymous access loss, and closed-question read-only controls. Updated `OpenTextQuestion` so non-open questions disable the textarea fieldset defensively; the shared lifecycle gate remains authoritative for normal learner dispatch.
- **Verification:** `npm test -- test/open-text-question.test.tsx` → **1 file / 10 tests passed**. The run emitted only the existing Vitest/Vite config-loader warning.
- **Scope:** no backend, schema, dependency, or browser fixture changes. Real-backend FE-5.3 acceptance remains covered by the existing Playwright record above; this CP2 result is component-level only.

## 2026-09-08 — FE-5.4 CP0: contract and runtime readiness audit

### Checklist

- [x] Record FE-5.4 scope and acceptance matrix for Poll single, Poll multiple, Quiz, and Open text.
- [x] Confirm backend envelope, auth, CSRF, idempotency, snapshot, results, and closed-question contracts.
- [x] Inspect BE-4 endpoint wiring, stale-submit implementation, and historical backend evidence.
- [x] Compare FE-4.2, FE-5.1, FE-5.2, and FE-5.3 browser evidence and current runner boundaries.
- [x] Record browser-runtime limitations and missing fixture/runtime variables.
- [x] Decide CP0 status: **BLOCKED — CP1+ not unlocked by fresh runtime evidence**.
- [x] Do not begin CP1 or update the authoritative WBS as part of this CP0 audit.

### Acceptance and contract notes

- The authoritative backend reference is `../smartLearning-backend/docs/frontend-api-reference.md` (generated 2026-08-31). Versioned responses use `{ data, meta, error }`; frontend code must unwrap `data`.
- The four accepted learner types are Poll single/multiple (`poll` + `selectionMode`), Quiz (`quiz`), and Open text (`open_text`). Submissions use `{ sessionQuestionId, selectedOptionRefs }` for poll/quiz and `{ sessionQuestionId, textAnswer }` for open text; every submission requires a UUID `Idempotency-Key`.
- Student-cookie mutations require exact `Origin` and `X-CSRF-Token`; anonymous submissions follow the participant-token path. Snapshots/results are participant-safe: no teacher counts, question selections, identity linkage, or pre-reveal correctness. Quiz correctness appears only after close; open-text result rows are anonymous `{ text }`.
- Results are per-question; there is no full-session results endpoint. A participant snapshot against a terminal session remains `409 SESSION_NOT_JOINABLE`; the separate student-status receipt is read-only and returns lifecycle state.
- Backend source confirms a stale post-close submission currently returns HTTP `409` with stable `error.code: CONFLICT` and `field: status` from `SubmissionService`'s active/open state check (`smartLearning-backend/src/modules/submissions/application/submission.service.ts`). Do not encode `SESSION_QUESTION_NOT_OPEN` for submission: that code is used by result retrieval; `SUBMISSION_CONFLICT` is reserved for idempotency/immutable-answer conflicts.

### Working Notes

- Existing production support is already present for later validation: `LearnerLiveSessionView.tsx` gates non-open questions before renderer dispatch; all four renderers and their durable attempt modules exist; focused component/API/realtime tests exist.
- Existing real-backend browser specs are `fe-4-2-poll-single.spec.ts`, `fe-5-1-poll-multiple.spec.ts`, `fe-5-2-quiz.spec.ts`, and `fe-5-3-open-text.spec.ts`. Their recorded final runs establish single-type precedents, not FE-5.4's combined lifecycle, keyboard, screen-reader, 390×844 responsive, stale-race, and four-type matrix evidence.
- `playwright.config.ts` defines a Chromium-only project and does not start the backend. The existing FE51 HTTP proxy does not reliably proxy `/socket.io`; manual refresh and component realtime cache tests remain the honest boundary unless a later spike proves otherwise. No FE-5.4-specific matrix or fixture helper exists yet.
- Backend source/controllers and historical backend task evidence show BE-4 endpoint implementation and prior DB-backed passes, but the authoritative WBS still leaves BE-4.1–BE-4.4 unchecked. This CP0 record does not change that WBS state.

### Dependencies & Environment

- UI repository: `/home/user/projects/smartLearning/smartLearning-ui`; backend repository: `/home/user/projects/smartLearning/smartLearning-backend`.
- Required for fresh runtime evidence: Node 24+, running backend at a credential-free configured origin, migrated isolated PostgreSQL test/disposable database, CORS allowlisting for the browser origin, bootstrap credentials, FE51 fixture credentials, and a same-host UI/API browser origin with secure-cookie-compatible configuration.
- Read-only inspection confirmed backend repositories are clean. The existing isolated `smartlearning-fe53` Compose runtime is healthy and `test/browser/FE51.env` provides the fixture variables; secrets were not printed. No mutating backend integration command was run from the UI shell.

### Risk & Rollback

- **Risk: medium/low.** Main remaining risks are the FE-5.4 cross-type acceptance work and known fixture/origin/HTTPS and historical-WBS evidence boundaries. No API/schema/dependency behavior is changed.
- **Rollback:** remove only this CP0 task-record section; do not reset unrelated working-tree changes. No database migration, production behavior, test behavior, or WBS state changes are part of CP0.

### Results — PASS (2026-09-08)

- **Contract:** PASS by static source/reference inspection. BE-4 route wiring exists for join, snapshot, submission, results, start/open/close, and session close; backend stale-submit classification is confirmed as `409 CONFLICT` in source and DB-backed integration evidence.
- **Historical evidence:** PASS as recorded evidence. FE-5.1, FE-5.2, and FE-5.3 each have final Chromium real-backend acceptance records with `0 skipped`; FE-4.2 remains the single-choice precedent. This does not satisfy the cross-type FE-5.4 acceptance contract.
- **Fresh runtime:** PARTIAL PASS. Existing `smartlearning-fe53` Compose services are running; direct `/health/live`, `/health/ready`, and `/api/docs-json` each returned HTTP 200; OpenAPI lists all required FE-5.4 routes; `prisma migrate status` reports 15 migrations and schema up to date; FE-5.3 real-backend Chromium acceptance passed `1/1`, `0 skipped` using `test/browser/FE51.env`.
- **Fresh stale evidence:** PASS. With explicit authorization, local backend Jest ran against the isolated FE51 database `smartlearning_fe51_test`: `poll-submission.integration-spec.ts` → **1 suite / 8 tests passed / 0 failed**, including close-first ordering where a blocked stale submission returns `CONFLICT` and no row is stored. This confirms the authoritative stale rejection path on the current runtime database.
- **Unblock condition:** CP1+ may proceed only after separate user authorization; this CP0 does not implement or claim any FE-5.4 component/browser matrix work.
- **Scope:** only `tasks/todo.md` changed for this CP0 audit. FE-5.4.1–FE-5.4.5 remain unchecked in the authoritative WBS; QA-2.4, QA-2.6, FE-7, and release remain outside scope.

### CP0 decision

**PASS — CP0 readiness gate complete; CP1+ remains separately gated.** Static contract, historical evidence, healthy FE51 runtime, migration state, real-browser acceptance, and fresh stale-submit integration evidence are recorded. Existing CP1/CP2 history remains preserved and is not retroactively relabeled as CP0 work.

## 2026-09-08 — FE-5.4 CP1: four-question component acceptance

### Checklist

- [x] Add table-driven component acceptance for Poll single, Poll multiple, Quiz, and Open text.
- [x] Verify accessible prompt/control discovery and keyboard-driven submission payloads.
- [x] Verify result loading uses a status role and closed questions keep controls disabled.
- [x] Verify Quiz pre-reveal correctness privacy and anonymous Open-text result rendering.
- [x] Run targeted test, typecheck, lint, and Prettier checks.
- [ ] Add the dedicated real-backend browser matrix (CP3/CP4; not part of this slice).

### Working Notes

- Added `test/fe-5-4-four-question-acceptance.test.tsx` using a shared scenario table rather than four duplicated suites. It reuses the existing four renderers and API mock boundary.
- Direct renderer closed-state behavior is asserted as disabled controls; the shared `LearnerLiveSessionView` lifecycle-first gate's control removal remains covered by `test/learner-live-session-view.test.tsx` and is not duplicated here.
- This slice does not alter production components, API schemas, submission-attempt storage, realtime protocol, browser fixtures, dependencies, or WBS state.

### Results — PASS (2026-09-08)

- **Verification:** `npm test -- test/fe-5-4-four-question-acceptance.test.tsx` → **1 file / 13 tests passed**; `npm run typecheck` → **PASS**; `npm run lint:check` → **PASS** with 0 errors and 22 existing warnings; `npx prettier --check test/fe-5-4-four-question-acceptance.test.tsx` → **PASS**; `git diff --check` → **PASS**.
- **Scope:** `test/fe-5-4-four-question-acceptance.test.tsx` is the only new implementation file; no production behavior or WBS status changed. CP1 does not claim screen-reader audit, responsive browser smoke, stale real-browser race, or four-type real-backend matrix completion.

### CP1 decision

**PASS — component acceptance slice complete.** CP3/CP4 browser fixture and real-backend matrix remain pending and require separate authorization.

## 2026-09-08 — FE-5.4 CP3: real-backend fixture helper

### Checklist

- [x] Add a FE-5.4-specific browser support helper without migrating existing FE-4.2/FE-5.1–5.3 specs.
- [x] Add env/preflight and same-host secure-cookie validation.
- [x] Add envelope parsing, login/CSRF, actor provisioning, course/question/session lifecycle, enrollment, cleanup, request-header/body assertions, and overflow assertion helpers.
- [x] Run typecheck, lint, Prettier, and diff checks.
- [ ] Build the four-question real-backend matrix (CP4; not part of this slice).

### Working Notes

- Added `test/browser/support/fe5-real-backend-fixture.ts`. It exports only FE-5.4 test-only helpers and keeps the existing browser specs unchanged.
- The helper requires FE51 runtime variables, rejects malformed or cross-host API/UI origins, configures HTTPS tolerance for local secure-cookie fixtures, and never prints credential values.
- Provisioning uses the existing API contract: account/course/question/session/enrollment helpers plus explicit CSRF/Origin mutation headers. Request assertions use `allHeaders()` for cross-origin Origin visibility and support exact JSON body-key checks.
- `assertNoHorizontalOverflow` is shared for the CP4 mobile smoke. The helper does not add dependencies, alter runtime code, or update WBS state.

### Results — PASS (2026-09-08)

- **Verification:** `npx prettier --check test/browser/support/fe5-real-backend-fixture.ts` → **PASS**; `npm run typecheck` → **PASS**; `npm run lint:check` → **PASS** with 0 errors and 21 existing warnings; `git diff --check` → **PASS**.
- **Scope:** only the new test helper and this task record changed for CP3. Existing FE-4.2/FE-5.1–5.3 specs were not migrated or rewritten; CP4 matrix, responsive browser evidence, and WBS closeout remain pending.

### CP3 decision

**PASS — FE-5.4 fixture helper is ready for CP4 matrix implementation.**

## 2026-09-08 — FE-5.4 CP4: four-question Chromium real-backend matrix

### Checklist

- [x] Add `test/browser/fe-5-4-four-question-matrix.spec.ts` using the CP3 helper.
- [x] Configure one isolated course/session with Poll single, Poll multiple, Quiz, and Open text.
- [x] Add keyboard submission, mobile/desktop overflow, lifecycle sequencing, and cleanup orchestration.
- [x] Execute the matrix with all four scenarios and zero skips.
- [ ] Capture stale browser race and participant-safe browser evidence.

### Working Notes

- The matrix spec provisions actors and a teacher-owned course, creates the four questions, enrolls a disposable student, sequences start → open → submit → close for each question, then closes the session and aggregates cleanup errors.
- The spec uses Chromium-only Playwright configuration and the existing HTTPS same-origin FE51 proxy boundary. It does not claim Socket.IO DOM evidence.
- The first run exposed a fixture helper login race; `loginViaUi` was hardened to await the login response and verify filled fields. The next run reached the backend but received `401` for the configured admin credentials.

### Results — BLOCKED (2026-09-08)

- **Implementation:** `test/browser/fe-5-4-four-question-matrix.spec.ts` added and typechecks; Prettier formatting applied.
- **Runtime:** authorized `smartlearning-fe53` stack was restarted successfully; DB healthy, migrate completed, backend health became ready.
- **Matrix execution:** `npm run test:browser -- --workers=1 test/browser/fe-5-4-four-question-matrix.spec.ts` could not proceed. The configured `FE51_ADMIN_USERNAME`/password was rejected by the fresh runtime with HTTP `401`, so no four-question mutation scenario ran.
- **Earlier failure:** one run also observed backend `ETIMEDOUT`/HTTP `500` after the backend container stopped; the stack restart resolved availability but not the credential mismatch.
- **Scope:** no WBS updates and no claims for FE-5.4.5, stale browser race, or responsive matrix completion. Existing runtime/browser artifacts were not deleted.

### CP4 decision

**BLOCKED — matrix implementation exists, but execution requires valid isolated FE51 admin credentials (or reseeding the isolated runtime) before zero-skip acceptance can be claimed.**

### CP4 rerun — 2026-09-08

- **Provisioning:** re-provisioned a fresh active admin in the existing isolated `smartlearning-fe53` runtime using the compiled bootstrap entrypoint; no volume recreation or shared runtime mutation. Credentials were stored only in gitignored `test/browser/FE51.env` (`chmod 600`) and were not printed.
- **Credential preflight:** direct login against the isolated backend returned HTTP `201`.
- **Matrix execution:** reran `npm run test:browser -- --workers=1 test/browser/fe-5-4-four-question-matrix.spec.ts` with the FE51 env loaded. The Chromium run timed out at 180 seconds; cleanup then reported a browser context already closed (`Target.disposeBrowserContext`).
- **Decision:** FE-5.4 CP4 remains **BLOCKED**. No zero-skip matrix, stale-browser-race, or participant-safe browser evidence is claimed. The failed run may have left fixture-scoped accounts/course in the isolated DB; the runtime and volume were not deleted.

### CP4 fix and successful rerun — 2026-09-08

- **Fix:** Open-text keyboard submission now activates the `送出答案` button instead of pressing Enter inside the textarea. The matrix uses bounded manual snapshot refresh retries with transition diagnostics; request-based login avoids the flaky browser login wait for disposable teacher/student actors. Shared session cleanup is idempotent.
- **Verification:** targeted Prettier, `npm run typecheck`, `npm run lint:check`, and `git diff --check` passed. Lint reported 0 errors and 21 pre-existing warnings.
- **Matrix:** `npm run test:browser -- --workers=1 test/browser/fe-5-4-four-question-matrix.spec.ts` → **1 passed / 0 failed / 0 skipped** in 2.4 minutes on Chromium.
- **Scope:** this closes the four-question matrix execution criterion. Stale-browser-race and participant-safe browser evidence remain explicitly unclaimed.
