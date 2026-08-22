# US-F0 CP0 preflight handoff

- **Date:** 2026-08-22
- **Repository:** `smartLearning-ui`
- **Status:** `blocked`
- **Scope:** read-only environment and contract preflight; no F0 product files changed.

## Commands and evidence

| Check | Command / scope | Result |
|---|---|---|
| Backend liveness | `curl -sS -o /dev/null -w ... http://localhost:3000/health/live` | `HTTP 000`; curl timed out after 5 seconds |
| Backend readiness | `curl -sS -o /dev/null -w ... http://localhost:3000/health/ready` | `HTTP 000`; curl timed out after 5 seconds |
| OpenAPI | `curl ... http://localhost:3000/api/docs-json` | `HTTP 000`; curl timed out after 5 seconds |
| Backend port | `ss -ltn '( sport = :3000 )'` | not listening |
| UI port | `ss -ltn '( sport = :3001 )'` | not listening |
| Test database | `cd /home/user/projects/smartLearning/smartLearning-backend && NODE_ENV=test npm run prisma:migrate:status` | `P1001`: cannot reach PostgreSQL at `localhost:5432` |
| Existing F16 browser fixture contract | `test/browser/us-f16-account-permission.spec.ts` | requires `F16_ADMIN_USERNAME`, `F16_ADMIN_PASSWORD`, `F16_TARGET_ACCOUNT_ID`, `F16_TARGET_USERNAME`, `F16_TARGET_PASSWORD`; no secrets recorded here |
| Working tree | UI `git status --short` | clean before this handoff; only this handoff/todo documentation is in scope |

## Contract evidence already recorded

The checked-in 2026-08-22 F0 notes in `tasks/todo.md` record that the backend Course contract had previously been inspected: `/api/v1/courses`, `POST` success `201`, Course DTO fields, and existing backend e2e success/403/no-row behavior were aligned. That evidence is stale for this live attempt because the services and database are currently unreachable; it must be revalidated after the environment is restored.

The authoritative US-F0 plan still requires live confirmation of:

- `/auth/session` method and `canCreateCourse` DTO type;
- Course create/detail request and response fields, status, and detail route;
- actual CORS origin configuration for `http://localhost:3001`;
- CSRF cookie/header and Origin enforcement;
- F16 enabled/disabled behavior, no-new-row guarantee, and data/CLI-credential invariance.

## Blocker and stop decision

CP0 cannot meet its exit criteria while backend, UI, and PostgreSQL are unavailable. Do not start CP1–CP5, add API hooks, create routes, or use mock/runtime fixtures as a substitute.

## Required next action

Restore the backend service, migrated `smartlearning_test` database, UI service on port 3001, explicit `CORS_ORIGIN=http://localhost:3001`, and isolated F16 fixture values. Then rerun CP0 from the beginning. Secrets must remain in the local environment and must not be copied into this file, chat, logs, or commits.

## CP0 rerun — 2026-08-22

