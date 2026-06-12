// Session origin detection — port of csm's classifier and Linux /proc walk
// (/tmp/csm-src/internal/session/origin.go:29-263,
// origin_detect_linux.go:15-86, origin_store.go:28-82), plus Tilix support
// which csm misses (env marker TILIX_ID, ancestor comm "tilix").
// Cache format and location are csm-compatible:
// ~/.claude-monitor/origins/<sessionId>.json holding {category, app, display}.
// Server-side only.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Origin } from "./types";

const ORIGINS_DIR = path.join(os.homedir(), ".claude-monitor", "origins");

/** Max ancestor hops when walking the parent chain (origin_detect_linux.go:40). */
const MAX_PARENT_HOPS = 10;

/** One process in the ancestor chain (origin.go:70-74). */
export interface ProcessInfo {
  pid: number;
  /** Short command name from /proc/<pid>/comm (max 15 chars on Linux). */
  comm: string;
  /** Resolved /proc/<pid>/exe target; empty when unreadable. */
  exe: string;
}

/**
 * Catalog mapping stable app slugs to display name + category
 * (origin.go:29-54). Tilix is our addition — csm's catalog misses it.
 */
const APP_CATALOG: Record<string, { display: string; category: Origin["category"] }> = {
  // Terminals
  ghostty: { display: "Ghostty", category: "terminal" },
  iterm: { display: "iTerm", category: "terminal" },
  terminal: { display: "Terminal", category: "terminal" }, // macOS Terminal.app
  "apple-terminal": { display: "Terminal", category: "terminal" },
  wezterm: { display: "WezTerm", category: "terminal" },
  kitty: { display: "Kitty", category: "terminal" },
  alacritty: { display: "Alacritty", category: "terminal" },
  konsole: { display: "Konsole", category: "terminal" },
  "gnome-terminal": { display: "GNOME Terminal", category: "terminal" },
  xterm: { display: "xterm", category: "terminal" },
  terminator: { display: "Terminator", category: "terminal" },
  tilix: { display: "Tilix", category: "terminal" }, // csm misses this one
  tmux: { display: "tmux", category: "terminal" }, // best-effort when we can't see further up
  // IDEs
  zed: { display: "Zed", category: "ide" },
  vscode: { display: "VS Code", category: "ide" },
  codium: { display: "VSCodium", category: "ide" },
  cursor: { display: "Cursor", category: "ide" },
  jetbrains: { display: "JetBrains", category: "ide" },
  // Desktop
  "claude-desktop": { display: "Claude Desktop", category: "desktop" },
};

/** Catalog lookup; null for unknown slugs (origin.go newOrigin, 58-63). */
function newOrigin(app: string): Origin | null {
  const entry = APP_CATALOG[app];
  if (!entry) return null;
  return { category: entry.category, app, display: entry.display };
}

/**
 * Ancestor comm/exe substring match (origin.go ancestorMatches, 241-263):
 * bundle paths like ".../Ghostty.app/...", exact comm/exe, or exe suffix
 * "/ghostty". Case-insensitive.
 */
function ancestorMatches(p: ProcessInfo, ...needles: string[]): boolean {
  const commLC = p.comm.toLowerCase();
  const exeLC = p.exe.toLowerCase();
  for (const n of needles) {
    const nLC = n.toLowerCase();
    if (exeLC.includes(`/${nLC}.app/`)) return true;
    if (commLC === nLC || exeLC === nLC) return true;
    if (exeLC.endsWith(`/${nLC}`)) return true;
    if (commLC.includes(`/${nLC}.app/`)) return true;
  }
  return false;
}

/** Claude Desktop app-bundle ancestor (NOT the `claude` CLI), origin.go:211-215. */
function claudeDesktopAncestor(p: ProcessInfo): boolean {
  return (
    p.comm.toLowerCase().includes("/claude.app/") || p.exe.toLowerCase().includes("/claude.app/")
  );
}

/** Cursor sets VSCODE_* markers too — disambiguate (origin.go:219-224). */
function vscodeVariant(env: Record<string, string>): Origin | null {
  if ("CURSOR_TRACE_ID" in env) return newOrigin("cursor");
  return newOrigin("vscode");
}

/**
 * Pure classifier from detection signals to an Origin (origin.go:88-207).
 * No filesystem or subprocess access, so it is unit-testable.
 *
 * Precedence (highest wins):
 *  1. IDE env vars (Cursor, VS Code, Zed, JetBrains)
 *  2. IDE ancestor match (skipping ancestors[0] — the claude CLI itself)
 *  3. Terminal env vars (TERM_PROGRAM and per-terminal markers, incl. TILIX_ID)
 *  4. Terminal ancestor match
 *  5. Claude Desktop (bundle id or Claude.app ancestor)
 *  6. Unknown (null)
 */
