import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "playwright/test";
import {
  archiveCourse,
  assertFixturePreflight,
  assertNoHorizontalOverflow,
  closeQuestion,
  closeSession,
  createAccount,
  createCleanupLedger,
  createCourse,
  createLiveSession,
  createQuestion,
  enrollStudent,
  fixture,
  loginViaRequest,
  loginViaUi,
  newActor,
  openQuestion,
  startSession,
} from "./support/fe5-real-backend-fixture";

test.describe("FE-5.4 real-backend four-question matrix", () => {
  test.describe.configure({ mode: "serial" });
  test("runs all four learner question types on Chromium at mobile and desktop widths", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    assertFixturePreflight();
    const runTag = randomUUID().slice(0, 8);
    const studentUsername = `fe54_student_${runTag}`;
    const studentTempPassword = `FE54-temp-${randomUUID()}`;
    const studentPassword = `FE54-final-${randomUUID()}`;
    const teacherUsername = fixture.teacherUsername || `fe54_teacher_${runTag}`;
    const teacherTempPassword = `FE54-teacher-temp-${randomUUID()}`;
    const teacherPassword =
      fixture.teacherPassword || `FE54-teacher-final-${randomUUID()}`;
    const createdAccounts: string[] = [];
    const createdCourses = new Set<string>();
    const cleanup = createCleanupLedger();
    let adminContext: BrowserContext | null = null;
    let teacherContext: BrowserContext | null = null;
    let studentContext: BrowserContext | null = null;
    let teacherPage: Page | null = null;
    let studentPage: Page | null = null;
    let sessionId = "";
    let questionIds: string[] = [];

    async function changePassword(
      page: Page,
      current: string,
      next: string,
      destination: string,
    ) {
      await expect(page).toHaveURL(/\/settings\/password$/);
      await page.getByLabel("目前密碼").fill(current);
      await page.getByLabel("新密碼", { exact: true }).fill(next);
      await page.getByLabel("確認新密碼", { exact: true }).fill(next);
      await page.getByRole("button", { name: "變更密碼" }).click();
      await expect(page).toHaveURL(
        new RegExp(`${destination.replace("/", "\\/")}$`),
      );
    }

    async function refreshUntilQuestionVisible(
      page: Page,
      prompt: string,
      label: string,
    ) {
      const refresh = page.getByRole("button", { name: "更新課堂狀態" });
      const question = page.getByText(prompt);
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await refresh.click();
        try {
          await expect(question).toBeVisible({ timeout: 3_000 });
          return;
        } catch {
          if (attempt === 5)
            throw new Error(
              `FE-5.4 ${label} did not become visible after ${attempt} refreshes`,
            );
        }
      }
    }

    try {
      adminContext = await newActor(browser);
      teacherContext = await newActor(browser);
      studentContext = await newActor(browser);
      teacherPage = await teacherContext.newPage();
      studentPage = await studentContext.newPage();
      const adminPage = await adminContext.newPage();
      await loginViaUi(
        adminPage,
        fixture.adminUsername,
        fixture.adminPassword,
        "/admin",
      );
      const student = await createAccount(
        adminContext.request,
        adminContext,
        studentUsername,
        `FE54 Student ${runTag}`,
        "student",
        studentTempPassword,
      );
      createdAccounts.push(student.id);
      if (!fixture.teacherUsername) {
        const teacher = await createAccount(
          adminContext.request,
          adminContext,
          teacherUsername,
          `FE54 Teacher ${runTag}`,
          "teacher",
          teacherTempPassword,
        );
        createdAccounts.push(teacher.id);
      }
      await loginViaRequest(
        teacherContext,
        teacherUsername,
        fixture.teacherUsername ? teacherPassword : teacherTempPassword,
      );
      if (!fixture.teacherUsername) {
        await teacherPage.goto("/settings/password", {
          waitUntil: "domcontentloaded",
        });
        await changePassword(
          teacherPage,
          teacherTempPassword,
          teacherPassword,
          "/teacher",
        );
      } else
        await teacherPage.goto("/teacher", { waitUntil: "domcontentloaded" });
      const course = await createCourse(
        teacherContext.request,
        teacherContext,
        `${fixture.courseNamePrefix} ${runTag}`,
        `FE-5.4 matrix ${runTag}`,
      );
      createdCourses.add(course.id);
      const questions = [];
      for (const [kind, prompt] of [
        ["poll-single", `FE54 Poll single ${runTag}`],
        ["poll-multiple", `FE54 Poll multiple ${runTag}`],
        ["quiz", `FE54 Quiz ${runTag}`],
        ["open-text", `FE54 Open text ${runTag}`],
      ] as const) {
        questions.push(
          await createQuestion(
            teacherContext.request,
            teacherContext,
            course.id,
            kind,
            prompt,
          ),
        );
      }
      questionIds = questions.map((question) => question.id);
      const session = await createLiveSession(
        teacherContext.request,
        teacherContext,
        course.id,
        questionIds,
      );
      sessionId = session.id;
      await enrollStudent(
        adminContext.request,
        adminContext,
        course.id,
        student.id,
      );
      await adminContext.close();
      adminContext = null;
      await loginViaRequest(
        studentContext,
        studentUsername,
        studentTempPassword,
      );
      await studentPage.goto("/settings/password", {
        waitUntil: "domcontentloaded",
      });
      await changePassword(
        studentPage,
        studentTempPassword,
        studentPassword,
        "/student",
      );
      await studentPage.getByRole("button", { name: "等候中課堂入口" }).click();
      await expect(studentPage).toHaveURL(
        new RegExp(`/student/live/${session.id}$`),
      );
      const started = await startSession(
        teacherContext.request,
        teacherContext,
        session.id,
      );
      const sessionQuestionIds = questionIds.map((_, index) =>
        index === 0 ? started.firstQuestionId : null,
      );
      if (!sessionQuestionIds[0])
        throw new Error("FE-5.4 first session question missing");
      const detail = await teacherContext.request.get(
        `${fixture.apiBase}/live-sessions/${session.id}`,
      );
      const detailData = (
        (await detail.json()) as {
          data: { sessionQuestions: Array<{ id: string }> };
        }
      ).data;
      const orderedSessionQuestionIds = detailData.sessionQuestions.map(
        (question) => question.id,
      );

      for (
        let index = 0;
        index < orderedSessionQuestionIds.length;
        index += 1
      ) {
        const sessionQuestionId = orderedSessionQuestionIds[index];
        await openQuestion(
          teacherContext.request,
          teacherContext,
          session.id,
          sessionQuestionId,
        );
        await refreshUntilQuestionVisible(
          studentPage,
          `FE54 ${["Poll single", "Poll multiple", "Quiz", "Open text"][index]} ${runTag}`,
          `question ${index + 1} (${sessionQuestionId})`,
        );
        if (index === 0) {
          const radios = studentPage.getByRole("radio");
          await expect(radios).toHaveCount(2);
          await radios.nth(0).focus();
          await studentPage.keyboard.press("Space");
          await studentPage
            .getByRole("button", { name: "送出答案" })
            .press("Enter");
        } else if (index === 1 || index === 2) {
          const boxes = studentPage.getByRole("checkbox");
          await expect(boxes).toHaveCount(2);
          await boxes.nth(0).focus();
          await studentPage.keyboard.press("Space");
          await studentPage
            .getByRole("button", { name: "送出答案" })
            .press("Enter");
        } else {
          const textbox = studentPage.getByRole("textbox", {
            name: "請輸入你的答案",
          });
          await textbox.fill("FE54 匿名回答");
          const submit = studentPage.getByRole("button", { name: "送出答案" });
          await expect(submit).toBeEnabled();
          await submit.focus();
          await studentPage.keyboard.press("Enter");
        }
        await expect(studentPage.getByText("你已作答。")).toBeVisible();
        await closeQuestion(
          teacherContext.request,
          teacherContext,
          session.id,
          sessionQuestionId,
        );
        await assertNoHorizontalOverflow(studentPage);
      }
      await closeSession(teacherContext.request, teacherContext, session.id);
      await studentPage.setViewportSize({ width: 1280, height: 800 });
      await studentPage.reload({ waitUntil: "domcontentloaded" });
      await assertNoHorizontalOverflow(studentPage);
      expect(
        await studentPage.evaluate(() => document.body.innerText),
      ).not.toContain("teacher");
    } finally {
      if (teacherContext && sessionId)
        await cleanup.attempt("close session", () =>
          closeSession(teacherContext!.request, teacherContext!, sessionId),
        );
      if (teacherContext)
        for (const courseId of createdCourses)
          await cleanup.attempt(`archive course ${courseId}`, () =>
            archiveCourse(teacherContext!.request, teacherContext!, courseId),
          );
      for (const context of [studentContext, teacherContext, adminContext])
        if (context)
          await cleanup.attempt("close browser context", () =>
            context!.close(),
          );
      cleanup.assertClean();
    }
  });
});
