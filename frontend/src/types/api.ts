// Types mirroring the backend API contract.

export interface HealthResponse {
  status: 'ok';
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    [detail: string]: unknown;
  };
}
