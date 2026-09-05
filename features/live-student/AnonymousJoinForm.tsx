"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Field, inputClass } from "@/components/ui/Field";
import { ApiRequestError } from "@/lib/api/client";
import {
  normalizeSessionCode,
  useJoinAnonymousLiveSession,
} from "@/lib/api/participant-live-sessions";

function containsUnsafeDisplayNameCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    );
  });
}

const schema = z.object({
  sessionCode: z
    .string()
    .trim()
    .min(1, "請輸入課堂代碼")
    .length(8, "課堂代碼為 8 碼"),
  displayName: z
    .string()
    .trim()
    .min(1, "請輸入顯示名稱")
    .max(40, "顯示名稱最多 40 個字元")
    .refine(
      (value) => !containsUnsafeDisplayNameCharacter(value),
      "顯示名稱不可包含控制或方向控制字元",
    ),
});

type FormValues = z.infer<typeof schema>;

export function AnonymousJoinForm() {
  const router = useRouter();
  const join = useJoinAnonymousLiveSession();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sessionCode: "", displayName: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const receipt = await join.mutateAsync({
        sessionCode: normalizeSessionCode(values.sessionCode),
        displayName: values.displayName.trim().normalize("NFC"),
      });
      router.replace(`/live/${encodeURIComponent(receipt.liveSessionId)}`);
    } catch {
      // join.error drives the curated alert; raw backend messages stay hidden.
    }
  });

  const error = join.error instanceof ApiRequestError ? join.error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-5">
      <p
        id="anonymous-join-instructions"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        輸入課堂代碼與顯示名稱即可加入課堂。
      </p>
      {error ? <ErrorAlert error={error} id="form-error" /> : null}
      <Field
        id="sessionCode"
        label="課堂代碼"
        error={errors.sessionCode?.message}
      >
        <input
          id="sessionCode"
          type="text"
          autoComplete="off"
          maxLength={32}
          aria-describedby="sessionCode-error"
          {...register("sessionCode")}
          className={inputClass(errors.sessionCode)}
        />
      </Field>
      <Field
        id="displayName"
        label="顯示名稱"
        error={errors.displayName?.message}
      >
        <input
          id="displayName"
          type="text"
          autoComplete="nickname"
          maxLength={40}
          aria-describedby="displayName-error"
          {...register("displayName")}
          className={inputClass(errors.displayName)}
        />
      </Field>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? "加入中…" : "加入課堂"}
      </button>
    </form>
  );
}
