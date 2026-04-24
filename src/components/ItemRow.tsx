"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpToLine, ChevronDown, Eye, MoveRight, PowerOff, Trash2, X, Zap } from "lucide-react";
import { bytes, callAction, kindLabel, shortDate } from "@/lib/client";
import type { AnyItem } from "@/lib/types";

const KIND_BADGE: Record<string, string> = {
  skill: "badge-ac", plugin: "badge-amber", agent: "badge-green",
  memory: "badge-ac", "claude-md": "badge-default", "loose-md": "badge-default",
};

export default function ItemRow({
  item, projects, onChanged, onView,
}: {
  item: AnyItem;
  projects: string[];
  onChanged: () => void;
  onView: (item: AnyItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDemote, setShowDemote] = useState(false);
  const [confirming, setConfirming] = useState<"trash" | "uninstall" | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  function askConfirm(kind: "trash" | "uninstall") {
    setConfirming(kind);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirming(null), 3500);
  }
  function cancelConfirm() {
    setConfirming(null);
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null; }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const trash    = () => { cancelConfirm(); return run(async () => { await callAction({ action: "trash", path: item.path }); }); };
  const promote  = () => run(async () => { await callAction({ action: "promote", path: item.path, kind: item.kind }); });
  const demote   = (p: string) => run(async () => { setShowDemote(false); await callAction({ action: "demote", path: item.path, kind: item.kind, projectRoot: p }); });
  const toggle   = (en: boolean) => run(async () => { if (item.kind !== "plugin") return; await callAction({ action: "togglePlugin", fullName: item.meta.fullName, enabled: en }); });
  const uninstall = () => { cancelConfirm(); return run(async () => { if (item.kind !== "plugin") return; await callAction({ action: "uninstallPlugin", fullName: item.meta.fullName }); }); };

  const isMovable = item.kind === "skill" || item.kind === "agent";

  return (
    <div
      className="card list-item"
      style={{ padding: "16px 18px", marginBottom: 7, position: "relative", zIndex: showDemote ? 40 : undefined }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--t-xl)" }}>{item.name}</span>
            <span className={`badge ${KIND_BADGE[item.kind] ?? "badge-default"}`}>{kindLabel(item.kind)}</span>
            <span className={`badge ${item.scope === "global" ? "badge-ac" : "badge-default"}`}>{item.scope}</span>
            {item.kind === "plugin" && (
              <span className={`badge ${item.meta.enabled ? "badge-green" : "badge-amber"}`}>
                {item.meta.enabled ? "enabled" : "disabled"}
              </span>
            )}
            {item.kind === "skill" && item.meta.pluginOwned && (
              <span className="badge badge-amber"><Zap size={10} /> {item.meta.pluginName}</span>
            )}
            {item.kind === "memory" && item.meta.indexed && (
              <span className="badge badge-green">indexed</span>
            )}
          </div>

          {item.description && (
            <p style={{ fontSize: "var(--t-md)", color: "var(--tx-2)", marginBottom: 5, lineHeight: 1.5 }}>{item.description}</p>
          )}

          <div className="mono truncate faint" style={{ fontSize: "var(--t-sm)", marginBottom: 3 }} title={item.path}>
            {item.path}
          </div>

          {item.projectRoot && (
            <div className="mono faint" style={{ fontSize: "var(--t-sm)" }}>↳ {item.projectRoot}</div>
          )}

          <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginTop: 5 }}>
            {bytes(item.size)} · {shortDate(item.modifiedAt)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-icon" onClick={() => onView(item)} disabled={busy} title="View / Edit">
            <Eye size={16} />
          </button>

          {isMovable && item.scope === "project" && (
            <button className="btn btn-ghost" onClick={promote} disabled={busy}>
              <ArrowUpToLine size={15} /> Promote
            </button>
          )}

          {isMovable && item.scope === "global" && projects.length > 0 && (
            <div style={{ position: "relative" }}>
              <button className="btn btn-ghost" onClick={() => setShowDemote(v => !v)} disabled={busy}>
                <MoveRight size={15} /> Move <ChevronDown size={13} />
              </button>
              {showDemote && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 20 }}
                    onClick={() => setShowDemote(false)}
                  />
                  <div className="card" style={{
                    position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 30,
                    minWidth: 280, maxHeight: 260, overflowY: "auto", padding: 4,
                    background: "var(--bg-2)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  }}>
                    <div style={{ padding: "5px 10px 7px", fontSize: "var(--t-sm)", color: "var(--tx-3)", fontFamily: "var(--font-mono), monospace" }}>
                      SELECT PROJECT
                    </div>
                    {projects.map((p) => (
                      <button key={p} className="btn btn-ghost"
                        style={{ width: "100%", justifyContent: "flex-start", fontSize: "var(--t-sm)", marginBottom: 2 }}
                        onClick={() => demote(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {item.kind === "plugin" && (
            <>
              <button className="btn btn-ghost" onClick={() => toggle(!item.meta.enabled)} disabled={busy}>
                <PowerOff size={15} /> {item.meta.enabled ? "Disable" : "Enable"}
              </button>
              {confirming === "uninstall" ? (
                <>
                  <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#0a0a14" }} onClick={uninstall} disabled={busy}>
                    <Trash2 size={15} /> Confirm uninstall
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={cancelConfirm} disabled={busy} title="Cancel">
                    <X size={15} />
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={() => askConfirm("uninstall")} disabled={busy} title="Uninstall">
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}

          {item.kind !== "plugin" && (
            confirming === "trash" ? (
              <>
                <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#0a0a14" }} onClick={trash} disabled={busy}>
                  <Trash2 size={15} /> Confirm trash
                </button>
                <button className="btn btn-ghost btn-icon" onClick={cancelConfirm} disabled={busy} title="Cancel">
                  <X size={15} />
                </button>
              </>
            ) : (
              <button className="btn btn-danger btn-icon" onClick={() => askConfirm("trash")} disabled={busy} title="Move to trash">
                <Trash2 size={15} />
              </button>
            )
          )}
        </div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 10, padding: "8px 12px", borderRadius: "var(--r)",
            background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)",
            color: "var(--red)", fontSize: "var(--t-sm)",
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
