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
      className="card list-item item"
      style={{ padding: "9px 11px", marginBottom: 4, position: "relative", zIndex: showDemote ? 40 : undefined }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: "var(--t-md)" }}>{item.name}</span>
            <span className={`badge ${KIND_BADGE[item.kind] ?? "badge-default"}`}>{kindLabel(item.kind)}</span>
            <span className={`badge ${item.scope === "global" ? "badge-ac" : "badge-default"}`}>{item.scope}</span>
            {item.kind === "plugin" && (
              <span className={`badge ${item.meta.enabled ? "badge-green" : "badge-amber"}`}>
                {item.meta.enabled ? "enabled" : "disabled"}
              </span>
            )}
            {item.kind === "skill" && item.meta.pluginOwned && (
              <span className="badge badge-amber"><Zap size={9} /> {item.meta.pluginName}</span>
            )}
            {item.kind === "memory" && item.meta.indexed && (
              <span className="badge badge-green">indexed</span>
            )}
          </div>

          {item.description && (
            <p style={{ fontSize: "var(--t-base)", color: "var(--tx-2)", marginBottom: 3, lineHeight: 1.45 }}>{item.description}</p>
          )}

          <div className="mono truncate faint" style={{ fontSize: "var(--t-xs)" }} title={item.path}>
            {item.path}
          </div>

          {item.projectRoot && (
            <div className="mono truncate faint" style={{ fontSize: "var(--t-xs)", opacity: 0.8 }}>↳ {item.projectRoot}</div>
          )}

          <div className="num" style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", marginTop: 3 }}>
            {bytes(item.size)} · {shortDate(item.modifiedAt)}
          </div>
        </div>

        {/* Actions — hidden until hover/focus so a long list reads as data, not
            chrome. Pinned open while a confirm or the move menu is pending, or
            moving the mouse away would yank the button mid-decision. */}
        <div
          className="item-actions"
          style={confirming || showDemote || busy ? { opacity: 1 } : undefined}
        >
          <button className="btn btn-ghost btn-icon" onClick={() => onView(item)} disabled={busy} title="View / Edit">
            <Eye size={14} />
          </button>

          {isMovable && item.scope === "project" && (
            <button className="btn btn-ghost" onClick={promote} disabled={busy}>
              <ArrowUpToLine size={13} /> Promote
            </button>
          )}

          {isMovable && item.scope === "global" && projects.length > 0 && (
            <div style={{ position: "relative" }}>
              <button className="btn btn-ghost" onClick={() => setShowDemote(v => !v)} disabled={busy}>
                <MoveRight size={13} /> Move <ChevronDown size={11} />
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
                    background: "var(--bg-2)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}>
                    <div className="eyebrow" style={{ padding: "6px 8px" }}>select project</div>
                    {projects.map((p) => (
                      <button key={p} className="btn btn-ghost"
                        style={{ width: "100%", justifyContent: "flex-start", fontSize: "var(--t-xs)", fontFamily: "var(--font-mono), monospace" }}
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
                <PowerOff size={13} /> {item.meta.enabled ? "Disable" : "Enable"}
              </button>
              {confirming === "uninstall" ? (
                <>
                  <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#0b0d12" }} onClick={uninstall} disabled={busy}>
                    <Trash2 size={13} /> Confirm uninstall
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={cancelConfirm} disabled={busy} title="Cancel">
                    <X size={13} />
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={() => askConfirm("uninstall")} disabled={busy} title="Uninstall">
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}

          {item.kind !== "plugin" && (
            confirming === "trash" ? (
              <>
                <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#0b0d12" }} onClick={trash} disabled={busy}>
                  <Trash2 size={13} /> Confirm trash
                </button>
                <button className="btn btn-ghost btn-icon" onClick={cancelConfirm} disabled={busy} title="Cancel">
                  <X size={13} />
                </button>
              </>
            ) : (
              <button className="btn btn-danger btn-icon" onClick={() => askConfirm("trash")} disabled={busy} title="Move to trash">
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 8, padding: "6px 10px", borderRadius: "var(--r)",
            background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)",
            color: "var(--red)", fontSize: "var(--t-xs)",
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
