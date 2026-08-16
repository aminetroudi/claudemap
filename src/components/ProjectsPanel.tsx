"use client";

import { Bot, BookOpen, Files, FolderOpen, Zap } from "lucide-react";
import { kindLabel } from "@/lib/client";
import type { AnyItem } from "@/lib/types";

export default function ProjectsPanel({
  items,
  projects,
}: {
  items: AnyItem[];
  projects: string[];
}) {
  // Group items by projectRoot
  const byProject: Record<string, AnyItem[]> = {};
  for (const it of items) {
    if (!it.projectRoot) continue;
    if (!byProject[it.projectRoot]) byProject[it.projectRoot] = [];
    byProject[it.projectRoot].push(it);
  }

  // Projects with no scoped items (discovered but nothing inside)
  const allProjects = [...new Set([...projects, ...Object.keys(byProject)])].sort();

  const KIND_ICON: Record<string, React.ReactNode> = {
    skill:      <Zap size={12} />,
    agent:      <Bot size={12} />,
    "claude-md":<BookOpen size={12} />,
    "loose-md": <Files size={12} />,
  };

  if (allProjects.length === 0) {
    return (
      <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "var(--t-2xl)", color: "var(--tx-2)", marginBottom: 8 }}>No projects discovered.</div>
        <div className="faint" style={{ fontSize: "var(--t-md)" }}>Rescan or add paths in Settings.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {allProjects.map((proj) => {
        const projItems = byProject[proj] ?? [];
        const byKind: Record<string, number> = {};
        for (const it of projItems) byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;

        return (
          <div key={proj} className="card" style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: projItems.length ? 10 : 0 }}>
              <FolderOpen size={15} style={{ color: "var(--ac)", flexShrink: 0 }} />
              <span
                className="mono truncate"
                style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}
                title={proj}
              >
                {proj}
              </span>
              <span className="badge badge-default" style={{ flexShrink: 0 }}>
                {projItems.length} item{projItems.length !== 1 ? "s" : ""}
              </span>
            </div>

            {projItems.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 23 }}>
                {Object.entries(byKind).map(([kind, count]) => (
                  <span key={kind} className="badge badge-ac" style={{ gap: 4, display: "flex", alignItems: "center" }}>
                    {KIND_ICON[kind] ?? null}
                    {count} {kindLabel(kind as AnyItem["kind"])}{count !== 1 ? "s" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
