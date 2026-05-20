#!/usr/bin/env node
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { RemindUserClient } from "./client.js";
const BASE_URL = process.env.PINGFYR_API_URL || "https://pingfyr.com";
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version",
};
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
function createMcpServer(apiKey) {
    const client = new RemindUserClient(BASE_URL, apiKey);
    const server = new McpServer({
        name: "pingfyr",
        version: "0.3.1",
    });
    // Tool: Create a reminder
    server.tool("create_reminder", "Schedule a new reminder to be delivered via email, webhook, Slack, Discord, Telegram, OpenClaw, or Google Calendar", {
        title: z.string().max(200).describe("Title of the reminder (max 200 chars)"),
        fire_at: z
            .string()
            .describe("When to fire the reminder (ISO 8601 datetime, must be in the future)"),
        body: z
            .string()
            .max(2000)
            .optional()
            .describe("Optional body/description of the reminder (max 2000 chars)"),
        channel: z
            .enum(["email", "webhook", "slack", "discord", "telegram", "openclaw", "google_calendar"])
            .describe('Delivery channel: "email", "webhook", "slack", "discord", "telegram", "openclaw", or "google_calendar"'),
        recipients: z
            .array(z.string().min(1))
            .min(1, "At least one recipient required")
            .describe("Required. Delivery addresses: email addresses for email channel, URLs for webhook/slack/discord/openclaw, " +
            "bot:<bot_id>:<chat_id> format for telegram (find bot_id in Settings → Telegram Bots)."),
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
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional()
            .describe("Arbitrary metadata to attach to the reminder"),
    }, async (params) => {
        const result = await client.createReminder(params);
        if (result.error) {
            return {
                content: [{ type: "text", text: `Failed to create reminder: ${result.error}` }],
            };
        }
        const d = result.data;
        return {
            content: [
                {
                    type: "text",
                    text: `Reminder created successfully!\nID: ${d.id}\nTitle: ${d.title}\nFire at: ${d.fire_at}\nChannel: ${d.channel}${Array.isArray(d.recipients) && d.recipients.length > 0 ? `\nRecipients: ${d.recipients.join(", ")}` : ""}`,
                },
            ],
        };
    });
    // Tool: List reminders
    server.tool("list_reminders", "List all reminders for the authenticated user with optional filtering", {
        status: z
            .enum(["pending", "processing", "delivered", "failed", "cancelled"])
            .optional()
            .describe("Filter by status"),
        limit: z.number().optional().describe("Max results (default 50, max 100)"),
        offset: z.number().optional().describe("Pagination offset (default 0)"),
    }, async (params) => {
        const result = await client.listReminders(params);
        if (result.error) {
            return {
                content: [{ type: "text", text: `Error: ${result.error}` }],
            };
        }
        const reminders = result.data?.data;
        if (!reminders || reminders.length === 0) {
            return {
                content: [{ type: "text", text: "No reminders found." }],
            };
        }
        const lines = reminders.map((r) => {
            let line = `- [${r.status}] ${r.title} at ${r.fire_at}${r.repeat ? ` (${r.repeat})` : ""} (ID: ${r.id.slice(0, 8)})`;
            const ds = r.delivery_summary;
            if (ds && (ds.success || ds.failure || ds.suppressed || ds.rate_limited)) {
                const parts = [];
                if (ds.success)
                    parts.push(`${ds.success} delivered`);
                if (ds.failure)
                    parts.push(`${ds.failure} failed`);
                if (ds.suppressed)
                    parts.push(`${ds.suppressed} suppressed`);
                if (ds.rate_limited)
                    parts.push(`${ds.rate_limited} rate-limited`);
                line += `\n  Delivery: ${parts.join(", ")}`;
            }
            return line;
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${result.data?.count ?? reminders.length} reminder(s):\n${lines.join("\n")}`,
                },
            ],
        };
    });
    // Tool: Update a reminder
    server.tool("update_reminder", "Update a pending reminder (title, fire time, etc.)", {
        id: z.string().uuid().describe("UUID of the reminder to update"),
        title: z.string().max(200).optional().describe("New title"),
        body: z.string().max(2000).optional().describe("New body"),
        fire_at: z.string().optional().describe("New fire time (ISO 8601)"),
        channel: z
            .enum(["email", "webhook", "slack", "discord", "telegram", "openclaw", "google_calendar"])
            .optional()
            .describe('New channel: "email", "webhook", "slack", "discord", "telegram", "openclaw", or "google_calendar"'),
        recipients: z.array(z.string().min(1)).optional().describe("Updated delivery addresses"),
        repeat: z
            .enum(["daily", "weekly", "monthly", "custom"])
            .nullable()
            .optional()
            .describe("New repeat schedule (null to remove)"),
        cron_expression: z
            .string()
            .nullable()
            .optional()
            .describe('Cron expression (required when setting repeat to "custom")'),
        timezone: z.string().optional().describe("New timezone"),
    }, async (params) => {
        const { id, ...updates } = params;
        const result = await client.updateReminder(id, updates);
        return {
            content: [
                {
                    type: "text",
                    text: result.error
                        ? `Failed to update reminder: ${result.error}`
                        : `Reminder ${id.slice(0, 8)} updated successfully.`,
                },
            ],
        };
    });
    // Tool: Cancel a reminder
    server.tool("cancel_reminder", "Cancel a pending reminder so it will not be delivered", {
        id: z.string().uuid().describe("UUID of the reminder to cancel"),
    }, async ({ id }) => {
        const result = await client.cancelReminder(id);
        return {
            content: [
                {
                    type: "text",
                    text: result.error
                        ? `Failed to cancel reminder: ${result.error}`
                        : `Reminder ${id.slice(0, 8)} cancelled.`,
                },
            ],
        };
    });
    return server;
}
async function startStdio() {
    const apiKey = process.env.PINGFYR_API_KEY;
    if (!apiKey || !apiKey.startsWith("rm_")) {
        console.error("Error: PINGFYR_API_KEY environment variable is required and must start with rm_");
        process.exit(1);
    }
    if (!BASE_URL.startsWith("https://") && !process.env.PINGFYR_ALLOW_HTTP) {
        console.error("Error: PINGFYR_API_URL must use HTTPS. Set PINGFYR_ALLOW_HTTP=1 for development.");
        process.exit(1);
    }
    const server = createMcpServer(apiKey);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
async function startHttp(port) {
    if (!BASE_URL.startsWith("https://") && !process.env.PINGFYR_ALLOW_HTTP) {
        console.error("Error: PINGFYR_API_URL must use HTTPS. Set PINGFYR_ALLOW_HTTP=1 for development.");
        process.exit(1);
    }
    const httpServer = http.createServer(async (req, res) => {
        // CORS preflight
        if (req.method === "OPTIONS") {
            res.writeHead(204, CORS_HEADERS);
            res.end();
            return;
        }
        // Health check
        if (req.method === "GET" && req.url === "/health") {
            res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));
            return;
        }
        // MCP endpoint — POST, GET (SSE), DELETE (session close)
        if (req.url === "/mcp" &&
            (req.method === "POST" || req.method === "GET" || req.method === "DELETE")) {
            const authHeader = req.headers["authorization"] ?? "";
            const match = authHeader.match(/^Bearer (.+)$/);
            const apiKey = match ? match[1] : null;
            if (!apiKey || !apiKey.startsWith("rm_")) {
                res.writeHead(401, { ...CORS_HEADERS, "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: "Unauthorized: valid Bearer token required (must start with rm_)",
                }));
                return;
            }
            let parsedBody;
            if (req.method === "POST") {
                let rawBody;
                try {
                    const chunks = [];
                    let totalBytes = 0;
                    for await (const chunk of req) {
                        const buf = chunk;
                        totalBytes += buf.byteLength;
                        if (totalBytes > MAX_BODY_BYTES) {
                            res.writeHead(413, { ...CORS_HEADERS, "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Request body too large" }));
                            req.destroy();
                            return;
                        }
                        chunks.push(buf);
                    }
                    rawBody = Buffer.concat(chunks).toString("utf8");
                }
                catch {
                    res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Failed to read request body" }));
                    return;
                }
                try {
                    parsedBody = JSON.parse(rawBody);
                }
                catch {
                    res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid JSON body" }));
                    return;
                }
            }
            const server = createMcpServer(apiKey);
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            try {
                await server.connect(transport);
                await transport.handleRequest(req, res, parsedBody);
            }
            catch (err) {
                console.error("MCP handler error:", err);
                if (!res.headersSent) {
                    res.writeHead(500, { ...CORS_HEADERS, "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Internal server error" }));
                }
            }
            finally {
                await transport.close();
                await server.close();
            }
            return;
        }
        res.writeHead(404, { ...CORS_HEADERS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
    });
    httpServer.on("error", (err) => {
        console.error("HTTP server error:", err);
        process.exit(1);
    });
    httpServer.listen(port, "0.0.0.0", () => {
        console.error(`MCP HTTP server listening on 0.0.0.0:${port}`);
    });
}
const rawPort = process.env.PORT;
let PORT = null;
if (rawPort !== undefined) {
    const parsed = parseInt(rawPort, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Error: PORT="${rawPort}" is not a valid port number (1-65535).`);
        process.exit(1);
    }
    PORT = parsed;
}
if (PORT !== null) {
    startHttp(PORT).catch((err) => {
        console.error("MCP HTTP server error:", err);
        process.exit(1);
    });
}
else if (process.env.PINGFYR_API_KEY) {
    startStdio().catch((err) => {
        console.error("MCP server error:", err);
        process.exit(1);
    });
}
else {
    // No PORT and no API key — default to HTTP on 3000 for server deployments
    startHttp(3000).catch((err) => {
        console.error("MCP HTTP server error:", err);
        process.exit(1);
    });
}
