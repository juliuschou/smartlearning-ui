This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 本地開發環境（搭配後端測試）

前端跑在 **port 3001**，後端 API 在 **port 3000**。`lib/api/client.ts` 的 `API_BASE`
預設是 `http://localhost:3000/api/v1`，可被 `NEXT_PUBLIC_API_BASE` 覆蓋。

### 啟動前端

```bash
npm install
npm run dev          # next dev -p 3001 → http://localhost:3001
```

### 啟動後端（在 `smartLearning-backend/`）

後端以 Docker Compose 跑（Postgres + migrate + NestJS API）。詳見後端的 `docker-compose.yml`。

```bash
cd ../smartLearning-backend
docker compose --env-file .env.production up -d   # db + migrate + backend
docker compose logs -f backend
```

後端 health probe：`GET http://localhost:3000/health/live`（**raw，未包 envelope**）。

### 建立（測試用）第一個 admin 帳號

UAT DB 預設是空的（無帳號）。用後端的 bootstrap CLI 建立第一個 admin，憑證一律走
**環境變數**（不進 shell history）：

```bash
docker exec \
  -e BOOTSTRAP_ADMIN_USERNAME=admin \
  -e BOOTSTRAP_ADMIN_PASSWORD='<你的密碼>' \
  -e BOOTSTRAP_ADMIN_DISPLAY_NAME='Test Admin' \
  smartlearning-backend \
  node dist/src/bootstrap/bootstrap-admin.js
# 成功印出：Bootstrapped first admin: id=... username=admin role=admin
```

> 憑證一律走環境變數（不進 shell history）。**不要把實際密碼寫進這個檔案**——
> README 會進版控；密碼請自行設定並妥善保管。

bootstrap 只能跑一次（成功後寫入 `system_setting.bootstrap_completed=true`）。
要重建帳號需先清掉該設定或整個 DB。

### F6 登入/登出測試

1. 開 `http://localhost:3001`
2. 用上面 bootstrap 建立的帳號密碼登入
3. 登入成功後依角色跳轉（admin → `/admin`）；再測登出

### 已知陷阱（踩過記錄）

- **`NEXT_PUBLIC_API_BASE` 必須指向後端 3000**。若 dev server 帶到
  `http://localhost:3002`（3002 無服務），登入會 `net::ERR_CONNECTION_REFUSED`
  → 前端顯示「無法連線到伺服器，請稍後再試。」（`lib/api/client.ts` 的
  `NETWORK_ERROR` catch-all）。檢查 dev server 實際 env：
  `tr '\0' '\n' < /proc/$(pgrep -f next-server|head -1)/environ | grep NEXT_PUBLIC_API_BASE`。
  若錯了，用正確 env 重啟：
  `NEXT_PUBLIC_API_BASE=http://localhost:3000/api/v1 npm run dev`
  （重啟前先 `kill` 舊的 `next dev -p 3001` 進程）。
- **後端 `CORS_ORIGIN` 必須包含前端 origin `http://localhost:3001`**。CSRF 採
  fail-closed 的 Origin allowlist，若 3001 不在白名單，所有需認證的 mutation
  會回 403 `AUTH_CSRF_INVALID`。Docker Compose 的 backend 從 `.env.production`
  讀 `CORS_ORIGIN`；臨時覆蓋（不改檔、不持久）：
  `CORS_ORIGIN="http://localhost:3000,http://localhost:3001" docker compose --env-file .env.production up -d backend`
- **`migrate` 容器 `Exited (0)` 是正常的**——它是一次性容器，跑完 migrations
  就退出；backend 才會接著起來。不要把它誤判為「整個 stack 沒起來」。
- 回應永遠是 envelope：資料在 `response.data`；`/health/*` 是 raw 不套 envelope。
  Logout 成功回 `data: null`。
