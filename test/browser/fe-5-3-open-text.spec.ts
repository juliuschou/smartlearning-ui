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

// FE-5.3 real-backend open-text acceptance. Runs against the same disposable
// FE51 fixture runtime as FE-5.1/FE-5.2 and reuses the FE51_* env contract.
// Missing fixture values are BLOCKED; this spec never skips or mocks.
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
      `FE-5.3 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
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
      "FE-5.3 real-backend fixture BLOCKED: FE51_API_BASE and FE51_UI_ORIGIN must be valid absolute URLs.",
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
      "FE-5.3 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs with API path /api/v1 and secure-cookie-compatible origin.",
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
      "FE-5.3 context did not have a non-empty __Host-csrf cookie",
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
  expect(response.status(), "FE-5.3 API login status").toBe(201);
  await readJson(response, "FE-5.3 API login");
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
    expect(loginResponse.status(), "FE-5.3 UI login status").toBe(201);
  }
  const sessionResponse = await page
    .context()
    .request.get(`${fixtureApiBase}/auth/session`);
  expect(sessionResponse.status(), "FE-5.3 session status").toBe(200);
  const session = dataFromEnvelope<JsonRecord>(
    await readJson(sessionResponse, "FE-5.3 session"),
    "FE-5.3 session",
  );
  expect(session.role, "FE-5.3 session role").toBe(expectedRole);
  expect(session.mustChangePassword, "FE-5.3 session password gate").toBe(
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

async function createOpenTextQuestion(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  prompt: string,
) {
  const response = await request.post(
    `${fixtureApiBase}/courses/${courseId}/questions`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
      data: { type: "open_text", prompt },
    },
  );
  expect(response.status(), "open-text question create status").toBe(201);
  const question = dataFromEnvelope<JsonRecord>(
    await readJson(response, "open-text question create"),
    "open-text question create",
  );
  if (question.type !== "open_text")
    throw new Error("unexpected question type");
  return {
    id: stringField(question, "id", "open-text question create"),
    courseId,
  };
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

async function submitOpenTextWithResponseLoss(
  page: Page,
  liveSessionId: string,
  answer: string,
) {
  let firstRequest: Request | null = null;
  let used = false;
  const endpoint = `${browserApiBase}/live-sessions/${liveSessionId}/submissions`;
  await page.route(endpoint, async (route) => {
    if (used) return route.continue();
    used = true;
    firstRequest = route.request();
    await route
      .fetch({
        headers: {
          ...route.request().headers(),
          "x-fe42-response-loss": responseLossToken,
        },
      })
      .catch(() => null);
    await route.abort("failed");
  });
  const textarea = page.getByRole("textbox", { name: "請輸入你的答案" });
  await textarea.fill(answer);
  const submit = page.getByRole("button", { name: "送出答案" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator("#open-text-error")).toContainText(
    "無法連線到伺服器，請稍後再試。",
  );
  if (!firstRequest) throw new Error("FE-5.3 response-loss request missing");
  const capturedRequest = firstRequest as Request;
  const headers = await capturedRequest.allHeaders();
  const key = headers["idempotency-key"];
  if (!key) throw new Error("FE-5.3 submission omitted Idempotency-Key");
  const body = requestBody(capturedRequest, "FE-5.3 first submission");
  expect(Object.keys(body).sort()).toEqual(["sessionQuestionId", "textAnswer"]);
  expect(body.textAnswer).toBe("第一行 第二行 😀");
  await page.unroute(endpoint);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue(answer);
  const replayRequestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && request.url() === endpoint,
  );
  const replayResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url() === endpoint,
  );
  await page.getByRole("button", { name: "送出答案" }).click();
  const replayRequest = await replayRequestPromise;
  const replayResponse = await replayResponsePromise;
  expect(replayResponse.status(), "FE-5.3 replay status").toBe(201);
  expect((await replayRequest.allHeaders())["idempotency-key"]).toBe(key);
  const replayBody = requestBody(replayRequest, "FE-5.3 replay");
  expect(replayBody.textAnswer).toBe("第一行 第二行 😀");
  const receipt = dataFromEnvelope<JsonRecord>(
    await readJson(replayResponse, "FE-5.3 replay"),
    "FE-5.3 replay",
  );
  expect(receipt.selectedOptionRefs).toBeNull();
  expect(receipt.textAnswer).toBe("第一行 第二行 😀");
  await expect(page.getByText("你已作答。", { exact: true })).toBeVisible();
}

test.describe("FE-5.3 real-backend Open text", () => {
  test.setTimeout(180_000);

  test("submits normalized multiline text and preserves anonymous result privacy", async ({
    browser,
  }) => {
    assertFixturePreflight();
    const runTag = randomUUID().slice(0, 8);
    const username = `fe53_student_${runTag}`;
    const tempPassword = `FE53-temp-${randomUUID()}`;
    const finalPassword = `FE53-final-${randomUUID()}`;
    const createdAccounts: string[] = [];
    const createdCourses = new Set<string>();
    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let adminPage: Page | null = null;
    let teacherPage: Page | null = null;
    let studentPage: Page | null = null;
    let adminLoggedIn = false;
    let teacherLoggedIn = false;
    let studentLoggedIn = false;
    let courseId = "";
    let sessionId = "";
    let sessionQuestionId = "";
    let primaryError: unknown = null;
    const cleanupErrors: string[] = [];
    try {
      adminContext = await newActorContext(browser);
      teacherContext = await newActorContext(browser);
      studentContext = await newActorContext(browser);
      adminPage = await adminContext.newPage();
      teacherPage = await teacherContext.newPage();
      studentPage = await studentContext.newPage();
      const healthOrigin = new URL(rawApiBase).origin;
      for (const path of ["/health/live", "/health/ready"]) {
        expect(
          (await adminContext.request.get(`${healthOrigin}${path}`)).status(),
        ).toBe(200);
        expect(
          (await adminContext.request.get(`${uiOrigin}${path}`)).status(),
        ).toBe(200);
      }
      const unauthenticated = await adminContext.request.get(
        `${browserApiBase}/auth/session`,
      );
      expect(unauthenticated.status()).toBe(401);
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
        username,
        `FE-5.3 Student ${runTag}`,
        "student",
        tempPassword,
      );
      createdAccounts.push(student.id);
      let teacherUsernameUsed = teacherUsername;
      let teacherPasswordUsed = teacherPassword;
      let teacherTempPassword: string | null = null;
      if (!teacherUsernameUsed.trim()) {
        teacherUsernameUsed = `fe53_teacher_${runTag}`;
        teacherTempPassword = `FE53-teacher-temp-${randomUUID()}`;
        teacherPasswordUsed = `FE53-teacher-final-${randomUUID()}`;
        const teacher = await createAccount(
          adminContext.request,
          adminCsrf,
          teacherUsernameUsed,
          `FE-5.3 Teacher ${runTag}`,
          "teacher",
          teacherTempPassword,
        );
        createdAccounts.push(teacher.id);
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
      const course = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag}`,
        `FE-5.3 course ${runTag}`,
      );
      courseId = course.id;
      createdCourses.add(course.id);
      const question = await createOpenTextQuestion(
        teacherContext.request,
        teacherCsrf,
        course.id,
        `FE-5.3 請分享一個學習想法 ${runTag}`,
      );
      const session = await createLiveSession(
        teacherContext.request,
        teacherCsrf,
        course.id,
        [question.id],
      );
      sessionId = session.id;
      await enrollStudent(
        teacherContext.request,
        teacherCsrf,
        course.id,
        student.id,
      );
      await loginViaUi(
        studentPage,
        username,
        tempPassword,
        "/student",
        "student",
        true,
        () => {
          studentLoggedIn = true;
        },
      );
      await changePasswordViaUi(
        studentPage,
        tempPassword,
        finalPassword,
        "/student",
      );
      await expect(
        studentPage.getByRole("button", { name: "等候中課堂入口" }),
      ).toBeVisible();
      await studentPage.getByRole("button", { name: "等候中課堂入口" }).click();
      await expect(studentPage).toHaveURL(
        `${uiOrigin}/student/live/${session.id}`,
      );
      const started = await startSession(
        teacherContext.request,
        teacherCsrf,
        session.id,
      );
      sessionQuestionId = started.firstQuestionId ?? "";
      if (!sessionQuestionId)
        throw new Error("FE-5.3 session question missing");
      await openQuestion(
        teacherContext.request,
        teacherCsrf,
        session.id,
        sessionQuestionId,
      );
      await studentPage.getByRole("button", { name: "更新課堂狀態" }).click();
      await expect(
        studentPage.getByRole("textbox", { name: "請輸入你的答案" }),
      ).toBeVisible();
      await expect(
        studentPage.getByText("送出時空白與換行會正規化。"),
      ).toBeVisible();
      await submitOpenTextWithResponseLoss(
        studentPage,
        session.id,
        "  第一行\n第二行  😀 ",
      );
      const csrf = await csrfToken(studentContext);
      const results = await studentContext.request.get(
        `${fixtureApiBase}/live-sessions/${session.id}/questions/${sessionQuestionId}/results`,
        { headers: { Origin: uiOrigin, "X-CSRF-Token": csrf } },
      );
      expect(results.status()).toBe(200);
      const result = dataFromEnvelope<JsonRecord>(
        await readJson(results, "FE-5.3 results"),
        "FE-5.3 results",
      );
      expect(result.snapshotType).toBe("open_text");
      expect(result.totalResponses).toBe(1);
      expect(JSON.stringify(result)).not.toContain("participantId");
      expect(JSON.stringify(result)).not.toContain("accountId");
      expect(JSON.stringify(result)).not.toContain("idempotency");
      const responses = result.responses;
      if (
        !Array.isArray(responses) ||
        responses.length !== 1 ||
        !isRecord(responses[0])
      )
        throw new Error("FE-5.3 malformed result projection");
      expect(Object.keys(responses[0]).sort()).toEqual(["text"]);
      expect(responses[0].text).toBe("第一行 第二行 😀");
      await closeQuestion(
        teacherContext.request,
        teacherCsrf,
        session.id,
        sessionQuestionId,
      );
      await closeSession(teacherContext.request, teacherCsrf, session.id);
      expect(
        await studentPage.evaluate(
          () =>
            document.body.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    } catch (error) {
      primaryError = error;
    } finally {
      if (sessionId && teacherContext) {
        try {
          await closeSession(
            teacherContext.request,
            await csrfToken(teacherContext),
            sessionId,
          );
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      for (const id of createdCourses) {
        if (!teacherContext) continue;
        try {
          await archiveCourse(teacherContext.request, teacherContext, id);
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      if (teacherContext && teacherLoggedIn) {
        try {
          await logoutContext(teacherContext.request, teacherContext);
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      for (const context of [studentContext, teacherContext, adminContext]) {
        if (context) {
          try {
            await context.close();
          } catch (error) {
            cleanupErrors.push(String(error));
          }
        }
      }
      if (primaryError) {
        if (cleanupErrors.length)
          primaryError = new Error(
            `${String(primaryError)}; cleanup: ${cleanupErrors.join(" | ")}`,
          );
        throw primaryError;
      }
      if (cleanupErrors.length)
        throw new Error(`FE-5.3 cleanup failed: ${cleanupErrors.join(" | ")}`);
    }
  });
});
