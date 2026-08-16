// Subagent transcripts — `projects/<key>/<parentUuid>/subagents/agent-<id>.jsonl`.
//
// Claude Code writes every Task/subagent run to its own log in a sidecar dir
// named after the PARENT session. Session discovery deliberately skips these
// (they are not sessions you can attach to and they would flood the live list),
// but they are the only record of what delegated work actually did — so they
// are surfaced here, attached to the parent they belong to.
//
// Server-side only. Callers must pass an already-guarded parent log path.

import fs from "node:fs/promises";
import path from "node:path";

export interface Subagent {
  /** Hex agent id from the filename — unique within the parent session. */
  agentId: string;
  /** Session that spawned it. */
  parentSessionId: string;
  /** The prompt the subagent was handed. */
  task: string;
  /** Its final text answer, when it produced one. */
  result?: string;
  messageCount: number;
  /** Assistant output tokens summed across the run, when reported. */
  outputTokens?: number;
  startedAt?: string; // ISO
  endedAt?: string; // ISO
  cwd?: string;
  gitBranch?: string;
}

/** Concatenate the text blocks of a message content field, string or array. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function parseOne(agentId: string, raw: string): Subagent | null {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  let parentSessionId = "";
  let task = "";
  let result = "";
  let outputTokens = 0;
  let sawUsage = false;
  let startedAt = "";
  let endedAt = "";
  let cwd = "";
  let gitBranch = "";
  let messageCount = 0;

  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // torn final line while the subagent is still running
    }

    const type = e.type;
    if (type !== "user" && type !== "assistant") continue;
    messageCount++;

    if (!parentSessionId && typeof e.sessionId === "string") parentSessionId = e.sessionId;
    if (!cwd && typeof e.cwd === "string") cwd = e.cwd;
    if (!gitBranch && typeof e.gitBranch === "string") gitBranch = e.gitBranch;
    if (typeof e.timestamp === "string") {
      if (!startedAt) startedAt = e.timestamp;
      endedAt = e.timestamp;
    }

    const msg = e.message as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== "object") continue;

    // The first user turn is the task; later user turns are tool results.
    if (type === "user" && !task) task = textOf(msg.content);

    if (type === "assistant") {
      const t = textOf(msg.content);
      if (t) result = t; // last non-empty assistant text wins
      const usage = msg.usage as Record<string, unknown> | undefined;
      const out = usage?.output_tokens ?? usage?.outputTokens;
      if (typeof out === "number") {
        outputTokens += out;
        sawUsage = true;
      }
    }
  }

  if (!task && !result) return null;

  return {
    agentId,
    parentSessionId,
    task,
    result: result || undefined,
    messageCount,
    outputTokens: sawUsage ? outputTokens : undefined,
    startedAt: startedAt || undefined,
    endedAt: endedAt || undefined,
    cwd: cwd || undefined,
    gitBranch: gitBranch || undefined,
  };
}

/**
 * Read every subagent spawned by one session, oldest first.
 *
 * @param parentLogFile an already-guarded `.../projects/<key>/<uuid>.jsonl` path.
 *   The sidecar directory is derived from it, so no new path input is accepted.
 */
export async function readSubagents(parentLogFile: string): Promise<Subagent[]> {
  const dir = path.join(
    path.dirname(parentLogFile),
    path.basename(parentLogFile, ".jsonl"),
    "subagents",
  );

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return []; // the overwhelming majority of sessions spawn no subagents
  }

  const out: Subagent[] = [];
  await Promise.all(
    names.map(async (name) => {
      const m = /^agent-([0-9a-f]+)\.jsonl$/.exec(name);
      if (!m) return;
      try {
        const raw = await fs.readFile(path.join(dir, name), "utf8");
        const rec = parseOne(m[1], raw);
        if (rec) out.push(rec);
      } catch {
        // unreadable transcript — omit rather than fail the whole listing
      }
    }),
  );

  out.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return out;
}
