# 智學互動平台 — Web UI

Next.js 16 + React 19 的前端。此專案使用 App Router、TypeScript、Tailwind CSS v4、React Query、React Hook Form 與 Zod，透過後端 `/api/v1` REST API 提供登入、帳號管理、老師課程與學員課程功能。

> 前端遵循 **Option B**：先完成並確認後端契約，再接上對應 UI。未完成的後端流程不以 mock、placeholder API 或 runtime fallback 取代。

## 目前功能

- Web session 登入、登出與 `next` 目的地導向
- `mustChangePassword` 強制改密碼 gate 與密碼變更頁
- 角色專屬 shell：管理員、老師、學員
- 管理員帳號列表、詳情、建立，以及老師開課權限切換
- 老師建立課程與讀取課程詳情
- 學員讀取自己的有效課程列表（支援分頁 transport）
- 集中的 API envelope 解包、CSRF/Origin header 與穩定錯誤碼處理

尚未包含的功能（需等待相應後端契約或後續 slice）：題目編輯、課堂即時互動、學員加選 UI，以及其他未列在上述清單的流程。

## 快速開始

### 環境需求

- Node.js 24+
- npm
- 若要執行登入或其他受保護流程：可連線的 `smartLearning-backend`，以及已完成 migration 的資料庫

### 安裝與啟動

```bash
npm install
npm run dev
```

開啟 <http://localhost:3001>。

前端開發伺服器固定使用 port `3001`，因為本地後端預設使用 port `3000`。

### 常用指令

```bash
npm run dev          # Next.js development server，port 3001
npm run build        # production build
npm run start -- -p 3001  # 啟動已 build 的 production server
npm run lint:check   # ESLint（不修改檔案）
npm run typecheck    # TypeScript noEmit
npm test             # Vitest unit/component tests
npm run test:watch   # Vitest watch mode
npm run test:browser # Playwright browser runner
```

Next.js 16 的 route helper types 由 typegen 產生。若是新 checkout 或新增 route，先執行：

```bash
npx next typegen
npm run typecheck
```

## 後端整合

### API base URL

`lib/api/client.ts` 的 `API_BASE` 讀取 `NEXT_PUBLIC_API_BASE`，未設定時使用：

```text
http://localhost:3000/api/v1
```

例如切換到其他本地 backend：

```bash
NEXT_PUBLIC_API_BASE=http://localhost:3000/api/v1 npm run dev
```

修改 `NEXT_PUBLIC_API_BASE` 後請重新啟動 Next.js dev server；該值會在建置時與 client bundle 中使用。

### 啟動 sibling backend

在 `smartLearning-backend/` 目錄依其 README 與環境檔啟動 backend。Compose stack 包含 PostgreSQL、一次性 migration container 與 NestJS API：

```bash
cd ../smartLearning-backend
docker compose --env-file .env.production up -d
docker compose logs -f backend
```

確認 backend：

```bash
curl -i http://localhost:3000/health/live
curl -i http://localhost:3000/health/ready
```

`/health/live` 與 `/health/ready` 是 raw response，不使用 API envelope。

### CORS 與 CSRF

本地 backend 的 `CORS_ORIGIN` 必須明確允許前端 origin：

```text
http://localhost:3001
```

CSRF 保護的 mutation 會由 API client 自動附加：

- `credentials: include`，傳送 DB-backed session cookie
- `Origin: http://localhost:3001`
- 從 `__Host-csrf` cookie 讀取的 `X-CSRF-Token`

登入本身不附 CSRF header；登入回應設定 session 與 CSRF cookies。若 CORS origin 不正確，authenticated mutation 會以 `AUTH_CSRF_INVALID` 失敗。

## API client 約定

`lib/api/client.ts` 是所有 `/api/v1` 呼叫的集中入口：

- 成功回應 `{ data, meta, error }` 會解包成 `body.data`
- 錯誤會轉成 `ApiRequestError`，UI 應依穩定的 `code` 顯示整理過的訊息
- 不應在畫面渲染 backend 原始 `message`
- GET query 會轉送 `AbortSignal`；不需要重試的 query 明確設定 `retry: false`
- health probe 不可套用這個 client，因為 health response 不在 envelope 中

後端 DTO 與 endpoint 契約以以下文件為準：

- `../smartLearning-backend/docs/frontend-api-reference.md`
- `../docs/智學互動平台/30_系統設計/API 與共用 Schema 設計.md`
- `../docs/智學互動平台/30_系統設計/Web Auth 與安全設計.md`

## 路由

| Route | 用途 | 存取角色 |
| --- | --- | --- |
| `/` | 公開入口，目前為簡單 landing | 公開 |
| `/login` | 登入 | 公開 |
| `/settings/password` | 變更密碼；也是 `mustChangePassword` 使用者的唯一 gate target | 已登入 |
| `/admin` | 管理員首頁 | `admin` |
| `/admin/accounts` | 帳號列表 | `admin` |
| `/admin/accounts/new` | 建立帳號 | `admin` |
| `/admin/accounts/:accountId` | 帳號詳情與開課權限 | `admin` |
| `/teacher` | 老師首頁 | `teacher` |
| `/courses/new` | 建立課程 | `teacher` |
| `/courses/:courseId` | 課程詳情 | `teacher` |
| `/student` | 我的課程 | `student` |

Route group 的 layout 會在 render children 前處理 session 載入、角色檢查與 forced password-change redirect。未登入者會被導向 `/login?next=...`，且 `next` 只接受 same-origin 路徑。

## 測試

一般 unit/component 測試：

```bash
npm test
```

列出 browser specs 而不執行 authenticated mutation：

```bash
node test/browser/run.mjs --list
```

目前的 real-backend Playwright specs 需要隔離的 backend、migration 完成的測試資料庫、`3000`/`3001` runtime、精確的 `CORS_ORIGIN`，以及各 spec 要求的 fixture environment variables。缺少條件時應保持 blocked，不要用 mock 取代真實驗收。

## 專案結構

```text
app/                 App Router routes、layouts、loading/error boundaries
components/           可重用 UI/auth 元件
features/             依功能分組的 client views 與表單
lib/api/              API client、wire types、query keys、feature hooks
lib/auth/             session query 與 session state
test/                 Vitest 與 Playwright 測試
```

`tasks/` 保存各 slice 的 acceptance criteria、驗證結果與已知限制；進行較大變更前請先閱讀相關 task log 與 `tasks/lessons.md`。

## 開發注意事項

- 不要把密碼、session cookie、CSRF token 或 fixture credentials 寫入 README、source、測試輸出或 commit。
- 不要直接修改 `next-env.d.ts`；route types 應由 `next typegen` 或 `next build` 產生。
- 前端與 backend 是兩個獨立 git repository；請在本目錄執行 UI 指令。
- 完成變更前至少執行受影響的 targeted tests、`npm run typecheck`、`npm run lint:check`、`npm run build` 與 `git diff --check`。
