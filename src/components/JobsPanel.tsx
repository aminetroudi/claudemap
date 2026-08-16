"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Coins,
  Copy,
  Loader2,
  PauseCircle,
  Pin,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { fetchJobTimeline, fetchJobs, openSessionTerminal } from "@/lib/client";
import type { Job, JobState, JobTimelineEntry } from "@/lib/sessions/types";
import { formatTokens, relativeTime } from "./sessions/format";

const STATE_META: Record<
  JobState,
  { label: string; badge: string; color: string; icon: React.ReactNode }
> = {
  blocked: {
    label: "Blocked",
    badge: "badge-amber",
    color: "var(--amber)",
    icon: <PauseCircle size={15} />,
  },
  working: {
    label: "Working",
    badge: "badge-ac",
    color: "var(--ac)",
    icon: <Loader2 size={15} style={{ animation: "spin 1.6s linear infinite" }} />,
  },
  done: {
    label: "Done",
    badge: "badge-green",
    color: "var(--green)",
    icon: <CheckCircle2 size={15} />,
  },
};

type Filter = "all" | JobState;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--t-2xs)",
          color: "var(--tx-3)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "var(--t-md)", color: "var(--tx-1)" }}>{children}</div>
    </div>
  );
}

/** Progress log for one job, loaded lazily when the row is expanded. */
function JobTimeline({ id }: { id: string }) {
  const [entries, setEntries] = useState<JobTimelineEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJobTimeline(id)
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) return <div style={{ color: "var(--red)", fontSize: "var(--t-sm)" }}>{err}</div>;
  if (!entries) return <div className="faint" style={{ fontSize: "var(--t-sm)" }}>Loading timeline…</div>;
  if (entries.length === 0)
    return <div className="faint" style={{ fontSize: "var(--t-sm)" }}>No transitions recorded yet.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {entries
        .slice()
        .reverse()
        .map((e, i) => {
          const meta = STATE_META[e.state];
          return (
            <div key={`${e.at}-${i}`} style={{ display: "flex", gap: 9 }}>
              <div style={{ color: meta.color, marginTop: 2, flexShrink: 0 }}>
                <CircleDot size={13} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--t-md)", color: meta.color, fontWeight: 600 }}>
                    {meta.label}
                  </span>
                  <span className="faint" style={{ fontSize: "var(--t-2xs)" }}>
                    {e.at ? relativeTime(e.at) : "—"}
                  </span>
                </div>
                {e.detail && (
                  <div style={{ fontSize: "var(--t-md)", color: "var(--tx-1)", marginTop: 1 }}>
                    {e.detail}
                  </div>
                )}
                {e.text?.trim() && (
                  <div
                    className="mono"
                    style={{
                      fontSize: "var(--t-sm)",
                      color: "var(--tx-2)",
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                      background: "var(--bg-2)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r)",
                      padding: "7px 9px",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {e.text.trim()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = STATE_META[job.state];

  const copyReply = async () => {
    if (!job.suggestedReply) return;
    await navigator.clipboard.writeText(job.suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          padding: "13px 15px",
          display: "flex",
          gap: 11,
          alignItems: "flex-start",
          color: "inherit",
        }}
      >
        <span style={{ color: meta.color, marginTop: 2, flexShrink: 0 }}>{meta.icon}</span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--t-lg)" }}>
              {job.name ?? job.intent ?? job.id}
            </span>
            {job.pinned && <Pin size={12} style={{ color: "var(--ac)" }} />}
            <span className={`badge ${meta.badge}`} style={{ fontSize: "var(--t-2xs)" }}>
              {meta.label}
            </span>
            {job.live && (
              <span className="badge badge-green" style={{ fontSize: "var(--t-2xs)" }}>
                live
              </span>
            )}
            <span className="mono faint" style={{ fontSize: "var(--t-2xs)" }}>
              {job.id}
            </span>
          </span>

          {job.detail && (
            <span
              style={{
                display: "block",
                fontSize: "var(--t-md)",
                color: "var(--tx-2)",
                marginTop: 3,
              }}
            >
              {job.detail}
            </span>
          )}

          <span
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 6,
              fontSize: "var(--t-2xs)",
              color: "var(--tx-3)",
            }}
          >
            {job.project && <span>{job.project}</span>}
            {job.model && <span className="mono">{job.model}</span>}
            {job.tokens != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Coins size={11} />
                {formatTokens(job.tokens)}
              </span>
            )}
            {job.inFlight && (job.inFlight.tasks > 0 || job.inFlight.queued > 0) && (
              <span>
                {job.inFlight.tasks} running · {job.inFlight.queued} queued
              </span>
            )}
            {job.updatedAt && <span>{relativeTime(job.updatedAt)}</span>}
          </span>
        </span>

        <ChevronRight
          size={16}
          style={{
            flexShrink: 0,
            marginTop: 3,
            color: "var(--tx-3)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s var(--ease)",
          }}
        />
      </button>

      {/* Blocked jobs surface their ask inline — that is the whole point of the view. */}
      {job.state === "blocked" && (job.needs || job.suggestedReply) && (
        <div
          style={{
            margin: "0 15px 13px",
            padding: "10px 12px",
            borderRadius: "var(--r)",
            background: "var(--amber-dim)",
            border: "1px solid rgba(251 191 36 / 0.25)",
          }}
        >
          {job.needs && (
            <div style={{ fontSize: "var(--t-md)", color: "var(--tx-1)" }}>{job.needs}</div>
          )}
          {job.suggestedReply && (
            <div style={{ marginTop: job.needs ? 8 : 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: "var(--t-sm)",
                  color: "var(--tx-2)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {job.suggestedReply}
              </div>
              <button
                className="btn"
                style={{ marginTop: 8 }}
                onClick={(e) => {
                  e.stopPropagation();
                  copyReply();
                }}
              >
                <Copy size={14} />
                {copied ? "Copied" : "Copy suggested reply"}
              </button>
            </div>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 15px 15px", borderTop: "1px solid var(--line)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 13,
                  padding: "13px 0",
                }}
              >
                {job.intent && <Field label="Intent">{job.intent}</Field>}
                {job.cwd && (
                  <Field label="Directory">
                    <span className="mono truncate" style={{ fontSize: "var(--t-sm)" }}>
                      {job.cwd}
                    </span>
                  </Field>
                )}
                {job.permissionMode && <Field label="Permissions">{job.permissionMode}</Field>}
                {job.template && <Field label="Template">{job.template}</Field>}
                {job.backend && <Field label="Backend">{job.backend}</Field>}
                {job.cliVersion && (
                  <Field label="CLI">
                    <span className="mono">{job.cliVersion}</span>
                  </Field>
                )}
                {job.createdAt && <Field label="Started">{relativeTime(job.createdAt)}</Field>}
              </div>

              {job.result && (
                <div style={{ marginBottom: 13 }}>
                  <Field label="Result">
                    <span style={{ whiteSpace: "pre-wrap" }}>{job.result}</span>
                  </Field>
                </div>
              )}

              {job.cwd && (
                <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    onClick={() =>
                      openSessionTerminal({
                        mode: job.live ? "attach" : "resume",
                        cwd: job.cwd as string,
                        attachId: job.live ? job.id : undefined,
                        sessionId: job.live ? undefined : job.resumeSessionId ?? job.sessionId,
                      }).catch(() => {})
                    }
                  >
                    <TerminalSquare size={14} />
                    {job.live ? "Attach" : "Resume"}
                  </button>
                </div>
              )}

              <div
                style={{
                  fontSize: "var(--t-2xs)",
                  color: "var(--tx-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 9,
                }}
              >
                Timeline
              </div>
              <JobTimeline id={job.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function JobsPanel() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setLoading(true);
    fetchJobs()
      .then((r) => {
        if (r.error) {
          setErr(r.error);
          return;
        }
        setErr(null);
        setJobs(r.jobs);
        setErrors(r.errors ?? []);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Jobs move on the daemon's clock, not ours — poll while the tab is open.
  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (err) {
    return (
      <div
        style={{
          padding: "7px 11px",
          borderRadius: "var(--r)",
          background: "var(--red-dim)",
          border: "1px solid rgba(248 113 113 / 0.2)",
          color: "var(--red)",
          fontSize: "var(--t-md)",
        }}
      >
        {err}
      </div>
    );
  }
  if (!jobs) {
    return <div className="faint" style={{ fontSize: "var(--t-md)" }}>Loading jobs…</div>;
  }

  const counts = {
    all: jobs.length,
    blocked: jobs.filter((j) => j.state === "blocked").length,
    working: jobs.filter((j) => j.state === "working").length,
    done: jobs.filter((j) => j.state === "done").length,
  };
  const shown = filter === "all" ? jobs : jobs.filter((j) => j.state === filter);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="seg" role="tablist" aria-label="Job state filter">
          {(["all", "blocked", "working", "done"] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "all" : STATE_META[f].label.toLowerCase()}
              <span style={{ opacity: 0.6 }}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-icon" onClick={load} disabled={loading} aria-label="Refresh jobs">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {counts.blocked > 0 && filter === "all" && (
        <div
          style={{
            padding: "7px 11px",
            borderRadius: "var(--r)",
            background: "var(--amber-dim)",
            border: "1px solid rgba(251 191 36 / 0.25)",
            color: "var(--amber)",
            fontSize: "var(--t-sm)",
          }}
        >
          {counts.blocked} job{counts.blocked !== 1 ? "s" : ""} waiting on you.
        </div>
      )}

      {errors.length > 0 && (
        <div className="faint" style={{ fontSize: "var(--t-xs)" }}>
          {errors.length} job record{errors.length !== 1 ? "s" : ""} could not be read.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "var(--t-md)", color: "var(--tx-2)", marginBottom: 4 }}>
            No background jobs.
          </div>
          <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
            Jobs appear here once you run Claude Code in the background.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {shown.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
