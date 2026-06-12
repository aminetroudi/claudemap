"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, BarChart3, GitBranch, History, Radio, Skull, TerminalSquare, Wifi, WifiOff } from "lucide-react";
import { fetchSessions, killGhosts, openSessionTerminal } from "@/lib/client";
import { contextWindowForModel, EXTENDED_CONTEXT_WINDOW } from "@/lib/sessions/context";
import type { LiveSession, SessionStatus } from "@/lib/sessions/types";
import HistoryView from "./sessions/HistoryView";
import SessionDrawer from "./sessions/SessionDrawer";
import UsageView from "./sessions/UsageView";
import { formatTokens, relativeTime } from "./sessions/format";

export interface TerminalPayload {
  mode: "attach" | "resume" | "shell";
  cwd?: string;
  attachId?: string;
  sessionId?: string;
}
type TerminalFn = (p: TerminalPayload) => void;

const STATUS_META: Record<SessionStatus, { dot: string; label: string; color: string }> = {
  working: { dot: "●", label: "Working", color: "var(--green)" },
  needs_input: { dot: "▲", label: "Needs Input", color: "var(--amber)" },
  waiting: { dot: "◉", label: "Waiting", color: "var(--tx-3)" },
  inactive: { dot: "◌", label: "Inactive", color: "var(--tx-3)" },
};

const SUMMARY_ORDER: SessionStatus[] = ["working", "needs_input", "waiting"];

type Tab = "live" | "history" | "usage";
type ConnState = "connecting" | "live" | "reconnecting";
type OpenFn = (file: string, label: string) => void;

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "live", label: "Live", icon: <Radio size={15} /> },
  { id: "history", label: "History", icon: <History size={15} /> },
  { id: "usage", label: "Usage", icon: <BarChart3 size={15} /> },
];

