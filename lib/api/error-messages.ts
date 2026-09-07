// `ApiRequestError` is one shape callers pass in; we only need its `code`.

/**
 * Stable error-code → Chinese message map.
 *
 * The backend's `error.message` is a human description, not a code, and for
 * server errors it may contain internal detail that should not leak to users.
 * We classify by the stable `code` and show a curated message instead. Unknown
 * codes fall back to a generic message — never the raw `message`.
 */

const MESSAGES: Record<string, string> = {
  // Auth / authorization
  UNAUTHORIZED: "請先登入後再繼續。",
  AUTH_SESSION_EXPIRED: "登入已過期，請重新登入。",
  AUTH_INVALID_CREDENTIALS: "帳號或密碼不正確。",
  AUTH_CSRF_INVALID: "安全驗證失敗，請重新整理頁面後再試一次。",
  AUTH_STEP_UP_REQUIRED: "此操作需要再次輸入密碼以進階驗證。",
  AUTH_PASSWORD_CHANGE_REQUIRED: "請先變更密碼後再繼續。",
  FORBIDDEN: "你沒有權限執行此操作。",
  // Account management
  NOT_FOUND: "找不到指定的帳號。",
  CONFLICT: "此帳號名稱已被使用，請換一個。",
  VALIDATION_FAILED: "輸入內容不符合要求，請檢查欄位後再試一次。",
  // Enrollment roster (FE-2.2)
  COURSE_NOT_EDITABLE: "課程已封存，無法修改名冊。",
  VALIDATION_ERROR: "輸入內容不符合要求，請檢查欄位後再試一次。",
  // Learner access (FE-4.1 CP4) — frozen codes only
  ENROLLMENT_REQUIRED: "你尚未加選此課程，無法進入課堂。",
  ENROLLMENT_REMOVED: "你的課程加選已被移除，無法進入課堂。",
  AUTH_ACCOUNT_DISABLED: "此帳號已停用，請聯絡管理員。",
  // Live session (FE-3.1)
  SESSION_NOT_JOINABLE: "此課堂目前無法加入。",
  SESSION_QUESTION_NOT_OPEN: "此題目前未開放作答。",
  QUESTION_LOCKED_BY_SESSION: "此題已被課堂鎖定，無法修改。",
  RESULTS_NOT_REVEALED: "結果尚未公布，請稍後再試。",
  SUBMISSION_CONFLICT: "作答內容有衝突，請重新整理後再試一次。",
  FIELD_REQUIRED: "請填寫答案後再送出。",
  TEXT_TOO_LONG: "答案不可超過 2,000 個字元。",
  TEXT_UNSAFE: "答案包含不安全的控制字元，請移除後再試。",
  // Live session realtime (FE-3.2)
  REALTIME_UNAVAILABLE: "即時連線暫時無法使用，請稍後再試。",
  CONNECTION_FAILED: "即時連線失敗，請檢查網路後再試。",
  SESSION_NOT_ACTIVE: "課堂目前不在進行中，無法執行此操作。",
  // Rate limit (US-F7 / R-F7-7)
  RATE_LIMITED: "嘗試次數過多，請稍後再試。",
  // Transport
  NETWORK_ERROR: "無法連線到伺服器，請稍後再試。",
  INTERNAL_ERROR: "伺服器發生問題，請稍後再試。",
  ANONYMOUS_CREDENTIAL_MISSING: "匿名參與憑證不存在，請重新加入課堂。",
  STORAGE_UNAVAILABLE: "目前無法保存匿名參與狀態，請稍後再試。",
};

const GENERIC_MESSAGE = "發生未預期的錯誤，請稍後再試。";

/** Resolve a localized message for a stable error code (or any object with `code`). */
export function errorMessage(codeOrError: string | { code: string }): string {
  const code = typeof codeOrError === "string" ? codeOrError : codeOrError.code;
  return MESSAGES[code] ?? GENERIC_MESSAGE;
}