- **Status:** `blocked`; the runtime environment was restored and the complete preflight was rerun. No F0 product files were modified.
- **Backend health:** PASS — `/health/live`, `/health/ready`, `/api/docs`, and `/api/docs-json` returned HTTP 200; readiness reported a healthy database; OpenAPI was 3.0.0 with 35 paths.
- **Runtime services:** PASS — backend `3000`, UI `3001`, PostgreSQL `5432`/`5433` were reachable; Compose PostgreSQL was healthy; the migrate container exited 0 with no pending migrations.
- **Test database:** PASS — `NODE_ENV=test npm run prisma:migrate:status` found 12 migrations and an up-to-date `smartlearning_test` schema.
- **Course/session contract:** PASS with documentation limitations — live OpenAPI confirmed Course create `201`, Course detail `200`, `CreateCourseDto` name/description constraints, CourseDto fields, and `SessionDto.canCreateCourse: boolean`. The list generic response schema and some UUID/date/nullability formats remain incomplete in generated OpenAPI.
- **CORS/CSRF:** functional behavior PASS — `http://localhost:3001` received the expected CORS response and an unapproved origin did not; authenticated mutations still require exact Origin plus matching `__Host-csrf`/`x-csrf-token`. Exact configuration is unresolved because the running process allows both `http://localhost:3000` and `http://localhost:3001`, rather than the requested single UI origin.
- **F16 browser gate:** BLOCKED — `node test/browser/run.mjs --list` discovered one Chromium test, but all five required fixture variables (`F16_ADMIN_USERNAME`, `F16_ADMIN_PASSWORD`, `F16_TARGET_ACCOUNT_ID`, `F16_TARGET_USERNAME`, `F16_TARGET_PASSWORD`) were absent. The mutating browser flow was intentionally not run.
- **Runtime/source parity:** BLOCKED — the checked-out backend source contains `GET /api/v1/admin/accounts/:id` and `PATCH /api/v1/admin/accounts/:id/permissions`, but the live OpenAPI does not. The running backend image predates the uncommitted F16 backend changes.
- **No destructive workaround:** no mock/runtime fixture, product-file edit, environment-file edit, container removal, volume deletion, or mutating browser flow was used during the rerun.

### Rerun decision

CP0 remains blocked. Before another rerun, provide isolated local F16 fixture values, rebuild/recreate the backend from the checked-out F16 source without resetting its dirty working tree, and launch it with the exact intended `CORS_ORIGIN=http://localhost:3001`. Then rerun CP0 from the beginning. Do not enter CP1–CP5 until CP0 passes and the user explicitly confirms continuation.

## Manual confirmation gate

The earlier 2026-08-22 rerun recorded above was blocked. The final rerun below supersedes that state; after CP0 PASS, wait for explicit user confirmation before entering CP1 or CP2.

## CP0 final rerun — 2026-08-22 (dirty F16 source + isolated fixture)

- **Status:** `PASS`; CP0 completed without modifying F0 product files. CP1–CP5 were not started.
- **Backend source/runtime:** rebuilt from the checked-out, uncommitted F16 backend source; the stale `smartlearning-backend` container was stopped with explicit authorization (container and original `smartlearning-db`/volume preserved). A temporary Compose override launched `f16-isolated-backend` on `localhost:3000` with a fresh `f16isolated_f16_fixture_pgdata` volume and `f16-isolated-db` on host port `55433`.
- **Health and migration:** `/health/live`, `/health/ready`, and `/api/docs-json` returned HTTP 200; the one-shot isolated migration exited `0`; `prisma migrate status` found 12 migrations with no pending migrations; OpenAPI exposed 37 paths including `/api/v1/admin/accounts/{id}` and `/api/v1/admin/accounts/{id}/permissions`.
- **CORS/CSRF preflight:** exact runtime `CORS_ORIGIN=http://localhost:3001`; allowed preflight returned `Access-Control-Allow-Origin: http://localhost:3001` and credentials; an unapproved origin returned no ACAO. The browser mutation path used the real Origin and CSRF cookie/header contract.
- **Isolated fixture:** a fresh admin was bootstrapped through the compiled container CLI, a unique teacher was created through the admin API, and the forced password change was completed. The target account ID was `01a028b5-c31f-7410-83a5-7032e8e81acd`; passwords/cookies were held only in the provisioning process and were not written to this handoff, logs, source, or commits.
- **Real browser gate:** `node test/browser/run.mjs test/browser/us-f16-account-permission.spec.ts` — **1 passed** (Chromium, 3.1s). The flow verified initial server permission, keyboard/focus/ARIA switch behavior, revoke→403 with no new Course, re-enable→201, archive cleanup, permission restoration, and logout cleanup.
- **Repository safety:** UI `git diff --check` passed; no F0 product file, env file, backend source, container volume, or existing domain row was reset or deleted. The isolated fixture volume remains available for this completed run.

### Final decision

CP0 exit criteria are satisfied. Do not begin CP1–CP5 in this session unless the user explicitly requests continuation; the current task stops at the CP0 PASS boundary.
