# Lessons

## 後端 bootstrap CLI 在 `tsx` 下因 decorator metadata 失效而崩潰

- **失敗模式**：`npm run bootstrap:admin`（`tsx src/bootstrap/bootstrap-admin.ts`）在 fresh DB 啟動即崩，`PrismaService` 建構子收到 `undefined` 的 `ConfigService`：`TypeError: Cannot read properties of undefined (reading 'get') at new PrismaService`。
- **偵測訊號**：直接呼叫 `validateEnv({...process.env})` 回 `Reflect.getMetadata is not a function`；加 `import 'reflect-metadata'` 後該錯消失，但 `ConfigService` 仍 undefined（`plainToInstance` 回空實例，因 `class-validator` decorator metadata 在 `tsx` 即時轉譯下未發出）。對照：`npm run start:dev`（`nest start --watch` → `tsc` → `node dist/`）正常。
- **預防規則**：任何走 `tsx` 即時轉譯的 Nest CLI 入口，**不可**依賴 `class-validator`/`class-transformer` decorator metadata（`emitDecoratorMetadata`）。要嘛走編譯產物（`node dist/...`），要嘛在入口頂端 `import 'reflect-metadata'` 並避免 `plainToInstance`+`validateSync`，要嘛改 `validateEnv` 為顯式 if/throw。補 CLI 測試（目前 0 覆蓋）。
- **Tripwire**：`grep -rn "tsx src/" package.json` 找到的 script，其入口若用 `@nestjs/config` 的 `validate` + `class-validator`，即可能中招；跑一次該 script 驗證不崩。
- **影響**：阻塞 US-F5 真實 backend 瀏覽器流程（bootstrap admin 建不出）。屬後端修復，非前端 Story 範圍。

## JSDoc 註解內含 `*/` 會提前關閉區塊註解

- **失敗模式**：`lib/api/types.ts` 註解寫了 `` `src/modules/*/api/dto/*.ts` ``，`*/` 序列被 TS 當成註解結束，後面的文字變成程式碼 → `TS2304: Cannot find name 'api'` / `'dto'`。
- **偵測訊號**：`tsc --noEmit` 報 `TS2304 Cannot find name` 指向註解行內的路徑。
- **預防規則**：JSDoc/區塊註解內**不可**出現 `*/` 字序列（含路徑 glob `*/`）。改用不含 `*/` 的描述，或用行內註解 `//`。
- **Tripwire**：`grep -rn '\*/' --include='*.ts' --include='*.tsx' lib app features components` 找註解內的意外 `*/`（排除合法結尾）。

## test subagent 因外部模型暫時不可用而失敗

- **失敗模式**：委派的靜態 gate test subagent 回 `502 unknown provider for model deepseek-v4-flash:0731`，agent 提前終止。
- **偵測訊號**：task-notification `status=failed` 且 summary 含 `502`/`unknown provider`。
- **預防規則**：subagent 失敗屬環境暫時性問題 → 改由主 agent 直接執行該驗證（靜態 gate 輸出量小，可直接跑並記最小證據）。不要把 subagent 失敗誤判為測試失敗。
- **Tripwire**：收到 subagent `failed` notification 時，先讀 summary 區分「環境失敗」vs「測試失敗」再決定是否重跑或改主 agent 跑。

## React Compiler rejects render-phase ref latching

- **失敗模式**：用 `useRef` 在 render 中讀寫 `current` 以保存 force-change 模式；React Compiler 的 `react-hooks/refs` lint rule 會拒絕 render-phase ref access。
- **偵測訊號**：`npm run lint:check` 在 `ChangePasswordForm.tsx` 的 ref 初始化行報 4 個 errors，即使 targeted tests/typecheck 通過。
- **預防規則**：若 component mount 時已有 session，使用 lazy `useState` 捕捉一次性初始模式；不要在 render 階段讀寫 ref。重新跑 lint 不能由 unit test 取代。
- **Tripwire**：任何新增 render-phase `ref.current` 讀寫後，先跑 `npm run lint:check`，再宣稱 React 19/Compiler UI slice 完成。

## Vitest hoisted mocks must not capture uninitialized locals

