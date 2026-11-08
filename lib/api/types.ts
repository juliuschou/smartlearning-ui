export interface ApiError {
  code: string;
  message: string;
  field?: string;
  blocking: boolean;
  nextStep?: string;
  retryAfterSeconds?: number | null;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: { schemaVersion: number; requestId: string };
  error: null;
}

export interface ApiErrorEnvelope {
  data: null;
  meta: { schemaVersion: number; requestId: string };
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
