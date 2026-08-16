// Background jobs — `~/.claude/jobs/<short8>/{state.json,timeline.jsonl}`,
// written by the Claude Code agents daemon. The daemon owns the state machine
// (working → done | blocked) and the respawn policy; claudemap only reads.
//
// `state.json` is rewritten in place, so a read can land mid-write: every parse
// failure is isolated to its own job rather than failing the whole listing.
//
// Server-side only.

import fs from "node:fs/promises";
import path from "node:path";
import { JOBS_DIR, JOBS_PINS } from "../paths";
import { extractProjectName } from "./discover";
import { readSessionRegistry } from "./registry";
import type { Job, JobState, JobTimelineEntry } from "./types";

/** Job directories are the daemon's 8-hex short ids; anything else is not a job. */
const JOB_ID = /^[0-9a-f]{8}$/;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asState(v: unknown): JobState {
  return v === "done" || v === "blocked" ? v : "working";
}

/**
 * Pull `--model` / `--permission-mode` out of the daemon's respawn flags so the
 * UI can show them as fields instead of a raw argv blob.
 */
function flagValue(flags: string[] | undefined, name: string): string | undefined {
  if (!flags) return undefined;
  const i = flags.indexOf(name);
  return i >= 0 ? flags[i + 1] : undefined;
}

function parseState(id: string, raw: unknown): Job | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const flags = Array.isArray(o.respawnFlags)
    ? o.respawnFlags.filter((f): f is string => typeof f === "string")
    : undefined;

  const inFlightRaw = o.inFlight as Record<string, unknown> | undefined;
  const inFlight =
    inFlightRaw && typeof inFlightRaw === "object"
      ? {
          tasks: num(inFlightRaw.tasks) ?? 0,
          queued: num(inFlightRaw.queued) ?? 0,
          kinds: Array.isArray(inFlightRaw.kinds)
            ? inFlightRaw.kinds.filter((k): k is string => typeof k === "string")
            : [],
        }
      : undefined;

  // `output` is an object envelope; `result` is the field the daemon fills.
  const output = o.output as Record<string, unknown> | undefined;
  const cwd = str(o.cwd);

  return {
    id,
    state: asState(o.state),
    detail: str(o.detail),
    tempo: str(o.tempo),
    inFlight,
    tokens: num(o.tokens),
    result: output && typeof output === "object" ? str(output.result) : undefined,
    needs: str(o.needs),
    suggestedReply: str(o.suggestedReply),
    intent: str(o.intent),
    name: str(o.name),
    nameSource: str(o.nameSource),
    sessionId: str(o.sessionId),
    resumeSessionId: str(o.resumeSessionId),
    cwd,
    project: cwd ? extractProjectName(cwd) : undefined,
    respawnFlags: flags,
    model: flagValue(flags, "--model"),
    permissionMode: flagValue(flags, "--permission-mode"),
    template: str(o.template),
    backend: str(o.backend),
    cliVersion: str(o.cliVersion),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
    logFile: str(o.linkScanPath),
  };
}

async function readPins(): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await fs.readFile(JOBS_PINS, "utf8"));
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/**
 * List every background job, newest activity first, with `live` set from the
 * session registry. Unreadable jobs are reported in `errors` and omitted.
 */
export async function readJobs(): Promise<{ jobs: Job[]; errors: string[] }> {
  let dirents;
  try {
    dirents = await fs.readdir(JOBS_DIR, { withFileTypes: true });
  } catch {
    return { jobs: [], errors: [] }; // no background job has ever run
  }

  const errors: string[] = [];
  const [pins, registry] = await Promise.all([readPins(), readSessionRegistry()]);
  const liveJobIds = new Set(
    registry.filter((s) => s.alive && s.jobId).map((s) => s.jobId as string),
  );

  const jobs: Job[] = [];
  await Promise.all(
    dirents.map(async (d) => {
      if (!d.isDirectory() || !JOB_ID.test(d.name)) return;
      let job: Job | null;
      try {
        const raw = await fs.readFile(
          path.join(JOBS_DIR, d.name, "state.json"),
          "utf8",
        );
        job = parseState(d.name, JSON.parse(raw));
      } catch (e) {
        // A job directory can exist before (or without) a state.json — the
        // daemon creates `tmp/` first. That is not a failure; only a malformed
        // record is worth reporting.
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
          errors.push(`${d.name}: ${(e as Error).message}`);
        }
        return;
      }
      if (!job) return;
      job.pinned = pins.has(d.name);
      job.live = liveJobIds.has(d.name);
      jobs.push(job);
    }),
  );

  // Pinned first, then blocked (they want a human), then newest activity.
  const rank = (j: Job) => (j.state === "blocked" ? 0 : j.state === "working" ? 1 : 2);
  jobs.sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "") || 0;
  });

  return { jobs, errors };
}

/**
 * Read one job's append-only progress timeline, oldest first. `id` is validated
 * against the 8-hex job-id shape before it reaches the filesystem, so a
 * caller-supplied value can never escape the jobs directory.
 */
export async function readJobTimeline(id: string): Promise<JobTimelineEntry[]> {
  if (!JOB_ID.test(id)) throw new Error("invalid job id");

  let raw: string;
  try {
    raw = await fs.readFile(path.join(JOBS_DIR, id, "timeline.jsonl"), "utf8");
  } catch {
    return []; // a job can exist before it has emitted any transition
  }

  const out: JobTimelineEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      out.push({
        at: str(o.at) ?? "",
        state: asState(o.state),
        detail: str(o.detail) ?? "",
        text: str(o.text),
      });
    } catch {
      // A partially-flushed final line is normal while a job is running.
    }
  }
  return out;
}