- **失敗模式**：新增的 `teacher-layout.test.tsx` 在 `vi.mock("next/navigation", ...)` factory 直接引用尚未初始化的 `redirect`，Vitest hoist 先執行 factory，造成 `ReferenceError: Cannot access 'redirect' before initialization`，整個 suite 在收集階段 0 tests。
- **偵測訊號**：targeted `npm test` 顯示 5 suites passed、1 suite failed，錯誤指向 mock factory 而非 assertion。
- **預防規則**：Vitest hoisted mock factory 使用可變 mock state 時，統一透過 `vi.hoisted(() => ...)` 建立 `redirect`、pathname、session 等 mock；不要在 factory 閉包捕捉一般 top-level `const`。
- **Tripwire**：新增含 `vi.mock` 的 route/layout 測試後，先跑該單一 suite；若錯誤發生於 test collection，先檢查 hoisting，再診斷 production code。

## Avoid broad replacement inside already-qualified mock references

- **失敗模式**：修正 `vi.hoisted` 後以全域字串替換 `pathnameState.value`，把已正確的 `mocks.pathnameState.value` 再次改成 `mocks.mocks.pathnameState.value`。
- **偵測訊號**：targeted suite 中所有 layout tests 在 render 前以 `Cannot read properties of undefined (reading 'pathnameState')` 失敗。
- **預防規則**：對已命名/限定的 mock state 使用精確上下文替換，避免 `replace_all` 套用到新前綴；修正後先讀取變更行再執行 suite。
- **Tripwire**：每次 test mock 結構重寫後，先跑單一測試檔並檢查錯誤是否發生在 collection/render setup，而非立即擴大到全套件。

## Typecheck test files under `globals: true` still need imports

- **失敗模式**：Vitest config 啟用 `globals: true`，但新測試依賴 `beforeEach` 未顯式 import；Vitest 執行通過，TypeScript 卻報 `TS2304: Cannot find name 'beforeEach'`。
- **偵測訊號**：targeted tests 全部通過後，`npm run typecheck` 仍在 test file 報未定義符號。
- **預防規則**：測試檔一律從 `vitest` 顯式 import 使用到的 lifecycle/assertion APIs；不要把 runtime globals 當成 TypeScript declarations。
- **Tripwire**：新增或修改 test imports 後，立即跑 `npm run typecheck`，不要只依賴 Vitest pass。

## Nested callback loses TypeScript narrowing

- **失敗模式**：`AccountDetailView` 在 render guard 後把 `account` 捕捉進 nested mutation callback；TypeScript 重新檢查 closure 時仍視為可能為 `undefined`。
- **偵測訊號**：targeted Vitest 通過，但 `npm run typecheck` 報 `TS18048: 'account' is possibly 'undefined'`，指向 callback 內的 `account.id`。
- **預防規則**：在 closure 建立前把已確認存在的欄位存入 local constant（例如 `const accountIdForMutation = account.id`），callback 只使用該值。
- **Tripwire**：任何 component 以 query data guard 後定義 event/mutation callback，先跑 typecheck，不只跑 component test。

## Playwright uses the existing request fixture context

- **失敗模式**：browser spec 把 Playwright test fixture 的 `request`（已是 `APIRequestContext`）當成 `APIRequest`，呼叫不存在的 `newContext()`；runner 另以未 export 的 `playwright/cli.js` 做 CLI resolution。
- **偵測訊號**：`npm run typecheck` 報 `Property 'newContext' does not exist on type 'APIRequestContext'`；runner `--list` 報 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
- **預防規則**：同一 spec 直接使用 fixture `request`，以 `storageState()` 讀 CSRF cookie；runner 由 `require.resolve('playwright')` 的 package 目錄組出 `cli.js`，不要 resolve 未 export subpath。
- **Tripwire**：新增 Playwright spec 後先跑 `npm run typecheck` 與 `node test/browser/run.mjs --list`，再執行需要 backend fixture 的瀏覽器測試。

## Confirm the requested successor before implementing adjacent stories

