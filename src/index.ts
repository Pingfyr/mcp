#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RemindUserClient } from "./client.js";

const API_KEY = process.env.PINGFYR_API_KEY;
const BASE_URL = process.env.PINGFYR_API_URL || "https://pingfyr.com";

if (!API_KEY) {
  console.error("Error: PINGFYR_API_KEY environment variable is required");
  process.exit(1);
}

const client = new RemindUserClient(BASE_URL, API_KEY);

const server = new McpServer({
  name: "pingfyr",
  version: "0.2.0",
});

// Tool: Create a reminder
server.tool(
  "create_reminder",
  "Schedule a new reminder to be delivered via email, webhook, Slack, Discord, Telegram, OpenClaw, or Google Calendar",
  {
    title: z.string().describe("Title of the reminder (max 200 chars)"),
    fire_at: z
      .string()
      .describe("When to fire the reminder (ISO 8601 datetime, must be in the future)"),
    body: z
      .string()
      .optional()
      .describe("Optional body/description of the reminder (max 2000 chars)"),
    channel: z
      .enum(["email", "webhook", "slack", "discord", "telegram", "openclaw", "google_calendar"])
      .describe(
        'Delivery channel: "email", "webhook", "slack", "discord", "telegram", "openclaw", or "google_calendar"'
      ),
    recipients: z
      .array(z.string().min(1))
      .min(1, "At least one recipient required")
      .describe(
        "Required. Delivery addresses: email addresses for email channel, URLs for webhook/slack/discord/openclaw, " +
          "bot:<bot_id>:<chat_id> format for telegram (find bot_id in Settings → Telegram Bots)."
      ),
    repeat: z
      .enum(["daily", "weekly", "monthly", "custom"])
      .optional()
      .describe("Recurring schedule"),
    cron_expression: z
      .string()
      .optional()
      .describe('Cron expression (required when repeat is "custom")'),
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone for recurring reminders (default: UTC)"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arbitrary metadata to attach to the reminder"),
  },
  async (params) => {
    const result = await client.createReminder(params);
    if (result.error) {
      return {
        content: [{ type: "text" as const, text: `Failed to create reminder: ${result.error}` }],
      };
    }
    const d = result.data as Record<string, unknown>;
    return {
      content: [
        {
          type: "text" as const,
          text: `Reminder created successfully!\nID: ${d.id}\nTitle: ${d.title}\nFire at: ${d.fire_at}\nChannel: ${d.channel}${Array.isArray(d.recipients) && d.recipients.length > 0 ? `\nRecipients: ${(d.recipients as string[]).join(", ")}` : ""}`,
        },
      ],
    };
  }
);

// Tool: List reminders
server.tool(
  "list_reminders",
  "List all reminders for the authenticated user with optional filtering",
  {
    status: z
      .enum(["pending", "processing", "delivered", "failed", "cancelled"])
      .optional()
      .describe("Filter by status"),
    limit: z.number().optional().describe("Max results (default 50, max 100)"),
    offset: z.number().optional().describe("Pagination offset (default 0)"),
  },
  async (params) => {
    const result = await client.listReminders(params);
    if (result.error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error}` }],
      };
    }

    const reminders = result.data?.data;
    if (!reminders || reminders.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No reminders found." }],
      };
    }

    const lines = reminders.map((r: Record<string, unknown>) => {
      let line = `- [${r.status}] ${r.title} at ${r.fire_at}${r.repeat ? ` (${r.repeat})` : ""} (ID: ${(r.id as string).slice(0, 8)})`;
      const ds = r.delivery_summary as
        | { success?: number; failure?: number; suppressed?: number; rate_limited?: number }
        | undefined;
      if (ds && (ds.success || ds.failure || ds.suppressed || ds.rate_limited)) {
        const parts: string[] = [];
        if (ds.success) parts.push(`${ds.success} delivered`);
        if (ds.failure) parts.push(`${ds.failure} failed`);
        if (ds.suppressed) parts.push(`${ds.suppressed} suppressed`);
        if (ds.rate_limited) parts.push(`${ds.rate_limited} rate-limited`);
        line += `\n  Delivery: ${parts.join(", ")}`;
      }
      return line;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${result.data?.count ?? reminders.length} reminder(s):\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// Tool: Update a reminder
server.tool(
  "update_reminder",
  "Update a pending reminder (title, fire time, etc.)",
  {
    id: z.string().uuid().describe("UUID of the reminder to update"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New body"),
    fire_at: z.string().optional().describe("New fire time (ISO 8601)"),
    channel: z
      .enum(["email", "webhook", "slack", "discord", "telegram", "openclaw", "google_calendar"])
      .optional()
      .describe(
        'New channel: "email", "webhook", "slack", "discord", "telegram", "openclaw", or "google_calendar"'
      ),
    recipients: z.array(z.string().min(1)).optional().describe("Updated delivery addresses"),
    repeat: z
      .enum(["daily", "weekly", "monthly", "custom"])
      .nullable()
      .optional()
      .describe("New repeat schedule (null to remove)"),
    timezone: z.string().optional().describe("New timezone"),
  },
  async (params) => {
    const { id, ...updates } = params;
    const result = await client.updateReminder(id, updates);
    return {
      content: [
        {
          type: "text" as const,
          text: result.error
            ? `Failed to update reminder: ${result.error}`
            : `Reminder ${id.slice(0, 8)} updated successfully.`,
        },
      ],
    };
  }
);

// Tool: Cancel a reminder
server.tool(
  "cancel_reminder",
  "Cancel a pending reminder so it will not be delivered",
  {
    id: z.string().uuid().describe("UUID of the reminder to cancel"),
  },
  async ({ id }) => {
    const result = await client.cancelReminder(id);
    return {
      content: [
        {
          type: "text" as const,
          text: result.error
            ? `Failed to cancel reminder: ${result.error}`
            : `Reminder ${id.slice(0, 8)} cancelled.`,
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
