// JSONL log parsing — port of csm's LogEntry/Message structs and the
// mixed-content unmarshal (/tmp/csm-src/internal/session/session.go:59-182).
// Server-side only.

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import type { ContentItem, LogEntry, LogMessage } from "./types";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Parse a `message.content` value. It may be a plain string (user prompts),
 * or an array of block objects possibly mixed with bare strings (individual
 * characters of user prompts). Consecutive bare strings are concatenated
 * into a single text block (session.go:101-160).
 */
function parseContent(raw: unknown): ContentItem[] {
  if (typeof raw === "string") {
    return raw !== "" ? [{ type: "text", text: raw }] : [];
  }
  if (!Array.isArray(raw)) return [];

  const items: ContentItem[] = [];
  let textBuf = "";
  const flushText = () => {
    if (textBuf.length > 0) {
      items.push({ type: "text", text: textBuf });
      textBuf = "";
    }
  };

  for (const el of raw) {
    if (typeof el === "string") {
      textBuf += el;
      continue;
    }
    flushText();
    if (el && typeof el === "object" && !Array.isArray(el)) {
      const o = el as Record<string, unknown>;
      const item: ContentItem = { type: typeof o.type === "string" ? o.type : "" };
      if (typeof o.text === "string") item.text = o.text;
      if (typeof o.name === "string") item.name = o.name;
      if (o.input !== undefined) item.input = o.input;
      items.push(item);
    }
  }
  flushText();

  return items;
}

function parseMessage(raw: Record<string, unknown>): LogMessage {
  const message: LogMessage = { content: parseContent(raw.content) };
  if (typeof raw.role === "string") message.role = raw.role;
  if (typeof raw.model === "string") message.model = raw.model;
  if (typeof raw.stop_reason === "string") message.stopReason = raw.stop_reason;

  const usage = raw.usage;
  if (usage && typeof usage === "object" && !Array.isArray(usage)) {
    const u = usage as Record<string, unknown>;
    // Read only the 4 top-level token fields — the live payload is a superset
    // (nested cache_creation, iterations[], …).
    message.usage = {
      inputTokens: num(u.input_tokens),
      cacheCreationInputTokens: num(u.cache_creation_input_tokens),
      cacheReadInputTokens: num(u.cache_read_input_tokens),
      outputTokens: num(u.output_tokens),
    };
  }

  return message;
}

/** Parse one JSONL line into a LogEntry. Returns null for invalid/non-object lines. */
export function parseLogLine(line: string): LogEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") return null;

  const entry: LogEntry = { type: obj.type };
  if (typeof obj.subtype === "string") entry.subtype = obj.subtype;
  if (typeof obj.timestamp === "string") {
    const ms = Date.parse(obj.timestamp);
    if (!Number.isNaN(ms)) entry.timestamp = ms;
  }
  if (typeof obj.summary === "string") entry.summary = obj.summary;
  if (typeof obj.gitBranch === "string") entry.gitBranch = obj.gitBranch;
  if (typeof obj.cwd === "string") entry.cwd = obj.cwd;
  if (typeof obj.customTitle === "string") entry.customTitle = obj.customTitle;
  if (typeof obj.aiTitle === "string") entry.aiTitle = obj.aiTitle;
  if (obj.message && typeof obj.message === "object" && !Array.isArray(obj.message)) {
    entry.message = parseMessage(obj.message as Record<string, unknown>);
  }
  return entry;
}

/** Initial tail window. Grows if huge lines (entries can be several MB) leave us short. */
const TAIL_CHUNK_BYTES = 256 * 1024;

/**
 * Read the last `count` valid JSON entries from a JSONL file without parsing
 * the whole file (csm semantics, session.go:775-809, done as a tail read):
 * read the trailing bytes, split lines, drop the possibly-truncated first
 * line, parse the rest, and widen the window if a single huge line ate it.
 */
export async function readLastEntries(filePath: string, count = 100): Promise<LogEntry[]> {
  const handle = await fs.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    if (size === 0) return [];

    let window = TAIL_CHUNK_BYTES;
    for (;;) {
      const start = Math.max(0, size - window);
      const length = size - start;
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, start);
      let lines = buf.toString("utf8", 0, bytesRead).split("\n");
      if (start > 0) lines = lines.slice(1); // first line may be truncated mid-record

      const entries: LogEntry[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const entry = parseLogLine(trimmed);
        if (entry) entries.push(entry);
      }

      if (entries.length >= count || start === 0) {
        return entries.length > count ? entries.slice(entries.length - count) : entries;
      }
      window = Math.min(size, window * 4);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Streaming full-file scanner (for code paths the plan allows full scans on:
 * history, metrics, summaries). Memory is bounded by the longest single line.
 */
export function scanEntries(filePath: string, onEntry: (entry: LogEntry) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line) return;
      const entry = parseLogLine(line);
      if (entry) onEntry(entry);
    });
    rl.on("close", () => resolve());
    stream.on("error", (err) => {
      rl.close();
      reject(err);
    });
  });
}
