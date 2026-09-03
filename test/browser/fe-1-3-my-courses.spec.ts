import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "playwright/test";

const rawApiBase = process.env.FE13_API_BASE ?? "";
const rawUiOrigin = process.env.FE13_UI_ORIGIN ?? "";
const apiBase = normalizeApiBase(rawApiBase);
const uiOrigin = normalizeOrigin(rawUiOrigin);
const adminUsername = process.env.FE13_ADMIN_USERNAME ?? "";
const adminPassword = process.env.FE13_ADMIN_PASSWORD ?? "";
const courseNamePrefix = process.env.FE13_COURSE_NAME_PREFIX ?? "";

const requiredFixtureNames = [
  "FE13_API_BASE",
  "FE13_UI_ORIGIN",
  "FE13_ADMIN_USERNAME",
  "FE13_ADMIN_PASSWORD",
  "FE13_COURSE_NAME_PREFIX",
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

type Course = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ownerAccountId: string;
};

type MyCourse = Course & {
  enrollmentId: string;
  enrolledAt: string;
};

type MyCoursePage = {
  data: MyCourse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type PendingCourseAttempt = {
  name: string;
  ownerAccountId: string;
  baselineIds: Set<string>;
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

function assertFixturePreflight() {
  const missing = requiredFixtureNames.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(
      `FE-1.3 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
        "Provision a disposable migrated backend and set all FE13_* variables; this acceptance never skips.",
    );
  }

  let api: URL;
  let ui: URL;
  try {
    api = new URL(rawApiBase);
    ui = new URL(rawUiOrigin);
  } catch {
    throw new Error(
      "FE-1.3 real-backend fixture BLOCKED: FE13_API_BASE and FE13_UI_ORIGIN must be valid absolute URLs.",
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
      "FE-1.3 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs with API path /api/v1 and secure-cookie-compatible origin.",
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

function parseCourse(body: unknown, label: string): Course {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data)) throw new Error(`${label} data was not an object`);
  const id = stringField(data, "id", label);
  if (!uuidPattern.test(id))
    throw new Error(`${label} returned an invalid Course UUID`);
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

function parseMyCoursesPage(body: unknown, label: string): MyCoursePage {
  const data = dataFromEnvelope<unknown>(body, label);
  if (!isRecord(data) || !Array.isArray(data.data) || !isRecord(data.meta)) {
    throw new Error(`${label} did not return a paginated course payload`);
  }
  const rows = data.data.map((value, index) => {
    const rowLabel = `${label} row ${index}`;
    if (!isRecord(value)) throw new Error(`${rowLabel} was not an object`);
    const id = stringField(value, "courseId", rowLabel);
    const enrollmentId = stringField(value, "enrollmentId", rowLabel);
    if (!uuidPattern.test(id) || !uuidPattern.test(enrollmentId)) {
      throw new Error(`${rowLabel} returned invalid UUIDs`);
    }
    const description = value.description;
    if (description !== null && typeof description !== "string") {
      throw new Error(`${rowLabel} returned an invalid description`);
    }
    return {
      enrollmentId,
      id,
      name: stringField(value, "name", rowLabel),
      description,
      status: stringField(value, "status", rowLabel),
      ownerAccountId: stringField(value, "ownerAccountId", rowLabel),
      enrolledAt: stringField(value, "enrolledAt", rowLabel),
    };
  });

  const pageMeta = data.meta;
  const integer = (field: string) => {
    const value = pageMeta[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`${label} metadata has invalid ${field}`);
    }
    return value;
  };

  return {
    data: rows,
    meta: {
      page: integer("page"),
      pageSize: integer("pageSize"),
      total: integer("total"),
      totalPages: integer("totalPages"),
    },
  };
}

async function fetchMyCoursesPage(
  request: APIRequestContext,
  url: string,
  label: string,
) {
  const response = await request.get(url);
  expect(response.status(), `${label} status`).toBe(200);
  return parseMyCoursesPage(await readJson(response, label), label);
}

async function csrfToken(context: BrowserContext) {
  const state = await context.storageState();
  const cookie = state.cookies.find((item) => item.name === "__Host-csrf");
  if (!cookie || cookie.value.length === 0) {
    throw new Error(
      "FE-1.3 context did not have a non-empty __Host-csrf cookie",
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
) {
  await expect(page).toHaveURL(`${uiOrigin}/settings/password`);
  await page.getByLabel("目前密碼").fill(currentPassword);
  await page.getByLabel("新密碼", { exact: true }).fill(newPassword);
  await page.getByLabel("確認新密碼", { exact: true }).fill(newPassword);
  const navigation = page.waitForURL(
    (url) => url.origin === uiOrigin && url.pathname === "/student",
  );
  await page.getByRole("button", { name: "變更密碼" }).click();
  await navigation;
}

async function createStudent(
  request: APIRequestContext,
  csrf: string,
  username: string,
  displayName: string,
  tempPassword: string,
) {
  const response = await request.post(`${apiBase}/admin/accounts`, {
    headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    data: {
      username,
      displayName,
      role: "student",
      canCreateCourse: false,
      tempPassword,
    },
  });
  expect(response.status(), "student account create status").toBe(201);
  const account = parseAccount(
    await readJson(response, "student account create"),
    "student account create",
  );
  if (
    account.role !== "student" ||
    account.username !== username ||
    account.displayName !== displayName
  ) {
    throw new Error("student account create returned an unexpected identity");
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
  expect(response.status(), "student account disable status").toBe(201);
  const account = parseAccount(
    await readJson(response, "student account disable"),
    "student account disable",
  );
  if (account.id !== accountId || account.status !== "disabled") {
    throw new Error("student account disable returned an unexpected identity");
  }
}

async function listOwnedCourseIds(request: APIRequestContext) {
  const response = await request.get(`${apiBase}/courses?page=1&pageSize=100`);
  expect(response.status(), "owned Course list status").toBe(200);
  const body = await readJson(response, "owned Course list");
  const data = dataFromEnvelope<unknown>(body, "owned Course list");
  if (!isRecord(data) || !Array.isArray(data.data)) {
    throw new Error("owned Course list did not return rows");
  }
  return data.data.map((row, index) => {
    if (!isRecord(row))
      throw new Error(`owned Course row ${index} was invalid`);
    const id = stringField(row, "id", "owned Course row");
    if (!uuidPattern.test(id))
      throw new Error("owned Course row returned invalid UUID");
    return id;
  });
}

async function createCourse(
  request: APIRequestContext,
  csrf: string,
  ownerAccountId: string,
  name: string,
  description: string,
  pendingAttempts: Map<string, PendingCourseAttempt>,
  createdCourseIds: Set<string>,
) {
  const baselineIds = new Set(await listOwnedCourseIds(request));
  const attempt: PendingCourseAttempt = {
    name,
    ownerAccountId,
    baselineIds,
    responseStatus: null,
  };
  pendingAttempts.set(name, attempt);

  const response = await request.post(`${apiBase}/courses`, {
    headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
    data: { name, description },
  });
  attempt.responseStatus = response.status();
  expect(response.status(), `${name} Course create status`).toBe(201);
  const course = parseCourse(
    await readJson(response, `${name} Course create`),
    `${name} Course create`,
  );
  if (
    course.name !== name ||
    course.ownerAccountId !== ownerAccountId ||
    course.status !== "draft" ||
    attempt.baselineIds.has(course.id)
  ) {
    throw new Error(`${name} Course create returned an unexpected identity`);
  }
  createdCourseIds.add(course.id);
  pendingAttempts.delete(name);
  return course;
}

async function reconcileCourseAttempts(
  request: APIRequestContext,
  pendingAttempts: Map<string, PendingCourseAttempt>,
  createdCourseIds: Set<string>,
) {
  const failures: string[] = [];
  for (const [name, attempt] of pendingAttempts) {
    if (
      attempt.responseStatus !== null &&
      attempt.responseStatus >= 400 &&
      attempt.responseStatus < 500
    ) {
      continue;
    }
    try {
      const afterIds = await listOwnedCourseIds(request);
      const candidates = afterIds.filter(
        (id) => !attempt.baselineIds.has(id) && !createdCourseIds.has(id),
      );
      const matches: Course[] = [];
      for (const id of candidates) {
        const response = await request.get(`${apiBase}/courses/${id}`);
        if (response.status() !== 200) continue;
        const course = parseCourse(
          await readJson(response, "Course reconciliation"),
          "Course reconciliation",
        );
        if (
          course.name === attempt.name &&
          course.ownerAccountId === attempt.ownerAccountId &&
          course.status === "draft"
        ) {
          matches.push(course);
        }
      }
      if (matches.length !== 1) {
        throw new Error("uncertain Course create was not uniquely reconciled");
      }
      createdCourseIds.add(matches[0].id);
      pendingAttempts.delete(name);
    } catch {
      failures.push(`reconcile ${name}`);
    }
  }
  return failures;
}

async function addEnrollment(
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

async function assertServerOrdering(rows: MyCourse[]) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const previousTime = Date.parse(previous.enrolledAt);
    const currentTime = Date.parse(current.enrolledAt);
    if (
      !Number.isFinite(previousTime) ||
      !Number.isFinite(currentTime) ||
      previousTime < currentTime ||
      (previousTime === currentTime &&
        previous.enrollmentId < current.enrollmentId)
    ) {
      throw new Error(
        "/me/courses did not preserve enrolledAt DESC, id DESC ordering",
      );
    }
  }
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

async function removeEnrollment(
  request: APIRequestContext,
  context: BrowserContext,
  courseId: string,
  studentAccountId: string,
) {
  const response = await request.delete(
    `${apiBase}/courses/${courseId}/enrollments/${studentAccountId}`,
    {
      headers: {
        Origin: uiOrigin,
        "X-CSRF-Token": await csrfToken(context),
      },
    },
  );
  expect(response.status(), "enrollment removal status").toBe(200);
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

test.describe("FE-1.3 real-backend 我的課程", () => {
  test("renders, paginates, archives, removes, and cleans up an isolated roster", async ({
    browser,
  }) => {
    assertFixturePreflight();

    const runTag = randomUUID().slice(0, 8);
    const studentUsername = `fe13_student_${runTag}`;
    const studentDisplayName = `FE-1.3 Student ${runTag}`;
    const studentTempPassword = `FE13-temp-${randomUUID()}`;
    const studentPassword = `FE13-final-${randomUUID()}`;
    const courseCount = 21;
    const createdCourseIds = new Set<string>();
    const enrolledCourseIds = new Set<string>();
    const archivedCourseIds = new Set<string>();
    const pendingAttempts = new Map<string, PendingCourseAttempt>();
    const cleanupErrors: string[] = [];
    let primaryError: unknown = null;
    let adminContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let adminPage: Page | null = null;
    let studentPage: Page | null = null;
    let studentAccountId: string | null = null;
    let studentCreateAttempted = false;
    let adminLoggedIn = false;
    let studentLoggedIn = false;

    try {
      adminContext = await browser.newContext({ baseURL: uiOrigin });
      studentContext = await browser.newContext({
        baseURL: uiOrigin,
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      adminPage = await adminContext.newPage();
      studentPage = await studentContext.newPage();

      const healthOrigin = new URL(rawApiBase).origin;
      for (const path of ["/health/live", "/health/ready"]) {
        const health = await adminContext.request.get(`${healthOrigin}${path}`);
        expect(health.status(), `${path} status`).toBe(200);
      }

      await loginViaUi(
        adminPage,
        adminUsername,
        adminPassword,
        "/admin",
        () => {
          adminLoggedIn = true;
        },
      );
      const adminSessionResponse = await adminContext.request.get(
        `${apiBase}/auth/session`,
      );
      expect(adminSessionResponse.status(), "admin session status").toBe(200);
      const adminSession = dataFromEnvelope<JsonRecord>(
        await readJson(adminSessionResponse, "admin session"),
        "admin session",
      );
      const adminAccountId = stringField(
        adminSession,
        "accountId",
        "admin session",
      );
      if (stringField(adminSession, "role", "admin session") !== "admin") {
        throw new Error("admin fixture session did not have admin role");
      }

      const adminCsrf = await csrfToken(adminContext);
      studentCreateAttempted = true;
      const student = await createStudent(
        adminContext.request,
        adminCsrf,
        studentUsername,
        studentDisplayName,
        studentTempPassword,
      );
      studentAccountId = student.id;

      for (let index = 0; index < courseCount; index += 1) {
        const isLongCourse = index === courseCount - 1;
        const name = isLongCourse
          ? `${courseNamePrefix} ${runTag} long-name ${"課程".repeat(36)}`
          : `${courseNamePrefix} ${runTag} course-${String(index + 1).padStart(2, "0")}`;
        const description = isLongCourse
          ? `${"https://long-unbroken-content.example/".repeat(18)}\n完整長描述 ${runTag}`
          : `FE-1.3 isolated description ${index + 1}`;
        const course = await createCourse(
          adminContext.request,
          adminCsrf,
          adminAccountId,
          name,
          description,
          pendingAttempts,
          createdCourseIds,
        );
        enrolledCourseIds.add(course.id);
        await addEnrollment(
          adminContext.request,
          adminCsrf,
          course.id,
          student.id,
        );
      }

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
      );
      await expect(studentPage).toHaveURL(`${uiOrigin}/student`);

      const firstPageUrl = `${apiBase}/me/courses?page=1&pageSize=20`;
      await studentPage.reload();
      const firstPage = await fetchMyCoursesPage(
        studentContext.request,
        firstPageUrl,
        "first /me/courses page",
      );
      await expect(
        studentPage.locator('ul[aria-label="我的課程列表"]'),
      ).toBeVisible();
      expect(firstPage.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      });
      await assertServerOrdering(firstPage.data);
      expect(firstPage.data).toHaveLength(20);
      const firstPageNames = await studentPage
        .locator('ul[aria-label="我的課程列表"] h2')
        .allTextContents();
      expect(firstPageNames).toEqual(
        firstPage.data.map((course) => course.name),
      );
      const longCourse = firstPage.data.find((course) =>
        course.name.includes(`${runTag} long-name`),
      );
      if (!longCourse)
        throw new Error("long Course was not returned on the first page");
      const longCourseCard = studentPage
        .locator("article")
        .filter({ hasText: longCourse.name });
      await expect(
        longCourseCard.getByText("草稿", { exact: true }),
      ).toBeVisible();
      await expect(
        longCourseCard.getByText("完整長描述", { exact: false }),
      ).toBeVisible();
      await expect(
        studentPage.locator('ul[aria-label="我的課程列表"]').getByRole("link"),
      ).toHaveCount(0);
      await expect(
        studentPage
          .locator('ul[aria-label="我的課程列表"]')
          .getByRole("button"),
      ).toHaveCount(0);
      await assertNoHorizontalOverflow(studentPage, "mobile 我的課程");

      await expect(
        studentPage.locator(`time[dateTime="${longCourse.enrolledAt}"]`),
      ).toHaveCount(1);
      await expect(
        studentPage.getByText(longCourse.name, { exact: true }),
      ).toBeVisible();

      await studentPage.reload();
      await expect(
        studentPage.getByText(longCourse.name, { exact: true }),
      ).toBeVisible();

      const pageTwoUrl = `${apiBase}/me/courses?page=2&pageSize=20`;
      const nextButton = studentPage.getByRole("button", { name: "下一頁" });
      await nextButton.focus();
      await expect(nextButton).toBeFocused();
      await nextButton.press("Enter");
      await expect(
        studentPage
          .getByRole("navigation", { name: "我的課程分頁" })
          .locator("p"),
      ).toHaveText("第 2 / 2 頁，共 21 門課程");
      const pageTwo = await fetchMyCoursesPage(
        studentContext.request,
        pageTwoUrl,
        "second /me/courses page",
      );
      expect(pageTwo.meta).toEqual({
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      });
      await assertServerOrdering([...firstPage.data, ...pageTwo.data]);
      await expect(
        studentPage
          .getByRole("navigation", { name: "我的課程分頁" })
          .locator("p"),
      ).toHaveText("第 2 / 2 頁，共 21 門課程");
      const pageTwoNames = await studentPage
        .locator('ul[aria-label="我的課程列表"] h2')
        .allTextContents();
      expect(pageTwoNames).toEqual(pageTwo.data.map((course) => course.name));
      await expect(
        studentPage.getByRole("button", { name: "下一頁" }),
      ).toBeDisabled();
      await expect(
        studentPage.getByRole("button", { name: "上一頁" }),
      ).toBeEnabled();

      const previousButton = studentPage.getByRole("button", {
        name: "上一頁",
      });
      await previousButton.focus();
      await expect(previousButton).toBeFocused();
      await previousButton.press("Enter");
      await expect(
        studentPage
          .getByRole("navigation", { name: "我的課程分頁" })
          .locator("p"),
      ).toHaveText("第 1 / 2 頁，共 21 門課程");
      await expect(
        studentPage
          .getByRole("navigation", { name: "我的課程分頁" })
          .locator("p"),
      ).toHaveText("第 1 / 2 頁，共 21 門課程");
      await expect(
        studentPage.getByRole("button", { name: "上一頁" }),
      ).toBeDisabled();
      await assertNoHorizontalOverflow(
        studentPage,
        "mobile paginated 我的課程",
      );

      await archiveCourse(adminContext.request, adminContext, longCourse.id);
      archivedCourseIds.add(longCourse.id);
      await studentPage.reload();
      await expect(
        studentPage.getByText(longCourse.name, { exact: true }),
      ).toBeVisible();
      await expect(
        studentPage.getByText("已封存", { exact: true }),
      ).toBeVisible();

      await studentPage.setViewportSize({ width: 1280, height: 800 });
      await studentPage.reload();
      await expect(
        studentPage.getByRole("navigation", { name: "我的課程分頁" }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(studentPage, "desktop 我的課程");

      await studentPage.setViewportSize({ width: 390, height: 844 });
      await removeEnrollment(
        adminContext.request,
        adminContext,
        longCourse.id,
        student.id,
      );
      enrolledCourseIds.delete(longCourse.id);
      await studentPage.reload();
      const removedPage = await fetchMyCoursesPage(
        studentContext.request,
        firstPageUrl,
        "post-removal /me/courses page",
      );
      const remainingCourse = removedPage.data.find(
        (course) => course.id !== longCourse.id,
      );
      if (!remainingCourse) {
        throw new Error("post-removal roster did not retain a course");
      }
      await expect(
        studentPage.getByText(remainingCourse.name, { exact: true }),
      ).toBeVisible();
      await expect(
        studentPage.getByText(longCourse.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        studentPage.getByText("已封存", { exact: true }),
      ).toHaveCount(0);

      for (const courseId of [...enrolledCourseIds]) {
        await removeEnrollment(
          adminContext.request,
          adminContext,
          courseId,
          student.id,
        );
        enrolledCourseIds.delete(courseId);
      }
      await studentPage.reload();
      const emptyPage = await fetchMyCoursesPage(
        studentContext.request,
        firstPageUrl,
        "empty /me/courses page",
      );
      expect(emptyPage.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
      await expect(
        studentPage.getByText(
          "尚未加選任何課程。加選由老師或管理員操作，請聯絡你的授課老師。",
        ),
      ).toBeVisible();
      await expect(
        studentPage.getByRole("navigation", { name: "我的課程分頁" }),
      ).toHaveCount(0);
      await expect(
        studentPage.locator('ul[aria-label="我的課程列表"]'),
      ).toHaveCount(0);
    } catch (error) {
      primaryError = error;
    } finally {
      if (adminContext) {
        const reconciliationFailures = await reconcileCourseAttempts(
          adminContext.request,
          pendingAttempts,
          createdCourseIds,
        );
        cleanupErrors.push(...reconciliationFailures);

        if (studentAccountId) {
          for (const courseId of [...enrolledCourseIds]) {
            try {
              await removeEnrollment(
                adminContext.request,
                adminContext,
                courseId,
                studentAccountId,
              );
              enrolledCourseIds.delete(courseId);
            } catch {
              cleanupErrors.push(`remove enrollment ${courseId}`);
            }
          }
        } else if (enrolledCourseIds.size > 0) {
          cleanupErrors.push(
            "remove enrollments without verified student UUID",
          );
        }
        if (studentCreateAttempted && !studentAccountId) {
          cleanupErrors.push("student account UUID not verified");
        }

        for (const courseId of createdCourseIds) {
          if (archivedCourseIds.has(courseId)) continue;
          try {
            await archiveCourse(adminContext.request, adminContext, courseId);
            archivedCourseIds.add(courseId);
          } catch {
            cleanupErrors.push(`archive Course ${courseId}`);
          }
        }
      } else if (
        pendingAttempts.size > 0 ||
        createdCourseIds.size > 0 ||
        studentCreateAttempted
      ) {
        cleanupErrors.push(
          "cleanup unavailable without verified admin context",
        );
      }

      if (studentLoggedIn && studentContext) {
        try {
          await logoutContext(studentContext.request, studentContext);
        } catch {
          cleanupErrors.push("student logout");
        }
      }
      if (studentAccountId && adminLoggedIn && adminContext) {
        try {
          await disableAccount(
            adminContext.request,
            adminContext,
            studentAccountId,
            adminPassword,
          );
        } catch {
          cleanupErrors.push("disable student account");
        }
      } else if (studentAccountId) {
        cleanupErrors.push(
          "disable student account without verified admin session",
        );
      }
      if (adminLoggedIn && adminContext) {
        try {
          await logoutContext(adminContext.request, adminContext);
        } catch {
          cleanupErrors.push("admin logout");
        }
      }
      if (studentContext) {
        try {
          await studentContext.close();
        } catch {
          cleanupErrors.push("close student context");
        }
      }
      if (adminContext) {
        try {
          await adminContext.close();
        } catch {
          cleanupErrors.push("close admin context");
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
      throw new Error(`FE-1.3 cleanup failed: ${cleanupErrors.join(", ")}`);
    }
  });
});
