#!/usr/bin/env node
// Assemble a throwaway $HOME with fixture data and run the dashboard against it.
// Intended for screenshots / evaluation — never touches your real ~/.claude.
//
// Usage:
//   node scripts/demo-run.mjs              # defaults: /tmp/claudemap-demo, :3738
//   CLAUDEMAP_PORT=3939 node scripts/demo-run.mjs
//   CLAUDEMAP_DEMO_HOME=/tmp/foo node scripts/demo-run.mjs
//
// Stop with Ctrl+C. The fixture HOME is preserved between runs (fast restarts);
// delete it manually (`rm -rf /tmp/claudemap-demo`) for a clean seed.

import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const FIXTURE_SRC = resolve(PROJECT_ROOT, "fixtures", "demo-home");
const DEMO_HOME =
  process.env.CLAUDEMAP_DEMO_HOME || resolve("/tmp", "claudemap-demo");
const PORT = Number(process.env.CLAUDEMAP_PORT || 3738);
const HOST = process.env.CLAUDEMAP_HOST || "127.0.0.1";
const RESEED = process.env.CLAUDEMAP_DEMO_RESEED === "1";

if (!existsSync(FIXTURE_SRC)) {
  console.error(`Fixture source missing: ${FIXTURE_SRC}`);
  process.exit(1);
}

if (RESEED && existsSync(DEMO_HOME)) {
  console.log(`↳ reseed: removing ${DEMO_HOME}`);
  rmSync(DEMO_HOME, { recursive: true, force: true });
}

mkdirSync(DEMO_HOME, { recursive: true });

// Copy the static skeleton (.claude/, .claude-memory/) into DEMO_HOME.
cpSync(FIXTURE_SRC, DEMO_HOME, { recursive: true });

// Move the memory blob into the per-project location the app expects:
//   $HOME/.claude/projects/<project-key>/memory/
const projectKey = DEMO_HOME.replace(/\//g, "-");
const memoryDst = resolve(
  DEMO_HOME,
  ".claude",
  "projects",
  projectKey,
  "memory",
);
mkdirSync(memoryDst, { recursive: true });
const memorySrc = resolve(DEMO_HOME, ".claude-memory");
if (existsSync(memorySrc)) {
  cpSync(memorySrc, memoryDst, { recursive: true, force: true });
  rmSync(memorySrc, { recursive: true, force: true });
}

// Rewrite the installed_plugins.json placeholder with the real demo HOME path
// so the plugins panel shows a valid install location.
{
  const path = resolve(DEMO_HOME, ".claude", "plugins", "installed_plugins.json");
  const { readFileSync } = await import("node:fs");
  const raw = readFileSync(path, "utf8");
  writeFileSync(path, raw.replaceAll("/__REPLACED_AT_RUNTIME__", DEMO_HOME));
}

// Write ~/.claude.json (main config with mcpServers) and ~/.mcp.json (host-level)
writeFileSync(
  resolve(DEMO_HOME, ".claude.json"),
  JSON.stringify(
    {
      mcpServers: {
        demoPostgres: {
          type: "stdio",
          command: "mcp-server-postgres",
          args: ["--readonly"],
          env: { PGDATABASE: "demo" },
        },
        demoFilesystem: {
          type: "stdio",
          command: "mcp-server-filesystem",
          args: ["/srv/demo"],
        },
      },
    },
    null,
    2,
  ),
);
writeFileSync(
  resolve(DEMO_HOME, ".mcp.json"),
  JSON.stringify(
    {
      mcpServers: {
        cloudSearch: {
          type: "sse",
          url: "https://example.com/mcp/search",
        },
      },
    },
    null,
    2,
  ),
);

// Register workspace dirs as Claude "projects" so the Projects panel has
// entries without needing a real session history. We create:
//   $HOME/.claude/projects/<pathkey(workspace)>/    (empty marker dir)
for (const ws of ["workspaces/acme-api", "workspaces/acme-web"]) {
  const wsPath = resolve(DEMO_HOME, ws);
  const key = wsPath.replace(/\//g, "-");
  mkdirSync(resolve(DEMO_HOME, ".claude", "projects", key), { recursive: true });
}

// Dashboard config — narrow scan so nothing outside DEMO_HOME leaks in.
writeFileSync(
  resolve(DEMO_HOME, ".claude", "claude-dashboard.config.json"),
  JSON.stringify(
    {
      scanPaths: [DEMO_HOME],
      excludePaths: [],
      excludeProjects: [],
      looseMdMaxDepth: 4,
      looseMdMaxFiles: 500,
    },
    null,
    2,
  ),
);

// Ensure the app is built.
if (!existsSync(resolve(PROJECT_ROOT, ".next", "BUILD_ID"))) {
  console.log("↳ building Next.js bundle (one-time)…");
  const r = spawnSync("bun", ["run", "build"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`↳ demo HOME: ${DEMO_HOME}`);
console.log(`↳ dashboard: http://${HOST}:${PORT}`);
console.log(`↳ Ctrl+C to stop.`);

const nextBin = resolve(
  PROJECT_ROOT,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const child = spawn(
  process.execPath,
  [nextBin, "start", "-p", String(PORT), "-H", HOST],
  {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, HOME: DEMO_HOME, NODE_ENV: "production" },
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
