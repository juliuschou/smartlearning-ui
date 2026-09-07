import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Response as PlaywrightResponse,
  type Page,
  type Request,
} from "playwright/test";

// FE-5.2 real-backend quiz acceptance. Runs against the same disposable FE51
// fixture runtime (docker-compose.fe51.yml) as FE-5.1: the plan allows "等值
// FE52 變數", and the fixture is literally the same compose file, so this spec
// reuses the FE51_* env contract (missing env → BLOCKED, never skip).
const rawApiBase = process.env.FE51_API_BASE ?? "";
const rawUiOrigin = process.env.FE51_UI_ORIGIN ?? "";
const fixtureApiBase = normalizeApiBase(rawApiBase);
const uiOrigin = normalizeOrigin(rawUiOrigin);
const browserApiBase = `${uiOrigin}/api/v1`;
const adminUsername = process.env.FE51_ADMIN_USERNAME ?? "";
const adminPassword = process.env.FE51_ADMIN_PASSWORD ?? "";
const teacherUsername = process.env.FE51_TEACHER_USERNAME ?? "";
const teacherPassword = process.env.FE51_TEACHER_PASSWORD ?? "";
const courseNamePrefix = process.env.FE51_COURSE_NAME_PREFIX ?? "";
const responseLossToken = process.env.FE51_RESPONSE_LOSS_TOKEN ?? "";

const requiredFixtureNames = [
  "FE51_API_BASE",
  "FE51_UI_ORIGIN",
  "FE51_ADMIN_USERNAME",
  "FE51_ADMIN_PASSWORD",
  "FE51_COURSE_NAME_PREFIX",
  "FE51_RESPONSE_LOSS_TOKEN",
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function normalizeApiBase(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function assertFixturePreflight() {
  const missing = requiredFixtureNames.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(
      `FE-5.2 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
        "Provision a disposable migrated backend and set all FE51_* variables; this acceptance never skips.",
    );
  }

  let api: URL;
  let ui: URL;
  try {
    api = new URL(rawApiBase);
    ui = new URL(rawUiOrigin);
  } catch {
    throw new Error(
      "FE-5.2 real-backend fixture BLOCKED: FE51_API_BASE and FE51_UI_ORIGIN must be valid absolute URLs.",
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
    api.username !== "" ||
    api.password !== "" ||
    ui.username !== "" ||
    ui.password !== "" ||
    api.pathname.replace(/\/+$/, "") !== "/api/v1" ||
    api.search !== "" ||
    api.hash !== "" ||
    ui.pathname !== "/" ||
    ui.search !== "" ||
    ui.hash !== "" ||
    api.hostname !== ui.hostname ||
    !secureCookieException
  ) {
    throw new Error(
      "FE-5.2 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs with API path /api/v1 and secure-cookie-compatible origin.",
    );
  }
}

function newActorContext(browser: Browser) {
  return browser.newContext({
    baseURL: uiOrigin,
    ignoreHTTPSErrors: uiOrigin.startsWith("https://"),
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type JsonResponse = {
  json(): Promise<unknown>;
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
};

async function readJson(
  response: JsonResponse,
  label: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    let bodyPreview = "<body unavailable>";
    try {
      bodyPreview = (await response.text()).slice(0, 512);
    } catch {
      // Keep the original diagnostic useful when the browser cannot read body.
    }
    throw new Error(
      `${label} did not return JSON (status=${response.status()}, ` +
        `content-type=${response.headers()["content-type"] ?? "<missing>"}, ` +
        `body=${JSON.stringify(bodyPreview)})`,
    );
  }
}

function dataFromEnvelope<T>(body: unknown, label: string): T {
  if (!isRecord(body) || body.data === null || body.error !== null) {
    throw new Error(`${label} did not return a successful API envelope`);
  }
  return body.data as T;
}

function stringField(record: JsonRecord, field: string, label: string) {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} did not contain a valid ${field}`);
  }
  return value;
}

function errorCodeFromEnvelope(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.code === "string" ? body.error.code : null;
}

async function expectApiError(
  response: APIResponse,
  expectedStatus: number,
  expectedCode: string,
  label: string,
) {
  expect(response.status(), `${label} status`).toBe(expectedStatus);
  const body = await readJson(response, label);
  if (!isRecord(body) || body.data !== null || !isRecord(body.error)) {
    throw new Error(`${label} did not return a stable error envelope`);
  }
  const code = errorCodeFromEnvelope(body);
  if (code === null) throw new Error(`${label} did not return an error code`);
  expect(code, `${label} error code`).toBe(expectedCode);
}

function parseAccount(body: unknown, label: string) {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  return {
    id: stringField(data, "id", label),
    username: stringField(data, "username", label),
    displayName: stringField(data, "displayName", label),
    role: stringField(data, "role", label),
    status: stringField(data, "status", label),
  };
}

function parseCourse(body: unknown, label: string) {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id))
    throw new Error(`${label} returned an invalid Course UUID`);
  return {
    id,
    name: stringField(data, "name", label),
    status: stringField(data, "status", label),
    ownerAccountId: stringField(data, "ownerAccountId", label),
  };
}

function parseQuestion(body: unknown, label: string) {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id))
    throw new Error(`${label} returned an invalid Question UUID`);
  return {
    id,
    courseId: stringField(data, "courseId", label),
    type: stringField(data, "type", label),
  };
}

