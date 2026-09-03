import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Request,
} from "playwright/test";

const rawApiBase = process.env.FE41_API_BASE ?? "";
const rawUiOrigin = process.env.FE41_UI_ORIGIN ?? "";
const apiBase = normalizeApiBase(rawApiBase);
const uiOrigin = normalizeOrigin(rawUiOrigin);
const adminUsername = process.env.FE41_ADMIN_USERNAME ?? "";
const adminPassword = process.env.FE41_ADMIN_PASSWORD ?? "";
const teacherUsername = process.env.FE41_TEACHER_USERNAME ?? "";
const teacherPassword = process.env.FE41_TEACHER_PASSWORD ?? "";
const courseNamePrefix = process.env.FE41_COURSE_NAME_PREFIX ?? "";

const requiredFixtureNames = [
  "FE41_API_BASE",
  "FE41_UI_ORIGIN",
  "FE41_ADMIN_USERNAME",
  "FE41_ADMIN_PASSWORD",
  "FE41_COURSE_NAME_PREFIX",
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
      `FE-4.1 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
        "Provision a disposable migrated backend and set all FE41_* variables; this acceptance never skips.",
    );
  }

  let api: URL;
  let ui: URL;
  try {
    api = new URL(rawApiBase);
    ui = new URL(rawUiOrigin);
  } catch {
    throw new Error(
      "FE-4.1 real-backend fixture BLOCKED: FE41_API_BASE and FE41_UI_ORIGIN must be valid absolute URLs.",
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
      "FE-4.1 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs with API path /api/v1 and secure-cookie-compatible origin.",
    );
  }
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
      "FE-4.1 context did not have a non-empty __Host-csrf cookie",
    );
  }
  return cookie.value;
}

async function loginViaUi(
  page: Page,
  username: string,
  password: string,
  next: string,
  onLoginSuccess?: () => void,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("帳號").fill(username);
  await page.getByLabel("密碼").fill(password);
  const destination = new URL(next, uiOrigin);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === `${apiBase}/auth/login`,
  );
  const navigation = page.waitForURL(
    (url) =>
      url.origin === uiOrigin &&
      (url.pathname === destination.pathname ||
        url.pathname === "/settings/password"),
  );
  await page.getByRole("button", { name: "登入" }).click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() === 201) onLoginSuccess?.();
  await navigation;
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
  const response = await request.post(`${apiBase}/admin/accounts`, {
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
  const response = await request.post(`${apiBase}/auth/step-up`, {
    headers: {
      Origin: uiOrigin,
      "X-CSRF-Token": await csrfToken(context),
    },
    data: { password },
  });
  expect(response.status(), "admin step-up status").toBe(201);
}

async function disableAccount(
  request: APIRequestContext,
  context: BrowserContext,
  accountId: string,
  adminPassword: string,
) {
  await stepUp(request, context, adminPassword);
  const response = await request.post(
    `${apiBase}/admin/accounts/${accountId}/disable`,
    {
      headers: {
        Origin: uiOrigin,
        "X-CSRF-Token": await csrfToken(context),
      },
    },
  );
  expect(response.status(), "account disable status").toBe(201);
  const account = parseAccount(
    await readJson(response, "account disable"),
    "account disable",
  );
  if (account.id !== accountId || account.status !== "disabled") {
    throw new Error("account disable returned an unexpected identity");
  }
}

async function createCourse(
  request: APIRequestContext,
  csrf: string,
  name: string,
  description: string,
) {
  const response = await request.post(`${apiBase}/courses`, {
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

async function createPollQuestion(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  prompt: string,
) {
  const response = await request.post(
    `${apiBase}/courses/${courseId}/questions`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
      data: {
        type: "poll",
        prompt,
        selectionMode: "single",
        options: [
          { optionRef: "a", text: "選項甲" },
          { optionRef: "b", text: "選項乙" },
        ],
      },
    },
  );
  expect(response.status(), "poll question create status").toBe(201);
  const question = parseQuestion(
    await readJson(response, "poll question create"),
    "poll question create",
  );
  if (question.type !== "poll") {
    throw new Error("poll question create returned an unexpected type");
  }
  return question;
}

async function createLiveSession(
  request: APIRequestContext,
  csrf: string,
  courseId: string,
  questionIds: string[],
) {
  const response = await request.post(`${apiBase}/live-sessions`, {
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
    `${apiBase}/live-sessions/${liveSessionId}/start`,
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
    `${apiBase}/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/open`,
    {
      headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    },
  );
  expect(response.status(), "session question open status").toBe(201);
}

async function closeSession(
  request: APIRequestContext,
  csrf: string,
  liveSessionId: string,
) {
  const response = await request.post(
    `${apiBase}/live-sessions/${liveSessionId}/close`,
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
    `${apiBase}/courses/${courseId}/enrollments`,
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
    `${apiBase}/courses/${courseId}/archive`,
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
  const response = await request.post(`${apiBase}/auth/logout`, {
    headers: {
      Origin: uiOrigin,
      "X-CSRF-Token": await csrfToken(context),
    },
  });
  expect(response.status(), "logout status").toBe(201);
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

test.describe("FE-4.1 real-backend Entry／join", () => {
  test("discovers, joins, observes learner states, and enforces access loss on an isolated roster", async ({
    browser,
  }) => {
    assertFixturePreflight();

    const runTag = randomUUID().slice(0, 8);
    const studentUsername = `fe41_student_${runTag}`;
    const studentDisplayName = `FE-4.1 Student ${runTag}`;
    const studentTempPassword = `FE41-temp-${randomUUID()}`;
    const studentPassword = `FE41-final-${randomUUID()}`;
    const otherStudentUsername = `fe41_other_${runTag}`;
    const otherStudentDisplayName = `FE-4.1 Other ${runTag}`;
    const otherStudentTempPassword = `FE41-other-temp-${randomUUID()}`;
    const otherStudentPassword = `FE41-other-final-${randomUUID()}`;

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
      adminContext = await browser.newContext({ baseURL: uiOrigin });
      teacherContext = await browser.newContext({ baseURL: uiOrigin });
      studentContext = await browser.newContext({ baseURL: uiOrigin });
      otherStudentContext = await browser.newContext({ baseURL: uiOrigin });
      adminPage = await adminContext.newPage();
      teacherPage = await teacherContext.newPage();
      studentPage = await studentContext.newPage();
      otherStudentPage = await otherStudentContext.newPage();

      const healthOrigin = new URL(rawApiBase).origin;
      for (const path of ["/health/live", "/health/ready"]) {
        const health = await adminContext.request.get(`${healthOrigin}${path}`);
        expect(health.status(), `${path} status`).toBe(200);
      }

      // Admin provisions the student fixtures.
      await loginViaUi(
        adminPage,
        adminUsername,
        adminPassword,
        "/admin",
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
        teacherUsernameUsed = `fe41_teacher_${runTag}`;
        teacherPasswordUsed = `FE41-teacher-final-${randomUUID()}`;
        teacherTempPassword = `FE41-teacher-temp-${randomUUID()}`;
        const teacher = await createAccount(
          adminContext.request,
          adminCsrf,
          teacherUsernameUsed,
          `FE-4.1 Teacher ${runTag}`,
          "teacher",
          teacherTempPassword,
        );
        createdAccountIds.push(teacher.id);
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

      // Main course + waiting live session for the full learner flow.
      const mainCourse = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag} main`,
        `FE-4.1 main course ${runTag}`,
      );
      createdCourseIds.add(mainCourse.id);
      const mainQuestion = await createPollQuestion(
        teacherContext.request,
        teacherCsrf,
        mainCourse.id,
        `FE-4.1 你最喜歡哪個科目？ ${runTag}`,
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

      // --- Student logs in and sees the waiting entry on My Courses.
      await loginViaUi(
        studentPage,
        studentUsername,
        studentTempPassword,
        "/student",
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

      // Discovery projection: /me/courses advertises the waiting session.
      const discoveryResponse = await studentContext.request.get(
        `${apiBase}/me/courses?page=1&pageSize=20`,
      );
      expect(discoveryResponse.status(), "discovery status").toBe(200);
      const discoveryBody = await readJson(discoveryResponse, "discovery");
      const discoveryData = dataFromEnvelope<unknown>(
        discoveryBody,
        "discovery",
      );
      if (!isRecord(discoveryData) || !Array.isArray(discoveryData.data)) {
        throw new Error("discovery did not return rows");
      }
      const mainRow = discoveryData.data.find((row) => {
        if (!isRecord(row)) return false;
        return row.courseId === mainCourse.id;
      });
      if (!isRecord(mainRow)) {
        throw new Error("discovery did not return the main course row");
      }
      const joinable = mainRow.currentJoinableSession;
      if (
        !isRecord(joinable) ||
        joinable.id !== mainSession.id ||
        joinable.sessionCode !== mainSession.sessionCode ||
        joinable.status !== "waiting"
      ) {
        throw new Error(
          "discovery did not advertise the waiting joinable session",
        );
      }

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
            `${apiBase}/live-sessions/${mainSession.sessionCode}/join`,
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
        studentPage.getByText(`FE-4.1 你最喜歡哪個科目？ ${runTag}`),
      ).toBeVisible();
      await expect(studentPage.getByText("選項甲")).toBeVisible();
      await expect(studentPage.getByText("選項乙")).toBeVisible();
      await expect(studentPage.getByText("尚未作答。")).toBeVisible();
      // No teacher-only data, no answering control (FE-4.2).
      await expect(
        studentPage.getByText(/已加入人數|已作答人數|結束課堂|正確/),
      ).toHaveCount(0);
      await expect(
        studentPage.getByRole("button", { name: /送出|作答/ }),
      ).toHaveCount(0);

      // --- Teacher closes the session; the learner observes the closed
      // terminal state after a manual refresh.
      await closeSession(teacherContext.request, teacherCsrf, mainSession.id);
      await studentPage.getByRole("button", { name: "更新課堂狀態" }).click();
      await expect(
        studentPage.getByRole("heading", { name: "已結束" }),
      ).toBeVisible();
      await expect(
        studentPage.getByText(/課堂已結束，此頁面為唯讀/),
      ).toBeVisible();
      await expect(
        studentPage.getByRole("link", { name: "返回我的課程" }),
      ).toHaveAttribute("href", "/student");

      // --- Terminal race: a second session is closed between discovery and
      // join, so the join surfaces the curated SESSION_NOT_JOINABLE race.
      const raceCourse = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag} race`,
        `FE-4.1 race course ${runTag}`,
      );
      createdCourseIds.add(raceCourse.id);
      const raceQuestion = await createPollQuestion(
        teacherContext.request,
        teacherCsrf,
        raceCourse.id,
        `FE-4.1 race question ${runTag}`,
      );
      const raceSession = await createLiveSession(
        teacherContext.request,
        teacherCsrf,
        raceCourse.id,
        [raceQuestion.id],
      );
      await enrollStudent(
        teacherContext.request,
        teacherCsrf,
        raceCourse.id,
        student.id,
      );

      await studentPage.goto("/student");
      await expect(
        studentPage.getByText(raceCourse.name, { exact: true }),
      ).toBeVisible();
      const raceEntry = studentPage.getByRole("button", {
        name: "等候中課堂入口",
      });
      await expect(raceEntry).toBeVisible();

      // Close the session between discovery and join to force the race.
      await closeSession(teacherContext.request, teacherCsrf, raceSession.id);
      await raceEntry.click();
      const raceError = studentPage.getByRole("alert");
      await expect(raceError).toHaveText("此課堂目前無法加入。");
      await expect(
        studentPage.getByRole("button", { name: "重新整理課堂狀態" }),
      ).toBeVisible();
      await expect(studentPage).toHaveURL(`${uiOrigin}/student`);

      // --- Not-enrolled: a second student (not enrolled) visits the learner
      // route directly and sees the ENROLLMENT_REQUIRED access state.
      await loginViaUi(
        otherStudentPage,
        otherStudentUsername,
        otherStudentTempPassword,
        "/student",
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
      const notEnrolledAlert = otherStudentPage.getByRole("alert");
      await expect(notEnrolledAlert).toHaveText(
        "你尚未加選此課程，無法進入課堂。",
      );
      await expect(
        otherStudentPage.getByText(mainCourse.name, { exact: true }),
      ).toHaveCount(0);

      // --- Wrong-role: a teacher cookie cannot join (403 FORBIDDEN), and a
      // teacher visiting the learner route is redirected away by the student
      // layout role gate.
      const teacherJoin = await teacherContext.request.post(
        `${apiBase}/live-sessions/${mainSession.sessionCode}/join`,
        {
          headers: {
            Origin: uiOrigin,
            "X-CSRF-Token": await csrfToken(teacherContext),
          },
          data: {},
        },
      );
      await expectApiError(
        teacherJoin,
        403,
        "FORBIDDEN",
        "teacher cookie join",
      );
      await teacherPage.goto(`/student/live/${mainSession.id}`);
      await expect(teacherPage).toHaveURL(
        (url) =>
          url.origin === uiOrigin &&
          url.pathname === "/login" &&
          url.searchParams.get("next") ===
            encodeURIComponent(`/student/live/${mainSession.id}`),
      );

      // --- Disabled: after disabling the enrolled student, the participant
      // snapshot classifies the already-issued cookie as AUTH_ACCOUNT_DISABLED.
      // (The student layout would redirect on /auth/session first, so the
      // disabled UI state is asserted at the API boundary where the code is
      // machine-readable.)
      adminContext = await browser.newContext({ baseURL: uiOrigin });
      adminPage = await adminContext.newPage();
      await loginViaUi(
        adminPage,
        adminUsername,
        adminPassword,
        "/admin",
        () => {
          adminLoggedIn = true;
        },
      );
      await disableAccount(
        adminContext.request,
        adminContext,
        student.id,
        adminPassword,
      );
      const disabledSnapshot = await studentContext.request.get(
        `${apiBase}/live-sessions/${mainSession.id}/snapshot`,
      );
      await expectApiError(
        disabledSnapshot,
        401,
        "AUTH_ACCOUNT_DISABLED",
        "disabled student snapshot",
      );

      // --- Expired/missing session: a fresh context with no cookie visiting
      // the learner route is redirected to login (missing session → UNAUTHORIZED
      // → student layout redirect).
      const anonymousContext = await browser.newContext({ baseURL: uiOrigin });
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto(`/student/live/${mainSession.id}`);
      await expect(anonymousPage).toHaveURL(
        (url) =>
          url.origin === uiOrigin &&
          url.pathname === "/login" &&
          url.searchParams.get("next") ===
            encodeURIComponent(`/student/live/${mainSession.id}`),
      );
      await anonymousContext.close();
    } catch (error) {
      primaryError = error;
    } finally {
      // Cleanup is admin-only (account disable + course archive); re-login the
      // admin for finalization when the admin context was closed mid-flow.
      if (!adminContext) {
        try {
          adminContext = await browser.newContext({ baseURL: uiOrigin });
          adminPage = await adminContext.newPage();
          await loginViaUi(
            adminPage,
            adminUsername,
            adminPassword,
            "/admin",
            () => {
              adminLoggedIn = true;
            },
          );
        } catch (cleanupLoginError) {
          if (createdAccountIds.length > 0 || createdCourseIds.size > 0) {
            cleanupErrors.push(
              `cleanup admin login failed: ${String(cleanupLoginError)}`,
            );
          }
        }
      }

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
            await disableAccount(
              adminContext.request,
              adminContext,
              accountId,
              adminPassword,
            );
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

      if (studentLoggedIn && studentContext) {
        try {
          await logoutContext(studentContext.request, studentContext);
        } catch {
          cleanupErrors.push("student logout");
        }
      }
      if (otherStudentLoggedIn && otherStudentContext) {
        try {
          await logoutContext(otherStudentContext.request, otherStudentContext);
        } catch {
          cleanupErrors.push("other student logout");
        }
      }
      if (teacherLoggedIn && teacherContext) {
        try {
          await logoutContext(teacherContext.request, teacherContext);
        } catch {
          cleanupErrors.push("teacher logout");
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
      throw new Error(`FE-4.1 cleanup failed: ${cleanupErrors.join(", ")}`);
    }
  });
});