- **失敗模式**：US-F16 完成摘要同時存在 canonical roadmap（下一個是 F0）與歷史 F8 resume note（列出未完成的 F8 UI Slice C/D）；在未先確認使用者意圖前，誤開始編寫 F8 step-up scaffolding，造成不必要的 working-tree scope contamination。
- **偵測訊號**：使用者明確選擇「只處理 F16 驗收阻塞」後，F8 初始型別／元件必須全部移除；F16 static diff 本身原本已可獨立驗證。
- **預防規則**：當 roadmap 與 resume note 指向不同 successor 時，先列出選項並問一個針對性問題；在答案前不得修改產品檔案。若已誤動，僅回復自己新增的檔案／片段，不 reset 使用者既有工作樹。
- **Tripwire**：開始下一個 story 前比對 `SPEC F0-F17 前端實作計畫.md`、該 story resume note 與 `tasks/todo.md`；若順序或 scope 不一致，先做 scope confirmation，再執行 typecheck／e2e，不先寫 code。

## Zsh indirect environment lookup differs from Bash

- **失敗模式**：在 zsh shell 使用 Bash 的 `${!name-}` 間接環境變數展開，並把 `status` 當作暫存變數；命令分別因 `bad substitution` 與 zsh `read-only variable` 失敗。
- **偵測訊號**：Bash tool 回傳 `eval: bad substitution` 或 `eval: read-only variable: status`，而非檢查結果。
- **預防規則**：本專案 shell 是 zsh；動態讀取環境變數使用 `${(P)name}`，HTTP status 暫存使用非保留名稱（例如 `http_code`）。
- **Tripwire**：執行含 shell 間接展開或 `status` 變數的 preflight 前，先以 `zsh -n`/小型無秘密命令驗證語法；不要把 Bash-only expansion 直接貼進 Bash tool。

## Real-backend browser cleanup must fail closed

- **失敗模式**：真實 backend Playwright spec 以 API/UI 預設值啟動，或在未驗證 Course name、owner、status 與 baseline ID 前把 response ID 放入 cleanup set；response 遺失時又沒有 reconciliation，可能誤觸碰既有資料或遺留本次建立的 Course。
- **偵測訊號**：code review 發現 fixture gate 未涵蓋全部環境變數、cleanup set 在 projection assertion 前更新，或 archive loop 在第一個錯誤即停止；任何 POST 201/timeout/body parse failure 都應能對應到唯一 run name 的 recovery path。
- **預防規則**：mutating browser test 必須要求全部 fixture/runtime target 變數且無 localhost defaults；只在 exact unique name + owner + draft + baseline absence 通過後追蹤 UUID；不確定的 create 要用 owner-scoped list + detail 且唯一名稱 reconciliation，無法證明時標記 cleanup blocked；每個 archive 嘗試獨立執行並 aggregate failures。
- **Tripwire**：對任何 authenticated browser spec 檢查 `requiredFixtureNames` 是否覆蓋所有 target/session/name 設定、`createdIds.add` 是否位於 identity assertion 之後，並針對 response timeout/malformed 及多個 cleanup ID 寫 recovery/continue-path review。

## Playwright `request.headers()` omits `Origin` on cross-origin; use `allHeaders()`

- **失敗模式**: 在 real backend browser spec 中，用 `request.headers()` 讀 `Origin` 去斷言 mutation 是否送出正確 UI Origin。瀏覽器實際送出 `Origin: http://localhost:3001`（HAR trace 與 `allHeaders()` 都證明），但對跨源請求 Playwright 的 `headers()` 不包含 `origin` key → `headers.origin === undefined`，造成 `undefined !== "http://localhost:3001"` 的 false-negative，測試誤判為「未送出正確 Origin」而失敗。
- **偵測訊號**: 同一 PATCH 請求，HAR/network trace 的 `headers` 陣列含 `Origin: http://localhost:3001`，且 `await request.allHeaders()` 回 `origin: "http://localhost:3001"`；但 `request.headers()` 的 key set 裡沒有 `origin`。spec 在 `assertMutationHeaders` 拋 `... did not send the exact UI Origin`。
- **預防規則**: 跨源 mutation 的 header 斷言改用 `await request.allHeaders()`（含 `Origin`）而非 `request.headers()`。`x-csrf-token` 在 `headers()` 也在，但 `Origin` 只在 `allHeaders()` 可見。修正後必須實際跑一次 real-backend run 驗證，不能只靠 static inspection。
- **Tripwire**: 任何 browser spec 用 `request.headers().origin`（或 `headers()["origin"]`）斷言 Origin 前，先確認改用 `allHeaders()`；grep `assertMutationHeaders` / `.headers().origin`。

