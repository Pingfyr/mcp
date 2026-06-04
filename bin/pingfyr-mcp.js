#!/usr/bin/env node

import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const tokenIdx = args.indexOf("--token");

if (tokenIdx === -1 || !args[tokenIdx + 1]) {
  process.stderr.write("Error: --token <api-token> is required\n");
  process.stderr.write("Usage: pingfyr-mcp --token <your-api-token>\n");
  process.exit(1);
}

const token = args[tokenIdx + 1];

let mcpRemoteBin;
try {
  mcpRemoteBin = require.resolve("mcp-remote/dist/proxy.js");
} catch {
  process.stderr.write("Error: mcp-remote not found — reinstall @pingfyr/mcp\n");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [mcpRemoteBin, "https://mcp.pingfyr.com/mcp", "--header", "Authorization: Bearer ${PINGFYR_TOKEN}"],
  {
    stdio: "inherit",
    env: { ...process.env, PINGFYR_TOKEN: token },
  }
);

child.on("error", (err) => {
  process.stderr.write(`Error starting mcp-remote: ${err.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
