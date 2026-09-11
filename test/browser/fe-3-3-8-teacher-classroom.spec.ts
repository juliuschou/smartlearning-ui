import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "playwright/test";
import {
  archiveCourse,
  assertFixturePreflight,
  assertMutationHeaders,
  assertNoHorizontalOverflow,
  browserApiBase,
  closeQuestion,
  closeSession,
  createAccount,
  createCleanupLedger,
  createCourse,
  createLiveSession,
  createQuestion,
  csrfToken,
  disableAccount,
  enrollStudent,
  fixture,
  loginViaRequest,
  newActor,
  startSession,
} from "./support/fe5-real-backend-fixture";

const TOTAL_TIMEOUT_MS = 180_000;
const SCENARIO_BUDGET_MS = 145_000;
const OPERATION_TIMEOUT_MS = 10_000;
const CLEANUP_TIMEOUT_MS = 5_000;

test.use({ trace: "retain-on-failure" });

test.describe("FE-3.3.8 teacher classroom real-backend acceptance", () => {
  test.describe.configure({ mode: "serial" });

  test("covers teacher classroom lifecycle, realtime counts, results, and responsive deep links", async ({
    browser,
  }) => {
    test.setTimeout(TOTAL_TIMEOUT_MS);
    const scenarioDeadline = Date.now() + SCENARIO_BUDGET_MS;
    const runTag = randomUUID().slice(0, 8);
    const studentUsername = `fe338_student_${runTag}`;
    const studentTempPassword = `FE338-student-${randomUUID()}`;
    const studentPassword = `FE338-student-final-${randomUUID()}`;
    const usesFixtureTeacher = Boolean(fixture.teacherUsername);
    const teacherUsername = usesFixtureTeacher
      ? fixture.teacherUsername
      : `fe338_teacher_${runTag}`;
    const teacherTempPassword = usesFixtureTeacher
      ? fixture.teacherPassword
      : `FE338-teacher-${randomUUID()}`;
    const teacherPassword = usesFixtureTeacher
      ? fixture.teacherPassword
      : `FE338-teacher-final-${randomUUID()}`;
    const createdAccounts: string[] = [];
    const createdCourses = new Set<string>();
    const cleanup = createCleanupLedger();
    let primaryError: unknown = null;
    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let teacherPage: Page | null = null;
    let studentPage: Page | null = null;
    let courseId = "";
    let sessionId = "";
    let pollQuestionId = "";
    let pollSessionQuestionId = "";
    let quizSessionQuestionId = "";
    let primarySessionStarted = false;
    let primarySessionClosed = false;
    let cancelSessionId = "";
    let cancelSessionCancelled = false;

    function assertScenarioBudget(label: string) {
      const remainingMs = scenarioDeadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(
          `FE-3.3.8 scenario budget exhausted before ${label}; cleanup reserve preserved`,
        );
      }
    }

    async function refreshTeacherUntil(
      page: Page,
      text: string,
      label: string,
    ) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        assertScenarioBudget(label);
        try {
          await expect(page.getByText(text, { exact: true })).toBeVisible({
            timeout: 3_000,
          });
          return;
        } catch {
          if (attempt === 5) {
            throw new Error(
              `FE-3.3.8 ${label} not visible after ${attempt} refreshes`,
            );
          }
          await page.reload({
            waitUntil: "domcontentloaded",
            timeout: OPERATION_TIMEOUT_MS,
          });
        }
      }
    }

    async function refreshTeacherUntilCounts(
      page: Page,
      context: BrowserContext,
      liveSessionId: string,
    ) {
      let lastStatus = 0;
      let lastJoinedCount = 0;
      let lastVotedCount = 0;
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        assertScenarioBudget("teacher count convergence");
        const detail = await context.request.get(
          `${fixture.apiBase}/live-sessions/${liveSessionId}`,
          { timeout: OPERATION_TIMEOUT_MS },
        );
        lastStatus = detail.status();
        if (lastStatus === 200) {
          const body = (await detail.json()) as {
            data?: { joinedCount?: number; votedCount?: number };
          };
          lastJoinedCount = body.data?.joinedCount ?? 0;
          lastVotedCount = body.data?.votedCount ?? 0;
          if (lastJoinedCount === 1 && lastVotedCount === 1) {
            await page.reload({
              waitUntil: "domcontentloaded",
              timeout: OPERATION_TIMEOUT_MS,
            });
            const counts = page.locator("dl dd");
            await expect(counts.nth(0)).toHaveText("1", {
              timeout: OPERATION_TIMEOUT_MS,
            });
            await expect(counts.nth(1)).toHaveText("1", {
              timeout: OPERATION_TIMEOUT_MS,
            });
            return;
          }
        }
        if (attempt < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      }
      throw new Error(
        `FE-3.3.8 backend counts did not converge to 1/1; last status=${lastStatus}, joined=${lastJoinedCount}, voted=${lastVotedCount}`,
      );
    }

    async function changePassword(
      page: Page,
      current: string,
      next: string,
      destination: RegExp,
    ) {
      await expect(page).toHaveURL(/\/settings\/password$/, {
        timeout: OPERATION_TIMEOUT_MS,
      });
      await page.getByLabel("目前密碼").fill(current);
      await page.getByLabel("新密碼", { exact: true }).fill(next);
      await page.getByLabel("確認新密碼", { exact: true }).fill(next);
      await Promise.all([
        page.waitForURL(destination, { timeout: OPERATION_TIMEOUT_MS }),
        page.getByRole("button", { name: "變更密碼" }).click(),
      ]);
    }

    async function boundedCleanup(label: string, action: () => Promise<void>) {
      await cleanup.attempt(label, async () => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            action(),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error(`${label} timed out`)),
                CLEANUP_TIMEOUT_MS,
              );
            }),
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      });
    }

    async function cancelWaitingSession(
      context: BrowserContext,
      liveSessionId: string,
    ) {
      const detail = await context.request.get(
        `${fixture.apiBase}/live-sessions/${liveSessionId}`,
        { timeout: CLEANUP_TIMEOUT_MS },
      );
      if (detail.status() !== 200) {
        throw new Error(`session status lookup returned ${detail.status()}`);
      }
      const body = (await detail.json()) as { data?: { status?: string } };
      const status = body.data?.status;
      if (status === "closed" || status === "cancelled") return;
      if (status !== "waiting") {
        throw new Error(`cannot cleanup session in state ${String(status)}`);
      }
      const response = await context.request.post(
        `${fixture.apiBase}/live-sessions/${liveSessionId}/cancel`,
        {
          headers: {
            Origin: fixture.uiOrigin,
            "X-CSRF-Token": await csrfToken(context),
          },
          timeout: CLEANUP_TIMEOUT_MS,
        },
      );
      if (response.status() !== 201) {
        throw new Error(`session cancel returned ${response.status()}`);
      }
    }

    try {
      await test.step("fixture preflight and actor setup", async () => {
        assertFixturePreflight();
        if (
          Boolean(fixture.teacherUsername) !== Boolean(fixture.teacherPassword)
        ) {
          throw new Error(
            "FE-3.3.8 fixture teacher username and password must be provided together",
          );
        }
        adminContext = await newActor(browser);
        teacherContext = await newActor(browser);
        studentContext = await newActor(browser);
        teacherPage = await teacherContext.newPage();
        studentPage = await studentContext.newPage();
        await studentPage.setViewportSize({ width: 390, height: 844 });
      });

      await test.step("provision teacher, student, and course", async () => {
        assertScenarioBudget("provisioning");
        if (
          !adminContext ||
          !teacherContext ||
          !studentContext ||
          !teacherPage ||
          !studentPage
        ) {
          throw new Error("FE-3.3.8 actor setup incomplete");
        }
        const adminPage = await adminContext.newPage();
        await loginViaRequest(
          adminContext,
          fixture.adminUsername,
          fixture.adminPassword,
        );
        await adminPage.goto("/admin", {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        const student = await createAccount(
          adminContext.request,
          adminContext,
          studentUsername,
          `FE338 Student ${runTag}`,
          "student",
          studentTempPassword,
        );
        createdAccounts.push(student.id);
        if (!usesFixtureTeacher) {
          const teacher = await createAccount(
            adminContext.request,
            adminContext,
            teacherUsername,
            `FE338 Teacher ${runTag}`,
            "teacher",
            teacherTempPassword,
          );
          createdAccounts.push(teacher.id);
        }

        await loginViaRequest(
          teacherContext,
          teacherUsername,
          teacherTempPassword,
        );
        await teacherPage.goto("/teacher", {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        if (!usesFixtureTeacher) {
          await teacherPage.goto("/settings/password", {
            waitUntil: "domcontentloaded",
            timeout: OPERATION_TIMEOUT_MS,
          });
          await changePassword(
            teacherPage,
            teacherTempPassword,
            teacherPassword,
            /\/teacher$/,
          );
        }
        const course = await createCourse(
          teacherContext.request,
          teacherContext,
          `${fixture.courseNamePrefix} ${runTag}`,
          `FE-3.3.8 teacher classroom ${runTag}`,
        );
        courseId = course.id;
        createdCourses.add(course.id);

        await enrollStudent(
          adminContext.request,
          adminContext,
          course.id,
          student.id,
        );
        await loginViaRequest(
          studentContext,
          studentUsername,
          studentTempPassword,
        );
        await studentPage.goto("/settings/password", {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await changePassword(
          studentPage,
          studentTempPassword,
          studentPassword,
          /\/student$/,
        );
      });

      await test.step("create and start primary session", async () => {
        assertScenarioBudget("primary session setup");
        if (!teacherContext || !teacherPage || !courseId) {
          throw new Error("FE-3.3.8 primary session prerequisites missing");
        }
        const poll = await createQuestion(
          teacherContext.request,
          teacherContext,
          courseId,
          "poll-single",
          `FE338 Poll ${runTag}`,
        );
        pollQuestionId = poll.id;
        const quiz = await createQuestion(
          teacherContext.request,
          teacherContext,
          courseId,
          "quiz",
          `FE338 Quiz ${runTag}`,
        );
        const session = await createLiveSession(
          teacherContext.request,
          teacherContext,
          courseId,
          [poll.id, quiz.id],
        );
        sessionId = session.id;
        const started = await startSession(
          teacherContext.request,
          teacherContext,
          session.id,
        );
        primarySessionStarted = true;
        pollSessionQuestionId = started.firstQuestionId ?? "";
        const detailResponse = await teacherContext.request.get(
          `${fixture.apiBase}/live-sessions/${session.id}`,
          { timeout: OPERATION_TIMEOUT_MS },
        );
        expect(detailResponse.status(), "teacher session detail status").toBe(
          200,
        );
        const detailBody = (await detailResponse.json()) as {
          data?: { sessionQuestions?: Array<{ id?: string }> };
        };
        const sessionQuestionIds =
          detailBody.data?.sessionQuestions?.map(
            (question) => question.id ?? "",
          ) ?? [];
        if (!pollSessionQuestionId || sessionQuestionIds.length !== 2) {
          throw new Error("FE-3.3.8 session question identities missing");
        }
        quizSessionQuestionId =
          sessionQuestionIds.find((id) => id !== pollSessionQuestionId) ?? "";
        if (!quizSessionQuestionId) {
          throw new Error("FE-3.3.8 quiz session question identity missing");
        }

        await teacherPage.goto(`/teacher/live/${session.id}`, {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(
          teacherPage.getByRole("heading", { name: "進行中" }),
        ).toBeVisible({ timeout: OPERATION_TIMEOUT_MS });
        await expect(
          teacherPage.getByText(new RegExp(`課堂代碼 ${session.sessionCode}`)),
        ).toBeVisible({ timeout: OPERATION_TIMEOUT_MS });
        await expect(
          teacherPage.getByRole("button", { name: "開放作答" }),
        ).toHaveCount(2, { timeout: OPERATION_TIMEOUT_MS });
      });

      let teacherCsrf = "";
      let studentCsrf = "";
      await test.step("student joins and submits poll", async () => {
        assertScenarioBudget("poll submission");
        if (
          !teacherContext ||
          !teacherPage ||
          !studentContext ||
          !studentPage
        ) {
          throw new Error("FE-3.3.8 poll actor missing");
        }
        teacherCsrf = await csrfToken(teacherContext);
        studentCsrf = await csrfToken(studentContext);
        await teacherPage
          .getByRole("button", { name: "開放作答" })
          .first()
          .click();
        await studentPage.goto("/student", {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await Promise.all([
          studentPage.waitForURL(new RegExp(`/student/live/${sessionId}$`), {
            timeout: OPERATION_TIMEOUT_MS,
          }),
          studentPage.getByRole("button", { name: "進入課堂" }).click(),
        ]);
        await expect(studentPage.getByRole("radio")).toHaveCount(2, {
          timeout: OPERATION_TIMEOUT_MS,
        });
        await studentPage.getByRole("radio").first().check();
        const [request] = await Promise.all([
          studentPage.waitForRequest(
            (value) =>
              value.method() === "POST" &&
              value.url() ===
                `${browserApiBase}/live-sessions/${sessionId}/submissions`,
            { timeout: OPERATION_TIMEOUT_MS },
          ),
          studentPage.getByRole("button", { name: "送出答案" }).click(),
        ]);
        await assertMutationHeaders(
          request,
          studentCsrf,
          "FE-3.3.8 poll submission",
        );
        await expect(studentPage.getByText("你已作答。")).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
      });

      await test.step("teacher observes counts and closes poll", async () => {
        assertScenarioBudget("teacher poll result");
        if (!teacherContext || !teacherPage) {
          throw new Error("FE-3.3.8 teacher actor missing");
        }
        await refreshTeacherUntilCounts(teacherPage, teacherContext, sessionId);
        await expect(teacherPage.getByText("作答結果")).toHaveCount(0);
        const [request] = await Promise.all([
          teacherPage.waitForRequest(
            (value) =>
              value.method() === "POST" &&
              value
                .url()
                .endsWith(
                  `/live-sessions/${sessionId}/questions/${pollSessionQuestionId}/close`,
                ),
            { timeout: OPERATION_TIMEOUT_MS },
          ),
          teacherPage.getByRole("button", { name: "關閉作答" }).click(),
        ]);
        await assertMutationHeaders(
          request,
          teacherCsrf,
          "FE-3.3.8 close poll",
        );
        await expect(teacherPage.getByText("作答結果")).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
      });

      await test.step("student submits quiz and teacher closes question", async () => {
        assertScenarioBudget("quiz result");
        if (!teacherContext || !teacherPage || !studentPage) {
          throw new Error("FE-3.3.8 quiz actor missing");
        }
        await teacherPage.getByRole("button", { name: "開放作答" }).click();
        await refreshTeacherUntil(teacherPage, `FE338 Quiz ${runTag}`, "quiz");
        await studentPage.reload({
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(studentPage.getByRole("checkbox")).toHaveCount(2, {
          timeout: OPERATION_TIMEOUT_MS,
        });
        await studentPage.getByRole("checkbox").first().check();
        const [request] = await Promise.all([
          studentPage.waitForRequest(
            (value) =>
              value.method() === "POST" &&
              value.url() ===
                `${browserApiBase}/live-sessions/${sessionId}/submissions`,
            { timeout: OPERATION_TIMEOUT_MS },
          ),
          studentPage.getByRole("button", { name: "送出答案" }).click(),
        ]);
        await assertMutationHeaders(
          request,
          studentCsrf,
          "FE-3.3.8 quiz submission",
        );
        await closeQuestion(
          teacherContext.request,
          teacherContext,
          sessionId,
          quizSessionQuestionId,
        );
        await teacherPage.reload({
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(teacherPage.getByText("正解")).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
      });

      await test.step("teacher closes primary session", async () => {
        assertScenarioBudget("primary session close");
        if (!teacherPage) throw new Error("FE-3.3.8 teacher page missing");
        await teacherPage.getByRole("button", { name: "結束課堂" }).click();
        const [request] = await Promise.all([
          teacherPage.waitForRequest(
            (value) =>
              value.method() === "POST" &&
              value.url().endsWith(`/live-sessions/${sessionId}/close`),
            { timeout: OPERATION_TIMEOUT_MS },
          ),
          teacherPage.getByRole("button", { name: "確認結束" }).click(),
        ]);
        await assertMutationHeaders(
          request,
          teacherCsrf,
          "FE-3.3.8 close session",
        );
        await expect(
          teacherPage.getByRole("heading", { name: "已結束" }),
        ).toBeVisible({ timeout: OPERATION_TIMEOUT_MS });
        primarySessionClosed = true;
      });

      await test.step("teacher cancels waiting session", async () => {
        assertScenarioBudget("secondary session cancellation");
        if (!teacherContext || !teacherPage || !courseId) {
          throw new Error("FE-3.3.8 cancellation prerequisites missing");
        }
        const second = await createLiveSession(
          teacherContext.request,
          teacherContext,
          courseId,
          [pollQuestionId],
        );
        cancelSessionId = second.id;
        await teacherPage.goto(`/teacher/live/${second.id}`, {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await teacherPage.getByRole("button", { name: "取消課堂" }).click();
        const [request] = await Promise.all([
          teacherPage.waitForRequest(
            (value) =>
              value.method() === "POST" &&
              value.url().endsWith(`/live-sessions/${second.id}/cancel`),
            { timeout: OPERATION_TIMEOUT_MS },
          ),
          teacherPage.getByRole("button", { name: "確認取消" }).click(),
        ]);
        await assertMutationHeaders(
          request,
          teacherCsrf,
          "FE-3.3.8 cancel session",
        );
        await expect(
          teacherPage.getByRole("heading", { name: "已取消" }),
        ).toBeVisible({ timeout: OPERATION_TIMEOUT_MS });
        cancelSessionCancelled = true;
      });

      await test.step("missing-session responsive deep link", async () => {
        assertScenarioBudget("negative responsive check");
        if (!teacherPage) throw new Error("FE-3.3.8 teacher page missing");
        await teacherPage.goto(`/teacher/live/${randomUUID()}`, {
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(
          teacherPage.getByRole("heading", { name: "找不到這堂課" }),
        ).toBeVisible({ timeout: OPERATION_TIMEOUT_MS });
        await assertNoHorizontalOverflow(teacherPage);
        await teacherPage.setViewportSize({ width: 1280, height: 800 });
        await teacherPage.reload({
          waitUntil: "domcontentloaded",
          timeout: OPERATION_TIMEOUT_MS,
        });
        await assertNoHorizontalOverflow(teacherPage);
      });
    } catch (error) {
      primaryError = error;
    } finally {
      if (
        teacherContext &&
        sessionId &&
        primarySessionStarted &&
        !primarySessionClosed
      ) {
        await boundedCleanup("close primary session", () =>
          closeSession(teacherContext!.request, teacherContext!, sessionId),
        );
      }
      if (teacherContext && cancelSessionId && !cancelSessionCancelled) {
        await boundedCleanup("cancel waiting session", () =>
          cancelWaitingSession(teacherContext!, cancelSessionId),
        );
      }
      if (teacherContext) {
        for (const id of createdCourses) {
          await boundedCleanup(`archive course ${id}`, () =>
            archiveCourse(teacherContext!.request, teacherContext!, id),
          );
        }
      }
      if (adminContext) {
        for (const accountId of createdAccounts) {
          await boundedCleanup(`disable account ${accountId}`, () =>
            disableAccount(adminContext!.request, adminContext!, accountId),
          );
        }
      }
      const contexts: Array<[string, BrowserContext | null]> = [
        ["student", studentContext],
        ["teacher", teacherContext],
        ["admin", adminContext],
      ];
      for (const [name, context] of contexts) {
        if (context) {
          await boundedCleanup(`close ${name} browser context`, () =>
            context.close(),
          );
        }
      }
    }

    if (primaryError) {
      if (cleanup.errors.length > 0 && primaryError instanceof Error) {
        throw new Error(
          `${primaryError.message}; cleanup failed: ${cleanup.errors.join(" | ")}`,
          { cause: primaryError },
        );
      }
      throw primaryError;
    }
    if (cleanup.errors.length > 0) {
      throw new Error(`FE-3.3.8 cleanup failed: ${cleanup.errors.join(" | ")}`);
    }
  });
});
