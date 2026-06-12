"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { fetchMetrics, fetchTimeline } from "@/lib/client";
import type { SessionMetrics, TimelineEntry } from "@/lib/sessions/types";
import { formatTokens } from "./format";

const PAGE = 50;
type Filter = "all" | "assistant" | "user";

export default function SessionDrawer({
  file,
  title,
  onClose,
}: {
  file: string;
  title: string;
  onClose: () => void;
}) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Metrics: load once per file.
  useEffect(() => {
    let cancelled = false;
    fetchMetrics(file)
      .then((m) => {
        if (cancelled) return;
        if (m.error) setErr(m.error);
        else setMetrics(m);
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [file]);

  const loadPage = useCallback(
    async (off: number, replace: boolean) => {
      setLoading(true);
      try {
        const r = await fetchTimeline(file, off, PAGE);
        if (r.error) {
          setErr(r.error);
          return;
        }
        setTotal(r.total);
        setEntries((prev) => (replace ? r.entries : [...prev, ...r.entries]));
        setOffset(off + r.entries.length);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [file],
  );

  // First timeline page per file.
  useEffect(() => {
    setEntries([]);
    setOffset(0);
    setErr(null);
    void loadPage(0, true);
  }, [file, loadPage]);

  // Esc closes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.type === filter)),
    [entries, filter],
  );

  const topTools = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics.toolUsageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [metrics]);

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0 0 0 / 0.6)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <motion.div
        className="card"
        style={{ width: "min(720px, 100%)", height: "100%", display: "flex", flexDirection: "column", borderRadius: 0, background: "var(--bg-1)", boxShadow: "-32px 0 80px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        transition={{ type: "tween", duration: 0.22 }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 700, fontSize: "var(--t-xl)" }} title={title}>{title}</div>
            <div className="truncate faint mono" style={{ fontSize: "var(--t-sm)", marginTop: 2 }} title={file}>{file}</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "grid", gap: 18 }}>
          {err && (
            <div style={{ padding: "10px 14px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-sm)" }}>
              {err}
            </div>
          )}

          {/* Metrics cards */}
          {metrics && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              <Stat label="Context" value={`${Math.round(metrics.contextPercent)}%`} sub={formatTokens(metrics.contextTokens)} />
              <Stat label="Turns" value={String(metrics.turnCount)} />
              <Stat label="User prompts" value={String(metrics.userPromptCount)} />
              <Stat label="Assistant msgs" value={String(metrics.assistantMessageCount)} />
              <Stat label="Tool results" value={String(metrics.toolResultCount)} />
              <Stat label="Compactions" value={String(metrics.compactCount)} />
              <Stat label="Input tok" value={formatTokens(metrics.totalInputTokens)} />
              <Stat label="Output tok" value={formatTokens(metrics.totalOutputTokens)} />
              <Stat label="Cache read" value={formatTokens(metrics.totalCacheReadTokens)} />
              <Stat label="Cache write" value={formatTokens(metrics.totalCacheCreationTokens)} />
            </div>
          )}

          {topTools.length > 0 && (
            <div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 8, fontWeight: 600 }}>Tool usage</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topTools.map(([tool, n]) => (
                  <span key={tool} className="badge badge-default">{tool} · {n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>
                Timeline {total > 0 ? `(${total})` : ""}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["all", "assistant", "user"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    className="btn"
                    onClick={() => setFilter(f)}
                    style={filter === f ? { background: "var(--ac-dim)", color: "var(--ac)", borderColor: "rgba(129 140 248 / 0.3)" } : undefined}
                  >
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {visible.map((e, i) => (
                <TimelineRow key={`${e.timestamp}-${i}`} entry={e} />
              ))}
            </div>

            {entries.length < total && (
              <button
                className="btn"
                style={{ marginTop: 12, width: "100%" }}
                onClick={() => loadPage(offset, false)}
                disabled={loading}
              >
                {loading ? "Loading…" : `Load more (${total - entries.length} left)`}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: "10px 12px", background: "var(--bg-2)" }}>
      <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)" }}>{label}</div>
      <div style={{ fontSize: "var(--t-xl)", fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div className="faint mono" style={{ fontSize: "var(--t-sm)" }}>{sub}</div>}
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  user: "var(--ac)",
  assistant: "var(--green)",
  system: "var(--tx-3)",
  summary: "var(--amber)",
};

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const color = TYPE_COLOR[entry.type] ?? "var(--tx-3)";
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <div className="card" style={{ padding: "10px 12px", background: "var(--bg-2)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600, fontSize: "var(--t-sm)", textTransform: "capitalize" }}>
          {entry.subtype ? `${entry.type} · ${entry.subtype}` : entry.type}
        </span>
        {entry.model && <span className="faint mono" style={{ fontSize: "var(--t-xs)" }}>{entry.model}</span>}
        <span className="faint" style={{ marginLeft: "auto", fontSize: "var(--t-xs)" }}>{time}</span>
      </div>

      {entry.summary && <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-2)" }}>{entry.summary}</div>}

      {entry.content?.map((c, i) => {
        if (c.type === "tool_use") {
          return (
            <div key={i} style={{ marginTop: 4 }}>
              <span className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--ac)" }}>🔧 {c.tool}</span>
              {c.input && (
                <pre className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--tx-3)", margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                  {c.input.length > 600 ? c.input.slice(0, 600) + "…" : c.input}
                </pre>
              )}
            </div>
          );
        }
        if (c.text) {
          return (
            <div key={i} style={{ fontSize: "var(--t-sm)", color: "var(--tx-2)", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {c.text.length > 1200 ? c.text.slice(0, 1200) + "…" : c.text}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
