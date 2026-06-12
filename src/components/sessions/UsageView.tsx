"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { fetchUsage } from "@/lib/client";
import type { APIQuota, ClaudeStatus, QuotaBucket, UsageStats } from "@/lib/sessions/types";
import { formatTokens } from "./format";

/** Quota bar colour thresholds (csm ui/usage.go): green <75, yellow 75–90, red >90. */
function quotaColor(util: number): string {
  if (util > 90) return "var(--red)";
  if (util >= 75) return "var(--amber)";
  return "var(--green)";
}

function resetCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const ms = Date.parse(resetsAt) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "resets soon";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `resets in ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `resets in ${h}h ${mins % 60}m`;
  return `resets in ${Math.floor(h / 24)}d ${h % 24}h`;
}

export default function UsageView() {
  const [data, setData] = useState<{
    local: UsageStats;
    apiQuota: APIQuota;
    status?: ClaudeStatus;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setErr(null);
    fetchUsage()
      .then((r) => {
        if (r.error) {
          setErr(r.error);
          return;
        }
        setData({ local: r.local, apiQuota: r.apiQuota, status: r.status });
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };

  // Refresh on mount and every 30 s while the tab is shown.
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (err) {
    return (
      <div style={{ padding: "10px 14px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>
        {err}
      </div>
    );
  }
  if (!data) {
    return <div style={{ color: "var(--tx-3)", fontSize: "var(--t-md)" }}>Loading usage…</div>;
  }

  const { local, apiQuota, status } = data;
  const buckets: Array<{ label: string; bucket?: QuotaBucket | null }> = [
    { label: "5-hour", bucket: apiQuota.fiveHour },
    { label: "7-day", bucket: apiQuota.sevenDay },
    { label: "7-day Sonnet", bucket: apiQuota.sevenDaySonnet },
    { label: "7-day Opus", bucket: apiQuota.sevenDayOpus },
  ].filter((b) => b.bucket);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header: refresh + service status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {status?.available ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-md)", color: status.indicator === "none" ? "var(--green)" : "var(--amber)" }}>
            {status.indicator === "none" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {status.description ?? "Operational"}
          </span>
        ) : (
          <span style={{ color: "var(--tx-3)", fontSize: "var(--t-md)" }}>Service status unavailable</span>
        )}
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* API quota */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--t-lg)", marginBottom: 4 }}>API quota</div>
        {!apiQuota.available ? (
          <div style={{ color: "var(--tx-3)", fontSize: "var(--t-md)" }}>
            Quota unavailable{apiQuota.error ? ` — ${apiQuota.error}` : ""}.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
            {buckets.map(({ label, bucket }) => {
              const util = bucket!.utilization;
              const color = quotaColor(util);
              return (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--t-md)", marginBottom: 4 }}>
                    <span style={{ color: "var(--tx-2)" }}>{label}</span>
                    <span style={{ display: "inline-flex", gap: 10 }}>
                      <span className="faint">{resetCountdown(bucket!.resetsAt)}</span>
                      <strong style={{ color }}>{Math.round(util)}%</strong>
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--bg-3)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, util))}%`, height: "100%", background: color, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              );
            })}
            {apiQuota.extraUsage?.isEnabled && (
              <div className="faint" style={{ fontSize: "var(--t-sm)" }}>Extra usage is enabled.</div>
            )}
          </div>
        )}
      </div>

      {/* Local 5 h usage */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: "var(--t-lg)" }}>Local usage · last 5 h</div>
          <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
            {formatTokens(local.totalTokens)} tokens total
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginBottom: 14, flexWrap: "wrap", fontSize: "var(--t-md)" }}>
          <span>Input <strong>{formatTokens(local.inputTokens)}</strong></span>
          <span>Output <strong>{formatTokens(local.outputTokens)}</strong></span>
          <span>Cache <strong>{formatTokens(local.cacheTokens)}</strong></span>
        </div>

        {local.sessions.length === 0 ? (
          <div className="faint" style={{ fontSize: "var(--t-md)" }}>No token usage in the last 5 hours.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--t-md)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>Project</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>Input</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>Output</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>Cache</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontWeight: 600 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {local.sessions.map((s) => (
                <tr key={s.logFile} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className="truncate" style={{ padding: "8px 10px", maxWidth: 260 }} title={s.logFile}>{s.project}</td>
                  <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: "var(--tx-2)" }}>{formatTokens(s.inputTokens)}</td>
                  <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: "var(--tx-2)" }}>{formatTokens(s.outputTokens)}</td>
                  <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: "var(--tx-2)" }}>{formatTokens(s.cacheTokens)}</td>
                  <td className="mono" style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{formatTokens(s.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
