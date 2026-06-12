// Status machine — exact port of csm determineStatus
// (/tmp/csm-src/internal/session/session.go:875-1042), plus the entry-derived
// extractors: task (1045-1069), last assistant message (636-664), git branch
// (667-674), unsandboxed flag (677-694). Rule order and constants are
// load-bearing; do not reorder.

import type { LogEntry, SessionStatus } from "./types";

/** Pending tool_use newer than this is "executing", not "needs approval" (2 min). */
const TOOL_PENDING_WINDOW_MS = 2 * 60 * 1000;
/** Progress heartbeat freshness window (2 min). */
const PROGRESS_HEARTBEAT_MS = 2 * 60 * 1000;
/** Log file mtime freshness window — streaming writes in progress (30 s). */
const FILE_MTIME_WINDOW_MS = 30 * 1000;
/** Entries older than this with a running process → Waiting (5 min). */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

const STATUS_PRIORITY: Record<SessionStatus, number> = {
  working: 0,
  needs_input: 1,
  waiting: 2,
  inactive: 3,
};

/** Sort priority for a status (lower = higher priority), csm session.go:349-364. */
export function statusPriority(s: SessionStatus): number {
  return STATUS_PRIORITY[s] ?? 4;
}

/** Entry timestamp in epoch ms; 0 when absent (mirrors Go's zero time). */
function ts(entry?: LogEntry): number {
  return entry?.timestamp ?? 0;
}

export interface StatusResult {
  status: SessionStatus;
  task: string;
}

/**
 * Analyze the last log entries to determine session status.
 * `fileModTimeMs` is the log file's mtime, used to detect recent writes that
 * may not yet appear as parsed entries (e.g. during streaming).
 */
export function determineStatus(
  entries: LogEntry[],
  isRunning: boolean,
  fileModTimeMs: number,
): StatusResult {
  const now = Date.now();

  // Rule 1: no entries — running means a new session starting up.
  if (entries.length === 0) {
    if (isRunning) return { status: "waiting", task: "-" };
    return { status: "inactive", task: "-" };
  }

  let lastAssistant: LogEntry | undefined;
  let lastUser: LogEntry | undefined;
  let lastSystem: LogEntry | undefined; // subtype === "turn_duration" only
  let lastProgress: LogEntry | undefined;
  let lastTimestamp = 0;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.timestamp != null && entry.timestamp > lastTimestamp) {
      lastTimestamp = entry.timestamp;
    }
    switch (entry.type) {
      case "assistant":
        if (!lastAssistant) lastAssistant = entry;
        break;
      case "user":
        if (!lastUser) lastUser = entry;
        break;
      case "system":
        if (!lastSystem && entry.subtype === "turn_duration") lastSystem = entry;
        break;
      case "progress":
      case "hook_progress":
      case "agent_progress":
        if (!lastProgress) lastProgress = entry;
        break;
    }
    if (lastAssistant && lastUser && lastSystem && lastProgress) break;
  }

  // Rule 2: Claude is not running — inactive.
  if (!isRunning) return { status: "inactive", task: "-" };

  // Rule 3: assistant ended with tool_use — count matching tool_results in the
  // subsequent user message. Checked BEFORE any staleness logic: a session
  // waiting for approval is not stale.
  let hasPendingToolUse = false;
  let pendingToolName = "";
  if (lastAssistant?.message) {
    let toolUseCount = 0;
    let lastToolName = "";
    for (const content of lastAssistant.message.content) {
      if (content.type === "tool_use") {
        toolUseCount++;
        lastToolName = content.name ?? "";
      }
    }

    if (toolUseCount > 0) {
      let toolResultCount = 0;
      if (lastUser && ts(lastUser) > ts(lastAssistant) && lastUser.message) {
        for (const uc of lastUser.message.content) {
          if (uc.type === "tool_result") toolResultCount++;
        }
      }

      if (toolResultCount >= toolUseCount) {
        if (lastSystem && lastUser && ts(lastSystem) > ts(lastUser)) {
          // Turn completed after tool results — fall through to later rules.
        } else {
          return { status: "working", task: "Processing..." };
        }
      } else {
        // Some tool_use blocks have no result yet.
        hasPendingToolUse = true;
        pendingToolName = lastToolName;
      }
    }
  }

  // Rule 4: pending tool_use — recent means auto-approved tool executing,
  // stale (≥ 2 min) means waiting for approval.
  if (hasPendingToolUse) {
    if (lastAssistant && now - ts(lastAssistant) < TOOL_PENDING_WINDOW_MS) {
      return { status: "working", task: `Using: ${pendingToolName}` };
    }
    return { status: "needs_input", task: `Using: ${pendingToolName}` };
  }

  // Rule 5: turn completed (turn_duration). MUST come before file-mtime and
  // progress checks — the turn_duration write itself bumps the file mtime.
  if (lastSystem) {
    if (!lastAssistant || ts(lastSystem) > ts(lastAssistant)) {
      if (lastUser && ts(lastUser) > ts(lastSystem)) {
        return { status: "working", task: "Processing..." };
      }
      return { status: "waiting", task: "-" };
    }
  }

  // Rule 6: stop_reason "end_turn" completes the turn even without a
  // turn_duration entry — unless a newer user message started a new turn.
  if (lastAssistant?.message?.stopReason === "end_turn") {
    if (!lastUser || ts(lastUser) <= ts(lastAssistant)) {
      return { status: "waiting", task: "-" };
    }
  }

  // Rule 7: recent progress heartbeat (progress/hook_progress/agent_progress).
  if (lastProgress && now - ts(lastProgress) < PROGRESS_HEARTBEAT_MS) {
    return { status: "working", task: extractTask(lastAssistant) };
  }

  // Rule 8: file recently modified — actively writing (streaming).
  if (fileModTimeMs > 0 && now - fileModTimeMs < FILE_MTIME_WINDOW_MS) {
    return { status: "working", task: extractTask(lastAssistant) };
  }

  // Rule 9: process running but log stale (> 5 min) — Waiting, not ghost.
  if (now - lastTimestamp > STALE_THRESHOLD_MS) {
    return { status: "waiting", task: "-" };
  }

  // Rule 10: recent assistant entry (2-minute window to avoid flapping).
  if (lastAssistant && now - ts(lastAssistant) < TOOL_PENDING_WINDOW_MS) {
    return { status: "working", task: extractTask(lastAssistant) };
  }

  // Rule 11: user message is the most recent entry — Claude is processing it.
  if (lastUser && (!lastAssistant || ts(lastUser) > ts(lastAssistant))) {
    return { status: "working", task: "Processing..." };
  }

  // Rule 12: default.
  return { status: "waiting", task: "-" };
}

