// Terminal spawner — the capability csm lacks: open a graphical terminal that
// attaches to / resumes / shells into a Claude session. Linux/GNOME (this box)
// and WSL2 with WSLg, which is Linux as far as everything below is concerned.
//
// SECURITY MODEL (all four enforced here):
//  1. argv arrays only — spawn(bin, args). No shell string, no shell:true, no
//     execSync, no `gnome-terminal -e <string>`.
//  2. Every dynamic token is regex-validated before use: attachId ^[0-9a-f]{8}$,
//     sessionId a UUID. The command line is assembled ONLY from those validated
//     tokens plus fixed literals, so it cannot carry shell metacharacters.
//  3. cwd must realpath to an existing directory under $HOME (assertSafeRealPath).
//  4. The child is detached + unref'd so it outlives the Next.js server.
// Server-side only.

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { assertSafeRealPath } from "../actions";
import { loadConfig } from "../config";

const execFileP = promisify(execFile);

const ATTACH_ID_RE = /^[0-9a-f]{8}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** WSLg's X socket. Present iff this kernel is WSL2 and WSLg is available. */
const WSLG_X11 = "/mnt/wslg/.X11-unix";

/**
 * Resolve the display env the spawned terminal needs, or null when the box is
 * genuinely headless. Returns env overrides to merge into the child's env.
 *
 * Three sources, in order:
 *  1. Whatever the server inherited — the normal case, started from a graphical
 *     shell by claudemap.sh.
 *  2. A configured `display` — for servers started with no graphical env at all
 *     (`@reboot` cron, systemd user unit), where the inherited env is empty even
 *     though a session exists. Previously this case failed closed.
 *  3. WSLg's fixed defaults, when its X socket is on disk. WSLg normally exports
 *     these itself, so this only fires for the cron/systemd case above.
 */
async function resolveDisplayEnv(): Promise<Record<string, string> | null> {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return {};

  const cfg = await loadConfig();
  if (cfg.display) return { DISPLAY: cfg.display };

  try {
    await fs.access(WSLG_X11);
    return { DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0" };
  } catch {
    return null;
  }
}

// Preference order; spawn resolves each via PATH (csm targets none of these).
// Under WSL these are the same Linux binaries — WSLg renders their windows on
// the Windows desktop — so no Windows-specific entry belongs here. Driving
// wt.exe through the WSL interop layer is deliberately NOT attempted: its
// command line is reassembled by Windows quoting rules and `wt.exe` splits on
// `;`, which our `<cmd>; exec bash` payload contains. That would mean building
// a shell string, breaking invariant 1 below. Set `terminalEmulator` if you
// want to point at something else.
// gnome-terminal and tilix are tried before x-terminal-emulator because the
// latter is an `alternatives` symlink that, on Debian/Ubuntu, points at
// gnome-terminal.wrapper — a legacy shim that silently DROPS --working-directory
// and mangles `-- bash -c`, so the terminal opens in the server's cwd and our
// command never runs. The real binaries honor both correctly.
const CANDIDATES = ["gnome-terminal", "tilix", "x-terminal-emulator"];

export type TerminalMode = "attach" | "resume" | "shell";

export interface SpawnTerminalInput {
  mode: TerminalMode;
  cwd: string;
  attachId?: string;
  sessionId?: string;
}

async function onPath(bin: string): Promise<boolean> {
  try {
    await execFileP("which", [bin], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function pickEmulator(): Promise<string | null> {
  const cfg = await loadConfig();
  // A configured override is tried first, then the built-in candidates.
  const order = cfg.terminalEmulator
    ? [cfg.terminalEmulator, ...CANDIDATES.filter((c) => c !== cfg.terminalEmulator)]
    : CANDIDATES;
  for (const bin of order) {
    if (await onPath(bin)) return bin;
  }
  return null;
}

/**
 * Open a terminal for one session. Returns the emulator used on success;
 * throws (→ 400) on any validation failure with nothing spawned.
 */
export async function spawnSessionTerminal(
  input: SpawnTerminalInput,
): Promise<{ ok: true; emulator: string; mode: TerminalMode }> {
  const { mode } = input;

  // Headless guard — the server may run with no graphical session attached.
  const displayEnv = await resolveDisplayEnv();
  if (!displayEnv) {
    throw new Error(
      "no graphical session available to claudemap server (set `display` in ~/.claude/claude-dashboard.config.json if one exists)",
    );
  }

  // cwd must resolve under $HOME and be a real directory.
  if (!input.cwd) throw new Error("cwd required");
  const cwd = await assertSafeRealPath(input.cwd);
  let st;
  try {
    st = await fs.stat(cwd);
  } catch {
    throw new Error("cwd does not exist");
  }
  if (!st.isDirectory()) throw new Error("cwd is not a directory");

  // Assemble the in-terminal command from validated tokens + fixed literals.
  let claudeCmd = "";
  if (mode === "attach") {
    if (!input.attachId || !ATTACH_ID_RE.test(input.attachId)) throw new Error("invalid attachId");
    claudeCmd = `claude attach ${input.attachId}`;
  } else if (mode === "resume") {
    if (!input.sessionId || !UUID_RE.test(input.sessionId)) throw new Error("invalid sessionId");
    claudeCmd = `claude --resume ${input.sessionId}`;
  } else if (mode !== "shell") {
    throw new Error("invalid mode");
  }
  // `exec bash` keeps the window open after claude exits / detaches.
  const inner = claudeCmd ? `${claudeCmd}; exec bash` : "exec bash";
  // cd "$1" guarantees the working directory even when an emulator ignores
  // --working-directory. $1 is passed positionally (argv), so a cwd containing
  // spaces or special characters needs no escaping and cannot inject anything.
  const script = `cd "$1" 2>/dev/null; ${inner}`;
  const title = `claudemap: ${mode}`;

  const emulator = await pickEmulator();
  if (!emulator) {
    throw new Error("no supported terminal emulator found (gnome-terminal, tilix, x-terminal-emulator)");
  }

  let args: string[];
  if (emulator === "tilix") {
    // tilix honors -w reliably; its -e takes a single shell-parsed command.
    // `inner` holds only validated tokens + literals (no cwd), so quoting is safe.
    args = ["-w", cwd, "-e", `bash -c "${inner}"`];
  } else {
    // gnome-terminal / x-terminal-emulator: everything after `--` is exec'd
    // directly (no shell). cwd is passed BOTH via --working-directory and
    // positionally to `bash -c <script> bash <cwd>` (→ $1) for the cd guard.
    args = ["--title", title, "--working-directory", cwd, "--", "bash", "-c", script, "bash", cwd];
  }

  // Also set the child's own cwd so emulators that spawn their shell directly
  // (rather than via a session server) inherit the right directory too.
  const child = spawn(emulator, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...displayEnv },
  });
  child.unref(); // survive the server process

  return { ok: true, emulator, mode };
}
