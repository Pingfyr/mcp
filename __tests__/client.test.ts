import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemindUserClient } from "../src/client.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("RemindUserClient", () => {
  let client: RemindUserClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RemindUserClient("https://api.example.com", "rm_testkey123");
  });

  describe("createReminder", () => {
    it("sends POST request with correct headers and body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "test-id", title: "Test" }));

      const result = await client.createReminder({
        title: "Test",
        recipient: "user@test.com",
        fire_at: "2026-03-01T10:00:00Z",
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/remind");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe("Bearer rm_testkey123");
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ id: "test-id", title: "Test" });
    });

    it("returns error for 400 response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Validation failed" }, 400));

      const result = await client.createReminder({ title: "" });
      expect(result.error).toBe("Validation failed");
    });

    it("returns error for 401 response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Invalid API key" }, 401));

      const result = await client.createReminder({ title: "Test" });
      expect(result.error).toBe("Invalid API key");
    });
  });

  describe("listReminders", () => {
    it("sends GET request with query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], count: 0 }));

      await client.listReminders({ status: "pending", limit: 10 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/reminders?");
      expect(url).toContain("status=pending");
      expect(url).toContain("limit=10");
    });

    it("sends GET without query params when none provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], count: 0 }));

      await client.listReminders({});

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/reminders");
    });
  });

  describe("updateReminder", () => {
    it("sends PATCH request", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "abc" }));

      await client.updateReminder("abc", { title: "Updated" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/remind/abc");
      expect(options.method).toBe("PATCH");
    });

    it("returns error for 409 conflict", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Reminder is not pending" }, 409));

      const result = await client.updateReminder("abc", { title: "X" });
      expect(result.error).toBe("Reminder is not pending");
    });
  });

  describe("cancelReminder", () => {
    it("sends DELETE request", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Cancelled" }));

      const result = await client.cancelReminder("abc");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/remind/abc");
      expect(options.method).toBe("DELETE");
      expect(result.error).toBeUndefined();
    });
  });

  describe("retry logic", () => {
    it("retries on 500 errors", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({ id: "ok" }));

      const result = await client.createReminder({ title: "Test" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ id: "ok" });
    });

    it("returns error after max retries", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500));

      const result = await client.createReminder({ title: "Test" });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.error).toContain("500");
    });

    it("retries on network errors", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(jsonResponse({ id: "ok" }));

      const result = await client.createReminder({ title: "Test" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ id: "ok" });
    });

    it("does not retry on 4xx errors", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Bad request" }, 400));

      await client.createReminder({ title: "" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("createReminder with telegram channel", () => {
    it("sends correct payload for telegram channel with bot:<uuid>:<chat_id> recipient", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "tg-id-1", title: "Telegram Test", channel: "telegram" })
      );

      const result = await client.createReminder({
        title: "Telegram Test",
        fire_at: "2026-03-01T10:00:00Z",
        channel: "telegram",
        recipients: ["bot:550e8400-e29b-41d4-a716-446655440000:123456789"],
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.example.com/api/remind");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string);
      expect(body.channel).toBe("telegram");
      expect(body.recipients).toEqual(["bot:550e8400-e29b-41d4-a716-446655440000:123456789"]);
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ id: "tg-id-1", title: "Telegram Test", channel: "telegram" });
    });

    it("sends correct payload for telegram channel with multiple bot recipients", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "tg-id-2", title: "Multi Telegram", channel: "telegram" })
      );

      await client.createReminder({
        title: "Multi Telegram",
        fire_at: "2026-03-01T10:00:00Z",
        channel: "telegram",
        recipients: ["bot:aaaa-1111:100", "bot:bbbb-2222:200"],
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);
      expect(body.channel).toBe("telegram");
      expect(body.recipients).toEqual(["bot:aaaa-1111:100", "bot:bbbb-2222:200"]);
    });
  });
});
