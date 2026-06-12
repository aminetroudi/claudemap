// Wire + log shapes for the Sessions monitor (port of csm's session model,
// /tmp/csm-src/internal/session/session.go:19-182).
// API wire convention: camelCase keys, ISO timestamp strings, millisecond durations.

export type SessionStatus = "working" | "needs_input" | "waiting" | "inactive";

export interface Origin {
  category: "terminal" | "ide" | "desktop";
  app: string;
  display: string;
}

export interface LiveSession {
  sessionId: string;
  project: string;
  projectPath?: string;
  logFile: string;
  status: SessionStatus;
  task: string;
  lastMessage?: string;
  summary?: string;
  sessionTitle?: string;
  lastActivity: string; // ISO
  gitBranch?: string;
  origin?: Origin;
  pid?: number;
  kind?: "interactive" | "background";
  attachId?: string;
  isGhost?: boolean;
  hasUnsandboxed?: boolean;
  contextPercent?: number;
  contextTokens?: number;
  model?: string;
}

export interface SessionsResult {
  sessions: LiveSession[];
  error?: string;
}

// ── JSONL log entry shapes (internal, parsed from ~/.claude/projects logs) ──

/** Token usage — only the 4 top-level fields; the real payload is a superset. */
export interface Usage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

export interface ContentItem {
  type: string;
  text?: string;
  name?: string; // for tool_use
  input?: unknown; // for tool_use inputs
}

export interface LogMessage {
  role?: string;
  model?: string;
  content: ContentItem[];
  usage?: Usage;
  stopReason?: string;
}

/**
 * One parsed JSONL line. Unknown line types (attachment, file-history-snapshot,
 * last-prompt, mode, permission-mode, …) are kept with just their `type` and
 * any recognized fields; consumers match on `type` and ignore the rest.
 */
export interface LogEntry {
  type: string;
  subtype?: string;
  /** Epoch milliseconds (parsed from the ISO `timestamp` field); absent if missing/invalid. */
  timestamp?: number;
  message?: LogMessage;
  summary?: string; // for type "summary"
  gitBranch?: string;
  cwd?: string;
  customTitle?: string;
  aiTitle?: string; // for type "ai-title"
}
