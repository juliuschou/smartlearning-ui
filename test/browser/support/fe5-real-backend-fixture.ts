import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
} from "playwright/test";

export type JsonRecord = Record<string, unknown>;
export type QuestionKind =
  "poll-single" | "poll-multiple" | "quiz" | "open-text";
export type Actor = { context: BrowserContext; page: Page };
export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
};
export type Course = {
  id: string;
  name: string;
  status: string;
  ownerAccountId: string;
};
export type Session = {
  id: string;
  sessionCode: string;
  status: string;
  firstQuestionId: string | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const fixture = {
  apiBase: normalizeApiBase(process.env.FE51_API_BASE ?? ""),
  uiOrigin: normalizeOrigin(process.env.FE51_UI_ORIGIN ?? ""),
  adminUsername: process.env.FE51_ADMIN_USERNAME ?? "",
  adminPassword: process.env.FE51_ADMIN_PASSWORD ?? "",
  teacherUsername: process.env.FE51_TEACHER_USERNAME ?? "",
  teacherPassword: process.env.FE51_TEACHER_PASSWORD ?? "",
  courseNamePrefix: process.env.FE51_COURSE_NAME_PREFIX ?? "",
  responseLossToken: process.env.FE51_RESPONSE_LOSS_TOKEN ?? "",
};

export const browserApiBase = `${fixture.uiOrigin}/api/v1`;

const requiredFixtureNames = [
  "FE51_API_BASE",
  "FE51_UI_ORIGIN",
  "FE51_ADMIN_USERNAME",
  "FE51_ADMIN_PASSWORD",
  "FE51_COURSE_NAME_PREFIX",
  "FE51_RESPONSE_LOSS_TOKEN",
];

export function assertFixturePreflight() {
  const missing = requiredFixtureNames.filter(
    (name) => !(process.env[name] ?? "").trim(),
  );
  if (missing.length) {
    throw new Error(
      `FE-5.4 real-backend fixture BLOCKED: missing ${missing.join(", ")}`,
    );
  }
  let api: URL;
  let ui: URL;
  try {
    api = new URL(process.env.FE51_API_BASE!);
    ui = new URL(process.env.FE51_UI_ORIGIN!);
  } catch {
    throw new Error(
      "FE-5.4 real-backend fixture BLOCKED: invalid absolute FE51 URLs",
    );
  }
  const secureCookieException =
    ui.protocol === "https:" ||
    ui.hostname === "localhost" ||
    ui.hostname === "127.0.0.1";
  if (
    !["http:", "https:"].includes(api.protocol) ||
    !["http:", "https:"].includes(ui.protocol) ||
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
    !secureCookieException
  ) {
    throw new Error(
      "FE-5.4 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs",
    );
  }
}

export function newActor(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: fixture.uiOrigin,
    ignoreHTTPSErrors: fixture.uiOrigin.startsWith("https://"),
  });
}

export async function csrfToken(context: BrowserContext) {
  const cookie = (await context.storageState()).cookies.find(
    (item) => item.name === "__Host-csrf",
  );
  if (!cookie?.value)
    throw new Error("FE-5.4 context did not have a CSRF cookie");
  return cookie.value;
}

export async function readJson(
  response: {
    json(): Promise<unknown>;
    text(): Promise<string>;
    status(): number;
    headers(): Record<string, string>;
  },
  label: string,
) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      `${label} did not return JSON (status=${response.status()})`,
    );
  }
}

export function dataFromEnvelope<T>(body: unknown, label: string): T {
  if (!isRecord(body) || body.data === null || body.error !== null)
    throw new Error(`${label} did not return a successful envelope`);
  return body.data as T;
}

export function errorCodeFromEnvelope(body: unknown) {
  return isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.code === "string"
    ? body.error.code
    : null;
}

export async function loginViaRequest(
  context: BrowserContext,
  username: string,
  password: string,
) {
  const response = await context.request.post(`${fixture.apiBase}/auth/login`, {
    data: { username, password },
  });
  expect(response.status(), "FE-5.4 login status").toBe(201);
  await readJson(response, "FE-5.4 login");
}