// ── SessionsPanel ─────────────────────────────────────────────────
// Tabbed shell (Live / History / Usage, mirroring csm's h/l/u). The Live tab
// streams from /api/sessions/events; History fetches on demand. Either tab can
// open the detail drawer (metrics + paginated timeline).
export default function SessionsPanel() {
  const [tab, setTab] = useState<Tab>("live");
  const [drawer, setDrawer] = useState<{ file: string; label: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const openDetail: OpenFn = useCallback((file, label) => setDrawer({ file, label }), []);

  // Auto-dismiss the action notice.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);

  const runTerminal: TerminalFn = useCallback((p) => {
    if (!p.cwd) {
      setNotice({ kind: "err", text: "No working directory known for this session." });
      return;
    }
    openSessionTerminal({ mode: p.mode, cwd: p.cwd, attachId: p.attachId, sessionId: p.sessionId })
      .then((r) => setNotice({ kind: "ok", text: `Opened ${p.mode} terminal (${r.emulator}).` }))
      .catch((e) => setNotice({ kind: "err", text: (e as Error).message }));
  }, []);

  const runKillGhosts = useCallback(() => {
    killGhosts()
      .then((r) => setNotice({ kind: "ok", text: `Killed ${r.killed} ghost${r.killed !== 1 ? "s" : ""}.` }))
      .catch((e) => setNotice({ kind: "err", text: (e as Error).message }));
  }, []);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", paddingBottom: 2 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className="btn"
            onClick={() => setTab(t.id)}
            style={{
              border: "none",
              borderRadius: 0,
              borderBottom: tab === t.id ? "2px solid var(--ac)" : "2px solid transparent",
              color: tab === t.id ? "var(--tx-1)" : "var(--tx-3)",
              background: "none",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          onClick={() => setNotice(null)}
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r)",
            cursor: "pointer",
            fontSize: "var(--t-md)",
            background: notice.kind === "ok" ? "var(--green-dim)" : "var(--red-dim)",
            border: `1px solid ${notice.kind === "ok" ? "rgba(52 211 153 / 0.25)" : "rgba(248 113 113 / 0.25)"}`,
            color: notice.kind === "ok" ? "var(--green)" : "var(--red)",
          }}
        >
          {notice.text}
        </div>
      )}

      {tab === "live" && <LiveView onOpen={openDetail} onTerminal={runTerminal} onKillGhosts={runKillGhosts} />}
      {tab === "history" && <HistoryView onOpen={openDetail} onTerminal={runTerminal} />}
      {tab === "usage" && <UsageView />}

      {drawer && (
        <SessionDrawer file={drawer.file} title={drawer.label} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
}

/** Decide which terminal action a live session supports (Phase 0.3 semantics):
 * background job → Attach; running interactive → Terminal here; else Resume. */
function liveAction(s: LiveSession): { label: string; payload: TerminalPayload } {
  const cwd = s.projectPath;
  if (s.kind === "background" && s.attachId) {
    return { label: "Attach", payload: { mode: "attach", attachId: s.attachId, cwd } };
  }
  if (s.kind === "interactive" && s.pid) {
    return { label: "Terminal here", payload: { mode: "shell", cwd } };
  }
  return { label: "Resume", payload: { mode: "resume", sessionId: s.sessionId, cwd } };
}

function ActionButton({
  label,
  payload,
  onTerminal,
}: {
  label: string;
  payload: TerminalPayload;
  onTerminal: TerminalFn;
}) {
  const resumeReady = payload.mode !== "resume" || !!payload.sessionId;
  const disabled = !payload.cwd || !resumeReady;
  return (
    <button
      className="btn"
      disabled={disabled}
      title={disabled ? "Working directory unknown" : label}
      onClick={(e) => {
        e.stopPropagation();
        onTerminal(payload);
      }}
      style={{ fontSize: "var(--t-sm)", whiteSpace: "nowrap" }}
    >
      <TerminalSquare size={13} />
      {label}
    </button>
  );
}

// ── Live view (SSE) ───────────────────────────────────────────────
function LiveView({
  onOpen,
  onTerminal,
  onKillGhosts,
}: {
  onOpen: OpenFn;
  onTerminal: TerminalFn;
  onKillGhosts: () => void;
}) {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

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
        retryRef.current = 0;
        setConn("live");
        setErrMsg(null);
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { sessions: LiveSession[] };
          setSessions(data.sessions ?? []);
        } catch {
          // a malformed frame is replaced by the next tick
        }
      });

      es.onerror = () => {
        es.close();
        if (closedRef.current) return;
        setConn("reconnecting");
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
  const ghostCount = list.filter((s) => s.isGhost).length;

  const confirmKillGhosts = () => {
    if (window.confirm(`Send SIGTERM to ${ghostCount} ghost process${ghostCount !== 1 ? "es" : ""}?`)) {
      onKillGhosts();
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
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
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {ghostCount > 0 && (
            <button
              className="btn"
              onClick={confirmKillGhosts}
              style={{ color: "var(--red)", borderColor: "rgba(248 113 113 / 0.3)" }}
            >
              <Skull size={14} /> Kill ghosts ({ghostCount})
            </button>
          )}
          <ConnBadge conn={conn} />
        </div>
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
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <SessionRow key={s.logFile} session={s} onOpen={onOpen} onTerminal={onTerminal} />
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

function SessionRow({
  session: s,
  onOpen,
  onTerminal,
}: {
  session: LiveSession;
  onOpen: OpenFn;
  onTerminal: TerminalFn;
}) {
  const meta = STATUS_META[s.status] ?? STATUS_META.inactive;
  const detail = s.task !== "-" && s.task ? s.task : s.lastMessage ?? "—";
  const action = liveAction(s);

  return (
    <tr
      style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }}
      onClick={() => onOpen(s.logFile, s.project)}
    >
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
          {s.isGhost && (
            <span className="badge badge-red" title="Process alive but idle > 1h">
              ghost
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
      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
        <ActionButton label={action.label} payload={action.payload} onTerminal={onTerminal} />
      </td>
    </tr>
  );
}
