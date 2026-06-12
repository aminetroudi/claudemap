// Local token usage over a rolling 5-hour window — port of csm ComputeUsage
// and scanLogTokens (/tmp/csm-src/internal/session/quota.go:60-117, 247-325).
// Per-log streaming scan with a `"usage"` substring pre-filter and per-line
// timestamp gate, summing the four token fields by fast string matching (no
// full JSON parse). Server-side only.

import { createReadStream } from "node:fs";
import readline from "node:readline";
import { discoverHistory } from "./history";
import type { SessionUsage, UsageStats } from "./types";

const WINDOW_MS = 5 * 60 * 60 * 1000;

/** Parse a `"field":<int>` value by string matching (quota.go extractIntField). */
function extractIntField(line: string, prefix: string): number {
  const idx = line.indexOf(prefix);
  if (idx < 0) return 0;
  let start = idx + prefix.length;
  while (start < line.length && line[start] === " ") start++;
  let end = start;
  while (end < line.length && line[end] >= "0" && line[end] <= "9") end++;
  if (end === start) return 0;
  return Number.parseInt(line.slice(start, end), 10);
}

/** Parse `"timestamp":"…"` to epoch ms, 0 if absent/invalid. */
function extractTimestampMs(line: string): number {
  const prefix = '"timestamp":"';
  const idx = line.indexOf(prefix);
  if (idx < 0) return 0;
  const start = idx + prefix.length;
  const end = line.indexOf('"', start);
  if (end < 0) return 0;
  const ms = Date.parse(line.slice(start, end));
  return Number.isNaN(ms) ? 0 : ms;
}

interface LogTokens {
  input: number;
  output: number;
  cache: number;
  hasTokens: boolean;
}

/** Sum tokens from usage lines newer than the window start (quota.go:249-292). */
async function scanLogTokens(logFile: string, windowStartMs: number): Promise<LogTokens> {
  const acc: LogTokens = { input: 0, output: 0, cache: 0, hasTokens: false };

  let rl: readline.Interface | null = null;
  try {
    rl = readline.createInterface({
      input: createReadStream(logFile, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      if (!line.includes('"usage"')) continue; // fast pre-filter

      const ts = extractTimestampMs(line);
      if (ts === 0 || ts < windowStartMs) continue;

      const input = extractIntField(line, '"input_tokens":');
      const output = extractIntField(line, '"output_tokens":');
      const cacheCreation = extractIntField(line, '"cache_creation_input_tokens":');
      const cacheRead = extractIntField(line, '"cache_read_input_tokens":');

      if (input > 0 || output > 0 || cacheCreation > 0 || cacheRead > 0) {
        acc.input += input;
        acc.output += output;
        acc.cache += cacheCreation + cacheRead;
        acc.hasTokens = true;
      }
    }
  } catch {
    // Unreadable file — skip it.
  } finally {
    rl?.close();
  }

  return acc;
}

/** Aggregate token usage across all sessions active in the last 5 hours. */
export async function computeUsage(): Promise<UsageStats> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const base: UsageStats = {
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(now).toISOString(),
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    totalTokens: 0,
    sessions: [],
  };

  // 1 day of history more than covers a 5 h window (csm ComputeUsage).
  const history = await discoverHistory(1);

  for (const s of history) {
    const endMs = Date.parse(s.endTime);
    if (!Number.isNaN(endMs) && endMs < windowStart) continue; // ended before the window

    const t = await scanLogTokens(s.logFile, windowStart);
    if (!t.hasTokens) continue;

    base.sessions.push({
      project: s.project,
      logFile: s.logFile,
      inputTokens: t.input,
      outputTokens: t.output,
      cacheTokens: t.cache,
      totalTokens: t.input + t.output + t.cache,
      startTime: s.startTime,
      endTime: s.endTime,
    });
    base.inputTokens += t.input;
    base.outputTokens += t.output;
    base.cacheTokens += t.cache;
  }

  base.totalTokens = base.inputTokens + base.outputTokens + base.cacheTokens;
  base.sessions.sort((a: SessionUsage, b: SessionUsage) => b.totalTokens - a.totalTokens);
  return base;
}
