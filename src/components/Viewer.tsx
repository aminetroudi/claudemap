"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { fetchFile, saveFile } from "@/lib/client";
import type { AnyItem } from "@/lib/types";

function fileToShow(item: AnyItem): string {
  if (item.kind === "skill") return `${item.path}/SKILL.md`;
  if (item.kind === "plugin") return `${item.path}/.claude-plugin/plugin.json`;
  return item.path;
}

export default function Viewer({ item, onClose }: { item: AnyItem; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const target = fileToShow(item);

  const dirty = edit && content !== original;
  const attemptClose = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  };

  useEffect(() => {
    setBusy(true); setErr(null);
    fetchFile(target)
      .then(c => { setContent(c); setOriginal(c); })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dirty && !confirm("Discard unsaved changes?")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dirty]);

  async function save() {
    setBusy(true); setErr(null);
    try { await saveFile(target, content); setOriginal(content); setEdit(false); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0 0 0 / 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={attemptClose}
    >
      <div
        className="card modal-sheet"
        style={{ width: "min(900px,100%)", maxHeight: "90dvh", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", background: "var(--bg-1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "var(--t-xl)" }}>{item.name}</div>
            <div className="mono faint truncate" style={{ fontSize: "var(--t-sm)", marginTop: 1 }} title={target}>{target}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {!edit ? (
              <button className="btn btn-ghost" onClick={() => setEdit(true)} disabled={busy}>
                <Pencil size={16} /> Edit
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={save} disabled={busy || content === original}>
                  <Check size={16} /> Save
                </button>
                <button className="btn btn-ghost" onClick={() => { setContent(original); setEdit(false); }}>Cancel</button>
              </>
            )}
            <button className="btn btn-ghost btn-icon" onClick={attemptClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "9px 11px" }}>
          {err && (
            <div style={{ padding: "7px 10px", marginBottom: 10, borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>{err}</div>
          )}
          {busy && !content ? (
            <div style={{ display: "grid", gap: 6 }}>
              {[70, 50, 65, 40, 55].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 13, width: `${w}%` }} />
              ))}
            </div>
          ) : edit ? (
            <textarea
              className="input mono"
              style={{ width: "100%", height: "56dvh", fontSize: "var(--t-md)", lineHeight: 1.6, resize: "vertical" }}
              value={content}
              onChange={e => setContent(e.target.value)}
              autoFocus
            />
          ) : (
            <pre className="mono" style={{ fontSize: "var(--t-md)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{content}</pre>
          )}
        </div>

        {edit && content !== original && (
          <div style={{ padding: "6px 14px", borderTop: "1px solid var(--line)", fontSize: "var(--t-md)", color: "var(--amber)", background: "var(--amber-dim)", fontFamily: "var(--font-mono), monospace" }}>
            · unsaved changes
          </div>
        )}
      </div>
    </div>
  );
}
