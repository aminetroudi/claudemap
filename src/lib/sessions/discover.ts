// Session discovery — port of csm Discover/findActiveLogs/parseSession
// (/tmp/csm-src/internal/session/session.go:285-346, 425-504, 506-595) with
// process info joined from `claude agents --json` (sessionId first, then
// encoded-cwd). Live data comes from a last-100-entries tail read only —
// full-file scans are reserved for the history/metrics phases.

import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR } from "../paths";
import { extractContextUsage } from "./context";
import { readLastEntries } from "./jsonl";
import { resolveOrigin } from "./origin";
import { listClaudeProcesses, type ClaudeProcess } from "./process";
import {
  detectUnsandboxedCommands,
  determineStatus,
  extractGitBranch,
  extractLastAssistantMessage,
  statusPriority,
} from "./status";
import type { LiveSession, LogEntry } from "./types";

/** Extra logs modified within this window also count as active (5 min). */
const RECENT_LOG_WINDOW_MS = 5 * 60 * 1000;
/** Running process + log activity older than this = ghost (1 h, csm session.go:1080-1110). */
const GHOST_AGE_MS = 60 * 60 * 1000;
/** Stopped sessions stay in the live view this long (1 h, csm handlers.go:27-42). */
const LIVE_RETENTION_MS = 60 * 60 * 1000;

/** Readable project name from the encoded dir name (csm session.go:737-773). Lossy fallback. */
export function decodeProjectName(name: string): string {
  name = name.replace(/^-/, "");

  const idx = name.indexOf("-Projects-");
  if (idx !== -1) return formatProjectPath(name.slice(idx + "-Projects-".length));

  const parts = name.split("-");
  if (parts.length >= 3 && parts[0] === "Users") {
    return formatProjectPath(parts.slice(2).join("-"));
  }

  return name.replace(/-/g, "/");
}

function formatProjectPath(p: string): string {
  const idx = p.indexOf("-");
  if (idx !== -1) return p.slice(0, idx) + "/" + p.slice(idx + 1);
  return p;
}

/** Readable project name from a real cwd path (csm history.go:214-243). */
export function extractProjectName(fullPath: string): string {
  const markers = ["/Projects/", "/repos/", "/src/", "/code/", "/workspace/"];
  for (const marker of markers) {
    const idx = fullPath.indexOf(marker);
    if (idx !== -1) return fullPath.slice(idx + marker.length);
  }

  if (fullPath.startsWith("/home/")) {
    const rest = fullPath.slice("/home/".length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) {
      const afterUser = rest.slice(slashIdx + 1);
      if (afterUser) return afterUser;
    }
  }

  const parts = fullPath.split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 2] + "/" + parts[parts.length - 1];
  }
  return fullPath;
}

/**
 * Active JSONL logs for one project dir (csm session.go:425-504).
 * With running processes: the top `runningCount` most-recent files plus any
 * file touched in the last 5 minutes. Without: the single most recent file
 * (preferring non-empty unless an even newer empty one marks a fresh session).
 * Skips `agent-*.jsonl` subagent files and `<uuid>/` sidecar dirs.
 */
async function findActiveLogs(dir: string, runningCount: number): Promise<string[]> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const logs: Array<{ path: string; mtimeMs: number; size: number }> = [];
  for (const dirent of dirents) {
    if (dirent.isDirectory()) continue; // skips <uuid>/ sidecar dirs
    if (!dirent.name.endsWith(".jsonl")) continue;
    if (dirent.name.startsWith("agent-")) continue; // subagent logs
    const filePath = path.join(dir, dirent.name);
    try {
      const info = await fs.stat(filePath);
      logs.push({ path: filePath, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      // file vanished mid-scan
    }
  }
  if (logs.length === 0) return [];

  logs.sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (runningCount === 0) {
    for (const l of logs) {
      if (l.size > 0) {
        // An even newer empty file means a fresh session just started.
        if (logs[0].size === 0 && logs[0].mtimeMs > l.mtimeMs) return [logs[0].path];
        return [l.path];
      }
    }
    return [logs[0].path]; // all empty — newest
  }

  const recentThreshold = Date.now() - RECENT_LOG_WINDOW_MS;
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < logs.length && i < runningCount; i++) {
    result.push(logs[i].path);
    seen.add(logs[i].path);
  }
  for (const l of logs) {
    if (!seen.has(l.path) && l.mtimeMs > recentThreshold) result.push(l.path);
  }
  return result;
}