## `getByRole("alert")` is ambiguous on a Next.js page — the route announcer also has role="alert"

- **失敗模式**: real-backend browser spec 在斷言 Form 錯誤時用 `page.getByRole("alert")` 去對 `你沒有權限執行此操作。` 做 `toContainText`。Playwright strict mode 報 `resolved to 2 elements`：除了產品真正的 `ErrorAlert id="form-error"`，Next.js 的 route announcer（`__next-route-announcer__`）也帶 `role="alert"`（顯示「建立課程 | 智學互動平台」）。
- **偵測訊號**: `expect(locator).toContainText` 拋 `Error: strict mode violation: getByRole('alert') resolved to 2 elements`，第二個是 `<div role="alert" id="__next-route-announcer__">…`。產品 UI 其實正常渲染（form-error 內容正確），是 locator 不夠唯一。
- **預防規則**: 對「單一組件的錯誤提示」不要用泛型 `getByRole("alert")`；改用穩定且有意的定位器，例如 `page.locator("#form-error")`（`ErrorAlert` 傳入的 `id`），或 `getByRole("alert", { name: /你沒有權限/ })`。`ErrorAlert` 已支援 `id` prop，直接用 id 最穩。
- **Tripwire**: 任何 browser spec 用 `getByRole("alert")`（或對不唯一 `role` 的 locator）斷言單一錯誤文字前，先確認該 `role` 在頁面上唯一；grep `getByRole("alert")` / `getByRole('alert')`。修正後必須實際跑一次 real-backend run 驗證，不能只靠 static inspection。

## Real-browser fixtures must share the API hostname and use secure __Host cookies

- **失敗模式**：以 `http://localhost:3001` 開啟 UI、卻將 `NEXT_PUBLIC_API_BASE` 設為 `http://127.0.0.1:3000`，瀏覽器沒有把 API 登入後的 host-only session cookie 帶回另一個 hostname；改用 same-host `localhost` 後仍因 `__Host-` cookie 在 plain HTTP 測試配置下被瀏覽器拒收而得到 401。`SESSION_COOKIE_SECURE=true` 在 localhost acceptance fixture 才讓真實瀏覽器保存並回送 cookie。
- **偵測訊號**：登入回 201 且頁面導向正確，但後續 `GET /api/v1/me/courses` 仍回 401；backend request headers 沒有 Cookie。API/ UI host mismatch 與 insecure `__Host-` cookie 是可重現原因。
- **預防規則**：real-browser fixture 的 UI origin 與 API base 使用同一 hostname；`__Host-` session/CSRF cookie 測試必須使用 Secure cookie，localhost 可作為瀏覽器安全例外。`SESSION_COOKIE_SECURE=false` 僅適合不執行瀏覽器 cookie jar 的 HTTP 測試。
- **Tripwire**：在 acceptance harness 首次 browser login 後檢查後續受保護 GET 的 backend status 不得為 401；preflight 同時確認 API base hostname 等於 cookie fixture host，並以 real browser 而非 Node cookie jar 驗證。

## Browser password form locators need exact labels when labels overlap

- **失敗模式**：對 `新密碼` 使用 `getByLabel("新密碼")` 時，Playwright 將同名 label 與 `確認新密碼` 的包含匹配一起解析，strict mode 報 `resolved to 2 elements`。
- **偵測訊號**：forced-password browser case 在真實頁面已正確導向 `/settings/password`，但第一次 fill 即因 strict-mode locator error 中止，並非產品流程錯誤。
- **預防規則**：密碼表單含前綴相似 label 時使用 `getByLabel("新密碼", { exact: true })`；避免以包含匹配代替穩定的欄位語義。
- **Tripwire**：任何新增或修改 ChangePasswordForm browser harness 先執行該 forced-password case；若錯誤出現在 `locator.fill` strict mode，先檢查 label exactness 再診斷產品行為。
