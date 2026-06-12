// Terminal spawner — the capability csm lacks: open a graphical terminal that
// attaches to / resumes / shells into a Claude session. Linux/GNOME (this box).
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

/** Preference order; spawn resolves each via PATH (csm targets none of these). */
const CANDIDATES = ["x-terminal-emulator", "gnome-terminal", "tilix"];

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
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error("no graphical session available to claudemap server");
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
  const script = claudeCmd ? `${claudeCmd}; exec bash` : "exec bash";
  const title = `claudemap: ${mode}`;

  const emulator = await pickEmulator();
  if (!emulator) {
    throw new Error("no supported terminal emulator found (x-terminal-emulator, gnome-terminal, tilix)");
  }

  let args: string[];
  if (emulator === "tilix") {
    // tilix word-splits -e with shell rules; the double-quotes group the script,
    // which is safe because `script` contains only validated tokens + literals.
    args = ["-w", cwd, "-e", `bash -c "${script}"`];
  } else {
    // gnome-terminal / x-terminal-emulator: everything after `--` is exec'd
    // directly (no shell), and `script` is a single argv element to `bash -c`.
    args = ["--title", title, "--working-directory", cwd, "--", "bash", "-c", script];
  }

  const child = spawn(emulator, args, { detached: true, stdio: "ignore" });
  child.unref(); // survive the server process

  return { ok: true, emulator, mode };
}
