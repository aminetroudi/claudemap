"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, GitBranch, Wifi, WifiOff } from "lucide-react";
import { fetchSessions } from "@/lib/client";
import { contextWindowForModel, EXTENDED_CONTEXT_WINDOW } from "@/lib/sessions/context";
import type { LiveSession, SessionStatus } from "@/lib/sessions/types";

const STATUS_META: Record<SessionStatus, { dot: string; label: string; color: string }> = {
  working: { dot: "●", label: "Working", color: "var(--green)" },
  needs_input: { dot: "▲", label: "Needs Input", color: "var(--amber)" },
  waiting: { dot: "◉", label: "Waiting", color: "var(--tx-3)" },
  inactive: { dot: "◌", label: "Inactive", color: "var(--tx-3)" },
};

/** Summary header counts the three active states (csm web header). */
const SUMMARY_ORDER: SessionStatus[] = ["working", "needs_input", "waiting"];

type ConnState = "connecting" | "live" | "reconnecting";

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

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── SessionsPanel ─────────────────────────────────────────────────
// Live by SSE: subscribes to /api/sessions/events, which the hub pushes every
// ~2 s. On SSE failure it falls back to a one-shot fetch and reconnects with
// capped backoff. Session data is volatile, so the panel owns its own data
// rather than going through page.tsx load().
export default function SessionsPanel() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  // One-shot fallback fetch, used when SSE errors before any frame arrives.
  const fallbackFetch = useCallback(async () => {
    try {
      const r = await fetchSessions();
      if (r.error) throw new Error(r.error);
      setSessions(r.sessions ?? []);
      setErrMsg(null);
    } catch (e) {
      setErrMsg((e as Error).message);
      setSessions((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const es = new EventSource("/api/sessions/events");
      esRef.current = es;

      es.addEventListener("sessions", (ev) => {
        retryRef.current = 0; // a real frame proves the link is healthy
        setConn("live");
        setErrMsg(null);
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { sessions: LiveSession[] };
          setSessions(data.sessions ?? []);
        } catch {
          // ignore a malformed frame; the next tick replaces it
        }
      });

      // heartbeat events are intentionally ignored — they only keep the link warm.

      es.onerror = () => {
        es.close();
        if (closedRef.current) return;
        setConn("reconnecting");
        // Keep data fresh while the stream is down, then retry with backoff.
        void fallbackFetch();
        const delay = Math.min(1000 * 2 ** retryRef.current, 15_000);
        retryRef.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [fallbackFetch]);

  const list = sessions ?? [];
  const counts = SUMMARY_ORDER.map((st) => ({
    st,
    meta: STATUS_META[st],
    n: list.filter((s) => s.status === st).length,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Header: live status summary + connection indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: "var(--t-md)" }}>
          {sessions === null ? (
            <span style={{ color: "var(--tx-3)" }}>Scanning sessions…</span>
          ) : (
            counts.map(({ st, meta, n }) => (
              <span key={st} style={{ color: meta.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>{meta.dot}</span>
                <span style={{ color: "var(--tx-2)" }}>
                  {meta.label}: <strong style={{ color: meta.color }}>{n}</strong>
                </span>
              </span>
            ))
          )}
        </div>
        <ConnBadge conn={conn} />
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
                <Th>Context</Th>
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

function ConnBadge({ conn }: { conn: ConnState }) {
  if (conn === "live") {
    return (
      <span className="badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Wifi size={13} /> Live
      </span>
    );
  }
  return (
    <span className="badge badge-amber" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <WifiOff size={13} /> {conn === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 14px", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--tx-3)", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

/** Context-usage bar: green <76 %, amber 76–90 %, red ≥91 %; width clamps at
 * 100 % while the label keeps the raw percent (it can exceed 100 % near a
 * compaction). ` (1M)` marks an extended-window model. */
function ContextBar({ percent, tokens, model }: { percent?: number; tokens?: number; model?: string }) {
  if (percent == null || !tokens) return <span className="faint">—</span>;
  const color = percent >= 91 ? "var(--red)" : percent >= 76 ? "var(--amber)" : "var(--green)";
  const width = Math.min(100, Math.max(0, percent));
  const extended = model ? contextWindowForModel(model) === EXTENDED_CONTEXT_WINDOW : false;
  return (
    <div style={{ minWidth: 120, maxWidth: 160 }} title={model ? `${model} · ${tokens.toLocaleString()} tokens` : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-sm)", marginBottom: 3 }}>
        <span style={{ color }}>
          {Math.round(percent)}%{extended ? " (1M)" : ""}
        </span>
        <span className="faint mono">{formatTokens(tokens)}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "var(--bg-3)", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, transition: "width 0.4s ease" }} />
      </div>
    </div>
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
          {s.origin && (
            <span className="badge badge-default" title={`Origin: ${s.origin.category}`}>
              {s.origin.display}
            </span>
          )}
          {s.hasUnsandboxed && (
            <span className="badge badge-red" title="Unsandboxed bash command(s) detected">
              [!S]
            </span>
          )}
          {s.sessionTitle && (
            <span className="truncate faint" style={{ fontSize: "var(--t-sm)", maxWidth: 180 }} title={s.sessionTitle}>
              {s.sessionTitle}
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: "10px 14px" }}>
        <ContextBar percent={s.contextPercent} tokens={s.contextTokens} model={s.model} />
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
