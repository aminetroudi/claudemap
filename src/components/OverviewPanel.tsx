"use client";

import { AlertTriangle, Bot, BookOpen, Box, Brain, Files, FolderOpen, Zap } from "lucide-react";
import type { AnyItem, ItemKind } from "@/lib/types";
import { kindLabel, shortDate } from "@/lib/client";
import type { Section } from "./Sidebar";
import OverviewMap from "./OverviewMap";

const STATS: Array<{ kind: ItemKind; icon: React.ReactNode; section: Section; color: string }> = [
  { kind: "skill",     icon: <Zap size={13} />,      section: "skill",     color: "#818cf8" },
  { kind: "plugin",    icon: <Box size={13} />,      section: "plugin",    color: "#fbbf24" },
  { kind: "agent",     icon: <Bot size={13} />,      section: "agent",     color: "#34d399" },
  { kind: "memory",    icon: <Brain size={13} />,    section: "memory",    color: "#c084fc" },
  { kind: "claude-md", icon: <BookOpen size={13} />, section: "claude-md", color: "#38bdf8" },
  { kind: "loose-md",  icon: <Files size={13} />,    section: "loose-md",  color: "#94a3b8" },
];

/** A readout tile: number first, label under it, kind colour as a 13px cue. */
function Stat({ label, count, icon, color, onClick }: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      className="card card-interactive"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        opacity: empty ? 0.55 : 1,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: empty ? "var(--tx-3)" : color }}>
        {icon}
        <span className="eyebrow" style={{ color: "inherit", opacity: empty ? 1 : 0.85 }}>{label}</span>
      </span>
      <span className="num" style={{ fontSize: "var(--t-2xl)", fontWeight: 600, lineHeight: 1.15 }}>
        {count}
      </span>
    </button>
  );
}

export default function OverviewPanel({ items, scannedAt, errors, onSection, onView }: {
  items: AnyItem[];
  scannedAt?: string;
  errors: string[];
  onSection: (s: Section) => void;
  onView?: (it: AnyItem) => void;
}) {
  const byKind: Record<string, AnyItem[]> = {};
  for (const it of items) { if (!byKind[it.kind]) byKind[it.kind] = []; byKind[it.kind].push(it); }
  const projectCount = new Set(items.filter(i => i.projectRoot).map(i => i.projectRoot)).size;
  const recent = [...items]
    .filter(i => i.modifiedAt)
    .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""))
    .slice(0, 10);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Readout strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))", gap: 6 }}>
        {STATS.map(({ kind, icon, section, color }) => (
          <Stat
            key={kind}
            label={kindLabel(kind)}
            count={byKind[kind]?.length ?? 0}
            icon={icon}
            color={color}
            onClick={() => onSection(section)}
          />
        ))}
        <Stat
          label="Projects"
          count={projectCount}
          icon={<FolderOpen size={13} />}
          color="#94a3b8"
          onClick={() => onSection("projects")}
        />
      </div>

      <OverviewMap items={items} onView={onView} />

      {errors.length > 0 && (
        <div className="card" style={{ padding: "10px 12px", borderColor: "rgba(251 191 36 / 0.28)", background: "var(--amber-dim)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--amber)", fontSize: "var(--t-sm)", fontWeight: 600, marginBottom: 4 }}>
            <AlertTriangle size={14} /> {errors.length} scan warning{errors.length !== 1 ? "s" : ""}
          </div>
          {errors.map((e, i) => (
            <div key={i} className="mono" style={{ fontSize: "var(--t-xs)", color: "var(--tx-3)", lineHeight: 1.6, overflowWrap: "anywhere" }}>{e}</div>
          ))}
        </div>
      )}

      {/* Recent */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <span className="eyebrow">recent changes</span>
          <span className="num faint" style={{ fontSize: "var(--t-2xs)" }}>{recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-sm)" }}>
            Nothing scanned yet.
          </div>
        ) : (
          recent.map((it) => (
            <div
              key={it.id}
              className={`row${onView ? " row-hover" : ""}`}
              style={{ cursor: onView ? "pointer" : "default" }}
              onClick={() => onView?.(it)}
            >
              <span className="badge badge-default" style={{ flexShrink: 0, minWidth: 66, justifyContent: "center" }}>
                {kindLabel(it.kind)}
              </span>
              <span className="truncate" style={{ flex: 1, fontSize: "var(--t-base)" }}>{it.name}</span>
              <span className="num faint" style={{ fontSize: "var(--t-2xs)", flexShrink: 0 }}>
                {shortDate(it.modifiedAt)}
              </span>
            </div>
          ))
        )}
      </div>

      {scannedAt && (
        <div className="mono faint" style={{ fontSize: "var(--t-2xs)", letterSpacing: "0.04em" }}>
          scanned {new Date(scannedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
