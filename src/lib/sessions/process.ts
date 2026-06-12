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
