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
- `npm run build`：因目前專案沒有 `app/` 或 `pages/` 目錄而失敗，與這次新增的傳輸工具無關。