export function classifyOrigin(
  env: Record<string, string>,
  ancestors: ProcessInfo[],
): Origin | null {
  // 1. IDE env vars — checked first because an IDE-hosted terminal also sets
  // TERM_PROGRAM, so we look for IDE-specific markers explicitly.
  if ("CURSOR_TRACE_ID" in env) return newOrigin("cursor");
  if ("VSCODE_INJECTION" in env) return vscodeVariant(env);
  if ("VSCODE_PID" in env) return vscodeVariant(env);
  if (env.TERM_PROGRAM === "vscode") return vscodeVariant(env);
  if ("ZED_TERM" in env) return newOrigin("zed");
  if (env.TERM_PROGRAM === "zed") return newOrigin("zed");
  if (env.TERMINAL_EMULATOR === "JetBrains-JediTerm") return newOrigin("jetbrains");

  // The first ancestor is usually the claude CLI process itself; what we want
  // is whatever spawned it, so skip index 0 for all ancestor scans.
  const parents = ancestors.length > 0 ? ancestors.slice(1) : ancestors;

  // 2. IDE ancestor match.
  for (const p of parents) {
    if (ancestorMatches(p, "Cursor")) return newOrigin("cursor");
    if (ancestorMatches(p, "Zed")) return newOrigin("zed");
    if (ancestorMatches(p, "Visual Studio Code", "Code", "Code - Insiders")) {
      return newOrigin("vscode");
    }
    if (ancestorMatches(p, "VSCodium", "codium")) return newOrigin("codium");
    if (
      ancestorMatches(
        p,
        "IntelliJ IDEA",
        "PyCharm",
        "WebStorm",
        "GoLand",
        "RubyMine",
        "PhpStorm",
        "CLion",
        "DataGrip",
        "Rider",
        "Android Studio",
      )
    ) {
      return newOrigin("jetbrains");
    }
  }

  // 3. Terminal env vars. Checked before Claude Desktop because a real
  // terminal emulator always stamps TERM_PROGRAM / its own marker vars,
  // whereas Claude Desktop-spawned processes don't.
  const tp = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (tp === "ghostty") return newOrigin("ghostty");
  if (tp === "iterm.app") return newOrigin("iterm");
  if (tp === "apple_terminal") return newOrigin("apple-terminal");
  if (tp === "wezterm") return newOrigin("wezterm");
  if ("KITTY_WINDOW_ID" in env) return newOrigin("kitty");
  if ("ALACRITTY_WINDOW_ID" in env) return newOrigin("alacritty");
  if ("KONSOLE_VERSION" in env) return newOrigin("konsole");
  if ("WEZTERM_EXECUTABLE" in env) return newOrigin("wezterm");
  if ("GHOSTTY_RESOURCES_DIR" in env) return newOrigin("ghostty");
  if ("TILIX_ID" in env) return newOrigin("tilix"); // our addition

  // 4. Terminal ancestor exe match.
  for (const p of parents) {
    if (ancestorMatches(p, "Ghostty")) return newOrigin("ghostty");
    if (ancestorMatches(p, "iTerm", "iTerm2")) return newOrigin("iterm");
    if (ancestorMatches(p, "Terminal")) return newOrigin("apple-terminal");
    if (ancestorMatches(p, "WezTerm")) return newOrigin("wezterm");
    if (ancestorMatches(p, "Alacritty", "alacritty")) return newOrigin("alacritty");
    if (ancestorMatches(p, "kitty")) return newOrigin("kitty");
    if (ancestorMatches(p, "konsole")) return newOrigin("konsole");
    if (ancestorMatches(p, "tilix")) return newOrigin("tilix"); // our addition
    if (ancestorMatches(p, "gnome-terminal-server", "gnome-terminal")) {
      return newOrigin("gnome-terminal");
    }
    if (ancestorMatches(p, "terminator")) return newOrigin("terminator");
    if (ancestorMatches(p, "xterm")) return newOrigin("xterm");
  }

  // 5. Claude Desktop — only a proper Claude.app bundle ancestor or explicit
  // bundle id. A bare exe named "claude" is the Claude CLI, not the desktop app.
  if (env.__CFBundleIdentifier === "com.anthropic.claude") return newOrigin("claude-desktop");
  for (const p of parents) {
    if (claudeDesktopAncestor(p)) return newOrigin("claude-desktop");
  }

  return null;
}

// ── Linux /proc detection (origin_detect_linux.go) ──────────────────

