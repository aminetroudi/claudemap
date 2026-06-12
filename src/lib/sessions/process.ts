// Running Claude process detection. Primary source is `claude agents --json`
// (richer than csm: sessionId, kind, attach id). The `ps ax` + /proc/<pid>/cwd
// scan (port of csm session.go:196-265) supplements it with PIDs the CLI does
// not report and is the fallback when the CLI is unavailable.
// No shell-string exec anywhere — execFile with argv arrays only.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const execFileP = promisify(execFile);

export interface ClaudeProcess {
  pid: number;
  cwd: string;
  encodedCwd: string;
  kind?: "interactive" | "background";
  sessionId?: string;
  /** Short 8-hex job id — present only on background jobs (`claude attach <id>`). */
  attachId?: string;
  startedAt?: string;
  name?: string;
}

/**
 * Claude Code's lossy project-dir encoding: '/', '.', and '_' all become '-'
 * (csm session.go:275-282). Do not trust it for identity — prefer JSONL cwd.
 */
export function encodeProjectPath(p: string): string {
  return p.replace(/[/._]/g, "-");
}

async function listFromAgentsCli(): Promise<ClaudeProcess[]> {
  const { stdout } = await execFileP("claude", ["agents", "--json"], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) return [];

  const procs: ClaudeProcess[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const pid = typeof a.pid === "number" && Number.isInteger(a.pid) ? a.pid : 0;
    const cwd = typeof a.cwd === "string" ? a.cwd : "";
    if (pid <= 0 || !cwd) continue;
    procs.push({
      pid,
      cwd,
      encodedCwd: encodeProjectPath(cwd),
      kind: a.kind === "background" ? "background" : a.kind === "interactive" ? "interactive" : undefined,
      sessionId: typeof a.sessionId === "string" && a.sessionId ? a.sessionId : undefined,
      attachId: typeof a.id === "string" && a.id ? a.id : undefined,
      startedAt: typeof a.startedAt === "string" ? a.startedAt : undefined,
      name: typeof a.name === "string" && a.name ? a.name : undefined,
    });
  }
  return procs;
}

/** Port of csm getRunningClaudeDirs (session.go:196-235): `ps ax` + /proc/<pid>/cwd. */
async function listFromPs(): Promise<ClaudeProcess[]> {
  const { stdout } = await execFileP("ps", ["ax", "-o", "pid=,comm="], { timeout: 10_000 });
  const procs: ClaudeProcess[] = [];
  for (const line of stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2) continue;
    const comm = fields[fields.length - 1];
    if (!comm.endsWith("claude")) continue;
    const pid = Number.parseInt(fields[0], 10);
    if (!Number.isInteger(pid) || pid <= 0) continue;

    let cwd: string;
    try {
      cwd = await fs.readlink(`/proc/${pid}/cwd`);
    } catch {
      continue; // other-user process, or already gone
    }
    if (!cwd) continue;
    procs.push({ pid, cwd, encodedCwd: encodeProjectPath(cwd) });
  }
  return procs;
}

/** List all running Claude processes, deduplicated by PID (primary wins). */
export async function listClaudeProcesses(): Promise<ClaudeProcess[]> {
  let primary: ClaudeProcess[] = [];
  try {
    primary = await listFromAgentsCli();
  } catch {
    // `claude` missing from PATH or errored — the ps scan below stands in
  }
  let supplement: ClaudeProcess[] = [];
  try {
    supplement = await listFromPs();
  } catch {
    // ps unavailable — primary list stands alone
  }
  const seen = new Set(primary.map((p) => p.pid));
  return [...primary, ...supplement.filter((p) => !seen.has(p.pid))];
}

const UUID_ARG_RE = /--resume[\s=]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const ENV_SID_PREFIX = "CLAUDE_CODE_SESSION_ID=";
const ENV_CHILD = "CLAUDE_CODE_CHILD_SESSION=1";

/**
 * Session ids of all live Claude sessions. A session is "running" iff its id
 * appears here. `claude agents --json` omits the top-level interactive session,
 * so we read each live `claude` process directly, deriving its session id by:
 *
 *  1. `--resume <uuid>` in the cmdline — AUTHORITATIVE. A process started via
 *     `claude --resume X` runs session X regardless of inherited env, which a
 *     spawned/attached session's `CLAUDE_CODE_SESSION_ID` gets wrong (it
 *     inherits the parent shell's id).
 *  2. else `CLAUDE_CODE_SESSION_ID` from environ, but only for NON-child
 *     processes (CLAUDE_CODE_CHILD_SESSION=1 marks tool/subprocess children
 *     that carry the parent's id, not their own session).
 *
 * Skips `claude daemon`. Linux-only (no /proc elsewhere → empty set).
 */
export async function collectLiveSessionIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let stdout: string;
  try {
    ({ stdout } = await execFileP("ps", ["ax", "-o", "pid=,comm="], { timeout: 10_000 }));
  } catch {
    return ids;
  }

  const pids: number[] = [];
  for (const line of stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2) continue;
    if (!fields[fields.length - 1].endsWith("claude")) continue;
    const pid = Number.parseInt(fields[0], 10);
    if (Number.isInteger(pid) && pid > 0) pids.push(pid);
  }

  await Promise.all(
    pids.map(async (pid) => {
      let cmd: string;
      try {
        cmd = (await fs.readFile(`/proc/${pid}/cmdline`)).toString("utf8").replace(/\0/g, " ");
      } catch {
        return; // gone or other-user
      }
      if (cmd.includes(" daemon ") || cmd.endsWith(" daemon")) return; // agents daemon, not a session

      // 1. Authoritative: --resume <uuid> in the cmdline.
      const m = cmd.match(UUID_ARG_RE);
      if (m) {
        ids.add(m[1].toLowerCase());
        return;
      }

      // 2. Fallback: own session id from environ, non-child only.
      let env: string;
      try {
        env = (await fs.readFile(`/proc/${pid}/environ`)).toString("utf8");
      } catch {
        return;
      }
      const parts = env.split("\0");
      if (parts.includes(ENV_CHILD)) return; // inherited id, not this proc's session
      for (const entry of parts) {
        if (entry.startsWith(ENV_SID_PREFIX)) {
          const v = entry.slice(ENV_SID_PREFIX.length);
          if (v) ids.add(v);
          break;
        }
      }
    }),
  );
  return ids;
}
