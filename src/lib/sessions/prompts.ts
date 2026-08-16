// Prompt history — `~/.claude/history.jsonl`, the CLI's own append-only record
// of every prompt you have submitted, across every project.
//
// This is the cheapest cross-session search claudemap can offer: the CLI has
// already extracted the prompt text, the project, the timestamp and the session
// id, so no JSONL transcript parsing or full-text index is involved. Matching is
// a literal case-insensitive substring scan over the prompt text.
//
// Server-side only.

import fs from "node:fs/promises";
import path from "node:path";
import { CLAUDE_DIR } from "../paths";

const HISTORY_FILE = path.join(CLAUDE_DIR, "history.jsonl");

export interface PromptEntry {
  /** The prompt text as submitted. */
  text: string;
  /** Working directory the prompt was submitted from. */
  project: string;
  sessionId: string;
  at: string; // ISO
  /** True when the prompt carried pasted attachments. */
  hasPaste?: boolean;
}

export interface PromptSearchResult {
  entries: PromptEntry[];
  /** Matches before the limit was applied. */
  total: number;
  /** Total prompts on record, regardless of query. */
  scanned: number;
}

/**
 * Search prompt history, newest first.
 *
 * @param q      literal case-insensitive substring; empty returns the most recent.
 * @param limit  maximum entries to return.
 * @param project optional exact working-directory filter.
 */
export async function searchPrompts(
  q: string,
  limit = 100,
  project?: string,
): Promise<PromptSearchResult> {
  let raw: string;
  try {
    raw = await fs.readFile(HISTORY_FILE, "utf8");
  } catch {
    return { entries: [], total: 0, scanned: 0 };
  }

  const needle = q.trim().toLowerCase();
  const matches: PromptEntry[] = [];
  let scanned = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue; // partially-flushed final line while the CLI is writing
    }
    const text = typeof o.display === "string" ? o.display : "";
    if (!text) continue;
    scanned++;

    const proj = typeof o.project === "string" ? o.project : "";
    if (project && proj !== project) continue;
    if (needle && !text.toLowerCase().includes(needle)) continue;

    const ts = typeof o.timestamp === "number" ? o.timestamp : 0;
    const paste = o.pastedContents;
    matches.push({
      text,
      project: proj,
      sessionId: typeof o.sessionId === "string" ? o.sessionId : "",
      at: ts ? new Date(ts).toISOString() : "",
      hasPaste:
        !!paste && typeof paste === "object" && Object.keys(paste).length > 0
          ? true
          : undefined,
    });
  }

  matches.reverse(); // file is append-order; newest first for the UI
  return { entries: matches.slice(0, limit), total: matches.length, scanned };
}

export interface ActivityDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export interface ActivityResult {
  /** One entry per day in range, including zero days, oldest first. */
  days: ActivityDay[];
  /** Prompt totals per working directory, busiest first. */
  projects: Array<{ project: string; count: number; lastAt: string }>;
  total: number;
  /** Busiest single day in range. */
  peak: number;
  /** Consecutive days with at least one prompt, counting back from today. */
  streak: number;
}

/** Local `YYYY-MM-DD` — deliberately not UTC, so days line up with your clock. */
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Aggregate prompt history into a daily activity series plus per-project
 * totals. Streams the file once and counts — never materializes the entries.
 *
 * @param days how many days back from today to include.
 */
export async function promptActivity(days = 182): Promise<ActivityResult> {
  const byDay = new Map<string, number>();
  const byProject = new Map<string, { count: number; last: number }>();
  let total = 0;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffMs = cutoff.getTime();

  let raw: string;
  try {
    raw = await fs.readFile(HISTORY_FILE, "utf8");
  } catch {
    return { days: [], projects: [], total: 0, peak: 0, streak: 0 };
  }

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = typeof o.timestamp === "number" ? o.timestamp : 0;
    if (!ts || ts < cutoffMs) continue;

    total++;
    const key = dayKey(new Date(ts));
    byDay.set(key, (byDay.get(key) ?? 0) + 1);

    const proj = typeof o.project === "string" ? o.project : "";
    if (proj) {
      const cur = byProject.get(proj);
      if (cur) {
        cur.count++;
        if (ts > cur.last) cur.last = ts;
      } else {
        byProject.set(proj, { count: 1, last: ts });
      }
    }
  }

  // Emit every day in range, zeros included, so the grid has no holes.
  const series: ActivityDay[] = [];
  let peak = 0;
  const cursor = new Date(cutoffMs);
  const today = dayKey(new Date());
  for (let i = 0; i < days; i++) {
    const key = dayKey(cursor);
    const count = byDay.get(key) ?? 0;
    if (count > peak) peak = count;
    series.push({ date: key, count });
    cursor.setDate(cursor.getDate() + 1);
    if (key === today) break; // never project into the future
  }

  // Streak counts back from today; an empty today does not break a run that
  // ended yesterday, since the day is not over yet.
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].count > 0) streak++;
    else if (i !== series.length - 1) break;
  }

  const projects = [...byProject.entries()]
    .map(([project, v]) => ({
      project,
      count: v.count,
      lastAt: new Date(v.last).toISOString(),
    }))
    .sort((a, b) => b.count - a.count);

  return { days: series, projects, total, peak, streak };
}

/** Distinct working directories present in prompt history, most-used first. */
export async function promptProjects(): Promise<string[]> {
  const { entries } = await searchPrompts("", Number.MAX_SAFE_INTEGER);
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.project) counts.set(e.project, (counts.get(e.project) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}
