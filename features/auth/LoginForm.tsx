"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Field, inputClass } from "@/components/ui/Field";
import { ApiRequestError } from "@/lib/api/client";
import { useLogin } from "@/lib/api/auth";

/**
 * Login form — US-F6.
 *
 * Backend contract: `POST /auth/login` is CSRF-exempt (the CSRF cookie is set
 * by the login response, so it cannot be required to make the request). The
 * `useLogin` hook passes `mutate: false` so no `X-CSRF-Token` / `Origin` is
 * attached. On success the backend returns `SessionDto` and the hook seeds the
 * session query cache (no immediate `/auth/session` refetch).
 *
 * Redirects:
 *  - `mustChangePassword=true` → `/settings/password` (the F7 gate target;
 *    `next` is intentionally ignored until the password is changed).
 *  - otherwise honor a same-origin relative `?next=` (open-redirect guarded),
 *    else default by role: `admin` → `/admin`, `student` → `/student`,
 *    `teacher` → `/` (teacher home not yet implemented).
 * All redirects use `router.replace` so the login page does not stay in
 * history (browser back should not return to the login page).
 *
 * Errors: classified by stable `code` via `ErrorAlert`; disabled / unknown
 * accounts / wrong password all map to `AUTH_INVALID_CREDENTIALS` (backend
 * deliberately does not leak account existence).
 */

const schema = z.object({
  username: z.string().min(1, "請輸入帳號").max(64, "帳號最長 64 字元"),
  password: z.string().min(1, "請輸入密碼").max(128, "密碼最長 128 字元"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Resolve a safe post-login destination.
 *
 * Accept only a relative path that starts with a single `/` (rejects `//evil`
 * scheme-less URLs and absolute `https://…`). This prevents open redirect via a
 * crafted `next`. Returns the role-based default when `next` is absent/invalid.
 */
function resolveNext(next: string | null, role: string): string {
  const fallback =
    role === "admin" ? "/admin" : role === "student" ? "/student" : "/";
  if (!next) return fallback;
  // Must start with a single `/` and not `//` (which the browser treats as a
  // scheme-relative URL to a foreign origin).
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next === "/") return fallback;
  return next;
}

export function LoginForm() {
  const login = useLogin();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session = await login.mutateAsync(values);
      if (session.mustChangePassword) {
        // Force-change users must reach the gate target before any role home or
        // caller-supplied destination is allowed.
        router.replace("/settings/password");
        return;
      }
      const dest = resolveNext(searchParams.get("next"), session.role);
      router.replace(dest);
    } catch {
      // `login.error` drives the ErrorAlert; no extra handling here.
    }
  });

  const apiError = login.error instanceof ApiRequestError ? login.error : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="w-full max-w-sm space-y-5"
      aria-describedby="login-instructions"
    >
      <p
        id="login-instructions"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        登入智學互動平台。
      </p>

      {apiError ? <ErrorAlert error={apiError} id="form-error" /> : null}

      <Field id="username" label="帳號" error={errors.username?.message}>
        <input
          id="username"
          type="text"
          autoComplete="username"
          aria-describedby="username-error"
          {...register("username")}
          className={inputClass(errors.username)}
        />
      </Field>

      <Field id="password" label="密碼" error={errors.password?.message}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-describedby="password-error"
          {...register("password")}
          className={inputClass(errors.password)}
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
