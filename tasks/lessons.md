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
