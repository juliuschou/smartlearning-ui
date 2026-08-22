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

const rawApiBase = process.env.F0_API_BASE ?? "";
const rawUiOrigin = process.env.F0_UI_ORIGIN ?? "";
const apiBase = normalizeApiBase(rawApiBase);
const uiOrigin = normalizeOrigin(rawUiOrigin);
const adminUsername = process.env.F0_ADMIN_USERNAME;
const adminPassword = process.env.F0_ADMIN_PASSWORD;
const teacherAccountId = process.env.F0_TEACHER_ACCOUNT_ID;
const teacherUsername = process.env.F0_TEACHER_USERNAME;
const teacherPassword = process.env.F0_TEACHER_PASSWORD;
const courseNamePrefix = process.env.F0_COURSE_NAME_PREFIX ?? "";

const requiredFixtureNames = [
  "F0_API_BASE",
  "F0_UI_ORIGIN",
  "F0_ADMIN_USERNAME",
  "F0_ADMIN_PASSWORD",
  "F0_TEACHER_ACCOUNT_ID",
  "F0_TEACHER_USERNAME",
  "F0_TEACHER_PASSWORD",
  "F0_COURSE_NAME_PREFIX",
];
const hasFixture =
  requiredFixtureNames.every((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  }) && hasValidFixtureTarget();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

type SessionDto = {
  accountId: string;
  role: string;
  canCreateCourse: boolean;
  mustChangePassword: boolean;
};

type CourseDto = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ownerAccountId: string;
};

type AccountDto = {
  id: string;
  role: string;
  status: string;
  canCreateCourse: boolean;
};

type CoursePage = {
  data: Array<{ id: string }>;
  totalPages: number;
};

type PendingCourseAttempt = {
  name: string;
  ownerAccountId: string;
  baselineIds: Set<string>;
  requestObserved: boolean;
  responseStatus: number | null;
};

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

function hasValidFixtureTarget() {
  try {
    const api = new URL(rawApiBase);
    const ui = new URL(rawUiOrigin);
    const validProtocol = (protocol: string) =>
      protocol === "http:" || protocol === "https:";
    return (
      validProtocol(api.protocol) &&
      validProtocol(ui.protocol) &&
      api.username === "" &&
      api.password === "" &&
      ui.username === "" &&
      ui.password === "" &&
      api.pathname.replace(/\/+$/, "") === "/api/v1" &&
      api.search === "" &&
      api.hash === "" &&
      ui.pathname === "/" &&
      ui.search === "" &&
      ui.hash === ""
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(
  response: { json(): Promise<unknown> },
  label: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} did not return JSON`);
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

function booleanField(record: JsonRecord, field: string, label: string) {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`${label} did not contain a valid ${field}`);
  }
  return value;
}

function integerField(record: JsonRecord, field: string, label: string) {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} did not contain a valid ${field}`);
  }
  return value;
}

function parseSession(body: unknown): SessionDto {
  const data = dataFromEnvelope<unknown>(body, "Session");
  if (!isRecord(data)) throw new Error("Session data was not an object");
  return {
    accountId: stringField(data, "accountId", "Session"),
    role: stringField(data, "role", "Session"),
    canCreateCourse: booleanField(data, "canCreateCourse", "Session"),
    mustChangePassword: booleanField(data, "mustChangePassword", "Session"),
  };
}

function parseCourse(body: unknown, label: string): CourseDto {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id))
    throw new Error(`${label} did not return a Course UUID`);
  const description = data.description;
  if (description !== null && typeof description !== "string") {
    throw new Error(`${label} returned an invalid description`);
  }
  return {
    id,
    name: stringField(data, "name", label),
    description,
    status: stringField(data, "status", label),
    ownerAccountId: stringField(data, "ownerAccountId", label),
  };
}

function assertNewCourseIdentity(
  course: CourseDto,
  expectedName: string,
  expectedOwnerAccountId: string,
  baselineIds: Set<string>,
  label: string,
) {
  if (
    baselineIds.has(course.id) ||
    course.name !== expectedName ||
    course.ownerAccountId !== expectedOwnerAccountId ||
    course.status !== "draft"
  ) {
    throw new Error(`${label} did not return this run's new Course`);
  }
}

