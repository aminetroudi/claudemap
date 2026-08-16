"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { fetchConfig, saveConfig } from "@/lib/client";
import type { AppConfig } from "@/lib/types";

export default function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchConfig().then(setCfg); }, []);

  if (!cfg) return (
    <div style={{ display: "grid", gap: 8 }}>
      {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
    </div>
  );

  async function persist(next: AppConfig) {
    setBusy(true);
    try {
      const saved = await saveConfig(next);
      setCfg(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      {saved && (
        <div style={{
          padding: "6px 10px",
          borderRadius: "var(--r)",
          background: "rgba(52 211 153 / 0.08)",
          border: "1px solid rgba(16 185 129 / 0.25)",
          color: "var(--green)",
          fontSize: "var(--t-xl)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Check size={14} /> Settings saved
        </div>
      )}

      <ListEditor
        title="Scan paths"
        hint="Roots to scan for projects, CLAUDE.md, and loose .md files."
        items={cfg.scanPaths}
        onAdd={(v) => persist({ ...cfg, scanPaths: [...new Set([...cfg.scanPaths, v])] })}
        onRemove={(v) => persist({ ...cfg, scanPaths: cfg.scanPaths.filter((p) => p !== v) })}
        disabled={busy}
      />
      <ListEditor
        title="Exclude paths"
        hint="Skip these prefixes and everything under them."
        items={cfg.excludePaths}
        onAdd={(v) => persist({ ...cfg, excludePaths: [...new Set([...cfg.excludePaths, v])] })}
        onRemove={(v) => persist({ ...cfg, excludePaths: cfg.excludePaths.filter((p) => p !== v) })}
        disabled={busy}
      />
      <ListEditor
        title="Excluded projects"
        hint="Project roots to omit from scans entirely."
        items={cfg.excludeProjects}
        onAdd={(v) => persist({ ...cfg, excludeProjects: [...new Set([...cfg.excludeProjects, v])] })}
        onRemove={(v) => persist({ ...cfg, excludeProjects: cfg.excludeProjects.filter((p) => p !== v) })}
        disabled={busy}
      />

      {/* Limits */}
      <div className="card" style={{ padding: "16px" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--t-xl)", marginBottom: 4 }}>Scan limits</div>
        <div className="faint" style={{ fontSize: "var(--t-md)", marginBottom: 12 }}>
          Limits for loose .md file scanning.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginBottom: 6 }}>Max depth</div>
            <input
              className="input"
              type="number"
              min={1} max={20}
              value={cfg.looseMdMaxDepth}
              onChange={(e) => setCfg({ ...cfg, looseMdMaxDepth: Number(e.target.value) || 1 })}
              onBlur={() => persist(cfg)}
            />
          </label>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginBottom: 6 }}>Max files</div>
            <input
              className="input"
              type="number"
              min={10} max={10000}
              value={cfg.looseMdMaxFiles}
              onChange={(e) => setCfg({ ...cfg, looseMdMaxFiles: Number(e.target.value) || 100 })}
              onBlur={() => persist(cfg)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function ListEditor({
  title,
  hint,
  items,
  onAdd,
  onRemove,
  disabled,
}: {
  title: string;
  hint?: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  disabled: boolean;
}) {
  const [val, setVal] = useState("");

  function submit() {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal("");
  }

  return (
    <div className="card" style={{ padding: "16px" }}>
      <div style={{ fontWeight: 600, fontSize: "var(--t-xl)", marginBottom: 4 }}>{title}</div>
      {hint && <div className="faint" style={{ fontSize: "var(--t-md)", marginBottom: 12 }}>{hint}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          className="input mono"
          style={{ fontSize: "var(--t-md)" }}
          placeholder="/absolute/path"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn btn-primary" onClick={submit} disabled={disabled || !val.trim()}>
          <Plus size={13} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="faint" style={{ fontSize: "var(--t-md)" }}>None configured.</div>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {items.map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: "var(--r)",
                background: "var(--bg-2)",
              }}
            >
              <span className="mono truncate" style={{ fontSize: "var(--t-md)" }}>{p}</span>
              <button
                className="btn btn-danger btn-icon"
                style={{ flexShrink: 0 }}
                onClick={() => onRemove(p)}
                disabled={disabled}
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
