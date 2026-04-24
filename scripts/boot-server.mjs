#!/usr/bin/env node
// Boot claudemap Next.js server in background on SessionStart.
// Idempotent: if already listening on PORT, exit fast.
// Emits a JSON line to stdout so the hook stays silent in the UI.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const HOST = process.env.CLAUDEMAP_HOST || "127.0.0.1";
const PORT = Number(process.env.CLAUDEMAP_PORT || 3737);
const STATE_DIR = resolve(homedir(), ".claudemap");
const PID_FILE = resolve(STATE_DIR, "server.pid");
const LOG_FILE = resolve(STATE_DIR, "server.log");

function done(msg) {
  process.stdout.write(
    JSON.stringify({ continue: true, suppressOutput: true, claudemap: msg }) +
      "\n",
  );
  process.exit(0);
}

function ping(timeoutMs = 800) {
  return new Promise((res) => {
    const req = http.get(
      { host: HOST, port: PORT, path: "/", timeout: timeoutMs },
      (r) => {
        r.resume();
        res(true);
      },
    );
    req.on("error", () => res(false));
    req.on("timeout", () => {
      req.destroy();
      res(false);
    });
  });
}

async function waitUntilUp(attempts = 15, delay = 1000) {
  for (let i = 0; i < attempts; i++) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

async function main() {
  if (await ping()) done("already-running");

  const built =
    existsSync(resolve(PROJECT_ROOT, "node_modules")) &&
    existsSync(resolve(PROJECT_ROOT, ".next", "BUILD_ID"));
  if (!built) {
    // Fire-and-forget smart-install; it will make subsequent sessions boot cleanly.
    mkdirSync(STATE_DIR, { recursive: true });
    const installerOut = openSync(LOG_FILE, "a");
    const installer = spawn(
      process.execPath,
      [resolve(__dirname, "smart-install.mjs")],
      {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ["ignore", installerOut, installerOut],
        env: process.env,
      },
    );
    installer.unref();
    done(
      "bootstrapping — first-run install+build in background (~1-2min). Tail ~/.claudemap/server.log",
    );
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const out = openSync(LOG_FILE, "a");
  const err = openSync(LOG_FILE, "a");

  const child = spawn(
    process.execPath,
    [resolve(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", HOST],
    {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ["ignore", out, err],
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  child.unref();
  try {
    writeFileSync(PID_FILE, String(child.pid));
  } catch {}

  const up = await waitUntilUp();
  done(up ? `started:${HOST}:${PORT}` : "starting — check ~/.claudemap/server.log");
}

main().catch((e) => done("error:" + (e?.message || String(e))));