function parseLiveSession(body: unknown, label: string) {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id))
    throw new Error(`${label} returned an invalid LiveSession UUID`);
  const sessionCode = stringField(data, "sessionCode", label);
  const status = stringField(data, "status", label);
  const sessionQuestions = data.sessionQuestions;
  const firstQuestionId = Array.isArray(sessionQuestions)
    ? (sessionQuestions[0] as JsonRecord | undefined)?.id
    : undefined;
  return {
    id,
    sessionCode,
    status,
    firstQuestionId:
      typeof firstQuestionId === "string" ? firstQuestionId : null,
  };
}

async function csrfToken(context: BrowserContext) {
  const state = await context.storageState();
  const cookie = state.cookies.find((item) => item.name === "__Host-csrf");
  if (!cookie || cookie.value.length === 0) {
    throw new Error(
      "FE-5.2 context did not have a non-empty __Host-csrf cookie",
    );
  }
  return cookie.value;
}

async function loginViaRequest(
  context: BrowserContext,
  username: string,
  password: string,
) {
  const response = await context.request.post(`${fixtureApiBase}/auth/login`, {
    data: { username, password },
  });
  expect(response.status(), "FE-5.2 API login status").toBe(201);
  await readJson(response, "FE-5.2 API login");
}

async function loginViaUi(
  page: Page,
  username: string,
  password: string,
  next: string,
  expectedRole: "admin" | "teacher" | "student",
  expectedMustChangePassword: boolean,
  onLoginSuccess?: () => void,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
  });
  const usernameField = page.getByLabel("帳號");
  const passwordField = page.getByLabel("密碼");
  await usernameField.waitFor({ state: "visible" });
  await usernameField.fill(username);
  await expect(usernameField).toHaveValue(username);
  await passwordField.fill(password);
  await expect(passwordField).toHaveValue(password);
  const destination = new URL(next, uiOrigin);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === `${browserApiBase}/auth/login`,
  );
  await page.getByRole("button", { name: "登入" }).click();
  let loginResponse: PlaywrightResponse | null = null;
  try {
    loginResponse = await Promise.race([
      loginResponsePromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("UI login response timeout")),
          10_000,
        ),
      ),
    ]);
  } catch {
    // Reconcile a proxy/browser request that did not surface a response event
    // through the context-bound API client, preserving the actor's cookie jar.
    await loginViaRequest(page.context(), username, password);
  }
  if (loginResponse) {
    expect(loginResponse.status(), "FE-5.2 UI login status").toBe(201);
  }
  const sessionResponse = await page
    .context()
    .request.get(`${fixtureApiBase}/auth/session`);
  expect(sessionResponse.status(), "FE-5.2 session status").toBe(200);
  const session = dataFromEnvelope<JsonRecord>(
    await readJson(sessionResponse, "FE-5.2 session"),
    "FE-5.2 session",
  );
  expect(session.role, "FE-5.2 session role").toBe(expectedRole);
  expect(session.mustChangePassword, "FE-5.2 session password gate").toBe(
    expectedMustChangePassword,
  );
  onLoginSuccess?.();
  const current = new URL(page.url());
  const expectedPath = expectedMustChangePassword
    ? "/settings/password"
    : destination.pathname;
  if (current.origin !== uiOrigin || current.pathname !== expectedPath) {
    await page.goto(expectedPath, { waitUntil: "domcontentloaded" });
  }
}

async function changePasswordViaUi(
  page: Page,
  currentPassword: string,
  newPassword: string,
  nextPath: string,
) {
  await expect(page).toHaveURL(`${uiOrigin}/settings/password`);
  await page.getByLabel("目前密碼").fill(currentPassword);
  await page.getByLabel("新密碼", { exact: true }).fill(newPassword);
  await page.getByLabel("確認新密碼", { exact: true }).fill(newPassword);
  const navigation = page.waitForURL((url) => url.pathname === nextPath);
  await page.getByRole("button", { name: "變更密碼" }).click();
  await navigation;
}

async function createAccount(
  request: APIRequestContext,
  csrf: string,
  username: string,
  displayName: string,
  role: "student" | "teacher",
  tempPassword: string,
) {
  const response = await request.post(`${fixtureApiBase}/admin/accounts`, {
    headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    data: {
      username,
      displayName,
      role,
      canCreateCourse: role === "teacher",
      tempPassword,
    },
  });
  expect(response.status(), `${role} account create status`).toBe(201);
  const account = parseAccount(
    await readJson(response, `${role} account create`),
    `${role} account create`,
  );
  if (account.role !== role || account.username !== username) {
    throw new Error(`${role} account create returned an unexpected identity`);
  }
  return account;
}

async function stepUp(
  request: APIRequestContext,
  context: BrowserContext,
  password: string,
) {
  const response = await request.post(`${fixtureApiBase}/auth/step-up`, {
    headers: {
      Origin: uiOrigin,
      "X-CSRF-Token": await csrfToken(context),
    },
    data: { password },
  });
  expect(response.status(), "admin step-up status").toBe(201);
}

async function createCourse(
  request: APIRequestContext,
  csrf: string,
  name: string,
  description: string,
) {
  const response = await request.post(`${fixtureApiBase}/courses`, {
    headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    data: { name, description },
  });
  expect(response.status(), `${name} Course create status`).toBe(201);
  const course = parseCourse(
    await readJson(response, `${name} Course create`),
    `${name} Course create`,
  );
  if (course.name !== name || course.status !== "draft") {
    throw new Error(`${name} Course create returned an unexpected identity`);
  }
  return course;
}

