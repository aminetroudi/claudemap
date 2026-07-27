#!/usr/bin/env node
// claudemap launcher — boots the bundled Next standalone server and prints the URL.
//
// SECURITY: the bind address is hardcoded to 127.0.0.1 and is deliberately NOT
// configurable, not by flag and not by env. claudemap has no authentication, it
// reads and writes everything under ~/.claude, it can spawn terminals, and it
// reads the Claude Code OAuth token server-side for the quota view. Any bind
// beyond loopback turns all of that into a remote capability. HOSTNAME/HOST are
// overwritten in the child env rather than merely defaulted, so an ambient
// HOSTNAME=0.0.0.0 (common in container images) cannot leak through.

"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3737;
const PORT_SCAN_LIMIT = 20;

const pkg = require("../package.json");

function usage() {
  process.stdout.write(
    `claudemap ${pkg.version} — local dashboard for your ~/.claude

Usage:
  npx claudemap [--port <n>]

Options:
  --port, -p <n>   Port to listen on (default ${DEFAULT_PORT}; env PORT also works).
                   If busy, the next free port is used.
  --version, -v
  --help, -h

Binds ${HOST} only. No authentication — do not attempt to expose it.
`,
  );
}

function parseArgs(argv) {
  const out = { port: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--version" || a === "-v") return { version: true };
    if (a === "--port" || a === "-p") {
      out.port = argv[++i];
      continue;
    }
    if (a.startsWith("--port=")) {
      out.port = a.slice("--port=".length);
      continue;
    }
    return { error: `unknown argument: ${a}` };
  }
  return out;
}

function coercePort(raw, label) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${label} must be an integer 1-65535, got "${raw}"`);
  }
  return n;
}

/** True if we can bind the port on HOST right now. */
function isFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

/** First free port at or above `start`, scanning a bounded range. */
async function pickPort(start) {
  for (let p = start; p < start + PORT_SCAN_LIMIT; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(
    `no free port in ${start}-${start + PORT_SCAN_LIMIT - 1} (claudemap may already be running)`,
  );
}

/** Resolve once the server accepts a connection, or reject on child exit/timeout. */
function waitForListen(port, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };

    child.once("exit", (code) =>
      done(reject, new Error(`server exited before listening (code ${code})`)),
    );

    const attempt = () => {
      if (settled) return;
      if (Date.now() > deadline) {
        return done(reject, new Error("server did not start listening in time"));
      }
      const sock = net.connect(port, HOST);
      sock.once("connect", () => {
        sock.destroy();
        done(resolve, undefined);
      });
      sock.once("error", () => {
        sock.destroy();
        setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(`${args.error}\n\n`);
    usage();
    process.exit(2);
  }
  if (args.help) return usage();
  if (args.version) return void process.stdout.write(`${pkg.version}\n`);

  const server = path.join(__dirname, "..", "dist", "server.js");
  if (!fs.existsSync(server)) {
    throw new Error(
      `bundled server missing at ${server}\n` +
        `If you are running from a git clone, build it first:\n` +
        `  npm run build && npm run stage`,
    );
  }

  const requested =
    coercePort(args.port, "--port") ?? coercePort(process.env.PORT, "PORT") ?? DEFAULT_PORT;
  const port = await pickPort(requested);
  if (port !== requested) {
    process.stderr.write(`port ${requested} is busy — using ${port}\n`);
  }

  const child = spawn(process.execPath, [server], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Overwrite, never default — see the security note at the top.
      HOSTNAME: HOST,
      HOST,
      PORT: String(port),
      NODE_ENV: "production",
    },
  });

  // Forward terminating signals so Ctrl-C in the foreground, and a supervisor's
  // SIGTERM, both reach the server instead of orphaning it.
  const SIGNUM = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
  for (const sig of Object.keys(SIGNUM)) {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig);
    });
  }

  // Mirror the child's fate. A signal death reports as 128+signum, the shell
  // convention (Ctrl-C -> 130), rather than a synthetic 0.
  child.on("exit", (code, signal) => {
    if (signal) process.exit(128 + (SIGNUM[signal] ?? 0));
    process.exit(code ?? 1);
  });

  try {
    await waitForListen(port, child);
    process.stdout.write(`\nclaudemap → http://${HOST}:${port}  (Ctrl-C to stop)\n\n`);
  } catch (e) {
    // The child's own stderr is inherited and already explains the failure.
    process.stderr.write(`${e.message}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
