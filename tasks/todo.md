# Task: 建立共用 API client 封裝

## Acceptance criteria
- [x] 建立共用請求函式，統一送出請求、整理成功回覆及錯誤回覆。
- [x] 保留專案既有後端回覆格式、登入 cookie、變更資料時的 CSRF 慣例。
- [x] 不恢復已移除的前端頁面、功能 API 或 UI。
- [x] 以 fetch mock 測試成功、錯誤及請求選項；無需啟動後端。

## Checklist
- [x] 建立最小 API 型別、CSRF helper、client 與對應測試。
- [x] 執行 API client 測試。
- [x] 執行 typecheck 與 lint，記錄結果。

## Working notes
- 目前分支是 Next.js 空殼；舊傳輸層可從 `9ece7e9^` 取回參考。
- `vitest.config.ts` 原本指向已刪除的 `test/setup.ts`，已移除失效設定，讓目前的獨立測試可執行。
- 不執行瀏覽器測試：runner/specs 與應用程式目前不存在。

## Results
- 新增 `lib/api/client.ts`、`lib/api/types.ts`、`lib/api/csrf.ts` 與 `test/api-client.test.ts`；移除 Vitest 對已刪除 `test/setup.ts` 的設定。
- `npm test -- --run test/api-client.test.ts`：通過，9 項測試成功。
- API 傳輸檔案獨立 TypeScript 檢查：通過（`npx tsc --noEmit --strict --skipLibCheck --target ES2017 --module esnext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext --types node lib/api/client.ts lib/api/csrf.ts lib/api/types.ts`）。
- `npm run lint` 與 `npm run lint:check`：皆通過，只有 ESLint 提示目前沒有 `pages/`、`src/pages/` 目錄的警告。
- 專案 `npm run typecheck`：既有 `.next` 產生的路由檢查檔引用已刪除的 `app/` 頁面而失敗；以上獨立檢查確認本次新增傳輸檔案型別正確。
- `npm run build`：因目前專案沒有 `app/` 或 `pages/` 目錄而失敗，與 API client 新增無關。


# Task: 建立 Socket.IO client 封裝

## Acceptance criteria
- [x] 提供明確啟動、關閉、讀取狀態及訂閱連線狀態的共用工具。
- [x] 使用 Socket.IO 內建自動重連，回報連線中、重連中、失敗及中斷等狀態。
- [x] 不在模組載入時連線，不假定即時服務路徑、登入憑證或業務事件。
- [x] 以可控 mock 測試連線生命週期及清理，無需真實後端。

## Checklist
- [x] 新增 `lib/live/socket-client.ts` 與 `test/socket-client.test.ts`。
- [x] 執行 scoped typecheck、整體 typecheck 與測試，記錄結果。
- [x] 檢查 diff 及工作樹。

## Working notes
- REST `API_BASE` 僅用於取得 Socket.IO 預設服務來源的 origin，不沿用 `/api/v1` 路徑。
- 連線由呼叫端明確管理；每個 client 控制一個 socket，可呼叫 `disconnect()` 清理。

## Results
- `npm test -- --run`：通過，2 個測試檔共 15 項測試成功。
- 前次裸 CLI 檔案檢查未載入專案 `tsconfig.json`，造成 `@/` alias 找不到。本次透過暫存設定繼承 repo tsconfig，並設定 repo `node_modules/@types` 為 typeRoots、啟用 Node types，限定檢查 `lib/live/socket-client.ts` 及 API client/csrf/types 依賴。`npx tsc --noEmit -p /tmp/tsconfig-socket-check.json`：通過，無錯誤；驗證後移除暫存設定。
- `npm run typecheck`：因既有 `.next/dev/types/validator.ts` 引用已移除的 `app/**` 路由而失敗；Socket.IO 新增檔案未出現在失敗項目。
- `npm run lint:check`：沒有發現新增檔案的 lint 問題；ESLint 仍對專案缺少 `pages/` 或 `src/pages/` 目錄輸出既有診斷。
- `git diff --check`：通過。


# Task: 定義管理端／學員端共用待機狀況資料

## Acceptance criteria
- [x] 定義等待開始、即將開始、進行中、已結束的共用資料形狀。
- [x] 分清預定與實際時間；未發生的實際時間可為 `null`；時間格式採含時區的 ISO 8601。
- [x] 共用資料不包含目前時間、倒數或特定端畫面文案；由使用端自行計算／呈現。
- [x] 不新增頁面、業務事件或傳輸行為；保持待機狀況與 Socket.IO 連線狀態分離。
- [x] 型別與測試通過，既有使用者變更保留。

## Checklist
- [x] 新增共用待機狀況型別及必要測試。
- [x] 執行新增測試、typecheck、lint 與 diff 檢查。
- [x] 記錄結果及任何既有檢查限制。

## Results
- 新增 `lib/live/standby-state.ts` 的共用型別及 `test/standby-state.test.ts` 的格式測試。
- `npm test -- --run test/standby-state.test.ts`：通過，3/3 測試成功。
- `npm run typecheck`：受既有 `.next/dev/types/validator.ts` 引用不存在的 `app/**` 路由阻擋（20 個 TS2307）；與本次新增型別無關。
- `npm run lint:check`：受既有 ESLint Pages 路由檢查找不到 `pages/` 或 `src/pages/` 目錄阻擋；與本次新增型別無關。
- `git diff --check`：通過。原有未提交變更保持未動。

## Working notes
- 專案目前沒有管理端／學員端畫面、活動模型、待機事件或服務端回覆可供比對。
- `SocketConnectionStatus` 是連線狀況，不可和活動待機狀況混用。
- 工作樹中的 `lib/live/socket-client.ts`、`test/socket-client.test.ts` 是既有未提交變更，保持不動。


# Task: 建立共用讀取中、空狀態及錯誤提示元件

## Acceptance criteria
- [x] 提供可重複使用的讀取中、沒有資料、發生問題提示元件。
- [x] 提示文字可讀，並讓輔助科技辨識讀取狀態與錯誤訊息。
- [x] 錯誤元件可選擇提供重試按鈕；未提供時不顯示按鈕。
- [x] 不新增頁面或業務功能，不加入新依賴。

## Checklist
- [x] 新增共用元件及元件測試。
- [x] 執行測試、lint、typecheck 與 diff 檢查。

## Working notes
- 專案尚無既有 UI 元件或樣式規範；沿用已安裝 Tailwind CSS，採簡潔自適應樣式。

## Results
- 新增 `src/components/ui/LoadingMessage.tsx`、`EmptyMessage.tsx`、`ErrorMessage.tsx`，支援可設定訊息、標題、樣式 class，以及錯誤時選擇性重試。
- `npm test -- --run test/components/messages.test.tsx`：通過，5/5 項測試成功。
- `npm run lint`：通過；ESLint 提示專案目前沒有 `pages/` 或 `src/pages/` 目錄。
- `npm run typecheck`：因既有 `.next/dev/types/validator.ts` 引用不存在的 `app/**` 路由而失敗（19 個 TS2307）；沒有新增元件或測試相關型別錯誤。
- `git diff --check`：通過。