/**
 * Environment of a running process via /proc/<pid>/environ (NUL-separated).
 * Only readable for same-UID processes; empty map on any error.
 */
async function readProcessEnv(pid: number): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  let data: Buffer;
  try {
    data = await fs.readFile(`/proc/${pid}/environ`);
  } catch {
    return env;
  }
  for (const entry of data.toString("utf8").split("\0")) {
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return env;
}

async function readPPid(pid: number): Promise<number | null> {
  let data: string;
  try {
    data = await fs.readFile(`/proc/${pid}/status`, "utf8");
  } catch {
    return null;
  }
  for (const line of data.split("\n")) {
    if (line.startsWith("PPid:")) {
      const ppid = Number.parseInt(line.slice("PPid:".length).trim(), 10);
      if (Number.isInteger(ppid)) return ppid;
    }
  }
  return null;
}

async function readComm(pid: number): Promise<string> {
  try {
    return (await fs.readFile(`/proc/${pid}/comm`, "utf8")).trim();
  } catch {
    return "";
  }
}

async function readExe(pid: number): Promise<string> {
  try {
    return await fs.readlink(`/proc/${pid}/exe`);
  } catch {
    return "";
  }
}

/**
 * Walk ancestors via /proc/<pid>/status PPid, capped at 10 hops, stopping at
 * pid <= 1 (origin_detect_linux.go:37-54). Includes `pid` itself as entry 0.
 */
export async function parentChain(pid: number): Promise<ProcessInfo[]> {
  const chain: ProcessInfo[] = [];
  let current = pid;
  for (let hops = 0; hops < MAX_PARENT_HOPS && current > 1; hops++) {
    const ppid = await readPPid(current);
    if (ppid === null) return chain;
    chain.push({ pid: current, comm: await readComm(current), exe: await readExe(current) });
    if (ppid <= 1) return chain;
    current = ppid;
  }
  return chain;
}

/**
 * Classify the Claude process identified by pid (origin.go:229-236).
 * Returns null on any failure — callers treat that as "unknown" and must
 * neither display nor persist it.
 */
export async function detectOrigin(pid: number): Promise<Origin | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const env = await readProcessEnv(pid);
  const chain = await parentChain(pid);
  return classifyOrigin(env, chain);
}

// ── Persistent cache, csm-compatible (origin_store.go) ──────────────

/** Session ids are UUIDs; reject anything else before building cache paths. */
const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

const VALID_CATEGORIES = new Set<Origin["category"]>(["terminal", "ide", "desktop"]);

/**
 * Read the cached origin for a session (origin_store.go LoadOrigin, 28-48).
 * Returns null when no cache exists, on parse errors, or for zero values.
 */
export async function loadOrigin(sessionId: string): Promise<Origin | null> {
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(ORIGINS_DIR, `${sessionId}.json`), "utf8");
  } catch {
    return null;
  }
  try {
    const o = JSON.parse(raw) as Partial<Origin> | null;
    if (
      o &&
      typeof o === "object" &&
      typeof o.app === "string" &&
      o.app !== "" &&
      typeof o.category === "string" &&
      VALID_CATEGORIES.has(o.category)
    ) {
      return {
        category: o.category,
        app: o.app,
        display: typeof o.display === "string" && o.display ? o.display : o.app,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Persist a detected origin atomically: write a temp file in the same
 * directory, then rename (origin_store.go SaveOrigin, 52-82). Zero/invalid
 * inputs are skipped silently — there is nothing useful to cache.
 */
export async function saveOrigin(sessionId: string, origin: Origin): Promise<void> {
  if (!sessionId || !SESSION_ID_RE.test(sessionId) || !origin.app) return;
  try {
    await fs.mkdir(ORIGINS_DIR, { recursive: true });
    const target = path.join(ORIGINS_DIR, `${sessionId}.json`);
    const tmp = path.join(
      ORIGINS_DIR,
      `${sessionId}.${process.pid}.${Date.now().toString(36)}.json.tmp`,
    );
    await fs.writeFile(tmp, JSON.stringify(origin), "utf8");
    try {
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  } catch {
    // Cache write failures are non-fatal — next live tick retries detection.
  }
}

/**
 * Read-through origin resolution (csm session.go:527-534): cache first;
 * /proc detection ONLY when uncached AND the process is still running;
 * persist non-zero detections. Historical sessions are cache-only.
 */
export async function resolveOrigin(sessionId: string, pid?: number): Promise<Origin | null> {
  const cached = await loadOrigin(sessionId);
  if (cached) return cached;
  if (!pid || pid <= 0) return null;
  const detected = await detectOrigin(pid);
  if (detected) await saveOrigin(sessionId, detected);
  return detected;
}
