"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, GitBranch, RefreshCw } from "lucide-react";
import { fetchSessions } from "@/lib/client";
import type { LiveSession, SessionStatus } from "@/lib/sessions/types";

const STATUS_META: Record<SessionStatus, { dot: string; label: string; color: string }> = {
  working: { dot: "●", label: "Working", color: "var(--green)" },
  needs_input: { dot: "▲", label: "Needs Input", color: "var(--amber)" },
  waiting: { dot: "◉", label: "Waiting", color: "var(--tx-3)" },
  inactive: { dot: "◌", label: "Inactive", color: "var(--tx-3)" },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  if (ms < 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── SessionsPanel ─────────────────────────────────────────────────
// Self-fetching by design: session data is volatile, so it is not wired
// into page.tsx load(). v1 fetches once on mount (SSE arrives in Phase 2).
export default function SessionsPanel() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const r = await fetchSessions();
      if (r.error) throw new Error(r.error);
      setSessions(r.sessions ?? []);
    } catch (e) {
      setErrMsg((e as Error).message);
      setSessions((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = sessions ?? [];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Header actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)" }}>
          {sessions === null
            ? "Scanning sessions…"
            : `${list.length} session${list.length !== 1 ? "s" : ""}`}
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {errMsg && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>
          {errMsg}
        </div>
      )}

      {sessions !== null && list.length === 0 && !errMsg && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <Activity size={32} style={{ color: "var(--tx-3)", margin: "0 auto 14px" }} />
          <div style={{ fontSize: "var(--t-xl)", color: "var(--tx-2)", marginBottom: 6 }}>No active sessions</div>
          <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)" }}>
            Claude Code sessions from the last hour will appear here.
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--t-md)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <Th>Status</Th>
                <Th>Project</Th>
                <Th>Branch</Th>
                <Th>Last activity</Th>
                <Th>Task / last message</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <SessionRow key={s.logFile} session={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--tx-3)", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function SessionRow({ session: s }: { session: LiveSession }) {
  const meta = STATUS_META[s.status] ?? STATUS_META.inactive;
  const detail = s.task !== "-" && s.task ? s.task : s.lastMessage ?? "—";

  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
        <span style={{ color: meta.color, marginRight: 7 }}>{meta.dot}</span>
        <span style={{ color: meta.color }}>{meta.label}</span>
      </td>
      <td style={{ padding: "10px 14px", maxWidth: 260 }}>
        <div className="truncate" style={{ fontWeight: 600 }} title={s.projectPath ?? s.project}>
          {s.project}
        </div>
        {s.sessionTitle && (
          <div className="truncate faint" style={{ fontSize: "var(--t-sm)" }} title={s.sessionTitle}>
            {s.sessionTitle}
          </div>
        )}
      </td>
      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
        {s.gitBranch ? (
          <span className="mono" style={{ fontSize: "var(--t-sm)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <GitBranch size={13} style={{ color: "var(--tx-3)" }} />
            {s.gitBranch}
          </span>
        ) : (
          <span className="faint">—</span>
        )}
      </td>
      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--tx-2)" }} title={s.lastActivity}>
        {relativeTime(s.lastActivity)}
      </td>
      <td style={{ padding: "10px 14px", maxWidth: 420 }}>
        <div className="truncate" style={{ color: "var(--tx-2)" }} title={s.lastMessage ?? detail}>
          {detail}
        </div>
      </td>
    </tr>
  );
}
