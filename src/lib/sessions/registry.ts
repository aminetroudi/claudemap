// Live session registry — `~/.claude/sessions/<pid>.json`, written by the CLI
// itself (Claude Code >= 2.1.220). Authoritative for pid, procStart, cwd,
// sessionId, kind, status, name, jobId and the per-session message socket.
//
// This supersedes reconstructing the same facts from /proc + `ps` (process.ts,
// origin.ts): the CLI records `procStart` alongside the pid, which is exactly
// the PID-reuse guard we otherwise re-derive by hand. Records are NOT removed
// when a session exits, so every read is liveness-checked before use.
//
// Server-side only.

import fs from "node:fs/promises";
import path from "node:path";
import { SESSION_REGISTRY_DIR } from "../paths";
import { encodeProjectPath, type ClaudeProcess } from "./process";
import type { RegistrySession } from "./types";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}
function n(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Read `/proc/<pid>/stat` field 22 (starttime, in clock ticks since boot).
 * The CLI stores the same value as a string, so a match proves the pid was
 * not recycled onto a different process. Returns null when unreadable —
 * on a non-Linux host or a dead pid.
 */
async function procStartTicks(pid: number): Promise<string | null> {
  try {
    const raw = await fs.readFile(`/proc/${pid}/stat`, "utf8");
    // comm (field 2) is parenthesized and may contain spaces — split after it.
    const close = raw.lastIndexOf(")");
    if (close < 0) return null;
    const fields = raw.slice(close + 2).split(" ");
    // After comm and state, field 22 overall is index 19 here.
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/** True when `pid` is alive AND started at `procStart` (defeats PID reuse). */
export async function isSessionAlive(
  pid: number,
  procStart?: string,
): Promise<boolean> {
  const actual = await procStartTicks(pid);
  if (actual === null) return false;
  // No recorded start time: liveness of the pid is the best we can assert.
  if (!procStart) return true;
  return actual === procStart;
}

function parseRecord(raw: unknown): RegistrySession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pid = n(o.pid);
  const sessionId = str(o.sessionId);
  if (pid === undefined || !sessionId) return null;
  const kind = str(o.kind);
  return {
    pid,
    procStart: str(o.procStart) ?? "",
    sessionId,
    cwd: str(o.cwd) ?? "",
    startedAt: n(o.startedAt) ?? 0,
    version: str(o.version),
    kind: kind === "bg" || kind === "interactive" ? kind : undefined,
    entrypoint: str(o.entrypoint),
    messagingSocketPath: str(o.messagingSocketPath),
    peerProtocol: n(o.peerProtocol),
    name: str(o.name),
    nameSource: str(o.nameSource),
    jobId: str(o.jobId),
    status: str(o.status),
    updatedAt: n(o.updatedAt),
  };
}

/**
 * Read every registry record. Stale entries (dead pid, or a pid recycled onto
 * another process) come back with `alive: false` rather than being dropped —
 * the caller decides whether a just-exited session is still interesting.
 */
export async function readSessionRegistry(): Promise<RegistrySession[]> {
  let names: string[];
  try {
    names = await fs.readdir(SESSION_REGISTRY_DIR);
  } catch {
    return []; // older CLI, or no session has run yet
  }

  const out: RegistrySession[] = [];
  await Promise.all(
    names.map(async (name) => {
      // `<pid>.json` only — `<pid>.<sha256>.key` holds the peer token and is
      // deliberately never read here.
      if (!/^\d+\.json$/.test(name)) return;
      let rec: RegistrySession | null;
      try {
        const raw = await fs.readFile(
          path.join(SESSION_REGISTRY_DIR, name),
          "utf8",
        );
        rec = parseRecord(JSON.parse(raw));
      } catch {
        return; // torn write mid-scan, or malformed — skip this one record
      }
      if (!rec) return;
      rec.alive = await isSessionAlive(rec.pid, rec.procStart);
      out.push(rec);
    }),
  );

  out.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return out;
}

/** Registry records for sessions that are currently running. */
export async function readLiveRegistry(): Promise<RegistrySession[]> {
  return (await readSessionRegistry()).filter((s) => s.alive);
}

/**
 * Live registry records in the shape session discovery already consumes.
 * Every field here is stated by the CLI rather than inferred, so these take
 * precedence over the `claude agents` / `ps` results they are merged with.
 */
export async function registryProcesses(): Promise<ClaudeProcess[]> {
  const live = await readLiveRegistry();
  return live.map((s) => ({
    pid: s.pid,
    cwd: s.cwd,
    encodedCwd: encodeProjectPath(s.cwd),
    kind: s.kind === "bg" ? "background" : "interactive",
    sessionId: s.sessionId,
    attachId: s.jobId,
    startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : undefined,
    name: s.name,
  }));
}
