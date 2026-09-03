/**
 * Wire types mirroring the backend `/api/v1` REST contract.
 *
 * Envelope shape: `{ data, meta, error }` — see
 * `smartLearning-backend/src/common/http/api-envelope.ts`. Success responses
 * carry `data`; the API client unwraps to `body.data`. Health probes are raw
 * (not enveloped) and must not go through the same client.
 *
 * Keep these aligned with the backend DTOs (each feature module's
 * `api/dto` directory) — the source of truth. The OpenAPI spec at
 * `/api/docs-json` is machine-readable but shows inner types after the
 * envelope; these types are already envelope-unwrapped.
 */

/** Stable error detail carried in the `error` field of the envelope. */
export interface ApiError {
  /** Stable uppercase snake_case code (e.g. `AUTH_CSRF_INVALID`). */
  code: string;
  /** Human description — NOT a code; classify by `code`. */
  message: string;
  /** Optional field/item path, e.g. "username" or "items[2].text". */
  field?: string;
  /** True when the error blocks the operation. */
  blocking: boolean;
  /** Optional actionable next step. */
  nextStep?: string;
  /** Optional retry hint (transport serializes absent as null). */
  retryAfterSeconds?: number | null;
}

/** Successful envelope: client code reads `body.data`. */
export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: { schemaVersion: number; requestId: string };
  error: null;
}

