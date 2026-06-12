// Context-window usage — port of csm extractContextUsage
// (/tmp/csm-src/internal/session/session.go:700-734) and the model window
// table (811-865).

import type { LogEntry } from "./types";

/** Fallback context window for Claude models (200K tokens). */
export const DEFAULT_CONTEXT_WINDOW = 200_000;
/** 1M context window, available on Opus/Sonnet from generation 4.6 onward. */
export const EXTENDED_CONTEXT_WINDOW = 1_000_000;

/**
 * Model families with extended (1M) windows, keyed by family, valued with the
 * first generation that ships it. New families are one-line additions here.
 * "fable" is a 1M-window tier (verified live: a claude-fable-5 session held
 * 510K context tokens, impossible on a 200K window).
 */
export const EXTENDED_WINDOW_FAMILIES: Record<string, { major: number; minor: number }> = {
  opus: { major: 4, minor: 6 },
  sonnet: { major: 4, minor: 6 },
  fable: { major: 5, minor: 0 },
};

/**
 * Extract family + generation from ids of the form
 * "claude-<family>-<major>[-<minor>][-suffix]". Real ids may omit the minor
 * version entirely (e.g. "claude-fable-5"), which parses as minor 0. Returns
 * null for anything else — including "<synthetic>" and empty strings — so
 * callers fall back to the safe default.
 */
function parseClaudeModel(model: string): { family: string; major: number; minor: number } | null {
  const prefix = "claude-";
  if (!model.startsWith(prefix)) return null;
  const parts = model.slice(prefix.length).split("-");
  if (parts.length < 2) return null;
  if (!/^-?\d+$/.test(parts[1])) return null;
  // Minor is optional: "claude-fable-5" → 5.0; non-numeric third parts
  // (date suffixes never appear there — they follow the minor) mean 0 too.
  const minor = parts.length >= 3 && /^-?\d+$/.test(parts[2]) ? Number.parseInt(parts[2], 10) : 0;
  return {
    family: parts[0],
    major: Number.parseInt(parts[1], 10),
    minor,
  };
}

/** Context window size for a model id; unparseable ids get the 200K default. */
export function contextWindowForModel(model: string): number {
  const parsed = parseClaudeModel(model);
  if (!parsed) return DEFAULT_CONTEXT_WINDOW;
  const threshold = EXTENDED_WINDOW_FAMILIES[parsed.family];
  if (!threshold) return DEFAULT_CONTEXT_WINDOW;
  if (
    parsed.major > threshold.major ||
    (parsed.major === threshold.major && parsed.minor >= threshold.minor)
  ) {
    return EXTENDED_CONTEXT_WINDOW;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export interface ContextUsage {
  contextPercent: number;
  contextTokens: number;
  model: string;
}

/**
 * Context usage from the last assistant entry with usage data, considering
 * only entries after the most recent compact/microcompact boundary (context
 * resets during compaction).
 */
export function extractContextUsage(entries: LogEntry[]): ContextUsage {
  // Find the most recent compact/microcompact boundary.
  let lastBoundaryIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (
      e.type === "system" &&
      (e.subtype === "compact_boundary" || e.subtype === "microcompact_boundary")
    ) {
      lastBoundaryIdx = i;
      break;
    }
  }

  // Only look for usage data AFTER the last boundary.
  for (let i = entries.length - 1; i > lastBoundaryIdx; i--) {
    const entry = entries[i];
    if (entry.type !== "assistant" || !entry.message?.usage) continue;

    const usage = entry.message.usage;
    const totalTokens =
      usage.inputTokens +
      usage.cacheCreationInputTokens +
      usage.cacheReadInputTokens +
      usage.outputTokens;
    if (totalTokens === 0) continue;

    const model = entry.message.model ?? "";
    const window = contextWindowForModel(model);
    return {
      contextPercent: (totalTokens / window) * 100,
      contextTokens: totalTokens,
      model,
    };
  }

  return { contextPercent: 0, contextTokens: 0, model: "" };
}
