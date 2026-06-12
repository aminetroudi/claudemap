"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, History, Search, TerminalSquare } from "lucide-react";
import { fetchHistory } from "@/lib/client";
import type { HistorySession } from "@/lib/sessions/types";
import type { TerminalPayload } from "../SessionsPanel";
import { dateGroup, formatDuration, relativeTime } from "./format";

const DAYS_OPTIONS = [1, 7, 30, 90] as const;

function sessionIdFromLog(logFile: string): string {
  return (logFile.split("/").pop() ?? "").replace(/\.jsonl$/, "");
}

export default function HistoryView({
  onOpen,
  onTerminal,
}: {
  onOpen: (file: string, label: string) => void;
  onTerminal: (p: TerminalPayload) => void;
}) {
  const [days, setDays] = useState<number>(7);
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchHistory(days)
      .then((r) => {
        if (cancelled) return;
        if (r.error) {
          setErr(r.error);
          setSessions([]);
        } else {
          setSessions(r.sessions ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr((e as Error).message);
          setSessions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const filtered = useMemo(() => {
    const list = sessions ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (s) =>
        s.project.toLowerCase().includes(needle) ||
        s.firstPrompt.toLowerCase().includes(needle),
    );
  }, [sessions, q]);

  // Group consecutively — list is already sorted newest-first by the API.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: HistorySession[] }> = [];
    for (const s of filtered) {
      const g = dateGroup(s.startTime);
      const last = out[out.length - 1];
      if (last && last.label === g) last.items.push(s);
      else out.push({ label: g, items: [s] });
    }
    return out;
  }, [filtered]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search
            size={15}
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--tx-3)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Filter by project or first prompt…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              className="btn"
              onClick={() => setDays(d)}
              style={
                days === d
                  ? { background: "var(--ac-dim)", color: "var(--ac)", borderColor: "rgba(129 140 248 / 0.3)" }
                  : undefined
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>
          {err}
        </div>
      )}

      <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)" }}>
        {sessions === null
          ? "Loading history…"
          : `${filtered.length} session${filtered.length !== 1 ? "s" : ""} in the last ${days} day${days !== 1 ? "s" : ""}`}
        {loading && sessions !== null ? " · refreshing…" : ""}
      </div>

      {sessions !== null && filtered.length === 0 && !err && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <History size={28} style={{ color: "var(--tx-3)", margin: "0 auto 12px" }} />
          <div style={{ color: "var(--tx-2)" }}>No sessions match.</div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {group.label}
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {group.items.map((s, i) => (
              <button
                key={s.logFile}
                onClick={() => onOpen(s.logFile, s.project)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  background: "none",
                  border: "none",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                  cursor: "pointer",
                  color: "inherit",
                }}
                className="row-hover"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <span className="truncate" style={{ fontWeight: 600 }}>{s.project}</span>
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
                    <span className="faint" style={{ fontSize: "var(--t-sm)" }} title={s.startTime}>
                      {relativeTime(s.startTime)}
                    </span>
                    <button
                      className="btn"
                      disabled={!s.cwd}
                      title={s.cwd ? "Resume this session in a terminal" : "Working directory unknown"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTerminal({ mode: "resume", sessionId: sessionIdFromLog(s.logFile), cwd: s.cwd });
                      }}
                      style={{ fontSize: "var(--t-sm)" }}
                    >
                      <TerminalSquare size={13} /> Resume
                    </button>
                  </span>
                </div>
                {s.firstPrompt && (
                  <div className="truncate faint" style={{ fontSize: "var(--t-sm)", marginTop: 3 }} title={s.firstPrompt}>
                    {s.firstPrompt}
                  </div>
                )}
                <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: "var(--t-sm)", color: "var(--tx-3)", flexWrap: "wrap" }}>
                  <span>{s.messageCount} msg{s.messageCount !== 1 ? "s" : ""}</span>
                  <span>{formatDuration(s.durationMs)}</span>
                  {s.gitBranch && (
                    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <GitBranch size={12} /> {s.gitBranch}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
