"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Field, inputClass } from "@/components/ui/Field";
import { ApiRequestError } from "@/lib/api/client";
import { useChangePassword } from "@/lib/api/auth";
import { useSession } from "@/lib/auth/session";

/**
 * Change-password form — US-F7.
 *
 * Backend contract: `POST /auth/change-password` (Session + CSRF, NOT step-up).
 * The service verifies `currentPassword` inline, validates `newPassword`
 * against the length policy (12–128 Unicode) and the common-password blocklist
 * (R-F7-3), requires the new password to differ from the current, and rotates
 * the session on success (all other sessions are revoked; a fresh session
 * cookie is set). The hook seeds the returned `SessionDto` into the session
 * cache so `mustChangePassword` flips to false without a refetch.
 *
 * Two modes (decided from `useSession`):
 *  - Force-change (`mustChangePassword=true`): after success, redirect to the
 *    role-based home. The `(protected)` layout allows this user through to
 *    this page; the `(admin)`/`(student)` layouts gate them out of everything
 *    else until the flag clears.
 *  - Voluntary change: after success, show a success banner and stay on the
 *    page (the new session is already seeded).
 *
 * Errors via `ErrorAlert` keyed by stable `code`:
 *  - `AUTH_INVALID_CREDENTIALS` → wrong current password.
 *  - `VALIDATION_FAILED` (field `newPassword`) → too short / common password.
 *    This is a field-scoped validation message, safe to surface; we show the
 *    backend's `message` for this case via a dedicated inline error rather than
 *    the generic `ErrorAlert` message.
 *  - `RATE_LIMITED` → too many attempts (curated message).
 */

const schema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "請輸入目前的密碼")
      .max(128, "密碼最長 128 字元"),
    newPassword: z
      .string()
      .min(12, "新密碼至少 12 字元")
      .max(128, "新密碼最長 128 字元"),
    confirmPassword: z.string().min(1, "請再次輸入新密碼"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "兩次輸入的新密碼不一致",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "新密碼不得與目前密碼相同",
  });

type FormValues = z.infer<typeof schema>;

/** Resolve the role-based home for the force-change redirect. */
function roleHome(role: string): string {
  return role === "admin" ? "/admin" : role === "student" ? "/student" : "/";
}

export function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const { session } = useSession();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const wasForceChange = session?.mustChangePassword === true;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // After a successful force-change the session cache flips mustChangePassword
  // to false (the hook seeds the returned session). Once that propagates,
  // redirect to the role home. For a voluntary change we just show success.
  useEffect(() => {
    if (!done) return;
    if (wasForceChange) {
      router.replace(roleHome(session?.role ?? ""));
    }
  }, [done, wasForceChange, session?.role, router]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setDone(true);
    } catch {
      // `changePassword.error` drives the ErrorAlert; no extra handling here.
    }
  });

  const apiError =
    changePassword.error instanceof ApiRequestError ? changePassword.error : null;

  // Field-scoped backend validation (e.g. common-password rejection) carries a
  // safe human message in `error.message`; surface it inline on newPassword.
  const newPasswordServerError =
    apiError?.code === "VALIDATION_FAILED" && apiError.field === "newPassword"
      ? apiError.message
      : undefined;

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md space-y-4"
      >
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          密碼已成功變更。{wasForceChange ? "即將為你導向…" : ""}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="w-full max-w-md space-y-5"
      aria-describedby="form-instructions"
    >
      <p
        id="form-instructions"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        {wasForceChange
          ? "首次登入或管理員重設後，請設定你的新密碼才能繼續使用其他功能。"
          : "變更你的密碼。新密碼須為 12–128 字元，允許 passphrase，不須特定大小寫、數字或符號組合。"}
      </p>

      {apiError && apiError.code !== "VALIDATION_FAILED" ? (
        <ErrorAlert error={apiError} id="form-error" />
      ) : null}

      <Field
        id="currentPassword"
        label="目前密碼"
        error={errors.currentPassword?.message}
      >
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-describedby="currentPassword-error"
          {...register("currentPassword")}
          className={inputClass(errors.currentPassword)}
        />
      </Field>

      <Field
        id="newPassword"
        label="新密碼"
        error={errors.newPassword?.message ?? newPasswordServerError}
        hint="12–128 字元，允許 passphrase；不得為常見或已知外洩密碼"
      >
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby="newPassword-hint newPassword-error"
          {...register("newPassword")}
          className={inputClass(errors.newPassword)}
        />
      </Field>

      <Field
        id="confirmPassword"
        label="確認新密碼"
        error={errors.confirmPassword?.message}
      >
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby="confirmPassword-error"
          {...register("confirmPassword")}
          className={inputClass(errors.confirmPassword)}
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? "變更中…" : "變更密碼"}
      </button>
    </form>
  );
}