export async function loginViaUi(
  page: Page,
  username: string,
  password: string,
  next: string,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
  });
  const usernameField = page.getByLabel("帳號");
  const passwordField = page.getByLabel("密碼");
  await usernameField.fill(username);
  await expect(usernameField).toHaveValue(username);
  await passwordField.fill(password);
  await expect(passwordField).toHaveValue(password);
  const loginResponse = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" &&
      value.url() === `${browserApiBase}/auth/login`,
  );
  await page.getByRole("button", { name: "登入" }).click();
  const response = await loginResponse;
  expect(response.status(), "FE-5.4 UI login status").toBe(201);
  const sessionResponse = await page
    .context()
    .request.get(`${fixture.apiBase}/auth/session`);
  expect(sessionResponse.status(), "FE-5.4 session status").toBe(200);
  const session = dataFromEnvelope<JsonRecord>(
    await readJson(sessionResponse, "FE-5.4 session"),
    "FE-5.4 session",
  );
  if (session.mustChangePassword)
    await page.goto("/settings/password", { waitUntil: "domcontentloaded" });
  else if (
    new URL(page.url()).pathname !== new URL(next, fixture.uiOrigin).pathname
  )
    await page.goto(next, { waitUntil: "domcontentloaded" });
}

export async function createAccount(
  request: APIRequestContext,
  context: BrowserContext,
  username: string,
  displayName: string,
  role: "student" | "teacher",
  tempPassword: string,
) {
  const response = await request.post(`${fixture.apiBase}/admin/accounts`, {
    headers: {
      Origin: fixture.uiOrigin,
      "X-CSRF-Token": await csrfToken(context),
    },
    data: {
      username,
      displayName,
      role,
      canCreateCourse: role === "teacher",
      tempPassword,
    },
  });
  expect(response.status(), `${role} account status`).toBe(201);
  const data = dataFromEnvelope<JsonRecord>(
    await readJson(response, `${role} account`),
    `${role} account`,
  );
  return {
    id: stringField(data, "id", `${role} account`),
    username,
    displayName,
    role,
    status: stringField(data, "status", `${role} account`),
  };
}

export async function createCourse(
  request: APIRequestContext,
  context: BrowserContext,
  name: string,
  description: string,
) {
  const response = await request.post(`${fixture.apiBase}/courses`, {
    headers: await mutationHeaders(context),
    data: { name, description },
  });
  expect(response.status(), "course status").toBe(201);
  const data = dataFromEnvelope<JsonRecord>(
    await readJson(response, "course"),
    "course",
  );
  return {
    id: stringField(data, "id", "course"),
    name: stringField(data, "name", "course"),
    status: stringField(data, "status", "course"),
    ownerAccountId: stringField(data, "ownerAccountId", "course"),
  };
}

export async function createQuestion(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
  kind: QuestionKind,
  prompt: string,
) {
  const data =
    kind === "open-text"
      ? { type: "open_text", prompt }
      : {
          type: kind === "quiz" ? "quiz" : "poll",
          prompt,
          ...(kind === "quiz"
            ? {
                options: [
                  { optionRef: "a", text: "選項甲" },
                  { optionRef: "b", text: "選項乙" },
                ],
                correctOptionRefs: ["a"],
              }
            : {
                selectionMode: kind === "poll-single" ? "single" : "multiple",
                options: [
                  { optionRef: "a", text: "選項甲" },
                  { optionRef: "b", text: "選項乙" },
                ],
              }),
        };
  const response = await request.post(
    `${fixture.apiBase}/courses/${courseId}/questions`,
    { headers: await mutationHeaders(context), data },
  );
  expect(response.status(), `${kind} question status`).toBe(201);
  const value = dataFromEnvelope<JsonRecord>(
    await readJson(response, `${kind} question`),
    `${kind} question`,
  );
  return {
    id: stringField(value, "id", `${kind} question`),
    courseId,
    type: stringField(value, "type", `${kind} question`),
  };
}

export async function createLiveSession(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
  questionIds: string[],
) {
  const response = await request.post(`${fixture.apiBase}/live-sessions`, {
    headers: await mutationHeaders(context),
    data: { courseId, questionIds },
  });
  expect(response.status()).toBe(201);
  return parseSession(await readJson(response, "live session"), "live session");
}

