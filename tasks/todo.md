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


# Task: 整理雛形共用初始樣式

## Acceptance criteria
- [x] 依雛形設計整理共用色彩／字體 token、基礎元素與通用元件樣式。
- [x] 保留管理端、學員端與投影端頁面專屬樣式，不改既有視覺方向或 HTML/JS 行為。
- [x] 保留鍵盤焦點、reduced-motion 與窄螢幕響應式規則。

## Checklist
- [x] 整理 `docs/智學互動平台/80_系統雛形/assets/style.css` 區塊與註解。
- [x] 核對三頁共用 stylesheet 引用及 CSS 差異。
- [x] 執行可用的 CSS 語法／瀏覽器檢查與 `git diff --check`。

## Working notes
- 原型為獨立純 HTML/CSS/JS；smartLearning-ui 沒有現行全域 CSS 入口，故本次僅整理原型 stylesheet，不移植至 UI app。
- 視覺基準為課堂教具：靛墨、冷灰紙白、梔子黃、松石、朱砂；樣式中含頁面專屬規則，勿提升為通用元件。

## Results
- 更新 `docs/智學互動平台/80_系統雛形/assets/style.css` 的文件標題與分區註解，明確區分設計 tokens／基礎、共用元件、頁面專屬樣式及動效／可及性／響應式層；未改變任何 CSS selector 或屬性值，三個視角仍共用原單一 stylesheet。
- `git -C /home/user/projects/smartLearning/docs diff --check` 與 UI repo `git diff --check`：通過。
- Playwright 瀏覽器檢查 `index.html`、`learner.html`、`projection.html`，各以 1280×900 與 390×844 載入：6 組皆 HTTP 200、CSS 載入成功、CSSOM 120 rules、無 page/console/request errors，且無水平溢出。
- 原型文件位於獨立 `docs` Git repo；該 repo 另有既存 `40_開發規劃/WBS_前後端開發_實作任務_SubChecklist.md` 修改，本次未觸及。


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


# Task: 新增雛形共用樣式至 UI 專案

## Acceptance criteria
- [x] 建立可共用的 CSS 樣式檔並沿用雛形視覺基礎。
- [x] Next.js 根版面載入全域樣式；不新增頁面或業務功能。
- [x] 不把原型的登入、控制台、學員或投影版型搬入 UI 專案。

## Checklist
- [x] 新增 Tailwind CSS 4 相容的全域樣式及 Next.js 根版面。
- [x] 驗證 lint、typecheck、build 與 diff，記錄既有限制。

## Working notes
- 專案原先沒有 `app/`、layout 或 CSS 入口；本次新增根版面匯入 CSS，沒有新增頁面路由。
- 沿用 `@tailwindcss/postcss` 和 Tailwind v4 的 `@import "tailwindcss";`，不新增套件。

## Results
- 新增 `app/globals.css`，放入雛形色彩／字體變數、紙白背景、基本字體和焦點外框；另提供 `.ui-heading`、`.ui-link` 共用類別。未搬入原型的頁面版型，也不覆蓋現有 Tailwind 元件類別。
- 新增 `app/layout.tsx` 匯入全域 CSS，提供 `zh-Hant` 文件語系及基本 Next.js 根結構。
- `npm run lint`：通過，無診斷。
- `npm run typecheck`：受 `.next/dev/types/validator.ts` 中 18 個既有路由模組找不到錯誤阻擋（TS2307），例如不存在的 `app/page.js` 及其他 route/layout；沒有指向新增 CSS／layout 的錯誤。
- `npm run build`：CSS／Next.js 編譯成功；在 TypeScript 檢查階段因同一批 `.next/dev/types/validator.ts` 缺失路由錯誤失敗。
- `git diff --check`：通過；另檢查新檔案無行尾空白。


# Task: 建立可分開啟動的管理端與學員端 Next.js 空殼

## Acceptance criteria
- [x] 在 UI workspace 中建立兩個獨立 Next.js app，分別供管理端與學員端使用。
- [x] 兩端有各自最小首頁與版面，使用不同連接埠，可各自啟動並能同時運行。
- [x] 原有共用 CSS、依賴、`src/`、`lib/` 與測試保留；後端專案不納入 workspace。
- [x] 不加入登入、API 或其他產品功能。

## Checklist
- [x] 設定 npm workspace 與根層啟動指令。
- [x] 建立兩端 app、必要設定及共用樣式載入。
- [x] 分別執行檢查、啟動各端並確認首頁回應。

## Working notes
- 管理端使用 3001，學員端使用 3002；根指令為 `npm run dev:admin` 和 `npm run dev:learner`。
- 原根層 `app/globals.css` 已搬至 `packages/ui-styles/base.css`，兩個 app 的 Tailwind CSS 入口都載入同一份共用樣式。
- 後端仍是獨立專案，沒有加入 workspace。

## Results
- 根 `package.json` 設定 npm workspaces、各端開發／建置／正式啟動指令；`package-lock.json` 更新 workspace 資訊，兩端沿用 Next.js 16.3.1、React 19.2.8 與 Tailwind CSS 4，沒有新增套件版本。
- 新增 `apps/admin` 與 `apps/learner` 兩個 Next.js app，各有獨立首頁、版面、TypeScript、PostCSS 設定；保留既有管理端 Next 設定及共用 CSS，並讓兩端共用 `packages/ui-styles/base.css`。
- 兩端各自 lint、typecheck、build 均通過；`npm test -- --run` 通過，4 個測試檔、23 個測試成功（Vitest 有一則既有 CommonJS/ESM 載入提示）。
- 實際同時啟動兩端後，`http://127.0.0.1:3001/` 回傳管理端頁面標題「管理端｜智學互動平台」，`http://127.0.0.1:3002/` 回傳學員端頁面標題「學員端｜智學互動平台」；兩個頁面均包含各自空殼文字。驗證後已停止本次啟動的伺服器，兩個連接埠都已釋放。
- `git diff --check`：通過。`npm install --package-lock-only --ignore-scripts` 回報目前相依套件有 18 項安全警示（10 項中等、7 項高、1 項嚴重）；此任務未進行相依套件更新或安全修補。
