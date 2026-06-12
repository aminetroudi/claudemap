// Session detail — paginated timeline + aggregated metrics. Port of csm
// ParseTimeline/ParseMetrics (/tmp/csm-src/internal/session/timeline.go:86-320).
// Both entry points validate the path FIRST (arbitrary-file-read guard), then
// do a full streaming JSON parse — unlike history's QuickSessionStats, these
// need real structure, and they run on one explicitly-selected file at a time.
// Server-side only.

import { contextWindowForModel } from "./context";
import { scanEntries } from "./jsonl";
import { assertLogFilePath } from "./pathguard";
import type {
  ContentItem,
  LogEntry,
  SessionMetrics,
  TimelineContent,
  TimelineEntry,
  Usage,
} from "./types";

function hasToolResult(items: ContentItem[]): boolean {
  return items.some((c) => c.type === "tool_result");
}

function isoOrEmpty(ms?: number): string {
  return ms != null ? new Date(ms).toISOString() : "";
}

/** Convert a parsed log entry to a timeline entry, or null to drop it. */
function logEntryToTimeline(entry: LogEntry): TimelineEntry | null {
  const te: TimelineEntry = {
    timestamp: isoOrEmpty(entry.timestamp),
    type: entry.type,
    subtype: entry.subtype,
    gitBranch: entry.gitBranch,
  };

  switch (entry.type) {
    case "user":
    case "assistant": {
      if (!entry.message) return null;
      // Drop user entries that are only tool_result payloads — they are
      // automatic responses, not real user turns (timeline.go:269-274).
      if (entry.type === "user" && hasToolResult(entry.message.content)) return null;

      te.model = entry.message.model;
      te.usage = entry.message.usage;
      te.content = entry.message.content.map((c) => {
        const tc: TimelineContent = { type: c.type };
        switch (c.type) {
          case "text":
            tc.text = c.text;
            break;
          case "tool_use":
            tc.tool = c.name;
            if (c.input !== undefined) tc.input = JSON.stringify(c.input);
            break;
          case "tool_result":
            tc.text = c.text;
            break;
          default:
            tc.text = c.text;
        }
        return tc;
      });
      break;
    }
    case "summary":
      te.summary = entry.summary;
      break;
    case "system":
      // Kept as-is (turn_duration, compact_boundary, …) — no content payload.
      break;
    default:
      return null; // progress and other noise types
  }

  return te;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  total: number;
}

/**
 * Paginated timeline, newest entries first (csm ParseTimeline, timeline.go:89-147).
 * offset is 0-based; limit caps the page. Validates the path before reading.
 */
export async function parseTimeline(
  logFile: string,
  offset: number,
  limit: number,
): Promise<TimelinePage> {
  const safe = await assertLogFilePath(logFile);

  const all: TimelineEntry[] = [];
  await scanEntries(safe, (entry) => {
    const te = logEntryToTimeline(entry);
    if (te) all.push(te);
  });

  all.reverse(); // newest first
  const total = all.length;
  if (offset >= total) return { entries: [], total };

  const end = Math.min(offset + limit, total);
  return { entries: all.slice(offset, end), total };
}

/**
 * Aggregated session metrics (csm ParseMetrics, timeline.go:150-252).
 * Validates the path before reading.
 */
export async function parseMetrics(logFile: string): Promise<SessionMetrics> {
  const safe = await assertLogFilePath(logFile);

  const m: SessionMetrics = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    toolUsageCounts: {},
    userPromptCount: 0,
    toolResultCount: 0,
    assistantMessageCount: 0,
    turnCount: 0,
    compactCount: 0,
    contextPercent: 0,
    contextTokens: 0,
    firstTimestamp: null,
    lastTimestamp: null,
  };

  let firstMs = Number.POSITIVE_INFINITY;
  let lastMs = Number.NEGATIVE_INFINITY;
  let lastUsage: Usage | undefined;
  let lastUsageModel = "";

  await scanEntries(safe, (entry) => {
    if (entry.timestamp != null) {
      if (entry.timestamp < firstMs) firstMs = entry.timestamp;
      if (entry.timestamp > lastMs) lastMs = entry.timestamp;
    }

    switch (entry.type) {
      case "user":
        if (entry.message && hasToolResult(entry.message.content)) m.toolResultCount++;
        else m.userPromptCount++;
        break;

      case "assistant": {
        m.assistantMessageCount++;
        if (!entry.message) break;
        if (entry.message.usage) {
          const u = entry.message.usage;
          m.totalInputTokens += u.inputTokens;
          m.totalOutputTokens += u.outputTokens;
          m.totalCacheCreationTokens += u.cacheCreationInputTokens;
          m.totalCacheReadTokens += u.cacheReadInputTokens;
          lastUsage = u;
          lastUsageModel = entry.message.model ?? "";
        }
        for (const c of entry.message.content) {
          if (c.type === "tool_use" && c.name) {
            m.toolUsageCounts[c.name] = (m.toolUsageCounts[c.name] ?? 0) + 1;
          }
        }
        break;
      }

      case "system":
        if (entry.subtype === "turn_duration") m.turnCount++;
        if (entry.subtype === "compact_boundary" || entry.subtype === "microcompact_boundary") {
          m.compactCount++;
          lastUsage = undefined; // context resets after a compaction
          lastUsageModel = "";
        }
        break;
    }
  });

  if (lastUsage) {
    const total =
      lastUsage.inputTokens +
      lastUsage.cacheCreationInputTokens +
      lastUsage.cacheReadInputTokens +
      lastUsage.outputTokens;
    m.contextTokens = total;
    m.contextPercent = (total / contextWindowForModel(lastUsageModel)) * 100;
  }

  if (Number.isFinite(firstMs)) m.firstTimestamp = new Date(firstMs).toISOString();
  if (Number.isFinite(lastMs)) m.lastTimestamp = new Date(lastMs).toISOString();

  return m;
}
