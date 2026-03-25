const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

interface ApiResult<T = unknown> {
  data: T;
  error?: undefined;
}

interface ApiError {
  data?: undefined;
  error: string;
}

type ApiResponse<T = unknown> = ApiResult<T> | ApiError;

export class RemindUserClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async createReminder(params: Record<string, unknown>): Promise<ApiResponse> {
    return this.request("POST", "/api/remind", params);
  }

  async listReminders(
    params: Record<string, unknown>
  ): Promise<ApiResponse<{ data: Record<string, unknown>[]; count: number }>> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", String(params.status));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));

    const qs = query.toString();
    return this.request("GET", `/api/reminders${qs ? `?${qs}` : ""}`);
  }

  async updateReminder(id: string, updates: Record<string, unknown>): Promise<ApiResponse> {
    return this.request("PATCH", `/api/remind/${id}`, updates);
  }

  async cancelReminder(id: string): Promise<ApiResponse> {
    return this.request("DELETE", `/api/remind/${id}`);
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          return { data: data as T };
        }

        // Don't retry client errors
        if (response.status >= 400 && response.status < 500) {
          const message =
            (data as Record<string, unknown>)?.error ??
            (data as Record<string, unknown>)?.message ??
            `HTTP ${response.status}`;
          return { error: String(message) };
        }

        // Server error — retry if attempts remain
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }

        return { error: `Server error: HTTP ${response.status}` };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === "AbortError"
              ? `Request timed out after ${TIMEOUT_MS}ms`
              : err.message
            : "Unknown error";

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }

        return { error: message };
      }
    }

    return { error: "Max retries exceeded" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
