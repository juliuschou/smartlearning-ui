import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "playwright/test";

const rawApiBase = process.env.FE22_API_BASE ?? "";
const rawUiOrigin = process.env.FE22_UI_ORIGIN ?? "";
const apiBase = normalizeApiBase(rawApiBase);
const uiOrigin = normalizeOrigin(rawUiOrigin);
const adminUsername = process.env.FE22_ADMIN_USERNAME ?? "";
const adminPassword = process.env.FE22_ADMIN_PASSWORD ?? "";
const teacherUsername = process.env.FE22_TEACHER_USERNAME ?? "";
const teacherPassword = process.env.FE22_TEACHER_PASSWORD ?? "";
const courseNamePrefix = process.env.FE22_COURSE_NAME_PREFIX ?? "";

const requiredFixtureNames = [
  "FE22_API_BASE",
  "FE22_UI_ORIGIN",
  "FE22_ADMIN_USERNAME",
  "FE22_ADMIN_PASSWORD",
  "FE22_TEACHER_USERNAME",
  "FE22_TEACHER_PASSWORD",
  "FE22_COURSE_NAME_PREFIX",
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
      `FE-2.2 real-backend fixture BLOCKED: missing ${missing.join(", ")}. ` +
        "Provision a disposable migrated backend and set all FE22_* variables; this acceptance never skips.",
    );
  }

  let api: URL;
  let ui: URL;
  try {
    api = new URL(rawApiBase);
    ui = new URL(rawUiOrigin);
  } catch {
    throw new Error(
      "FE-2.2 real-backend fixture BLOCKED: FE22_API_BASE and FE22_UI_ORIGIN must be valid absolute URLs.",
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
      "FE-2.2 real-backend fixture BLOCKED: use credential-free same-host UI/API URLs with API path /api/v1 and secure-cookie-compatible origin.",
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

async function csrfToken(context: BrowserContext) {
  const state = await context.storageState();
  const cookie = state.cookies.find((item) => item.name === "__Host-csrf");
  if (!cookie || cookie.value.length === 0) {
    throw new Error(
      "FE-2.2 context did not have a non-empty __Host-csrf cookie",
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
  await page.getByLabel("確認新密碼").fill(newPassword);
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

test.describe("FE-2.2 real-backend Teacher 名冊", () => {
  test("searches, enrolls, reactivates, removes, and enforces archived/permission states on an isolated course", async ({
    browser,
  }) => {
    assertFixturePreflight();

    const runTag = randomUUID().slice(0, 8);
    const adminUsernameTagged = adminUsername;
    const studentUsername = `fe22_student_${runTag}`;
    const studentDisplayName = `FE-2.2 Student ${runTag}`;
    const studentTempPassword = `FE22-temp-${randomUUID()}`;
    const studentPassword = `FE22-final-${randomUUID()}`;
    const createdCourseIds = new Set<string>();
    const cleanupErrors: string[] = [];
    let primaryError: unknown = null;
    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let adminPage: Page | null = null;
    let teacherPage: Page | null = null;
    let studentPage: Page | null = null;
    let createdAccountIds: string[] = [];
    let teacherCreatedViaFixture = false;
    let adminLoggedIn = false;
    let teacherLoggedIn = false;
    let studentLoggedIn = false;

    try {
      adminContext = await browser.newContext({ baseURL: uiOrigin });
      teacherContext = await browser.newContext({ baseURL: uiOrigin });
      studentContext = await browser.newContext({ baseURL: uiOrigin });
      adminPage = await adminContext.newPage();
      teacherPage = await teacherContext.newPage();
      studentPage = await studentContext.newPage();

      const healthOrigin = new URL(rawApiBase).origin;
      for (const path of ["/health/live", "/health/ready"]) {
        const health = await adminContext.request.get(`${healthOrigin}${path}`);
        expect(health.status(), `${path} status`).toBe(200);
      }

      // Admin provisions the student fixture account.
      await loginViaUi(
        adminPage,
        adminUsernameTagged,
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
      createdAccountIds = [student.id];

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
        teacherUsernameUsed = `fe22_teacher_${runTag}`;
        teacherPasswordUsed = `FE22-teacher-final-${randomUUID()}`;
        teacherTempPassword = `FE22-teacher-temp-${randomUUID()}`;
        const teacher = await createAccount(
          adminContext.request,
          adminCsrf,
          teacherUsernameUsed,
          `FE-2.2 Teacher ${runTag}`,
          "teacher",
          teacherTempPassword,
        );
        createdAccountIds.push(teacher.id);
        teacherCreatedViaFixture = true;
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
      const rosterCourse = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag} roster`,
        `FE-2.2 roster course ${runTag}`,
      );
      createdCourseIds.add(rosterCourse.id);
      const archivedCourse = await createCourse(
        teacherContext.request,
        teacherCsrf,
        `${courseNamePrefix} ${runTag} archived`,
        `FE-2.2 archived course ${runTag}`,
      );
      createdCourseIds.add(archivedCourse.id);

      // --- Roster section renders on the course detail page.
      await teacherPage.goto(`/courses/${rosterCourse.id}`);
      await expect(
        teacherPage.getByRole("heading", { name: "修課名冊" }),
      ).toBeVisible();
      await expect(teacherPage.getByText(/名冊目前沒有學生/)).toBeVisible();

      // --- Search needs at least 2 characters before issuing a request.
      const searchBox = teacherPage.getByLabel("搜尋學生");
      await searchBox.fill(studentUsername.slice(0, 1));
      await expect(
        teacherPage.getByText("請輸入至少 2 個字元。"),
      ).toBeVisible();

      await searchBox.fill(studentDisplayName);
      await expect(
        teacherPage.getByText(studentDisplayName, { exact: true }),
      ).toBeVisible();
      await expect(teacherPage.getByText(/未加選/)).toBeVisible();

      // --- Enroll: new enrollment success feedback.
      await teacherPage.getByRole("button", { name: "加入名冊" }).click();
      await expect(
        teacherPage.getByText(`已加入 ${studentDisplayName}。`),
      ).toBeVisible();
      await expect(
        teacherPage.getByRole("table", { name: "課程名冊" }),
      ).toBeVisible();
      await expect(teacherPage.getByText(/在學中/)).toBeVisible();

      // --- Duplicate add: the search projection refreshes to 已在名冊中.
      await searchBox.fill(studentUsername);
      await expect(teacherPage.getByText(/已在名冊中$/)).toBeVisible();
      await teacherPage.getByRole("button", { name: "再次加選" }).click();
      await expect(
        teacherPage.getByText(/已在名冊中，未重複新增/),
      ).toBeVisible();

      // --- Remove with confirmation; cancel first must not delete.
      const removeButton = teacherPage.getByRole("button", { name: "移除" });
      await removeButton.click();
      const dialog = teacherPage.getByRole("dialog", {
        name: "確認移除學生",
      });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(studentDisplayName);
      await teacherPage.getByRole("button", { name: "取消" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        teacherPage.getByRole("table", { name: "課程名冊" }),
      ).toBeVisible();

      await removeButton.click();
      await expect(dialog).toBeVisible();
      await teacherPage.getByRole("button", { name: "確認移除" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(teacherPage.getByText(/已移除/)).toBeVisible();
      await expect(
        teacherPage.getByRole("button", { name: "移除" }),
      ).toHaveCount(0);

      // --- Reactivation: search shows removed, add reactivates.
      await searchBox.fill(studentUsername);
      await expect(
        teacherPage.getByText(/先前已移除，可重新加選/),
      ).toBeVisible();
      await teacherPage.getByRole("button", { name: "重新加選" }).click();
      await expect(
        teacherPage.getByText(`已重新加選 ${studentDisplayName}。`),
      ).toBeVisible();
      await expect(teacherPage.getByText(/在學中/)).toBeVisible();

      // --- Keyboard: the remove dialog opens, Escape closes, focus returns.
      await teacherPage.getByRole("button", { name: "移除" }).click();
      await expect(dialog).toBeVisible();
      await teacherPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);

      // --- Archived course: enroll attempt shows the stable archived error.
      await archiveCourse(
        teacherContext.request,
        teacherContext,
        archivedCourse.id,
      );
      await teacherPage.goto(`/courses/${archivedCourse.id}`);
      await expect(
        teacherPage.getByRole("heading", { name: "修課名冊" }),
      ).toBeVisible();
      const archivedSearch = teacherPage.getByLabel("搜尋學生");
      await archivedSearch.fill(studentDisplayName);
      await expect(
        teacherPage.getByText(studentDisplayName, { exact: true }),
      ).toBeVisible();
      await teacherPage.getByRole("button", { name: "加入名冊" }).click();
      await expect(
        teacherPage.getByText("課程已封存，無法修改名冊。"),
      ).toBeVisible();

      // --- Student role: roster section must surface a stable 403 error.
      await studentContext.request.post(`${apiBase}/auth/login`, {
        headers: { Origin: uiOrigin },
        data: {
          username: studentUsername,
          password: studentTempPassword,
        },
      });
      studentLoggedIn = true;
      await studentPage.goto(
        `/login?next=${encodeURIComponent(`/courses/${rosterCourse.id}`)}`,
      );
      await studentPage.getByLabel("帳號").fill(studentUsername);
      await studentPage.getByLabel("密碼").fill(studentTempPassword);
      const studentLoginResponsePromise = studentPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === `${apiBase}/auth/login`,
      );
      await studentPage.getByRole("button", { name: "登入" }).click();
      const studentLoginResponse = await studentLoginResponsePromise;
      expect(studentLoginResponse.status()).toBe(201);
      studentLoggedIn = true;
      await studentPage.waitForURL(
        (url) => url.pathname === "/settings/password",
      );
      await changePasswordViaUi(
        studentPage,
        studentTempPassword,
        studentPassword,
        `/courses/${rosterCourse.id}`,
      );
      await expect(
        studentPage.getByText("你沒有權限執行此操作。"),
      ).toBeVisible();
    } catch (error) {
      primaryError = error;
    } finally {
      try {
        // Cleanup is admin-only (account disable); the teacher session cannot
        // disable accounts, so re-login the admin for finalization.
        adminContext = await browser.newContext({ baseURL: uiOrigin });
        adminPage = await adminContext.newPage();
        await loginViaUi(
          adminPage,
          adminUsernameTagged,
          adminPassword,
          "/admin",
          () => {
            adminLoggedIn = true;
          },
        );
        const adminCsrf = await csrfToken(adminContext);

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

        try {
          await logoutContext(adminContext.request, adminContext);
        } catch {
          cleanupErrors.push("admin logout");
        }
      } catch (cleanupLoginError) {
        if (createdAccountIds.length > 0 || createdCourseIds.size > 0) {
          cleanupErrors.push(
            `cleanup admin login failed: ${String(cleanupLoginError)}`,
          );
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
      for (const [name, context] of [
        ["admin", adminContext],
        ["teacher", teacherContext],
        ["student", studentContext],
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
      throw new Error(`FE-2.2 cleanup failed: ${cleanupErrors.join(", ")}`);
    }
  });
});