function parseAccount(body: unknown): AccountDto {
  const data = dataFromEnvelope<unknown>(body, "Account permission update");
  if (!isRecord(data)) {
    throw new Error("Account permission data was not an object");
  }
  return {
    id: stringField(data, "id", "Account permission update"),
    role: stringField(data, "role", "Account permission update"),
    status: stringField(data, "status", "Account permission update"),
    canCreateCourse: booleanField(
      data,
      "canCreateCourse",
      "Account permission update",
    ),
  };
}

function parseCoursePage(body: unknown): CoursePage {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new Error("Course list did not return a paginated envelope");
  }
  const rows = body.data.data;
  const meta = body.data.meta;
  if (!Array.isArray(rows) || !isRecord(meta)) {
    throw new Error("Course list did not return page data");
  }
  const ids = rows.map((row) => {
    if (!isRecord(row)) throw new Error("Course list returned an invalid row");
    const id = stringField(row, "id", "Course list row");
    if (!uuidPattern.test(id))
      throw new Error("Course list returned an invalid Course ID");
    return { id };
  });
  return {
    data: ids,
    totalPages: integerField(meta, "totalPages", "Course list metadata"),
  };
}

function errorCodeFromEnvelope(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.code === "string" ? body.error.code : null;
}

function errorMessageFromEnvelope(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.message === "string" ? body.error.message : null;
}

async function csrfToken(context: BrowserContext) {
  const state = await context.storageState();
  const cookie = state.cookies.find((item) => item.name === "__Host-csrf");
  if (!cookie || cookie.value.length === 0) {
    throw new Error("Context did not have a non-empty __Host-csrf cookie");
  }
  return cookie.value;
}

async function sessionData(context: BrowserContext) {
  const response = await context.request.get(`${apiBase}/auth/session`);
  expect(response.status(), "GET /auth/session status").toBe(200);
  return parseSession(await readJson(response, "GET /auth/session"));
}

async function courseIds(context: BrowserContext) {
  const ids: string[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await context.request.get(`${apiBase}/courses`, {
      params: { page, pageSize: 100 },
    });
    expect(response.status(), `GET /courses page ${page} status`).toBe(200);
    const result = parseCoursePage(await readJson(response, "GET /courses"));
    ids.push(...result.data.map((course) => course.id));
    totalPages = result.totalPages;
    page += 1;
    if (page > 1_000)
      throw new Error("Course list pagination exceeded the safety limit");
  }

  return [...new Set(ids)].sort();
}