export async function startSession(
  request: APIRequestContext,
  context: BrowserContext,
  sessionId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/live-sessions/${sessionId}/start`,
    { headers: await mutationHeaders(context) },
  );
  expect(response.status()).toBe(201);
  return parseSession(
    await readJson(response, "start session"),
    "start session",
  );
}

export async function openQuestion(
  request: APIRequestContext,
  context: BrowserContext,
  sessionId: string,
  questionId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/live-sessions/${sessionId}/questions/${questionId}/open`,
    { headers: await mutationHeaders(context) },
  );
  expect(response.status()).toBe(201);
}

export async function closeQuestion(
  request: APIRequestContext,
  context: BrowserContext,
  sessionId: string,
  questionId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/live-sessions/${sessionId}/questions/${questionId}/close`,
    { headers: await mutationHeaders(context) },
  );
  expect(response.status()).toBe(201);
}

export async function closeSession(
  request: APIRequestContext,
  context: BrowserContext,
  sessionId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/live-sessions/${sessionId}/close`,
    { headers: await mutationHeaders(context) },
  );
  expect(response.status()).toBe(201);
}

export async function enrollStudent(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
  studentAccountId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/courses/${courseId}/enrollments`,
    { headers: await mutationHeaders(context), data: { studentAccountId } },
  );
  expect(response.status()).toBe(201);
  return stringField(
    dataFromEnvelope<JsonRecord>(
      await readJson(response, "enrollment"),
      "enrollment",
    ),
    "id",
    "enrollment",
  );
}

export async function archiveCourse(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
) {
  const response = await request.post(
    `${fixture.apiBase}/courses/${courseId}/archive`,
    { headers: await mutationHeaders(context) },
  );
  expect(response.status()).toBe(201);
}

export async function mutationHeaders(context: BrowserContext) {
  return { Origin: fixture.uiOrigin, "X-CSRF-Token": await csrfToken(context) };
}

export async function assertMutationHeaders(
  request: Request,
  expectedCsrf: string,
  label: string,
) {
  const headers = await request.allHeaders();
  expect(headers.origin, `${label} Origin`).toBe(fixture.uiOrigin);
  expect(headers["x-csrf-token"], `${label} CSRF`).toBe(expectedCsrf);
}

export function requestBody(request: Request, label: string): JsonRecord {
  const postData = request.postData();
  if (!postData) throw new Error(`${label} did not send a JSON body`);
  const body: unknown = JSON.parse(postData);
  if (!isRecord(body)) throw new Error(`${label} body was not an object`);
  return body;
}

export function assertRequestBodyKeys(
  request: Request,
  expectedKeys: string[],
  label: string,
) {
  expect(
    Object.keys(requestBody(request, label)).sort(),
    `${label} body keys`,
  ).toEqual([...expectedKeys].sort());
}

export function assertNoHorizontalOverflow(page: Page) {
  return expect
    .poll(() =>
      page.evaluate(
        () => document.body.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

export function createCleanupLedger() {
  const errors: string[] = [];
  return {
    errors,
    async attempt(label: string, action: () => Promise<void>) {
      try {
        await action();
      } catch (error) {
        errors.push(`${label}: ${String(error)}`);
      }
    },
    assertClean() {
      if (errors.length > 0)
        throw new Error(`FE-5.4 cleanup failed: ${errors.join(" | ")}`);
    },
  };
}

function parseSession(body: unknown, label: string): Session {
  const data = dataFromEnvelope<JsonRecord>(body, label);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id)) throw new Error(`${label} returned invalid UUID`);
  const questions = Array.isArray(data.sessionQuestions)
    ? data.sessionQuestions
    : [];
  const first =
    isRecord(questions[0]) && typeof questions[0].id === "string"
      ? questions[0].id
      : null;
  return {
    id,
    sessionCode: stringField(data, "sessionCode", label),
    status: stringField(data, "status", label),
    firstQuestionId: first,
  };
}

function stringField(record: JsonRecord, field: string, label: string) {
  const value = record[field];
  if (typeof value !== "string" || !value)
    throw new Error(`${label} did not contain ${field}`);
  return value;
}
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
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
