import { test, expect } from "playwright/test";

const apiBase = process.env.F16_API_BASE ?? "http://localhost:3000/api/v1";
const uiOrigin = process.env.F16_UI_ORIGIN ?? "http://localhost:3001";
const adminUsername = process.env.F16_ADMIN_USERNAME;
const adminPassword = process.env.F16_ADMIN_PASSWORD;
const targetAccountId = process.env.F16_TARGET_ACCOUNT_ID;
const targetUsername = process.env.F16_TARGET_USERNAME;
const targetPassword = process.env.F16_TARGET_PASSWORD;
const courseNamePrefix = process.env.F16_COURSE_NAME_PREFIX ?? "US-F16 browser";

const hasFixture = Boolean(
  adminUsername &&
  adminPassword &&
  targetAccountId &&
  targetUsername &&
  targetPassword,
);

async function csrfToken(context: {
  storageState: () => Promise<{
    cookies: Array<{ name: string; value: string }>;
  }>;
}) {
  const cookie = (await context.storageState()).cookies.find(
    (item) => item.name === "__Host-csrf",
  );
  if (!cookie) throw new Error("F16 fixture login did not set __Host-csrf");
  return cookie.value;
}

async function courseIds(context: {
  get: (url: string) => Promise<{
    status: () => number;
    json: () => Promise<unknown>;
  }>;
}) {
  const response = await context.get(`${apiBase}/courses`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    data: { data: Array<{ id: string }> };
  };
  return body.data.data.map((course) => course.id);
}

test.describe("US-F16 account course-creation permission", () => {
  test("admin toggles the server permission and course creation follows it", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      !hasFixture,
      "Set F16_ADMIN_USERNAME, F16_ADMIN_PASSWORD, F16_TARGET_ACCOUNT_ID, F16_TARGET_USERNAME, and F16_TARGET_PASSWORD for the real-backend fixture.",
    );

    const accountPath = `/admin/accounts/${targetAccountId}`;
    let adminLoggedIn = false;
    let teacherLoggedIn = false;
    let initialPermission: boolean | null = null;
    let enabledCourseId: string | null = null;

    await page.goto(`/login?next=${encodeURIComponent(accountPath)}`);
    await page.getByLabel("帳號").fill(adminUsername!);
    await page.getByLabel("密碼").fill(adminPassword!);
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL(new RegExp(`${accountPath}$`));
    adminLoggedIn = true;

    const permissionSwitch = page.getByRole("switch", {
      name: "允許建立課程",
    });
    await expect(permissionSwitch).toBeVisible();
    await expect(permissionSwitch).toHaveAttribute("role", "switch");
    await permissionSwitch.focus();
    await expect(permissionSwitch).toBeFocused();
    initialPermission = await permissionSwitch.isChecked();
    await expect(permissionSwitch).toHaveAttribute(
      "aria-checked",
      String(initialPermission),
    );

    try {
      // Normalize the fixture to enabled for the first revoke assertion while
      // remembering the original value for cleanup.
      if (!initialPermission) {
        await permissionSwitch.press("Space");
        await expect(permissionSwitch).toBeChecked();
      }

      const login = await request.post(`${apiBase}/auth/login`, {
        data: { username: targetUsername, password: targetPassword },
      });
      expect(login.status()).toBe(201);
      teacherLoggedIn = true;
      const csrf = await csrfToken(request);

      const beforeBlocked = await courseIds(request);
      await permissionSwitch.press("Space");
      await expect(permissionSwitch).not.toBeChecked();
      await expect(permissionSwitch).toHaveAttribute("aria-checked", "false");
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "允許建立課程" }),
      ).not.toBeChecked();

      const blockedCourse = await request.post(`${apiBase}/courses`, {
        headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
        data: {
          name: `${courseNamePrefix} blocked ${testInfo.workerIndex}`,
        },
      });
      expect(blockedCourse.status()).toBe(403);
      expect(await courseIds(request)).toEqual(beforeBlocked);

      await permissionSwitch.press("Space");
      await expect(permissionSwitch).toBeChecked();
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "允許建立課程" }),
      ).toBeChecked();

      const enabledCourse = await request.post(`${apiBase}/courses`, {
        headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
        data: {
          name: `${courseNamePrefix} enabled ${testInfo.workerIndex}`,
        },
      });
      expect(enabledCourse.status()).toBe(201);
      const enabledBody = (await enabledCourse.json()) as {
        data: { id: string };
      };
      enabledCourseId = enabledBody.data.id;
    } finally {
      // Archive the course created by this test; archive remains permitted even
      // when the account's course-creation permission is false.
      if (enabledCourseId && teacherLoggedIn) {
        const csrf = await csrfToken(request);
        const archived = await request.post(
          `${apiBase}/courses/${enabledCourseId}/archive`,
          { headers: { Origin: uiOrigin, "X-CSRF-Token": csrf } },
        );
        expect(archived.status()).toBe(201);
      }

      if (teacherLoggedIn) {
        const csrf = await csrfToken(request);
        const logout = await request.post(`${apiBase}/auth/logout`, {
          headers: { Origin: uiOrigin, "X-CSRF-Token": csrf },
        });
        expect(logout.status()).toBe(201);
      }

      if (initialPermission !== null) {
        const currentPermission = await permissionSwitch.isChecked();
        if (currentPermission !== initialPermission) {
          await permissionSwitch.press("Space");
          await expect(permissionSwitch).toBeChecked({
            checked: initialPermission,
          });
        }
      }

      if (adminLoggedIn) {
        const logoutButton = page.getByRole("button", { name: "登出" });
        if (await logoutButton.isVisible().catch(() => false)) {
          await logoutButton.click();
        }
      }
    }
  });
});
