"use client";

import { useEffect, useState } from "react";
import { Activity, BookOpen, Bot, Box, Brain, Files, FolderOpen, LayoutDashboard, ListChecks, Moon, Server, Settings, Store, Sun, Zap } from "lucide-react";
import type { AnyItem, ItemKind } from "@/lib/types";
import { getTheme, toggleTheme, type Theme } from "@/lib/theme";

export type Section =
  | "overview" | "skill" | "plugin" | "agent" | "memory"
  | "claude-md" | "loose-md" | "projects" | "sessions" | "jobs" | "mcp" | "marketplace" | "settings";

const ICON = 15;

/** `group` opens a labelled band above the item — the flat 13-item list gave
 *  no clue that half of it is on-disk config and half is live runtime. */
const NAV: Array<{ id: Section; label: string; icon: React.ReactNode; kind?: ItemKind; group?: string }> = [
  { id: "overview",    label: "Overview",         icon: <LayoutDashboard size={ICON} /> },
  { id: "skill",       label: "Skills",            icon: <Zap size={ICON} />,       kind: "skill", group: "config" },
  { id: "plugin",      label: "Plugins",           icon: <Box size={ICON} />,       kind: "plugin" },
  { id: "agent",       label: "Agents",            icon: <Bot size={ICON} />,       kind: "agent" },
  { id: "memory",      label: "Memory",            icon: <Brain size={ICON} />,     kind: "memory" },
  { id: "claude-md",   label: "CLAUDE.md",         icon: <BookOpen size={ICON} />,  kind: "claude-md" },
  { id: "loose-md",    label: "Loose .md",         icon: <Files size={ICON} />,     kind: "loose-md" },
  { id: "projects",    label: "Projects",          icon: <FolderOpen size={ICON} /> },
  { id: "sessions",    label: "Sessions",          icon: <Activity size={ICON} />,  group: "runtime" },
  { id: "jobs",        label: "Jobs",              icon: <ListChecks size={ICON} /> },
  { id: "mcp",         label: "MCP Servers",       icon: <Server size={ICON} /> },
  { id: "marketplace", label: "Browse & Install",  icon: <Store size={ICON} />,     group: "manage" },
  { id: "settings",    label: "Settings",          icon: <Settings size={ICON} /> },
];

export default function Sidebar({
  active, onChange, items, loading, mcpCount, projectsCount,
  jobsCount, jobsBlocked,
}: {
  active: Section;
  onChange: (s: Section) => void;
  items: AnyItem[];
  /** Rescan lives in the statusline now; this only drives the brand indicator. */
  loading: boolean;
  mcpCount?: number;
  projectsCount?: number;
  jobsCount?: number;
  /** Background jobs stopped waiting on a human — surfaced as an amber badge. */
  jobsBlocked?: number;
}) {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    const currentTheme = getTheme();
    setThemeState(currentTheme);
  }, []);

  const handleThemeToggle = () => {
    const newTheme = toggleTheme();
    setThemeState(newTheme);
  };

  const counts: Partial<Record<string, number>> = {};
  for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  counts["mcp"] = mcpCount ?? 0;
  counts["projects"] = projectsCount ?? 0;
  counts["jobs"] = jobsCount ?? 0;

  return (
    <aside className="sidebar" style={{
      width: 208,
      flexShrink: 0,
      height: "100dvh",
      position: "sticky",
      top: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-1)",
      borderRight: "1px solid var(--line)",
    }}>
      {/* Brand — a mark, not a hero. Mono wordmark keeps it in the toolchain
          register rather than the landing-page one. */}
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 12px", borderBottom: "1px solid var(--line)" }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }} aria-hidden>
          <rect x="0.5" y="0.5" width="17" height="17" rx="4" stroke="var(--ac)" strokeWidth="1" />
          <g stroke="var(--ac)" strokeWidth="0.8" strokeLinecap="round" opacity="0.55">
            <line x1="5.5" y1="5.5" x2="12" y2="7" />
            <line x1="12" y1="7" x2="9" y2="12.5" />
            <line x1="5.5" y1="5.5" x2="9" y2="12.5" />
          </g>
          <g fill="var(--ac)">
            <circle cx="5.5" cy="5.5" r="1.5" />
            <circle cx="12" cy="7" r="1.5" />
            <circle cx="9" cy="12.5" r="1.5" />
          </g>
        </svg>
        <span className="mono" style={{ fontSize: "var(--t-md)", fontWeight: 600, letterSpacing: "-0.02em" }}>
          claudemap
        </span>
        {loading && <span className="dot dot-live" style={{ marginLeft: "auto", background: "var(--ac)" }} title="Scanning…" />}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "6px 6px 10px" }}>
        {NAV.map((n) => {
          const count = n.kind != null
            ? (counts[n.kind] ?? 0)
            : n.id === "mcp" ? (counts["mcp"] ?? 0)
            : n.id === "projects" ? (counts["projects"] ?? 0)
            : n.id === "jobs" ? (counts["jobs"] ?? 0)
            : undefined;
          // A blocked job is the one thing in the nav that wants attention now.
          const blocked = n.id === "jobs" && (jobsBlocked ?? 0) > 0;
          return (
            <div key={n.id}>
              {n.group && (
                <div className="eyebrow" style={{ padding: "12px 9px 4px" }}>{n.group}</div>
              )}
              <button
                className={`nav-item${active === n.id ? " active" : ""}`}
                onClick={() => onChange(n.id)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ display: "flex", opacity: active === n.id ? 1 : 0.65 }}>{n.icon}</span>
                  <span className="truncate">{n.label}</span>
                </span>
                {blocked ? (
                  <span className="badge badge-amber">{jobsBlocked}</span>
                ) : count != null && count > 0 ? (
                  <span className="nav-count">{count}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer — origin of the data, and the theme switch. Nothing else. */}
      <div className="sidebar-footer" style={{ padding: "8px 10px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="mono" style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", letterSpacing: "0.04em" }}>
          ~/.claude · {items.length}
        </span>
        {theme !== null && (
          <button
            className="btn btn-ghost btn-icon"
            style={{ width: 22, minWidth: 22, height: 22 }}
            onClick={handleThemeToggle}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        )}
      </div>
    </aside>
  );
}