function assertCourseIdsUnchanged(
  before: string[],
  after: string[],
  label: string,
) {
  if (
    before.length !== after.length ||
    before.some((id, index) => id !== after[index])
  ) {
    throw new Error(`${label} changed the complete Course ID set`);
  }
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

async function expectRejectedCourseMutation(
  response: APIResponse,
  createdCourseIds: Set<string>,
  attempt: PendingCourseAttempt,
  pendingAttempts: Map<string, PendingCourseAttempt>,
  expectedStatus: number,
  expectedCode: string,
  label: string,
) {
  if (response.status() === 201) {
    const body = await readJson(response, label);
    const course = parseCourse(body, label);
    assertNewCourseIdentity(
      course,
      attempt.name,
      attempt.ownerAccountId,
      attempt.baselineIds,
      label,
    );
    createdCourseIds.add(course.id);
    pendingAttempts.delete(attempt.name);
    throw new Error(`${label} unexpectedly created a Course`);
  }
  await expectApiError(response, expectedStatus, expectedCode, label);
  pendingAttempts.delete(attempt.name);
}

function assertMutationHeaders(
  request: Request,
  expectedCsrf: string,
  label: string,
) {
  const headers = request.headers();
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

async function loginViaUi(
  page: Page,
  username: string,
  password: string,
  next: string,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("帳號").fill(username);
  const passwordInput = page.getByLabel("密碼");
  await passwordInput.fill(password);
  const destination = new URL(next, uiOrigin);
  const navigation = page.waitForURL(
    (url) => url.origin === uiOrigin && url.pathname === destination.pathname,
  );
  await passwordInput.press("Enter");
  await navigation;
}

async function submitCourseWithKeyboard(
  page: Page,
  name: string,
  description: string,
) {
  const form = page.getByRole("form", { name: "建立課程表單" });
  await expect(form).toBeVisible();
  const nameInput = page.getByLabel("課程名稱");
  const descriptionInput = page.getByLabel("課程說明");
  await expect(nameInput).toHaveAttribute("aria-describedby", /name-hint/);
  await expect(descriptionInput).toHaveAttribute(
    "aria-describedby",
    /description-hint/,
  );
  await nameInput.focus();
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  await nameInput.press("Tab");
  await descriptionInput.fill(description);
  await descriptionInput.press("Tab");
  const submit = page.getByRole("button", { name: "建立課程", exact: true });
  await expect(submit).toBeFocused();
  await expect(submit).toBeEnabled();
  await submit.press("Enter");
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (
    dimensions.documentWidth > dimensions.viewportWidth ||
    dimensions.bodyWidth > dimensions.viewportWidth
  ) {
    throw new Error(`${label} has horizontal overflow`);
  }
}

async function setPermissionViaUi(
  page: Page,
  context: BrowserContext,
  accountId: string,
  expected: boolean,
  label: string,
) {
  const permissionSwitch = page.getByRole("switch", {
    name: "允許建立課程",
  });
  await expect(permissionSwitch).toBeVisible();
  await permissionSwitch.focus();
  await expect(permissionSwitch).toBeFocused();
  const current = await permissionSwitch.isChecked();
  await expect(permissionSwitch).toHaveAttribute(
    "aria-checked",
    String(current),
  );

  if (current === expected) return;

  const expectedCsrf = await csrfToken(context);
  const permissionUrl = `${apiBase}/admin/accounts/${accountId}/permissions`;
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" && request.url() === permissionUrl,
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url() === permissionUrl,
  );
  await permissionSwitch.press("Space");
  const [request, response] = await Promise.all([
    requestPromise,
    responsePromise,
  ]);
  assertMutationHeaders(request, expectedCsrf, label);
  assertRequestBodyKeys(request, ["canCreateCourse"], label);
  expect(response.status(), `${label} status`).toBe(200);
  const account = parseAccount(await readJson(response, label));
  if (
    account.id !== accountId ||
    account.canCreateCourse !== expected ||
    account.role !== "teacher"
  ) {
    throw new Error(`${label} returned an unexpected account projection`);
  }
  await expect(permissionSwitch).toHaveAttribute(
    "aria-checked",
    String(expected),
  );
  await expect(permissionSwitch).toBeChecked({ checked: expected });
}

async function reconcileCourseAttempt(
  request: APIRequestContext,
  context: BrowserContext,
  attempt: PendingCourseAttempt,
  createdCourseIds: Set<string>,
) {
  if (
    !attempt.requestObserved ||
    (attempt.responseStatus !== null && attempt.responseStatus !== 201)
  ) {
    return;
  }

  const afterIds = await courseIds(context);
  const candidateIds = afterIds.filter(
    (courseId) =>
      !attempt.baselineIds.has(courseId) && !createdCourseIds.has(courseId),
  );
  const matches: CourseDto[] = [];

  for (const courseId of candidateIds) {
    const response = await request.get(`${apiBase}/courses/${courseId}`);
    if (response.status() !== 200) continue;
    const course = parseCourse(
      await readJson(response, "Course reconciliation"),
      "Course reconciliation",
    );
    if (course.name === attempt.name) matches.push(course);
  }

  if (matches.length !== 1) {
    throw new Error("Could not uniquely reconcile an uncertain Course create");
  }

  const [course] = matches;
  assertNewCourseIdentity(
    course,
    attempt.name,
    attempt.ownerAccountId,
    attempt.baselineIds,
    "Course reconciliation",
  );
  createdCourseIds.add(course.id);
}

async function archiveCreatedCourses(
  request: APIRequestContext,
  context: BrowserContext,
  createdCourseIds: Set<string>,
) {
  const failures: string[] = [];

  for (const courseId of createdCourseIds) {
    try {
      const token = await csrfToken(context);
      const response = await request.post(
        `${apiBase}/courses/${courseId}/archive`,
        {
          headers: {
            Origin: uiOrigin,
            "X-CSRF-Token": token,
          },
        },
      );
      expect(response.status(), "archive Course status").toBe(201);
      const archived = parseCourse(
        await readJson(response, "Course archive"),
        "Course archive",
      );
      if (archived.id !== courseId || archived.status !== "archived") {
        throw new Error("Course archive did not return archived status");
      }
    } catch {
      failures.push("archive a created Course");
    }
  }

  if (failures.length > 0) {
    throw new Error("One or more Course archive attempts failed");
  }
}

async function logoutContext(
  request: APIRequestContext,
  context: BrowserContext,
  label: string,
) {
  const token = await csrfToken(context);
  const response = await request.post(`${apiBase}/auth/logout`, {
    headers: {
      Origin: uiOrigin,
      "X-CSRF-Token": token,
    },
  });
  expect(response.status(), `${label} status`).toBe(201);
}

async function closeContext(
  context: BrowserContext | null,
  label: string,
): Promise<void> {
  if (!context) return;
  await context.close();
  void label;
}

test.describe("US-F0 real-backend Course flow", () => {
  test("teacher creates and reloads a Course, then respects revoked permission", async ({
    browser,
  }, testInfo) => {
    test.skip(
      !hasFixture,
      `Set ${requiredFixtureNames.join(", ")} for the isolated real-backend CP5 fixture.`,
    );

    const runTag = randomUUID().slice(0, 8);
    const createdCourseIds = new Set<string>();
    const pendingCourseAttempts = new Map<string, PendingCourseAttempt>();
    const accountPath = `/admin/accounts/${teacherAccountId}`;
    const createdCourseName = `${courseNamePrefix} ${testInfo.workerIndex} ${runTag}`;
    const createdCourseDescription = "CP5 real-backend course flow";
    const missingCsrfName = `${createdCourseName} missing-csrf`;
    const wrongOriginName = `${createdCourseName} wrong-origin`;
    const deniedCourseName = `${createdCourseName} denied`;

    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let adminPage: Page | null = null;
    let teacherPage: Page | null = null;
    let initialPermission: boolean | null = null;
    let primaryError: unknown = null;
    const cleanupErrors: string[] = [];

    try {
      adminContext = await browser.newContext({ baseURL: uiOrigin });
      teacherContext = await browser.newContext({
        baseURL: uiOrigin,
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      adminPage = await adminContext.newPage();
      teacherPage = await teacherContext.newPage();

      await loginViaUi(adminPage, adminUsername!, adminPassword!, accountPath);
      const accountIdText = adminPage.getByText(teacherAccountId!, {
        exact: true,
      });
      await expect(accountIdText).toBeVisible();
      await expect(
        adminPage.getByText("teacher", { exact: true }),
      ).toBeVisible();
      await expect(
        adminPage.getByText("active", { exact: true }),
      ).toBeVisible();

      const permissionSwitch = adminPage.getByRole("switch", {
        name: "允許建立課程",
      });
      await expect(permissionSwitch).toBeVisible();
      initialPermission = await permissionSwitch.isChecked();
      await expect(permissionSwitch).toHaveAttribute(
        "aria-checked",
        String(initialPermission),
      );
      await setPermissionViaUi(
        adminPage,
        adminContext!,
        teacherAccountId!,
        true,
        "Enable teacher course permission",
      );

      await loginViaUi(
        teacherPage,
        teacherUsername!,
        teacherPassword!,
        "/courses/new",
      );
      const teacherSession = await sessionData(teacherContext);
      if (
        teacherSession.accountId !== teacherAccountId ||
        teacherSession.role !== "teacher" ||
        teacherSession.mustChangePassword ||
        !teacherSession.canCreateCourse
      ) {
        throw new Error(
          "Teacher fixture session did not have the expected state",
        );
      }

      await teacherPage.goto("/teacher");
      await expect(
        teacherPage.getByRole("heading", { name: "老師首頁" }),
      ).toBeVisible();
      const createLink = teacherPage.getByRole("link", {
        name: "建立課程",
        exact: true,
      });
      await expect(createLink).toBeVisible();
      await createLink.focus();
      await expect(createLink).toBeFocused();
      const createNavigation = teacherPage.waitForURL(
        (url) => url.origin === uiOrigin && url.pathname === "/courses/new",
      );
      await createLink.press("Enter");
      await createNavigation;
      await assertNoHorizontalOverflow(
        teacherPage,
        "mobile Course create page",
      );

      const courseUrl = `${apiBase}/courses`;
      const beforeCreateIds = new Set(await courseIds(teacherContext));
      const createAttempt: PendingCourseAttempt = {
        name: createdCourseName,
        ownerAccountId: teacherSession.accountId,
        baselineIds: beforeCreateIds,
        requestObserved: false,
        responseStatus: null,
      };
      pendingCourseAttempts.set(createAttempt.name, createAttempt);
      const createCsrf = await csrfToken(teacherContext);
      const createRequestPromise = teacherPage.waitForRequest(
        (request) => request.method() === "POST" && request.url() === courseUrl,
      );
      const createResponsePromise = teacherPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === courseUrl,
      );
      await submitCourseWithKeyboard(
        teacherPage,
        createdCourseName,
        createdCourseDescription,
      );
      const createRequest = await createRequestPromise;
      createAttempt.requestObserved = true;
      const createResponse = await createResponsePromise;
      createAttempt.responseStatus = createResponse.status();
      assertMutationHeaders(createRequest, createCsrf, "Course create");
      assertRequestBodyKeys(
        createRequest,
        ["name", "description"],
        "Course create",
      );
      expect(createResponse.status(), "Course create status").toBe(201);
      const createdCourse = parseCourse(
        await readJson(createResponse, "Course create"),
        "Course create",
      );
      assertNewCourseIdentity(
        createdCourse,
        createdCourseName,
        teacherSession.accountId,
        beforeCreateIds,
        "Course create",
      );
      createdCourseIds.add(createdCourse.id);
      pendingCourseAttempts.delete(createAttempt.name);
      await expect(teacherPage).toHaveURL(
        `${uiOrigin}/courses/${createdCourse.id}`,
      );

      const detailUrl = `${apiBase}/courses/${createdCourse.id}`;
      const detailResponsePromise = teacherPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" && response.url() === detailUrl,
      );
      await teacherPage.reload();
      const detailResponse = await detailResponsePromise;
      expect(detailResponse.status(), "Course detail GET status").toBe(200);
      const detailCourse = parseCourse(
        await readJson(detailResponse, "Course detail GET"),
        "Course detail GET",
      );
      if (
        detailCourse.id !== createdCourse.id ||
        detailCourse.name !== createdCourseName ||
        detailCourse.status !== "draft" ||
        detailCourse.ownerAccountId !== teacherSession.accountId
      ) {
        throw new Error(
          "Course detail did not match the server-created Course",
        );
      }
      await expect(
        teacherPage.getByRole("heading", { name: "課程詳情" }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText(createdCourseName, { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText("draft", { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText("課程擁有者（唯一老師）", { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText(teacherSession.accountId, { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText("題目功能目前尚未開放。", { exact: true }),
      ).toBeVisible();
      const detailSection = teacherPage
        .locator("section")
        .filter({ hasText: "題目功能目前尚未開放。" });
      await expect(detailSection).toHaveCount(1);
      await expect(detailSection.getByRole("link")).toHaveCount(0);
      await expect(detailSection.getByRole("button")).toHaveCount(0);

      const desktopPage = await teacherContext.newPage();
      try {
        await desktopPage.setViewportSize({ width: 1280, height: 800 });
        const desktopDetailResponsePromise = desktopPage.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            response.url() === detailUrl,
        );
        await desktopPage.goto(`/courses/${createdCourse.id}`);
        const desktopDetailResponse = await desktopDetailResponsePromise;
        expect(
          desktopDetailResponse.status(),
          "desktop detail GET status",
        ).toBe(200);
        await assertNoHorizontalOverflow(
          desktopPage,
          "desktop Course detail page",
        );
      } finally {
        await desktopPage.close();
      }

      const beforeMissingCsrfIds = new Set(await courseIds(teacherContext));
      const missingCsrfAttempt: PendingCourseAttempt = {
        name: missingCsrfName,
        ownerAccountId: teacherSession.accountId,
        baselineIds: beforeMissingCsrfIds,
        requestObserved: true,
        responseStatus: null,
      };
      pendingCourseAttempts.set(missingCsrfAttempt.name, missingCsrfAttempt);
      const missingCsrfResponse = await teacherContext.request.post(courseUrl, {
        headers: {
          Origin: uiOrigin,
          "Content-Type": "application/json",
        },
        data: { name: missingCsrfName },
      });
      missingCsrfAttempt.responseStatus = missingCsrfResponse.status();
      await expectRejectedCourseMutation(
        missingCsrfResponse,
        createdCourseIds,
        missingCsrfAttempt,
        pendingCourseAttempts,
        403,
        "AUTH_CSRF_INVALID",
        "missing-CSRF Course create",
      );
      assertCourseIdsUnchanged(
        [...beforeMissingCsrfIds].sort(),
        await courseIds(teacherContext),
        "missing-CSRF mutation",
      );

      const beforeWrongOriginIds = new Set(await courseIds(teacherContext));
      const wrongOriginAttempt: PendingCourseAttempt = {
        name: wrongOriginName,
        ownerAccountId: teacherSession.accountId,
        baselineIds: beforeWrongOriginIds,
        requestObserved: true,
        responseStatus: null,
      };
      pendingCourseAttempts.set(wrongOriginAttempt.name, wrongOriginAttempt);
      const token = await csrfToken(teacherContext);
      const wrongOriginResponse = await teacherContext.request.post(courseUrl, {
        headers: {
          Origin: "https://blocked.invalid",
          "X-CSRF-Token": token,
          "Content-Type": "application/json",
        },
        data: { name: wrongOriginName },
      });
      wrongOriginAttempt.responseStatus = wrongOriginResponse.status();
      await expectRejectedCourseMutation(
        wrongOriginResponse,
        createdCourseIds,
        wrongOriginAttempt,
        pendingCourseAttempts,
        403,
        "AUTH_CSRF_INVALID",
        "disallowed-Origin Course create",
      );
      assertCourseIdsUnchanged(
        [...beforeWrongOriginIds].sort(),
        await courseIds(teacherContext),
        "disallowed-Origin mutation",
      );

      await setPermissionViaUi(
        adminPage,
        adminContext!,
        teacherAccountId!,
        false,
        "Revoke teacher course permission",
      );

      const backToTeacher = teacherPage.getByRole("link", {
        name: /返回老師首頁/,
      });
      await backToTeacher.focus();
      await expect(backToTeacher).toBeFocused();
      const teacherHomeNavigation = teacherPage.waitForURL(
        (url) => url.origin === uiOrigin && url.pathname === "/teacher",
      );
      await backToTeacher.press("Enter");
      await teacherHomeNavigation;
      const staleCreateLink = teacherPage.getByRole("link", {
        name: "建立課程",
        exact: true,
      });
      await expect(staleCreateLink).toBeVisible();
      await staleCreateLink.focus();
      await expect(staleCreateLink).toBeFocused();
      const staleCreateNavigation = teacherPage.waitForURL(
        (url) => url.origin === uiOrigin && url.pathname === "/courses/new",
      );
      await staleCreateLink.press("Enter");
      await staleCreateNavigation;

      const beforeDeniedIds = new Set(await courseIds(teacherContext));
      const deniedAttempt: PendingCourseAttempt = {
        name: deniedCourseName,
        ownerAccountId: teacherSession.accountId,
        baselineIds: beforeDeniedIds,
        requestObserved: false,
        responseStatus: null,
      };
      pendingCourseAttempts.set(deniedAttempt.name, deniedAttempt);
      const deniedCsrf = await csrfToken(teacherContext);
      const deniedRequestPromise = teacherPage.waitForRequest(
        (request) => request.method() === "POST" && request.url() === courseUrl,
      );
      const deniedResponsePromise = teacherPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === courseUrl,
      );
      await submitCourseWithKeyboard(
        teacherPage,
        deniedCourseName,
        createdCourseDescription,
      );
      const deniedRequest = await deniedRequestPromise;
      deniedAttempt.requestObserved = true;
      const deniedResponse = await deniedResponsePromise;
      deniedAttempt.responseStatus = deniedResponse.status();
      assertMutationHeaders(
        deniedRequest,
        deniedCsrf,
        "revoked-permission Course create",
      );
      assertRequestBodyKeys(
        deniedRequest,
        ["name", "description"],
        "revoked-permission Course create",
      );
      const deniedBody = await readJson(
        deniedResponse,
        "revoked-permission Course create",
      );
      if (deniedResponse.status() === 201) {
        const unexpectedCourse = parseCourse(
          deniedBody,
          "revoked-permission Course create",
        );
        assertNewCourseIdentity(
          unexpectedCourse,
          deniedCourseName,
          teacherSession.accountId,
          beforeDeniedIds,
          "revoked-permission Course create",
        );
        createdCourseIds.add(unexpectedCourse.id);
        pendingCourseAttempts.delete(deniedAttempt.name);
        throw new Error(
          "revoked-permission Course create unexpectedly succeeded",
        );
      }
      if (deniedResponse.status() !== 403) {
        throw new Error(
          "revoked-permission Course create returned an unexpected status",
        );
      }
      if (errorCodeFromEnvelope(deniedBody) !== "FORBIDDEN") {
        throw new Error(
          "revoked-permission Course create returned an unexpected error code",
        );
      }
      pendingCourseAttempts.delete(deniedAttempt.name);
      const deniedRawMessage = errorMessageFromEnvelope(deniedBody);
      const visibleDeniedText = await teacherPage.locator("body").innerText();
      if (
        deniedRawMessage !== null &&
        deniedRawMessage.length > 0 &&
        visibleDeniedText.includes(deniedRawMessage)
      ) {
        throw new Error("Course denial UI rendered a raw backend message");
      }
      await expect(teacherPage.getByRole("alert")).toContainText(
        "你沒有權限執行此操作。",
      );
      await expect(teacherPage).toHaveURL(`${uiOrigin}/courses/new`);
      assertCourseIdsUnchanged(
        [...beforeDeniedIds].sort(),
        await courseIds(teacherContext),
        "revoked-permission mutation",
      );
    } catch (error) {
      primaryError = error;
    } finally {
      if (teacherContext) {
        for (const [attemptName, attempt] of pendingCourseAttempts) {
          try {
            await reconcileCourseAttempt(
              teacherContext.request,
              teacherContext,
              attempt,
              createdCourseIds,
            );
            pendingCourseAttempts.delete(attemptName);
          } catch {
            cleanupErrors.push("reconcile uncertain Course create");
          }
        }

        try {
          await archiveCreatedCourses(
            teacherContext.request,
            teacherContext,
            createdCourseIds,
          );
        } catch {
          cleanupErrors.push("archive created Courses");
        }
      } else if (pendingCourseAttempts.size > 0) {
        cleanupErrors.push("reconcile uncertain Course create");
      }

      if (adminPage && initialPermission !== null) {
        try {
          await setPermissionViaUi(
            adminPage,
            adminContext!,
            teacherAccountId!,
            initialPermission,
            "Restore teacher course permission",
          );
        } catch {
          cleanupErrors.push("restore original teacher permission");
        }
      }

      if (teacherContext) {
        try {
          await logoutContext(
            teacherContext.request,
            teacherContext,
            "Teacher logout",
          );
        } catch {
          cleanupErrors.push("teacher logout");
        }
      }
      if (adminContext) {
        try {
          await logoutContext(
            adminContext.request,
            adminContext,
            "Admin logout",
          );
        } catch {
          cleanupErrors.push("admin logout");
        }
      }

      try {
        await closeContext(teacherContext, "teacher context");
      } catch {
        cleanupErrors.push("close teacher context");
      }
      try {
        await closeContext(adminContext, "admin context");
      } catch {
        cleanupErrors.push("close admin context");
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
      throw new Error(`CP5 cleanup failed: ${cleanupErrors.join(", ")}`);
    }
  });
});