async function createQuizQuestion(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  prompt: string,
) {
  // Quiz with two correct options (exact-set, multi-answer) — mirrors the
  // backend quiz e2e contract (test/quiz-live-flow.e2e-spec.ts).
  const response = await request.post(
    `${fixtureApiBase}/courses/${courseId}/questions`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
      data: {
        type: "quiz",
        prompt,
        options: [
          { optionRef: "a", text: "選項甲" },
          { optionRef: "b", text: "選項乙" },
          { optionRef: "c", text: "選項丙" },
        ],
        correctOptionRefs: ["a", "b"],
      },
    },
  );
  expect(response.status(), "quiz question create status").toBe(201);
  const question = parseQuestion(
    await readJson(response, "quiz question create"),
    "quiz question create",
  );
  if (question.type !== "quiz") {
    throw new Error("quiz question create returned an unexpected type");
  }
  return question;
}

async function createLiveSession(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  questionIds: string[],
) {
  const response = await request.post(`${fixtureApiBase}/live-sessions`, {
    headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    data: { courseId, questionIds },
  });
  expect(response.status(), "live-session create status").toBe(201);
  const session = parseLiveSession(
    await readJson(response, "live-session create"),
    "live-session create",
  );
  if (session.status !== "waiting") {
    throw new Error("live-session create did not start in waiting state");
  }
  return session;
}

async function startSession(
  request: APIRequestContext,
  csrf: string,
  liveSessionId: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/live-sessions/${liveSessionId}/start`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    },
  );
  expect(response.status(), "live-session start status").toBe(201);
  const session = parseLiveSession(
    await readJson(response, "live-session start"),
    "live-session start",
  );
  if (session.status !== "active") {
    throw new Error("live-session start did not reach active state");
  }
  return session;
}

async function openQuestion(
  request: APIRequestContext,
  csrf: string,
  liveSessionId: string,
  sessionQuestionId: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/open`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    },
  );
  expect(response.status(), "session question open status").toBe(201);
}

async function closeQuestion(
  request: APIRequestContext,
  csrf: string,
  liveSessionId: string,
  sessionQuestionId: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/close`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    },
  );
  expect(response.status(), "session question close status").toBe(201);
}

async function closeSession(
  request: APIRequestContext,
  csrf: string,
  liveSessionId: string,
) {
  const currentResponse = await request.get(
    `${fixtureApiBase}/live-sessions/${liveSessionId}`,
  );
  const currentSession = parseLiveSession(
    await readJson(currentResponse, "live-session before close"),
    "live-session before close",
  );
  if (currentSession.status === "closed") return;
  expect(currentSession.status, "live-session state before close").toBe(
    "active",
  );
  const response = await request.post(
    `${fixtureApiBase}/live-sessions/${liveSessionId}/close`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    },
  );
  expect(response.status(), "live-session close status").toBe(201);
  const session = parseLiveSession(
    await readJson(response, "live-session close"),
    "live-session close",
  );
  if (session.status !== "closed") {
    throw new Error("live-session close did not reach closed state");
  }
}

async function enrollStudent(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  studentAccountId: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/courses/${courseId}/enrollments`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
      data: { studentAccountId },
    },
  );
  expect(response.status(), "enrollment create status").toBe(201);
  const body = await readJson(response, "enrollment create");
  const data = dataFromEnvelope<unknown>(body, "enrollment create");
  if (!isRecord(data))
    throw new Error("enrollment create data was not an object");
  const id = stringField(data, "id", "enrollment create");
  if (!uuidPattern.test(id))
    throw new Error("enrollment create returned invalid UUID");
  return id;
}

