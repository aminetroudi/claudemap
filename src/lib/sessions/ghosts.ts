// Ghost process detection + kill — port of csm FindGhostProcesses /
// KillGhostProcesses (session.go:1080-1154). A ghost is a session whose process
// is still alive but whose log has been silent for over an hour. discoverSessions
// already flags these (isGhost) using the same 1 h threshold.
//
// SECURITY: before signalling, re-verify the pid still maps to a `claude`
// process via `ps -p <pid> -o comm=` — pids are recycled, and we must never
// SIGTERM an unrelated process that inherited a dead Claude's pid. SIGTERM only,
// never SIGKILL. Server-side only.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { discoverSessions } from "./discover";
import type { LiveSession } from "./types";

const execFileP = promisify(execFile);

/** Sessions with a live pid that have been idle past the ghost threshold. */
export async function findGhostProcesses(): Promise<LiveSession[]> {
  const sessions = await discoverSessions();
  return sessions.filter((s) => s.isGhost && typeof s.pid === "number" && s.pid > 0);
}

/** PID-reuse guard: true only if pid currently belongs to a `claude` process. */
async function isClaudePid(pid: number): Promise<boolean> {
  try {
    const { stdout } = await execFileP("ps", ["-p", String(pid), "-o", "comm="], {
      timeout: 5000,
    });
    return stdout.trim().endsWith("claude");
  } catch {
    return false; // ps exits non-zero when the pid no longer exists
  }
}

/**
 * Kill confirmed ghosts. Each pid is re-verified against `comm` immediately
 * before the signal so a recycled pid is never touched. Returns the count
 * actually signalled.
 */
export async function killGhostProcesses(): Promise<{ killed: number }> {
  const ghosts = await findGhostProcesses();
  let killed = 0;
  for (const g of ghosts) {
    const pid = g.pid;
    if (typeof pid !== "number" || pid <= 0) continue;
    if (!(await isClaudePid(pid))) continue; // recycled or already gone
    try {
      process.kill(pid, "SIGTERM"); // SIGTERM only — never SIGKILL
      killed++;
    } catch {
      // Exited in the window between check and signal — fine.
    }
  }
  return { killed };
}
