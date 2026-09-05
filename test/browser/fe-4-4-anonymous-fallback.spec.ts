import { expect, test, type BrowserContext, type Page } from "playwright/test";

const rawApiBase = process.env.FE44_API_BASE ?? "";
const rawUiOrigin = process.env.FE44_UI_ORIGIN ?? "";
const uiOrigin = rawUiOrigin.replace(/\/+$/, "");
const sessionCode = process.env.FE44_SESSION_CODE ?? "";
const liveSessionId = process.env.FE44_LIVE_SESSION_ID ?? "";

const requiredFixtureNames = [
  "FE44_API_BASE",
  "FE44_UI_ORIGIN",
  "FE44_SESSION_CODE",
  "FE44_LIVE_SESSION_ID",
];

type JsonRecord = Record<string, unknown>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertFixturePreflight() {
  const missing = requiredFixtureNames.filter(
    (name) => !(process.env[name] ?? "").trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `FE-4.4 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
        "Provision a disposable migrated backend and set all FE44_* variables; this acceptance never skips.",
    );
  }

  let api: URL;
  let ui: URL;
  try {
    api = new URL(rawApiBase);
    ui = new URL(rawUiOrigin);
  } catch {
    throw new Error(
      "FE-4.4 real-backend fixture BLOCKED: FE44_API_BASE and FE44_UI_ORIGIN must be absolute URLs.",
    );
  }
  const validProtocol = (protocol: string) =>
    protocol === "http:" || protocol === "https:";
  const secureCookieException =
    ui.protocol === "https:" ||
    ui.hostname === "localhost" ||
    ui.hostname === "127.0.0.1";
  if (
    !validProtocol(api.protocol) ||
    !validProtocol(ui.protocol) ||
    api.username ||
    api.password ||
    ui.username ||
    ui.password ||
    api.pathname.replace(/\/+$/, "") !== "/api/v1" ||
    api.search ||
    api.hash ||
    ui.pathname !== "/" ||
    ui.search ||
    ui.hash ||
    api.hostname !== ui.hostname ||
    !secureCookieException ||
    !uuidPattern.test(liveSessionId) ||
    sessionCode.trim().length === 0
  ) {
    throw new Error(
      "FE-4.4 real-backend fixture BLOCKED: use same-host credential-free API/UI URLs, /api/v1 API path, secure-cookie-compatible origin, UUID session ID, and non-empty session code.",
    );
  }
}

async function assertHealth(context: BrowserContext) {
  const healthOrigin = new URL(rawApiBase).origin;
  for (const path of ["/health/live", "/health/ready"]) {
    const response = await context.request.get(`${healthOrigin}${path}`);
    expect(response.status(), `${path} status`).toBe(200);
  }
}

async function assertNoCredentialInObservableState(
  page: Page,
  liveSessionId: string,
) {
  const url = page.url();
  expect(url).not.toMatch(/token|participant/i);
  const localStorage = await page.evaluate(() =>
    Object.keys(window.localStorage),
  );
  expect(localStorage).toEqual([]);
  const sessionStorageKeys = await page.evaluate(() =>
    Object.keys(window.sessionStorage),
  );
  expect(sessionStorageKeys).toEqual([
    `smartlearning:v1:anonymous-participant:${liveSessionId}`,
  ]);
}

test.describe("FE-4.4 real-backend anonymous fallback", () => {
  test("joins anonymously, persists only the scoped session credential, and reloads without a second join", async ({
    browser,
  }) => {
    assertFixturePreflight();
    const context = await browser.newContext({ baseURL: uiOrigin });
    const page = await context.newPage();
    const joinRequests: string[] = [];
    const socketUrls: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request
          .url()
          .endsWith(`/live-sessions/${sessionCode.trim().toUpperCase()}/join`)
      ) {
        joinRequests.push(request.url());
        expect(request.postDataJSON()).toEqual({ displayName: "FE44 Learner" });
        expect(request.headers()).not.toHaveProperty("x-csrf-token");
        expect(request.headers()).not.toHaveProperty("x-participant-token");
        expect(request.headers()).not.toHaveProperty("idempotency-key");
      }
    });
    page.on("websocket", (socket) => socketUrls.push(socket.url()));

    try {
      await assertHealth(context);
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await page
        .getByLabel("課堂代碼")
        .fill(`  ${sessionCode.toLowerCase()}  `);
      await page.getByLabel("顯示名稱").fill("  FE44 Learner  ");
      await page.getByRole("button", { name: "加入課堂" }).click();
      await expect(page).toHaveURL(`${uiOrigin}/live/${liveSessionId}`);
      await expect.poll(() => joinRequests.length).toBe(1);
      await expect(
        page.getByRole("heading", { name: /等待開始|進行中/ }),
      ).toBeVisible();

      const credential = await page.evaluate((id) => {
        const key = `smartlearning:v1:anonymous-participant:${id}`;
        const raw = window.sessionStorage.getItem(key);
        if (!raw) throw new Error("anonymous credential was not persisted");
        const parsed = JSON.parse(raw) as JsonRecord;
        return { key, parsed };
      }, liveSessionId);
      expect(credential.parsed.version).toBe(1);
      expect(credential.parsed.liveSessionId).toBe(liveSessionId);
      expect(credential.parsed.sessionCode).toBe(
        sessionCode.trim().toUpperCase(),
      );
      expect(typeof credential.parsed.participantToken).toBe("string");
      expect(
        (credential.parsed.participantToken as string).length,
      ).toBeGreaterThan(0);
      expect(page.url()).not.toContain(
        credential.parsed.participantToken as string,
      );
      await assertNoCredentialInObservableState(page, liveSessionId);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(`${uiOrigin}/live/${liveSessionId}`);
      expect(joinRequests).toHaveLength(1);
      await expect
        .poll(() => socketUrls.some((url) => url.includes("/socket.io/")))
        .toBe(true);
      expect(
        socketUrls.every(
          (url) => !url.includes(credential.parsed.participantToken as string),
        ),
      ).toBe(true);

      const freshContext = await browser.newContext({ baseURL: uiOrigin });
      const freshPage = await freshContext.newPage();
      try {
        await freshPage.goto(`/live/${liveSessionId}`, {
          waitUntil: "domcontentloaded",
        });
        await expect(
          freshPage.getByRole("heading", { name: "匿名參與已失效" }),
        ).toBeVisible();
        expect(freshPage.url()).not.toContain(
          credential.parsed.participantToken as string,
        );
      } finally {
        await freshContext.close();
      }
    } finally {
      await context.close();
    }
  });
});