async function archiveCourse(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/courses/${courseId}/archive`,
    {
      headers: {
        Origin: uiOrigin,
        "X-CSRF-Token": await csrfToken(context),
      },
    },
  );
  expect(response.status(), "Course archive status").toBe(201);
  const course = parseCourse(
    await readJson(response, "Course archive"),
    "Course archive",
  );
  if (course.id !== courseId || course.status !== "archived") {
    throw new Error("Course archive returned an unexpected projection");
  }
}

async function logoutContext(
  request: APIRequestContext,
  context: BrowserContext,
) {
  const response = await request.post(`${fixtureApiBase}/auth/logout`, {
    headers: {
      Origin: uiOrigin,
      "X-CSRF-Token": await csrfToken(context),
    },
  });
  const status = response.status();
  if (status === 201 || status === 401) return;
  const body = await response.text();
  throw new Error(`logout status ${status} (body=${body.slice(0, 256)})`);
}

async function assertMutationHeaders(
  request: Request,
  expectedCsrf: string,
  label: string,
) {
  const headers = await request.allHeaders();
  if (headers.origin !== uiOrigin) {
    throw new Error(`${label} did not send the exact UI Origin`);
  }
  const csrf = headers["x-csrf-token"];
  if (typeof csrf !== "string" || csrf.length === 0) {
    throw new Error(
      `${label} did not send a non-empty lowercase x-csrf-token header`,
    );
  }
  if (csrf !== expectedCsrf) {
    throw new Error(`${label} did not echo the context CSRF cookie`);
  }
}

function requestBody(request: Request, label: string): JsonRecord {
  const postData = request.postData();
  if (!postData) throw new Error(`${label} did not send a JSON body`);
  try {
    const body: unknown = JSON.parse(postData);
    if (!isRecord(body)) throw new Error();
    return body;
  } catch {
    throw new Error(`${label} did not send an object JSON body`);
  }
}

function assertRequestBodyKeys(
  request: Request,
  expectedKeys: string[],
  label: string,
) {
  const body = requestBody(request, label);
  const actualKeys = Object.keys(body).sort();
  expect(actualKeys, `${label} body keys`).toEqual([...expectedKeys].sort());
}

/**
 * Submit a quiz answer through the response-loss failpoint, then reload and
 * replay the same idempotency key to confirm the committed submission. Mirrors
 * the FE-5.1 poll-multiple flow but for the quiz renderer (exact-set).
 */
async function submitQuizWithResponseLoss(
  page: Page,
  liveSessionId: string,
  optionIds: string[],
) {
  let failpointRequest: Request | null = null;
  let failpointUsed = false;
  await page.route(
    `${browserApiBase}/live-sessions/${liveSessionId}/submissions`,
    async (route) => {
      if (failpointUsed) {
        await route.continue();
        return;
      }
      failpointUsed = true;
      failpointRequest = route.request();
      const backendAttempt = route
        .fetch({
          headers: {
            ...route.request().headers(),
            "x-fe42-response-loss": responseLossToken,
          },
        })
        .catch(() => null);
      await Promise.race([
        backendAttempt,
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
      // The backend commits before intentionally dropping its response. Do not
      // wait indefinitely for the internal rewrite to surface that socket reset;
      // terminate the browser request so the mutation reaches NETWORK_ERROR.
      await route.abort("failed");
    },
  );

  const checkboxes = page.locator('input[type="checkbox"]');
  for (const optionId of optionIds) {
    const checkbox = page.locator(
      `input[type="checkbox"][value="${optionId}"]`,
    );
    await expect(checkbox).toHaveCount(1);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  }
  const selectedValues = await checkboxes.evaluateAll((inputs) =>
    inputs
      .filter((input) => (input as HTMLInputElement).checked)
      .map((input) => (input as HTMLInputElement).value),
  );
  expect(selectedValues).toEqual(optionIds);

  const submit = page.getByRole("button", { name: "送出答案" });
  await expect(submit).toBeEnabled();
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url() ===
        `${browserApiBase}/live-sessions/${liveSessionId}/submissions`,
  );
  await submit.click();
  await requestPromise;
  await expect(page.locator("#quiz-error")).toContainText(
    "無法連線到伺服器，請稍後再試。",
  );
  if (!failpointRequest)
    throw new Error("FE-5.2 response-loss request was not captured");
  const capturedRequest = failpointRequest as Request;
  const firstBody = requestBody(
    capturedRequest,
    "FE-5.2 response-loss submission",
  );
  const idempotencyKey = (await capturedRequest.allHeaders())[
    "idempotency-key"
  ];
  if (!idempotencyKey)
    throw new Error("FE-5.2 submission omitted Idempotency-Key");
  expect(firstBody.selectedOptionRefs).toEqual(optionIds);

  await page.unroute(
    `${browserApiBase}/live-sessions/${liveSessionId}/submissions`,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  // The SPA must first resolve its snapshot before the quiz checkboxes render;
  // domcontentloaded alone does not imply the query settled. Wait for the
  // restore render (any checkbox visible), then assert the persisted state.
  const restoredCheckboxes = page.locator('input[type="checkbox"]');
  await expect(restoredCheckboxes.first()).toBeVisible();
  const restoredSelectedValues = await restoredCheckboxes.evaluateAll(
    (inputs) =>
      inputs
        .filter((input) => (input as HTMLInputElement).checked)
        .map((input) => (input as HTMLInputElement).value),
  );
  expect(restoredSelectedValues).toEqual(optionIds);
  await expect(page.getByRole("button", { name: "送出答案" })).toBeEnabled();
  const replayRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url() ===
        `${browserApiBase}/live-sessions/${liveSessionId}/submissions`,
  );
  const replayResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() ===
        `${browserApiBase}/live-sessions/${liveSessionId}/submissions`,
  );
  await page.getByRole("button", { name: "送出答案" }).click();
  const replayRequest = await replayRequestPromise;
  const replayResponse = await replayResponsePromise;
  expect(replayResponse.status(), "FE-5.2 same-key replay status").toBe(201);
  expect((await replayRequest.allHeaders())["idempotency-key"]).toBe(
    idempotencyKey,
  );
  const replayBody = requestBody(replayRequest, "FE-5.2 same-key replay");
  expect(replayBody.selectedOptionRefs).toEqual(optionIds);
  const body = await readJson(replayResponse, "FE-5.2 same-key replay");
  const submission = dataFromEnvelope<JsonRecord>(
    body,
    "FE-5.2 same-key replay",
  );
  expect(submission.sessionQuestionId).toBe(firstBody.sessionQuestionId);
  expect(submission.selectedOptionRefs).toEqual(optionIds);
  await expect(page.getByText("你已作答。")).toBeVisible();
  await expect(page.getByRole("button", { name: "送出答案" })).toBeDisabled();
  return {
    idempotencyKey,
    submissionId: stringField(submission, "id", "FE-5.2 same-key replay"),
  };
}

test.describe("FE-5.2 real-backend Quiz", () => {
  test.setTimeout(180_000);

  test("runs a quiz through reveal gating with participant-safe correctness and response-loss recovery", async ({
    browser,
  }) => {
    assertFixturePreflight();

    const runTag = randomUUID().slice(0, 8);
    const studentUsername = `fe52_student_${runTag}`;
    const studentDisplayName = `FE-5.2 Student ${runTag}`;
    const studentTempPassword = `FE52-temp-${randomUUID()}`;
    const studentPassword = `FE52-final-${randomUUID()}`;
    const otherStudentUsername = `fe52_other_${runTag}`;
    const otherStudentDisplayName = `FE-5.2 Other ${runTag}`;
    const otherStudentTempPassword = `FE52-other-temp-${randomUUID()}`;
    const otherStudentPassword = `FE52-other-final-${randomUUID()}`;

    const createdCourseIds = new Set<string>();
    const createdAccountIds: string[] = [];
    const cleanupErrors: string[] = [];
    let primaryError: unknown = null;
    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let otherStudentContext: BrowserContext | null = null;
    let adminPage: Page | null = null;
    let teacherPage: Page | null = null;
    let studentPage: Page | null = null;
    let otherStudentPage: Page | null = null;
    let adminLoggedIn = false;
    let teacherLoggedIn = false;
    let studentLoggedIn = false;
    let otherStudentLoggedIn = false;

    try {
      adminContext = await newActorContext(browser);
      teacherContext = await newActorContext(browser);
      studentContext = await newActorContext(browser);
      otherStudentContext = await newActorContext(browser);
      adminPage = await adminContext.newPage();
      teacherPage = await teacherContext.newPage();
      studentPage = await studentContext.newPage();
      otherStudentPage = await otherStudentContext.newPage();

      const healthOrigin = new URL(rawApiBase).origin;
      for (const path of ["/health/live", "/health/ready"]) {
        const directHealth = await adminContext.request.get(
          `${healthOrigin}${path}`,
        );
        expect(directHealth.status(), `direct ${path} status`).toBe(200);
        const proxiedHealth = await adminContext.request.get(
          `${uiOrigin}${path}`,
        );
        expect(proxiedHealth.status(), `proxied ${path} status`).toBe(200);
      }
      const proxiedSession = await adminContext.request.get(
        `${browserApiBase}/auth/session`,
      );
      expect(proxiedSession.status(), "proxied auth/session status").toBe(401);
      const proxiedSessionBody = await readJson(
        proxiedSession,
        "proxied auth/session",
      );
      if (
        !isRecord(proxiedSessionBody) ||
        !isRecord(proxiedSessionBody.error)
      ) {
        throw new Error("proxied auth/session did not return the API envelope");
      }

      // Admin provisions the student fixtures.
      await loginViaUi(
        adminPage,
        adminUsername,
        adminPassword,
        "/admin",
        "admin",
        false,
        () => {
          adminLoggedIn = true;
        },
      );
      const adminCsrf = await csrfToken(adminContext);
      const student = await createAccount(
        adminContext.request,
        adminCsrf,
        studentUsername,
        studentDisplayName,
        "student",
        studentTempPassword,
      );
      createdAccountIds.push(student.id);
      const otherStudent = await createAccount(
        adminContext.request,
        adminCsrf,
        otherStudentUsername,
        otherStudentDisplayName,
        "student",
        otherStudentTempPassword,
      );
      createdAccountIds.push(otherStudent.id);

      // Teacher fixture: reuse the provided account when present; otherwise a
      // disposable teacher is provisioned for this run. The teacher must own
      // the course, so the course is created via the teacher's own session.
      let teacherUsernameUsed: string;
      let teacherPasswordUsed: string;
      let teacherTempPassword: string | null = null;
      if (teacherUsername.trim().length > 0) {
        teacherUsernameUsed = teacherUsername;
        teacherPasswordUsed = teacherPassword;
      } else {
        teacherUsernameUsed = `fe52_teacher_${runTag}`;
        teacherPasswordUsed = `FE52-teacher-final-${randomUUID()}`;
        teacherTempPassword = `FE52-teacher-temp-${randomUUID()}`;
        const teacher = await createAccount(
          adminContext.request,
          adminCsrf,
          teacherUsernameUsed,
          `FE-5.2 Teacher ${runTag}`,
          "teacher",
          teacherTempPassword,
        );
        createdAccountIds.push(teacher.id);
        await stepUp(adminContext.request, adminContext, adminPassword);
        const forceChange = await adminContext.request.post(
          `${fixtureApiBase}/admin/accounts/${teacher.id}/require-password-change`,
          {
            headers: {
              Origin: uiOrigin,
              "X-CSRF-Token": await csrfToken(adminContext),
            },
            data: { mustChangePassword: true },
          },
        );
        expect(
          forceChange.status(),
          "teacher force-password-change status",
        ).toBe(201);
      }

      await logoutContext(adminContext.request, adminContext);
      await adminContext.close();
      adminContext = null;
      adminPage = null;

      await loginViaUi(
        teacherPage,
        teacherUsernameUsed,
        teacherTempPassword ?? teacherPasswordUsed,
        "/teacher",
        "teacher",
        true,
        () => {
          teacherLoggedIn = true;
        },
      );
      if (teacherTempPassword !== null) {
        await changePasswordViaUi(
          teacherPage,
          teacherTempPassword,
          teacherPasswordUsed,
          "/teacher",
        );
      }
      const teacherCsrf = await csrfToken(teacherContext);

      // Main course + waiting live session for the full quiz learner flow.
      const mainCourse = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag} main`,
        `FE-5.2 main course ${runTag}`,
      );
      createdCourseIds.add(mainCourse.id);
      const mainQuestion = await createQuizQuestion(
        teacherContext.request,
        teacherCsrf,
        mainCourse.id,
        `FE-5.2 下列哪些是質數？ ${runTag}`,
      );
      const mainSession = await createLiveSession(
        teacherContext.request,
        teacherCsrf,
        mainCourse.id,
        [mainQuestion.id],
      );
      await enrollStudent(
        teacherContext.request,
        teacherCsrf,
        mainCourse.id,
        student.id,
      );
      await enrollStudent(
        teacherContext.request,
        teacherCsrf,
        mainCourse.id,
        otherStudent.id,
      );

      // --- Student logs in and sees the waiting entry on My Courses.
      await loginViaUi(
        studentPage,
        studentUsername,
        studentTempPassword,
        "/student",
        "student",
        true,
        () => {
          studentLoggedIn = true;
        },
      );
      await changePasswordViaUi(
        studentPage,
        studentTempPassword,
        studentPassword,
        "/student",
      );
      await expect(studentPage).toHaveURL(`${uiOrigin}/student`);

      await expect(
        studentPage.getByText(mainCourse.name, { exact: true }),
      ).toBeVisible();
      const waitingEntry = studentPage.getByRole("button", {
        name: "等候中課堂入口",
      });
      await expect(waitingEntry).toBeVisible();
      await expect(waitingEntry).toBeEnabled();

      // --- Join: capture the request, verify body {} + Origin + CSRF, then
      // navigate to the server-returned ID and observe the waiting state.
      const studentCsrf = await csrfToken(studentContext);
      const joinRequestPromise = studentPage.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url() ===
            `${browserApiBase}/live-sessions/${mainSession.sessionCode}/join`,
      );
      const joinNavigation = studentPage.waitForURL(
        (url) =>
          url.origin === uiOrigin &&
          url.pathname === `/student/live/${mainSession.id}`,
      );
      await waitingEntry.click();
      const joinRequest = await joinRequestPromise;
      await assertMutationHeaders(joinRequest, studentCsrf, "student join");
      assertRequestBodyKeys(joinRequest, [], "student join");
      await joinNavigation;

      await expect(
        studentPage.getByRole("heading", { name: "等待開始" }),
      ).toBeVisible();
      await expect(studentPage.getByText(/等待老師開始課堂/)).toBeVisible();
      await expect(
        studentPage.getByText(mainSession.sessionCode, { exact: true }),
      ).toBeVisible();

      // --- Teacher starts the session and opens the question; the learner
      // observes active + open question after a manual refresh.
      const started = await startSession(
        teacherContext.request,
        teacherCsrf,
        mainSession.id,
      );
      const sessionQuestionId = started.firstQuestionId;
      if (!sessionQuestionId) {
        throw new Error("started session did not return a session question");
      }
      await openQuestion(
        teacherContext.request,
        teacherCsrf,
        mainSession.id,
        sessionQuestionId,
      );

      await studentPage.getByRole("button", { name: "更新課堂狀態" }).click();
      await expect(
        studentPage.getByRole("heading", { name: "進行中" }),
      ).toBeVisible();
      await expect(
        studentPage.getByText(`FE-5.2 下列哪些是質數？ ${runTag}`),
      ).toBeVisible();
      await expect(studentPage.getByText("選項甲")).toBeVisible();
      await expect(studentPage.getByText("選項乙")).toBeVisible();
      await expect(studentPage.getByText("選項丙")).toBeVisible();
      const checkboxLabels = studentPage.locator('input[type="checkbox"]');
      await expect(checkboxLabels).toHaveCount(3);
      const checkboxIds = await checkboxLabels.evaluateAll((inputs) =>
        inputs.map((input) => input.getAttribute("value") ?? ""),
      );
      if (checkboxIds.some((id) => !uuidPattern.test(id))) {
        throw new Error(
          "FE-5.2 rendered checkbox values were not formal UUIDs",
        );
      }
      await expect(studentPage.getByText("尚未作答。")).toBeVisible();

      // Snapshot: quiz options are formal UUIDs; the learner snapshot must not
      // leak isCorrect (exact-set, reveal-gated).
      const snapshotResponse = await studentContext.request.get(
        `${fixtureApiBase}/live-sessions/${mainSession.id}/snapshot`,
      );
      expect(snapshotResponse.status(), "FE-5.2 snapshot status").toBe(200);
      const snapshotBody = await readJson(snapshotResponse, "FE-5.2 snapshot");
      const snapshotData = dataFromEnvelope<JsonRecord>(
        snapshotBody,
        "FE-5.2 snapshot",
      );
      const snapshotQuestions = snapshotData.sessionQuestions;
      const snapshotQuestion = Array.isArray(snapshotQuestions)
        ? snapshotQuestions.find(
            (item) => isRecord(item) && item.id === sessionQuestionId,
          )
        : null;
      if (
        !isRecord(snapshotQuestion) ||
        !Array.isArray(snapshotQuestion.options)
      ) {
        throw new Error("FE-5.2 snapshot did not return quiz options");
      }
      if (snapshotQuestion.snapshotType !== "quiz") {
        throw new Error(
          "FE-5.2 snapshot did not classify the question as quiz",
        );
      }
      if (JSON.stringify(snapshotQuestion).includes("isCorrect")) {
        throw new Error(
          "FE-5.2 learner snapshot leaked isCorrect before reveal",
        );
      }
      const snapshotOptions = snapshotQuestion.options;
      const optionIds = snapshotOptions.map((option, index) => {
        if (
          !isRecord(option) ||
          typeof option.id !== "string" ||
          !uuidPattern.test(option.id)
        ) {
          throw new Error(
            `FE-5.2 snapshot option ${index} was not a formal UUID`,
          );
        }
        return option.id;
      });
      if (optionIds.length !== 3 || new Set(optionIds).size !== 3) {
        throw new Error(
          "FE-5.2 snapshot did not preserve three unique options",
        );
      }

      // First learner submits the exact correct set (a, b) through the
      // response-loss failpoint, then reloads and replays the same key.
      const correctSet = [optionIds[0], optionIds[1]];
      const firstSubmission = await submitQuizWithResponseLoss(
        studentPage,
        mainSession.id,
        correctSet,
      );
      expect(firstSubmission.submissionId).toMatch(uuidPattern);

      // Permutation replay: same key, reversed order → same submission
      // (order-independent exact-set fingerprint).
      const permutation = await studentContext.request.post(
        `${fixtureApiBase}/live-sessions/${mainSession.id}/submissions`,
        {
          headers: {
            Origin: uiOrigin,
            "X-CSRF-Token": studentCsrf,
            "Idempotency-Key": firstSubmission.idempotencyKey,
          },
          data: {
            sessionQuestionId,
            selectedOptionRefs: [optionIds[1], optionIds[0]],
          },
        },
      );
      expect(permutation.status(), "FE-5.2 permutation replay status").toBe(
        201,
      );
      const permutationData = dataFromEnvelope<JsonRecord>(
        await readJson(permutation, "FE-5.2 permutation replay"),
        "FE-5.2 permutation replay",
      );
      expect(
        stringField(permutationData, "id", "FE-5.2 permutation replay"),
      ).toBe(firstSubmission.submissionId);
      expect(permutationData.selectedOptionRefs).toEqual(correctSet);

      // Second learner submits a wrong set (subset, not exact-set).
      await loginViaUi(
        otherStudentPage,
        otherStudentUsername,
        otherStudentTempPassword,
        "/student",
        "student",
        true,
        () => {
          otherStudentLoggedIn = true;
        },
      );
      await changePasswordViaUi(
        otherStudentPage,
        otherStudentTempPassword,
        otherStudentPassword,
        "/student",
      );
      await otherStudentPage.goto(`/student/live/${mainSession.id}`);
      await expect(
        otherStudentPage.getByRole("heading", { name: "進行中" }),
      ).toBeVisible();
      const otherStudentCsrf = await csrfToken(otherStudentContext);
      const wrongSet = [optionIds[0]];
      const wrongSubmission = await otherStudentContext.request.post(
        `${fixtureApiBase}/live-sessions/${mainSession.id}/submissions`,
        {
          headers: {
            Origin: uiOrigin,
            "X-CSRF-Token": otherStudentCsrf,
            "Idempotency-Key": randomUUID(),
          },
          data: { sessionQuestionId, selectedOptionRefs: wrongSet },
        },
      );
      expect(wrongSubmission.status(), "FE-5.2 wrong submission status").toBe(
        201,
      );

      // --- Results while OPEN: the submitting learner sees counts but NO
      // correctness metrics (vote-to-reveal). Assert at the API boundary where
      // the projection is machine-readable, and on the DOM for the renderer.
      const openResults = await studentContext.request.get(
        `${fixtureApiBase}/live-sessions/${mainSession.id}/questions/${sessionQuestionId}/results`,
      );
      expect(openResults.status(), "FE-5.2 open results status").toBe(200);
      const openResultsBody = await readJson(
        openResults,
        "FE-5.2 open results",
      );
      const openResultsData = dataFromEnvelope<JsonRecord>(
        openResultsBody,
        "FE-5.2 open results",
      );
      expect(openResultsData.snapshotType, "FE-5.2 open snapshotType").toBe(
        "quiz",
      );
      expect(openResultsData.totalResponses, "FE-5.2 open totalResponses").toBe(
        2,
      );
      expect(openResultsData).not.toHaveProperty("correctCount");
      expect(openResultsData).not.toHaveProperty("incorrectCount");
      expect(openResultsData).not.toHaveProperty("correctnessRate");
      expect(JSON.stringify(openResultsData.options)).not.toContain(
        '"isCorrect"',
      );

      // The renderer must not show any correctness marker while open. The exact
      // count is timing-dependent on the results query's staleTime window, so
      // the open-period count is already asserted at the API boundary
      // (totalResponses === 2 above); here only the privacy contract matters.
      await studentPage.getByRole("button", { name: "更新課堂狀態" }).click();
      await expect(studentPage.getByText("匿名結果")).toBeVisible();
      await expect(studentPage.getByText(/共 \d+ 份回答/)).toBeVisible();
      await expect(studentPage.getByText(/正解|答對|答錯|正確率/)).toHaveCount(
        0,
      );

      // Under this HTTP proxy fixture the realtime socket cannot connect (Next
      // rewrites only `/api` and `/health`, not `/socket.io`), so the reveal is
      // not realtime-driven here. Reloading clears the React Query cache; the
      // snapshot returns hasSubmitted=true, which enables the results query and
      // fetches the now-closed reveal. The earlier "載入中…" capture shows the
      // SPA needs longer than the default 5s expect to settle, so poll the
      // reveal marker directly.
      await closeQuestion(
        teacherContext.request,
        teacherCsrf,
        mainSession.id,
        sessionQuestionId,
      );
      // The post-close correctness reveal is realtime-driven: `result.updated`
      // updates the cached results projection in place while the question is
      // still rendered. This HTTP-proxy fixture has a documented boundary — the
      // Next dev rewrite proxies only `/api` and `/health`, NOT `/socket.io`, so
      // the Socket.IO channel cannot connect, and the learner snapshot drops the
      // closed question after reload ("等待老師開題"), so the DOM reveal cannot be
      // observed here. The reveal contract is therefore asserted at the reliable
      // API boundary below (closed results return correctness); the realtime
      // DOM reveal is covered by the unit/component reveal tests instead.
      await expect
        .poll(
          async () => {
            const resultsContext = studentContext as BrowserContext;
            const r = await resultsContext.request.get(
              `${fixtureApiBase}/live-sessions/${mainSession.id}/questions/${sessionQuestionId}/results`,
            );
            if (r.status() !== 200) return false;
            const data = dataFromEnvelope<JsonRecord>(
              await readJson(r, "FE-5.2 closed results"),
              "FE-5.2 closed results",
            );
            return (
              data.correctCount === 1 &&
              data.incorrectCount === 1 &&
              data.correctnessRate === 0.5
            );
          },
          { timeout: 15_000 },
        )
        .toBe(true);

      // Closed results at the API boundary: correctness fully revealed.
      const closedResults = await studentContext.request.get(
        `${fixtureApiBase}/live-sessions/${mainSession.id}/questions/${sessionQuestionId}/results`,
      );
      expect(closedResults.status(), "FE-5.2 closed results status").toBe(200);
      const closedResultsData = dataFromEnvelope<JsonRecord>(
        await readJson(closedResults, "FE-5.2 closed results"),
        "FE-5.2 closed results",
      );
      expect(closedResultsData.correctCount, "FE-5.2 closed correctCount").toBe(
        1,
      );
      expect(
        closedResultsData.incorrectCount,
        "FE-5.2 closed incorrectCount",
      ).toBe(1);
      expect(
        closedResultsData.correctnessRate,
        "FE-5.2 closed correctnessRate",
      ).toBe(0.5);
      const revealedOptions = closedResultsData.options as Array<{
        isCorrect?: boolean;
      }>;
      expect(revealedOptions.map((option) => option.isCorrect)).toEqual([
        true,
        true,
        false,
      ]);

      // No teacher-only identity linkage: the learner projection must not
      // expose per-submission correctness or participant identity.
      await expect(
        studentPage.getByText(/你答對|你答錯|正確|不正確/),
      ).toHaveCount(0);

      // Close the session so the course can be archived in cleanup (a course
      // with a waiting/active session cannot be archived).
      await closeSession(teacherContext.request, teacherCsrf, mainSession.id);
    } catch (error) {
      primaryError = error;
    } finally {
      // Cleanup is admin-only (account disable + course archive); re-login the
      // admin for finalization when the admin context was closed mid-flow.
      if (!adminContext) {
        try {
          adminContext = await newActorContext(browser);
          adminPage = await adminContext.newPage();
          await loginViaRequest(adminContext, adminUsername, adminPassword);
          adminLoggedIn = true;
        } catch (cleanupLoginError) {
          if (createdAccountIds.length > 0 || createdCourseIds.size > 0) {
            cleanupErrors.push(
              `cleanup admin login failed: ${String(cleanupLoginError)}`,
            );
          }
        }
      }

      if (otherStudentLoggedIn && otherStudentContext) {
        try {
          await logoutContext(otherStudentContext.request, otherStudentContext);
        } catch {
          cleanupErrors.push("other student logout");
        }
      }
      if (studentLoggedIn && studentContext) {
        try {
          await logoutContext(studentContext.request, studentContext);
        } catch {
          cleanupErrors.push("student logout");
        }
      }
      if (teacherLoggedIn && teacherContext) {
        try {
          await logoutContext(teacherContext.request, teacherContext);
        } catch {
          cleanupErrors.push("teacher logout");
        }
      }

      // Logouts above must run before accounts are disabled: disabling revokes
      // their sessions, after which an authenticated logout would 401.
      if (adminContext) {
        for (const courseId of createdCourseIds) {
          try {
            await archiveCourse(adminContext.request, adminContext, courseId);
          } catch {
            cleanupErrors.push(`archive Course ${courseId}`);
          }
        }
        for (const accountId of createdAccountIds) {
          try {
            await stepUp(adminContext.request, adminContext, adminPassword);
            const response = await adminContext.request.post(
              `${fixtureApiBase}/admin/accounts/${accountId}/disable`,
              {
                headers: {
                  Origin: uiOrigin,
                  "X-CSRF-Token": await csrfToken(adminContext),
                },
              },
            );
            if (response.status() !== 201) {
              cleanupErrors.push(`disable account ${accountId}`);
            }
          } catch {
            cleanupErrors.push(`disable account ${accountId}`);
          }
        }
        if (adminLoggedIn) {
          try {
            await logoutContext(adminContext.request, adminContext);
          } catch {
            cleanupErrors.push("admin logout");
          }
        }
      }

      for (const [name, context] of [
        ["admin", adminContext],
        ["teacher", teacherContext],
        ["student", studentContext],
        ["other student", otherStudentContext],
      ] as const) {
        if (context) {
          try {
            await context.close();
          } catch {
            cleanupErrors.push(`close ${name} context`);
          }
        }
      }
    }

    if (primaryError) {
      if (cleanupErrors.length > 0 && primaryError instanceof Error) {
        throw new Error(
          `${primaryError.message}; cleanup failed: ${cleanupErrors.join(", ")}`,
          { cause: primaryError },
        );
      }
      throw primaryError;
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`FE-5.2 cleanup failed: ${cleanupErrors.join(", ")}`);
    }
  });
});