/** Task description from an assistant entry (csm session.go:1045-1069). */
export function extractTask(entry?: LogEntry): string {
  if (!entry?.message) return "-";

  for (const content of entry.message.content) {
    if (content.type === "tool_use" && content.name) {
      return `Using: ${content.name}`;
    }
    if (content.type === "text" && content.text) {
      let text = content.text;
      if (text.length > 50) text = text.slice(0, 47) + "...";
      const idx = text.indexOf("\n");
      if (idx > 0) text = text.slice(0, idx);
      return text;
    }
  }

  return "-";
}

/** Last assistant text message: first line only, `#` headers stripped (csm 636-664). */
export function extractLastAssistantMessage(entries: LogEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "assistant" || !entry.message) continue;

    for (const content of entry.message.content) {
      if (content.type === "text" && content.text) {
        let text = content.text.trim();
        if (!text) continue;
        const idx = text.indexOf("\n");
        if (idx > 0) text = text.slice(0, idx);
        if (text.startsWith("# ")) text = text.slice(2);
        else if (text.startsWith("## ")) text = text.slice(3);
        else if (text.startsWith("### ")) text = text.slice(4);
        return text;
      }
    }
  }
  return "";
}

/** Most recent non-empty gitBranch field (csm session.go:667-674). */
export function extractGitBranch(entries: LogEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const branch = entries[i].gitBranch;
    if (branch) return branch;
  }
  return "";
}

/** True if any Bash tool_use ran with dangerouslyDisableSandbox (csm 677-694). */
export function detectUnsandboxedCommands(entries: LogEntry[]): boolean {
  for (const entry of entries) {
    if (entry.type !== "assistant" || !entry.message) continue;
    for (const content of entry.message.content) {
      if (content.type === "tool_use" && content.name === "Bash" && content.input) {
        const input = content.input as { dangerouslyDisableSandbox?: unknown };
        if (input.dangerouslyDisableSandbox === true) return true;
      }
    }
  }
  return false;
}
