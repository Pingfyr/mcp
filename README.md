# @pingfyr/mcp — MCP Server for Pingfyr Reminder API

[![MCP Server](https://glama.ai/mcp/servers/Pingfyr/mcp/badges/card.svg)](https://glama.ai/mcp/servers/Pingfyr/mcp)

Schedule reminders via API. Wake your agents via webhook. Deliver notifications via email, Slack, Discord, Telegram, OpenClaw, or Google Calendar.

## What is Pingfyr?

Pingfyr is a reminder service built for AI agents. It lets your agent schedule reminders that get delivered at the right time — via email to humans, via webhook to wake up other agents, or via Slack, Discord, Telegram, OpenClaw, and Google Calendar for team notifications.

No cron jobs. No infrastructure. Just tell your agent when to remind, and Pingfyr handles the rest.

## Installation

```bash
npm install -g @pingfyr/mcp
```

Or run directly with npx:

```bash
npx @pingfyr/mcp
```

## Configuration

### Claude Code (`~/.claude/mcp.json`)

```json
{
  "mcpServers": {
    "pingfyr": {
      "command": "pingfyr-mcp",
      "env": {
        "PINGFYR_API_KEY": "rm_your_api_key",
        "PINGFYR_API_URL": "https://pingfyr.com"
      }
    }
  }
}
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS)

```json
{
  "mcpServers": {
    "pingfyr": {
      "command": "npx",
      "args": ["-y", "@pingfyr/mcp"],
      "env": {
        "PINGFYR_API_KEY": "rm_your_api_key",
        "PINGFYR_API_URL": "https://pingfyr.com"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP-compatible client (Cursor, Windsurf, etc.) can use the same configuration pattern above.

Sign up at [pingfyr.com](https://pingfyr.com) to get your API key.

## Available Tools

| Tool              | Description                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `create_reminder` | Schedule a new reminder via email, webhook, Slack, Discord, Telegram, OpenClaw, or Google Calendar |
| `list_reminders`  | List all reminders with optional filtering by status, limit, and offset                            |
| `update_reminder` | Update a pending reminder (title, body, fire_at, channel, recipients, repeat, timezone)            |
| `cancel_reminder` | Cancel a pending reminder                                                                          |

### `create_reminder` Parameters

| Parameter         | Required | Type     | Description                                                                       |
| ----------------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `title`           | Yes      | string   | Title of the reminder (max 200 chars)                                             |
| `fire_at`         | Yes      | string   | When to fire (ISO 8601 datetime, must be in the future)                           |
| `channel`         | Yes      | enum     | `email`, `webhook`, `slack`, `discord`, `telegram`, `openclaw`, `google_calendar` |
| `recipients`      | Yes      | string[] | Delivery addresses (see Channels table for format per channel)                    |
| `body`            | No       | string   | Body/description of the reminder (max 2000 chars)                                 |
| `repeat`          | No       | enum     | `daily`, `weekly`, `monthly`, `custom`                                            |
| `cron_expression` | No       | string   | Cron expression (required when `repeat` is `custom`)                              |
| `timezone`        | No       | string   | IANA timezone for recurring reminders (default: UTC)                              |
| `metadata`        | No       | object   | Arbitrary key-value metadata to attach to the reminder                            |

### `list_reminders` Parameters

| Parameter | Required | Type   | Description                                                 |
| --------- | -------- | ------ | ----------------------------------------------------------- |
| `status`  | No       | enum   | `pending`, `processing`, `delivered`, `failed`, `cancelled` |
| `limit`   | No       | number | Max results (default: 50, max: 100)                         |
| `offset`  | No       | number | Pagination offset (default: 0)                              |

### `update_reminder` Parameters

| Parameter    | Required | Type     | Description                          |
| ------------ | -------- | -------- | ------------------------------------ |
| `id`         | Yes      | string   | UUID of the reminder to update       |
| `title`      | No       | string   | New title                            |
| `body`       | No       | string   | New body                             |
| `fire_at`    | No       | string   | New fire time (ISO 8601)             |
| `channel`    | No       | enum     | New channel                          |
| `recipients` | No       | string[] | Updated delivery addresses           |
| `repeat`     | No       | enum     | New repeat schedule (null to remove) |
| `timezone`   | No       | string   | New timezone                         |

## Examples

### Email reminder (multi-recipient)

```json
{
  "title": "Project deadline reminder",
  "fire_at": "2026-12-15T08:00:00Z",
  "channel": "email",
  "recipients": ["alice@example.com", "bob@example.com"]
}
```

### Slack reminder

```json
{
  "title": "Weekly team sync reminder",
  "fire_at": "2026-12-01T09:00:00Z",
  "channel": "slack",
  "recipients": ["https://hooks.slack.com/services/T.../B.../xxx"],
  "repeat": "weekly",
  "timezone": "America/New_York"
}
```

### Discord notification

```json
{
  "title": "Deploy notification",
  "fire_at": "2026-12-01T17:00:00Z",
  "channel": "discord",
  "recipients": ["https://discord.com/api/webhooks/xxx/yyy"]
}
```

### Telegram reminder

```json
{
  "title": "Daily standup",
  "fire_at": "2026-12-01T09:00:00Z",
  "channel": "telegram",
  "recipients": ["bot:123456:789012"],
  "repeat": "daily",
  "timezone": "Europe/Berlin"
}
```

Find your `bot_id` in Settings → Telegram Bots on the Pingfyr dashboard.

### OpenClaw notification

```json
{
  "title": "Agent task complete",
  "fire_at": "2026-12-01T10:00:00Z",
  "channel": "openclaw",
  "recipients": ["https://openclaw.example.com/webhook"]
}
```

### Google Calendar event (Starter+ plan required)

Creates a Google Calendar event on the user's connected Google account.
Connect your account at Settings → Google Calendar in the Pingfyr dashboard.

```json
{
  "title": "Team sync",
  "fire_at": "2026-12-01T09:00:00Z",
  "channel": "google_calendar",
  "recipients": ["google"]
}
```

### Webhook (agent wake-up)

```json
{
  "title": "Check for new orders",
  "fire_at": "2026-12-01T10:00:00Z",
  "channel": "webhook",
  "recipients": ["https://your-agent.example.com/webhook"],
  "repeat": "daily"
}
```

### Custom cron schedule

```json
{
  "title": "Weekday morning check",
  "fire_at": "2026-12-01T09:00:00Z",
  "channel": "webhook",
  "recipients": ["https://your-agent.example.com/webhook"],
  "repeat": "custom",
  "cron_expression": "0 9 * * MON-FRI",
  "timezone": "America/New_York"
}
```

## Channels

| Channel           | `recipients` format        | Description                                                                       |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `email`           | Email addresses            | Deliver to one or more email inboxes (Starter+ plan required)                     |
| `webhook`         | HTTP/HTTPS URL             | POST request to wake up agents                                                    |
| `slack`           | Slack Incoming Webhook URL | Post message to a Slack channel                                                   |
| `discord`         | Discord Webhook URL        | Post message to a Discord channel                                                 |
| `telegram`        | `bot:<bot_id>:<chat_id>`   | Send message via Telegram bot (register bot in Settings → Telegram Bots)          |
| `openclaw`        | OpenClaw URL               | POST request to an OpenClaw endpoint                                              |
| `google_calendar` | `google` (literal)         | Create a Google Calendar event on your connected account (Starter+ plan required) |

## Plans

| Plan       | Price   | Reminders/month | Recipients/month |
| ---------- | ------- | --------------- | ---------------- |
| Free       | $0      | 50              | 100              |
| Starter    | $59/mo  | 10,000          | 20,000           |
| Pro        | $269/mo | 50,000          | 100,000          |
| Enterprise | Contact | Unlimited       | Unlimited        |

Free plan includes Webhook, Slack, Discord, Telegram, and OpenClaw channels. Email and Google Calendar require a paid plan (Starter+).

## Environment Variables

| Variable          | Required | Description                                   |
| ----------------- | -------- | --------------------------------------------- |
| `PINGFYR_API_KEY` | Yes      | Your Pingfyr API key                          |
| `PINGFYR_API_URL` | No       | API base URL (default: `https://pingfyr.com`) |

## License

MIT