/** Parse one session from the tail of its log file (csm parseSession, session.go:506-595). */
async function parseSession(
  encodedName: string,
  logFile: string,
  proc?: ClaudeProcess,
): Promise<LiveSession | null> {
  let stat;
  try {
    stat = await fs.stat(logFile);
  } catch {
    return null;
  }

  const sessionId = path.basename(logFile, ".jsonl");
  let entries: LogEntry[] = [];
  try {
    entries = await readLastEntries(logFile, 100);
  } catch {
    entries = [];
  }

  const isRunning = proc != null;
  const { status, task } = determineStatus(entries, isRunning, stat.mtimeMs);

  // Metadata from the tail window. Prefer the real cwd over the lossy encoded
  // dir name; prefer customTitle over aiTitle.
  let cwd = "";
  let customTitle = "";
  let aiTitle = "";
  let summary = "";
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!customTitle && e.customTitle) customTitle = e.customTitle;
    if (!aiTitle && e.type === "ai-title" && e.aiTitle) aiTitle = e.aiTitle;
    if (!summary && e.type === "summary" && e.summary) summary = e.summary;
  }
  if (!cwd && proc?.cwd) cwd = proc.cwd;
  const sessionTitle = customTitle || aiTitle;

  // Actual last activity: newest entry timestamp, falling back to file mtime.
  let lastActivityMs = stat.mtimeMs;
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = entries[i].timestamp;
    if (t != null) {
      lastActivityMs = t;
      break;
    }
  }

  const context = extractContextUsage(entries);

  // Origin: cache first; /proc detection only while the process is running
  // (csm read-through rule, session.go:527-534). Never walks /proc for
  // non-running sessions — resolveOrigin is cache-only without a pid.
  const origin = await resolveOrigin(sessionId, proc?.pid);

  const session: LiveSession = {
    sessionId,
    project: cwd ? extractProjectName(cwd) : decodeProjectName(encodedName),
    projectPath: cwd || undefined,
    logFile,
    status,
    task,
    lastMessage: extractLastAssistantMessage(entries) || undefined,
    summary: summary || undefined,
    sessionTitle: sessionTitle || undefined,
    lastActivity: new Date(lastActivityMs).toISOString(),
    gitBranch: extractGitBranch(entries) || undefined,
    origin: origin ?? undefined,
    pid: proc?.pid,
    kind: proc?.kind,
    attachId: proc?.attachId,
    hasUnsandboxed: detectUnsandboxedCommands(entries) || undefined,
    contextPercent: context.contextTokens > 0 ? context.contextPercent : undefined,
    contextTokens: context.contextTokens > 0 ? context.contextTokens : undefined,
    model: context.model || undefined,
  };
  if (proc && Date.now() - lastActivityMs > GHOST_AGE_MS) session.isGhost = true;
  return session;
}

/** Discover all sessions, sorted by status priority then last activity desc. */
export async function discoverSessions(): Promise<LiveSession[]> {
  let dirents;
  try {
    dirents = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return []; // no ~/.claude/projects yet
  }

  const procs = await listClaudeProcesses();
  const bySessionId = new Map<string, ClaudeProcess>();
  const byEncodedCwd = new Map<string, ClaudeProcess[]>();
  for (const p of procs) {
    if (p.sessionId) bySessionId.set(p.sessionId, p);
    const list = byEncodedCwd.get(p.encodedCwd);
    if (list) list.push(p);
    else byEncodedCwd.set(p.encodedCwd, [p]);
  }

  const sessions: LiveSession[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name.startsWith(".")) continue;

    const projectDir = path.join(PROJECTS_DIR, dirent.name);
    const dirProcs = byEncodedCwd.get(dirent.name) ?? [];
    const logFiles = await findActiveLogs(projectDir, dirProcs.length);
    if (logFiles.length === 0) continue;

    // Join processes to logs: sessionId match first; processes without a
    // sessionId (ps-scan fallback) are paired to remaining logs by recency
    // index — most recent log gets the first PID (csm session.go:319-324).
    const matched = new Map<string, ClaudeProcess>();
    for (const logFile of logFiles) {
      const proc = bySessionId.get(path.basename(logFile, ".jsonl"));
      if (proc) matched.set(logFile, proc);
    }
    const anonymous = dirProcs.filter((p) => !p.sessionId);
    let cursor = 0;
    for (const logFile of logFiles) {
      if (matched.has(logFile)) continue;
      if (cursor >= anonymous.length) break;
      matched.set(logFile, anonymous[cursor++]);
    }

    for (const logFile of logFiles) {
      const session = await parseSession(dirent.name, logFile, matched.get(logFile));
      if (session) sessions.push(session);
    }
  }

  sessions.sort((a, b) => {
    const pa = statusPriority(a.status);
    const pb = statusPriority(b.status);
    if (pa !== pb) return pa - pb;
    return a.lastActivity < b.lastActivity ? 1 : a.lastActivity > b.lastActivity ? -1 : 0;
  });

  return sessions;
}

/**
 * Live-view filter (csm filterLiveSessions, handlers.go:31-42): every
 * non-inactive session, plus inactive ones with activity inside the
 * 1-hour retention window.
 */
export function filterLiveSessions(all: LiveSession[]): LiveSession[] {
  const cutoff = Date.now() - LIVE_RETENTION_MS;
  return all.filter((s) => {
    if (s.status !== "inactive") return true;
    const t = Date.parse(s.lastActivity);
    return !Number.isNaN(t) && t > cutoff;
  });
}
