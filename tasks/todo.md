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
- **Root cause (confirmed, not a backend/UI defect)**: The browser **does** send `Origin: http://localhost:3001` + a non-empty `X-CSRF-Token` on the PATCH (proven via the HAR trace snapshot and via `request.allHeaders()` which returned `origin: "http://localhost:3001"`). But the spec reads **`request.headers()`**, and on a real cross-origin request Playwright's `headers()` **omits the `Origin` key** → `headers.origin` is `undefined`. So `headers.origin !== uiOrigin` becomes `undefined !== "http://localhost:3001"` → false-negative throw. The CSRF sub-check passes because the `x-csrf-token` key *is* present in `headers()`. Fix is to read `request.allHeaders()` in `assertMutationHeaders`.
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
