"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Field, inputClass } from "@/components/ui/Field";
import { ApiRequestError } from "@/lib/api/client";
import { useCreateCourse } from "@/lib/api/courses";
import type { CreateCoursePayload } from "@/lib/api/types";

const schema = z.object({
  name: z.string().min(1, "請輸入課程名稱").max(200, "課程名稱最長 200 字元"),
  description: z.string().max(2000, "課程說明最多 2,000 字元").optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Course creation form — US-F0 CP3/CP4.
 *
 * The server controls ownership and lifecycle status. This component only
 * collects the two public fields and delegates the mutation to the CP2 hook.
 */
export function CourseCreateForm() {
  const router = useRouter();
  const createCourse = useCreateCourse();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload: CreateCoursePayload = { name: values.name };
    if (values.description !== undefined && values.description !== "") {
      payload.description = values.description;
    }

    try {
      const course = await createCourse.mutateAsync(payload);
      router.replace(`/courses/${course.id}`);
    } catch {
      // `createCourse.error` drives the ErrorAlert; no extra handling here.
    }
  });

  const apiError = createCourse.error
    ? createCourse.error instanceof ApiRequestError
      ? createCourse.error
      : { code: "INTERNAL_ERROR" }
    : null;
  const isPending = isSubmitting || createCourse.isPending;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="w-full max-w-md space-y-5"
      aria-label="建立課程表單"
      aria-describedby="form-instructions"
    >
      <p
        id="form-instructions"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        建立一門課程。課程擁有者與初始狀態由伺服器決定。
      </p>

      {apiError ? <ErrorAlert error={apiError} id="form-error" /> : null}

      <Field
        id="name"
        label="課程名稱"
        error={errors.name?.message}
        hint="1–200 字元"
      >
        <input
          id="name"
          type="text"
          autoComplete="off"
          aria-describedby="name-hint name-error"
          aria-invalid={errors.name ? "true" : undefined}
          {...register("name")}
          className={inputClass(errors.name)}
        />
      </Field>

      <Field
        id="description"
        label="課程說明"
        error={errors.description?.message}
        hint="選填，最多 2,000 字元"
      >
        <textarea
          id="description"
          rows={5}
          aria-describedby="description-hint description-error"
          aria-invalid={errors.description ? "true" : undefined}
          {...register("description")}
          className={inputClass(errors.description)}
        />
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isPending ? "建立中…" : "建立課程"}
      </button>
    </form>
  );
}
