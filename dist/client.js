const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];
export class RemindUserClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.apiKey = apiKey;
    }
    async createReminder(params) {
        return this.request("POST", "/api/remind", params);
    }
    async listReminders(params) {
        const query = new URLSearchParams();
        if (params.status)
            query.set("status", String(params.status));
        if (params.limit)
            query.set("limit", String(params.limit));
        if (params.offset)
            query.set("offset", String(params.offset));
        const qs = query.toString();
        return this.request("GET", `/api/reminders${qs ? `?${qs}` : ""}`);
    }
    async updateReminder(id, updates) {
        return this.request("PATCH", `/api/remind/${id}`, updates);
    }
    async cancelReminder(id) {
        return this.request("DELETE", `/api/remind/${id}`);
    }
    async request(method, path, body) {
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
                    return { data: data };
                }
                // Don't retry client errors
                if (response.status >= 400 && response.status < 500) {
                    const message = data?.error ??
                        data?.message ??
                        `HTTP ${response.status}`;
                    return { error: String(message) };
                }
                // Server error — retry if attempts remain
                if (attempt < MAX_RETRIES) {
                    await sleep(RETRY_DELAYS[attempt]);
                    continue;
                }
                return { error: `Server error: HTTP ${response.status}` };
            }
            catch (err) {
                const message = err instanceof Error
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
