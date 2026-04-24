#!/usr/bin/env node
// Self-bootstrap: install deps + build Next.js if missing.
// Idempotent. Logs to ~/.claudemap/server.log. Exits 0 on success, non-zero on failure.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const STATE_DIR = resolve(homedir(), ".claudemap");
const LOG_FILE = resolve(STATE_DIR, "server.log");

mkdirSync(STATE_DIR, { recursive: true });

function log(line) {
  const ts = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${ts}] smart-install: ${line}\n`);
}

function which(cmd) {
  const r = spawnSync("sh", ["-lc", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function run(cmd, args) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  if (r.status !== 0) {
    log(`failed (${r.status}): ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function pickPm() {
  if (existsSync(resolve(PROJECT_ROOT, "bun.lock")) && which("bun")) return "bun";
  if (existsSync(resolve(PROJECT_ROOT, "pnpm-lock.yaml")) && which("pnpm")) return "pnpm";
  if (existsSync(resolve(PROJECT_ROOT, "yarn.lock")) && which("yarn")) return "yarn";
  if (which("bun")) return "bun";
  if (which("pnpm")) return "pnpm";
  return "npm";
}

const pm = pickPm();
log(`project=${PROJECT_ROOT} pm=${pm}`);

const needsInstall = !existsSync(resolve(PROJECT_ROOT, "node_modules"));
const needsBuild = !existsSync(resolve(PROJECT_ROOT, ".next", "BUILD_ID"));

if (!needsInstall && !needsBuild) {
  log("already bootstrapped, nothing to do");
  process.exit(0);
}

if (needsInstall) {
  if (pm === "bun") run("bun", ["install"]);
  else if (pm === "pnpm") run("pnpm", ["install", "--frozen-lockfile=false"]);
  else if (pm === "yarn") run("yarn", ["install"]);
  else run("npm", ["install", "--no-audit", "--no-fund"]);
}

if (needsBuild) {
  if (pm === "bun") run("bun", ["run", "build"]);
  else run(pm, ["run", "build"]);
}

log("bootstrap complete");
