"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BookOpen, Bot, Box, Brain, Files, FolderOpen, LayoutDashboard, Moon, RefreshCw, Server, Settings, Store, Sun, Zap } from "lucide-react";
import type { AnyItem, ItemKind } from "@/lib/types";
import { getTheme, toggleTheme, type Theme } from "@/lib/theme";

export type Section =
  | "overview" | "skill" | "plugin" | "agent" | "memory"
  | "claude-md" | "loose-md" | "projects" | "sessions" | "mcp" | "marketplace" | "settings";

const NAV: Array<{ id: Section; label: string; icon: React.ReactNode; kind?: ItemKind; sep?: boolean }> = [
  { id: "overview",    label: "Overview",         icon: <LayoutDashboard size={18} /> },
  { id: "skill",       label: "Skills",            icon: <Zap size={18} />,       kind: "skill" },
  { id: "plugin",      label: "Plugins",           icon: <Box size={18} />,       kind: "plugin" },
  { id: "agent",       label: "Agents",            icon: <Bot size={18} />,       kind: "agent" },
  { id: "memory",      label: "Memory",            icon: <Brain size={18} />,     kind: "memory" },
  { id: "claude-md",   label: "CLAUDE.md",         icon: <BookOpen size={18} />,  kind: "claude-md" },
  { id: "loose-md",    label: "Loose .md",         icon: <Files size={18} />,     kind: "loose-md" },
  { id: "projects",    label: "Projects",          icon: <FolderOpen size={18} /> },
  { id: "sessions",    label: "Sessions",          icon: <Activity size={18} />, sep: true },
  { id: "mcp",         label: "MCP Servers",       icon: <Server size={18} /> },
  { id: "marketplace", label: "Browse & Install",  icon: <Store size={18} /> },
  { id: "settings",    label: "Settings",          icon: <Settings size={18} /> },
];

export default function Sidebar({
  active, onChange, items, scannedAt, loading, onRescan, mcpCount, projectsCount,
}: {
  active: Section;
  onChange: (s: Section) => void;
  items: AnyItem[];
  scannedAt?: string;
  loading: boolean;
  onRescan: () => void;
  mcpCount?: number;
  projectsCount?: number;
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

  return (
    <aside className="sidebar" style={{
      width: 270,
      flexShrink: 0,
      height: "100dvh",
      position: "sticky",
      top: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-1)",
      borderRight: "1px solid var(--line)",
    }}>
      {/* Brand */}
      <div className="sidebar-brand" style={{ padding: "20px 16px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <rect width="36" height="36" rx="9" fill="url(#cg)" />
            {/* constellation: clusters of dots connected by fine lines */}
            <g stroke="white" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" fill="none">
              <line x1="11" y1="11" x2="24" y2="14" />
              <line x1="24" y1="14" x2="18" y2="26" />
              <line x1="11" y1="11" x2="18" y2="26" />
              <line x1="24" y1="14" x2="27" y2="19" />
              <line x1="11" y1="11" x2="9" y2="16" />
            </g>
            <g fill="white">
              <circle cx="11" cy="11" r="1.7" />
              <circle cx="9" cy="16" r="1.1" opacity="0.8" />
              <circle cx="14" cy="14" r="1" opacity="0.7" />
              <circle cx="24" cy="14" r="1.9" />
              <circle cx="27" cy="19" r="1.2" opacity="0.8" />
              <circle cx="22" cy="19" r="1" opacity="0.7" />
              <circle cx="18" cy="26" r="1.7" />
              <circle cx="14" cy="25" r="1" opacity="0.7" />
              <circle cx="22" cy="27" r="1.1" opacity="0.8" />
            </g>
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#6366f1"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--t-xl)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              Claudemap
            </div>
            <div style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", marginTop: 1, letterSpacing: "0.01em" }}>
              map your claude setup
            </div>
            {loading && !scannedAt && (
              <div style={{ fontSize: "var(--t-sm)", color: "var(--ac)", marginTop: 2, animation: "pulse 1.4s ease-in-out infinite" }}>
                Scanning…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {NAV.map((n) => {
          const count = n.kind != null
            ? (counts[n.kind] ?? 0)
            : n.id === "mcp" ? (counts["mcp"] ?? 0)
            : n.id === "projects" ? (counts["projects"] ?? 0)
            : undefined;
          return (
            <div key={n.id}>
              {n.sep && <div className="divider" style={{ margin: "6px 2px 6px" }} />}
              <button
                className={`nav-item${active === n.id ? " active" : ""}`}
                onClick={() => onChange(n.id)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {n.icon}
                  {n.label}
                </span>
                {count != null && count > 0 && (
                  <span className="badge badge-default" style={{ fontSize: "var(--t-sm)" }}>{count}</span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ padding: "10px 8px 12px", borderTop: "1px solid var(--line)" }}>
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onRescan}
          disabled={loading}
        >
          <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Scanning…" : "Rescan"}
        </button>
        {theme !== null && (
          <motion.button
            className="btn btn-ghost btn-icon"
            style={{ width: "100%", marginTop: 6 }}
            onClick={handleThemeToggle}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </motion.button>
        )}
        <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", textAlign: "center", marginTop: 7, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{items.length} items</span>
          {scannedAt && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontFamily: "var(--font-mono), monospace" }}>
                {new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", textAlign: "center", marginTop: 4, fontFamily: "var(--font-mono), monospace", letterSpacing: "0.03em" }}>
          local ~/
        </div>
      </div>
    </aside>
  );
}