/** Error envelope: `data` is null, `error` present. */
export interface ApiErrorEnvelope {
  data: null;
  meta: { schemaVersion: number; requestId: string };
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/** Account roles recognized by the backend DTO. The UI only offers a subset. */
export type AccountRole = "admin" | "teacher" | "student";

/** `POST /auth/login` request body. */
export interface LoginPayload {
  username: string;
  password: string;
}

/** `POST /admin/accounts` request body. */
export interface CreateAccountPayload {
  username: string;
  displayName: string;
  role: AccountRole;
  canCreateCourse: boolean;
  tempPassword: string;
}

/** `PATCH /admin/accounts/:id/permissions` request body (US-F16). */
export interface UpdateAccountPermissionsPayload {
  canCreateCourse: boolean;
}

/** `POST /auth/change-password` request body (US-F7). */
export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * `AccountDto` — never includes password_hash.
 * Wire contract: UUID id, UTC ISO timestamps, stable field names.
 */
export interface AccountDto {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  status: string;
  canCreateCourse: boolean;
  mustChangePassword: boolean;
  disabledAt: string | null;
  createdAt: string;
}

/** `SessionDto` from `GET /auth/session` (envelope-unwrapped). */
export interface SessionDto {
  accountId: string;
  username: string;
  displayName: string;
  role: AccountRole;
  canCreateCourse: boolean;
  mustChangePassword: boolean;
  sessionId: string;
  /** ISO-8601 expiry returned by the backend. API 401 remains authoritative if it expires. */
  expiresAt: string;
}

/**
 * `Page<T>` — paginated list payload (envelope-unwrapped). The outer envelope's
 * `meta` is `{ schemaVersion, requestId }`; pagination metadata lives in this
 * inner `meta` (see backend frontend-api-reference §pagination).
 */
export interface Page<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Course lifecycle values returned by the Course API. */
export type CourseStatus = "draft" | "archived";

/**
 * `CourseDto` from the teacher/admin Course endpoints (envelope-unwrapped).
 * Timestamps are ISO-8601 strings from PostgreSQL `timestamptz` values.
 */
export interface CourseDto {
  id: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  ownerAccountId: string;
  createdAt: string;
  updatedAt: string;
}

/** `POST /courses` request body; ownership and status are server-controlled. */
export interface CreateCoursePayload {
  name: string;
  description?: string;
}

/** Enrollment lifecycle values returned by the course roster API. */
export type EnrollmentStatus = "active" | "removed";

/** Safe student projection embedded in an enrollment roster row. */
export interface EnrollmentStudentDto {
  id: string;
  username: string;
  displayName: string;
}

/** Course-roster enrollment projection returned to teacher/admin callers. */
export interface EnrollmentDto {
  id: string;
  courseId: string;
  studentAccountId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
  student: EnrollmentStudentDto;
}

/** `POST /courses/:courseId/enrollments` request body. */
export interface CreateEnrollmentPayload {
  studentAccountId: string;
}

/** Student projection returned by the course-scoped search endpoint. */
export interface StudentSearchResultDto {
  id: string;
  username: string;
  displayName: string;
  enrollmentStatus: EnrollmentStatus | null;
}

/**
 * `MyCourseDto` from `GET /me/courses` (envelope-unwrapped, inside `Page<T>`).
 * Guard: Session + StudentGuard. A student's active course roster projection.
 */
export interface MyCourseDto {
  enrollmentId: string;
  courseId: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  ownerAccountId: string;
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Live Session (FE-3.1) — teacher live classroom transport.
// Aligned with backend `src/modules/live-sessions/api/dto/live-session.dto.ts`
// and `results.dto.ts`. All mutations return 201; classify by envelope `data`,
// not status. There is no session-list endpoint (only `GET /live-sessions/:id`).
// ---------------------------------------------------------------------------

/** LiveSession lifecycle values returned by the LiveSession API. */
export type LiveSessionStatus = "waiting" | "active" | "closed" | "cancelled";

/** SessionQuestion lifecycle values. */
export type SessionQuestionStatus = "not_open" | "open" | "closed";

/** Question snapshot types carried by a SessionQuestion. */
export type QuestionSnapshotType = "poll" | "quiz" | "open_text";

/** Ordered question selection within a session (question definition id + position). */
export interface QuestionSelection {
  questionDefinitionId: string;
  position: number;
}

/** A single option snapshot embedded in a SessionQuestion. */
export interface SessionQuestionOption {
  id: string;
  optionRef: string | null;
  text: string;
  position: number;
}

/**
 * `SessionQuestionDto` — immutable snapshot of a question at session start.
 * `hasSubmitted` is present only on participant projections (not teacher detail).
 */
export interface SessionQuestion {
  id: string;
  liveSessionId: string;
  questionDefinitionId: string | null;
  position: number;
  status: SessionQuestionStatus;
  snapshotType: QuestionSnapshotType;
  snapshotPrompt: string;
  snapshotSelectionMode: string | null;
  openedAt: string | null;
  closedAt: string | null;
  hasSubmitted?: boolean;
  options: SessionQuestionOption[];
}

/**
 * `LiveSessionDto` from `GET /live-sessions/:id` (envelope-unwrapped).
 * `joinedCount`/`votedCount` are present on the teacher detail projection.
 */
export interface LiveSession {
  id: string;
  courseId: string;
  status: LiveSessionStatus;
  sessionCode: string;
  startedAt: string | null;
  closedAt: string | null;
  autoClosed: boolean;
  createdAt: string;
  updatedAt: string;
  joinedCount?: number;
  votedCount?: number;
  questionSelections: QuestionSelection[];
  sessionQuestions: SessionQuestion[];
}

/** `POST /live-sessions` request body. */
export interface CreateLiveSessionPayload {
  courseId: string;
  questionIds: string[];
}

/** Per-option count shared by poll and quiz results. */
export interface OptionCount {
  optionId: string;
  optionRef: string | null;
  text: string;
  count: number;
  /** Present for quiz only; omitted for poll/open_text. */
  isCorrect?: boolean;
}

/** Poll results projection (discriminated by `snapshotType: 'poll'`). */
export interface PollResults {
  snapshotType: "poll";
  selectionMode: "single" | "multiple";
  status: "open" | "closed";
  options: OptionCount[];
  totalResponses: number;
}

/** Quiz results projection (discriminated by `snapshotType: 'quiz'`). */
export interface QuizResults {
  snapshotType: "quiz";
  status: "open" | "closed";
  options: OptionCount[];
  totalResponses: number;
  /** Present for teacher always; participant only after close. */
  correctCount?: number;
  incorrectCount?: number;
  correctnessRate?: number;
}

/** Anonymized open-text answer (no identity linkage). */
export interface OpenTextResponse {
  text: string;
}

/** Open-text results projection (discriminated by `snapshotType: 'open_text'`). */
export interface OpenTextResults {
  snapshotType: "open_text";
  status: "open" | "closed";
  responses: OpenTextResponse[];
  totalResponses: number;
}

/**
 * `SessionQuestionResultsDto` — discriminated union returned by
 * `GET /live-sessions/:id/questions/:sessionQuestionId/results`.
 */
export type SessionQuestionResults =
  PollResults | QuizResults | OpenTextResults;
