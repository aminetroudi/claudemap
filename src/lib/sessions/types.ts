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
  /** True when the session was spawned by a plugin/skill/hook, not the user. */
  automated?: boolean;
}

export interface SessionsResult {
  sessions: LiveSession[];
  error?: string;
}

// ── Usage view: local 5 h window + API quota ─────────────────────────
// Port of csm UsageStats/SessionUsage/APIQuota/QuotaBucket (quota.go:14-58)
// and ClaudeStatus (status.go:12-17). Token counts only — the OAuth token
// itself NEVER appears in any of these wire shapes.

export interface SessionUsage {
  project: string;
  logFile: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  startTime: string; // ISO
  endTime: string; // ISO
}

export interface UsageStats {
  windowStart: string; // ISO
  windowEnd: string; // ISO
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  sessions: SessionUsage[];
}

export interface QuotaBucket {
  utilization: number; // percentage 0–100
  resetsAt: string | null; // ISO
}

export interface APIQuota {
  available: boolean;
  fiveHour?: QuotaBucket | null;
  sevenDay?: QuotaBucket | null;
  sevenDaySonnet?: QuotaBucket | null;
  sevenDayOpus?: QuotaBucket | null;
  extraUsage?: { isEnabled: boolean } | null;
  error?: string;
}

export interface ClaudeStatus {
  available: boolean;
  indicator?: string; // none | minor | major | critical
  description?: string;
  error?: string;
}

export interface UsageResult {
  local: UsageStats;
  apiQuota: APIQuota;
  status?: ClaudeStatus;
  error?: string;
}

// ── History + detail (timeline/metrics) wire shapes ──────────────────
// Port of csm HistorySession (history.go:14-24), TimelineEntry/Content and
// SessionMetrics (timeline.go:13-49). Durations are MILLISECONDS, not Go ns.

export interface HistorySession {
  project: string;
  gitBranch?: string;
  startTime: string; // ISO
  endTime: string; // ISO
  durationMs: number;
  messageCount: number;
  firstPrompt: string;
  lastMessage?: string;
  /** User-set custom title, else AI-generated title, when present. */
  sessionTitle?: string;
  logFile: string;
  /** Recorded working directory, when known — used to open a Resume terminal there. */
  cwd?: string;
  /** True when the session was spawned by a plugin/skill/hook, not the user. */
  automated?: boolean;
}

export interface HistoryResult {
  sessions: HistorySession[];
  error?: string;
}

export interface TimelineContent {
  type: string; // text | tool_use | tool_result | …
  text?: string;
  tool?: string; // tool name for tool_use
  input?: string; // stringified JSON for tool_use input
}

export interface TimelineEntry {
  timestamp: string; // ISO ("" when the source line had none)
  type: string; // user | assistant | system | summary
  subtype?: string;
  model?: string;
  content?: TimelineContent[];
  usage?: Usage;
  summary?: string;
  gitBranch?: string;
}

export interface TimelineResult {
  entries: TimelineEntry[];
  total: number;
  offset: number;
  limit: number;
  error?: string;
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  toolUsageCounts: Record<string, number>;
  userPromptCount: number;
  toolResultCount: number;
  assistantMessageCount: number;
  turnCount: number;
  compactCount: number;
  contextPercent: number;
  contextTokens: number;
  firstTimestamp: string | null; // ISO
  lastTimestamp: string | null; // ISO
  error?: string;
}

// ── Background jobs (~/.claude/jobs/<short8>/) ───────────────────────
// Claude Code's own durable background-job records, written by the agents
// daemon. claudemap only reads them; the daemon owns the state machine.

export type JobState = "working" | "done" | "blocked";

/** Append-only progress line from `jobs/<short8>/timeline.jsonl`. */
export interface JobTimelineEntry {
  at: string; // ISO
  state: JobState;
  detail: string;
  /** Free-form narrative the job emitted alongside the transition. */
  text?: string;
}

export interface Job {
  /** Short 8-hex id — the directory name, and what `claude attach <id>` takes. */
  id: string;
  state: JobState;
  /** One-line human summary of where the job is right now. */
  detail?: string;
  /** Pacing hint the daemon records ("idle" when nothing is in flight). */
  tempo?: string;
  inFlight?: { tasks: number; queued: number; kinds: string[] };
  tokens?: number;
  /** Structured completion payload, present once the job reaches `done`. */
  result?: string;
  /** Why the job stopped, and the reply it suggests — only when `blocked`. */
  needs?: string;
  suggestedReply?: string;
  /** What the job was started to do, and its display name. */
  intent?: string;
  name?: string;
  nameSource?: "user" | "auto" | string;
  sessionId?: string;
  resumeSessionId?: string;
  cwd?: string;
  project?: string;
  /** Flags the daemon would re-launch this job with. */
  respawnFlags?: string[];
  model?: string;
  permissionMode?: string;
  template?: string;
  backend?: string;
  cliVersion?: string;
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
  /** True when listed in `jobs/pins.json`. */
  pinned?: boolean;
  /** Session log the daemon scans for progress, when recorded. */
  logFile?: string;
  /** Whether a live process currently claims this job id. */
  live?: boolean;
}

export interface JobsResult {
  jobs: Job[];
  error?: string;
  /** Per-directory read failures; a bad job never hides the good ones. */
  errors?: string[];
}

// ── Live session registry (~/.claude/sessions/<pid>.json) ────────────
// Written by the CLI itself. Authoritative for pid/cwd/sessionId/status —
// no /proc scraping required. `procStart` is the PID-reuse guard.

export interface RegistrySession {
  pid: number;
  procStart: string;
  sessionId: string;
  cwd: string;
  startedAt: number; // epoch ms
  version?: string;
  kind?: "interactive" | "bg";
  entrypoint?: string;
  /** Unix socket this session listens on for messages. 0600, same uid. */
  messagingSocketPath?: string;
  peerProtocol?: number;
  name?: string;
  nameSource?: string;
  jobId?: string;
  status?: "idle" | "busy" | string;
  updatedAt?: number;
  /** False when the pid is gone or its start time no longer matches. */
  alive?: boolean;
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
