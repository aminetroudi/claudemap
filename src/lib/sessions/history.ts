// Session history discovery — port of csm DiscoverHistory and QuickSessionStats
// (/tmp/csm-src/internal/session/history.go:48-301). Two phases: read the rich
// sessions-index.json files first, then fill gaps by scanning loose *.jsonl.
//
// QuickSessionStats is deliberately STRING-MATCHING, not full JSON parsing — it
// runs over every history file, so it stays a cheap substring scan (csm
// history.go:247-301). Do not "upgrade" it to JSON.parse per line.
// Server-side only.

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { PROJECTS_DIR } from "../paths";
import { decodeProjectName, extractProjectName } from "./discover";
import type { HistorySession } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuickStats {
  messageCount: number;
  /** Epoch ms of the first/last timestamped line, 0 when none was found. */
  startTime: number;
  endTime: number;
  gitBranch: string;
  firstPrompt: string;
  cwd: string;
  customTitle: string;
}

/** Extract a JSON string value by fast substring match (history.go:305-316). */
function extractStringField(line: string, prefix: string): string {
  const idx = line.indexOf(prefix);
  if (idx < 0) return "";
  const start = idx + prefix.length;
  const end = line.indexOf('"', start);
  if (end < 0 || end === start) return "";
  return line.slice(start, end);
}

/** Read from `start` until the next unescaped double quote (history.go:347-366). */
function extractQuotedValue(line: string, start: number): string {
  if (start >= line.length) return "";
  let i = start;
  while (i < line.length) {
    if (line[i] === "\\") {
      i += 2; // skip escaped char
      continue;
    }
    if (line[i] === '"') break;
    i++;
  }
  if (i <= start || i > line.length) return "";
  return line.slice(start, i);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + "...";
}

/** First user-prompt text, plain-string or object-array form (history.go:320-343). */
function extractPromptFromLine(line: string): string {
  const contentStr = '"content":"';
  const sidx = line.indexOf(contentStr);
  if (sidx >= 0) {
    const text = extractQuotedValue(line, sidx + contentStr.length);
    if (text) return truncate(text, 120);
  }
  const contentArr = '"content":[';
  const cidx = line.indexOf(contentArr);
  if (cidx >= 0) {
    const textField = '"text":"';
    const tidx = line.indexOf(textField, cidx);
    if (tidx >= 0) {
      const text = extractQuotedValue(line, tidx + textField.length);
      if (text) return truncate(text, 120);
    }
  }
  return "";
}

/** Parse the `"timestamp":"…"` field to epoch ms, 0 when missing/invalid. */
function extractTimestampFromLine(line: string): number {
  const ts = extractStringField(line, '"timestamp":"');
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Fast scan of a log file for history metadata — message count, time range,
 * git branch, cwd, first prompt, custom title — without full JSON parsing
 * (csm QuickSessionStats, history.go:247-301).
 */
export async function quickSessionStats(logFile: string): Promise<QuickStats> {
  const stats: QuickStats = {
    messageCount: 0,
    startTime: 0,
    endTime: 0,
    gitBranch: "",
    firstPrompt: "",
    cwd: "",
    customTitle: "",
  };

  let rl: readline.Interface | null = null;
  try {
    rl = readline.createInterface({
      input: createReadStream(logFile, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;

      // Count user prompts only (exclude tool results and assistant messages).
      const isUserMsg = line.includes('"type":"user"') && !line.includes('"type":"tool_result"');
      if (isUserMsg) {
        stats.messageCount++;
        if (stats.firstPrompt === "") stats.firstPrompt = extractPromptFromLine(line);
      }

      const b = extractStringField(line, '"gitBranch":"');
      if (b) stats.gitBranch = b; // last non-empty wins (branch can change)

      if (stats.cwd === "") {
        const c = extractStringField(line, '"cwd":"');
        if (c) stats.cwd = c; // first non-empty (constant within a session)
      }

      const t = extractStringField(line, '"customTitle":"');
      if (t) stats.customTitle = t; // last non-empty wins

      const ts = extractTimestampFromLine(line);
      if (ts) {
        if (stats.startTime === 0) stats.startTime = ts;
        stats.endTime = ts;
      }
    }
  } catch {
    // Unreadable file — return whatever we gathered (callers fall back to mtime).
  } finally {
    rl?.close();
  }

  return stats;
}

interface IndexEntry {
  sessionId?: string;
  fullPath?: string;
  created?: string;
  modified?: string;
  messageCount?: number;
  firstPrompt?: string;
  gitBranch?: string;
  projectPath?: string;
  isSidechain?: boolean;
}

async function parseSessionIndex(file: string): Promise<IndexEntry[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { entries?: IndexEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * Discover sessions from the past `days` days, merging index-based metadata
 * with a direct .jsonl scan so projects without an index still appear
 * (csm DiscoverHistory, history.go:48-196). Sorted newest-first.
 */
export async function discoverHistory(days: number): Promise<HistorySession[]> {
  let dirents;
  try {
    dirents = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const cutoff = Date.now() - days * DAY_MS;
  const seen = new Set<string>();
  const sessions: HistorySession[] = [];

  // Phase 1 — sessions-index.json files (richest metadata).
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
    const indexFile = path.join(PROJECTS_DIR, dirent.name, "sessions-index.json");
    const entries = await parseSessionIndex(indexFile);
    for (const entry of entries) {
      if (entry.isSidechain) continue;
      if (!entry.fullPath || !entry.created) continue;
      const start = Date.parse(entry.created);
      if (Number.isNaN(start) || start < cutoff) continue;
      let end = entry.modified ? Date.parse(entry.modified) : start;
      if (Number.isNaN(end)) end = start;
      sessions.push({
        project: extractProjectName(entry.projectPath ?? ""),
        gitBranch: entry.gitBranch || undefined,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        durationMs: Math.max(0, end - start),
        messageCount: entry.messageCount ?? 0,
        firstPrompt: entry.firstPrompt ?? "",
        logFile: entry.fullPath,
      });
      seen.add(entry.fullPath);
    }
  }

  // Phase 2 — loose .jsonl files not already covered by an index.
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
    const projectDir = path.join(PROJECTS_DIR, dirent.name);
    const projectName = decodeProjectName(dirent.name);

    let files;
    try {
      files = await fs.readdir(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const f of files) {
      if (f.isDirectory() || !f.name.endsWith(".jsonl")) continue;
      if (f.name.startsWith("agent-")) continue; // subagent/sidechain logs
      const logFile = path.join(projectDir, f.name);
      if (seen.has(logFile)) continue;

      let info;
      try {
        info = await fs.stat(logFile);
      } catch {
        continue;
      }
      if (info.size === 0) continue;
      if (info.mtimeMs < cutoff) continue; // cheap pre-parse cutoff on mtime

      const q = await quickSessionStats(logFile);
      const start = q.startTime || info.mtimeMs;
      const end = q.endTime || info.mtimeMs;
      if (start < cutoff) continue; // re-check against real start time

      const displayName = q.cwd ? extractProjectName(q.cwd) : projectName;
      sessions.push({
        project: displayName,
        gitBranch: q.gitBranch || undefined,
        firstPrompt: q.firstPrompt,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        durationMs: Math.max(0, end - start),
        messageCount: q.messageCount,
        logFile,
      });
      seen.add(logFile);
    }
  }

  sessions.sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));
  return sessions;
}
