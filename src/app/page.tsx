"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar, { type Section } from "@/components/Sidebar";
import ItemRow from "@/components/ItemRow";
import Viewer from "@/components/Viewer";
import CommandPalette from "@/components/CommandPalette";
import SettingsPanel from "@/components/SettingsPanel";
import MarketplacePanel from "@/components/MarketplacePanel";
import OverviewPanel from "@/components/OverviewPanel";
import { SkeletonFullPage, SkeletonList } from "@/components/Skeleton";
import ProjectsPanel from "@/components/ProjectsPanel";
import McpPanel from "@/components/McpPanel";
import {
  fetchItems,
  fetchMarketplaces,
  fetchMcp,
  fetchProjects,
  kindLabel,
} from "@/lib/client";
import type { AnyItem, ItemKind, McpResult, ScanResult } from "@/lib/types";

type LocalMarketplace = {
  name: string;
  path: string;
  description?: string;
  plugins: Array<{ name: string; description?: string; category?: string }>;
};

const SECTION_TO_KIND: Partial<Record<Section, ItemKind>> = {
  skill: "skill",
  plugin: "plugin",
  agent: "agent",
  memory: "memory",
  "claude-md": "claude-md",
  "loose-md": "loose-md",
};

export default function Home() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [marketplaces, setMarketplaces] = useState<LocalMarketplace[]>([]);
  const [mcpResult, setMcpResult] = useState<McpResult>({ servers: [], errors: [], cloudServers: [] });
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "project">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<AnyItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ps, mps, mcp] = await Promise.all([
        fetchItems(),
        fetchProjects(),
        fetchMarketplaces(),
        fetchMcp(),
      ]);
      setScan(s);
      setProjects(ps);
      setMarketplaces((mps ?? []) as LocalMarketplace[]);
      setMcpResult(mcp);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allItems = scan?.items ?? [];

  const kind = SECTION_TO_KIND[section];
  let filtered = kind ? allItems.filter((i) => i.kind === kind) : allItems;
  if (scopeFilter !== "all") filtered = filtered.filter((i) => i.scope === scopeFilter);
  if (projectFilter !== "all") {
    filtered = filtered.filter((i) =>
      projectFilter === "__global"
        ? !i.projectRoot
        : i.projectRoot === projectFilter,
    );
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q),
    );
  }

  // Map of fullName -> enabled for installed plugins
  const installedPlugins = Object.fromEntries(
    allItems
      .filter((i) => i.kind === "plugin")
      .map((i) => [(i as { meta: { fullName: string; enabled: boolean } }).meta.fullName, (i as { meta: { enabled: boolean } }).meta.enabled])
  );

  const sectionTitle: Record<Section, string> = {
    overview: "Overview",
    skill: "Skills",
    plugin: "Plugins",
    agent: "Agents",
    memory: "Memory",
    "claude-md": "CLAUDE.md files",
    "loose-md": "Loose Markdown",
    projects: "Projects",
    mcp: "MCP Servers",
    marketplace: "Browse & Install",
    settings: "Settings",
  };

  const commandSections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: null },
    { id: "skill", label: "Skills", icon: null },
    { id: "plugin", label: "Plugins", icon: null },
    { id: "agent", label: "Agents", icon: null },
    { id: "memory", label: "Memory", icon: null },
    { id: "claude-md", label: "CLAUDE.md", icon: null },
    { id: "loose-md", label: "Loose .md", icon: null },
    { id: "projects", label: "Projects", icon: null },
    { id: "mcp", label: "MCP Servers", icon: null },
    { id: "marketplace", label: "Browse & Install", icon: null },
    { id: "settings", label: "Settings", icon: null },
  ];

  const itemProjects = [
    ...new Set(
      allItems.filter((i) => i.projectRoot).map((i) => i.projectRoot as string),
    ),
  ].sort();

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100dvh" }}>
      <Sidebar
        active={section}
        onChange={(s) => { setSection(s); setSearch(""); }}
        items={allItems}
        scannedAt={scan?.scannedAt}
        loading={loading}
        onRescan={load}
        mcpCount={mcpResult.servers.length + (mcpResult.cloudServers?.length ?? 0)}
        projectsCount={projects.length}
      />

      <main className="app-main" style={{ flex: 1, padding: "2rem 2.5rem", minWidth: 0, overflowY: "auto", maxHeight: "100dvh" }}>
        <h1 style={{ fontSize: "var(--t-3xl)", fontWeight: 700, marginBottom: 24, letterSpacing: "-0.02em" }}>
          {sectionTitle[section]}
        </h1>

        <AnimatePresence mode="wait">
          {scan === null && <SkeletonFullPage key="skeleton" />}

          {scan !== null && section === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <OverviewPanel
                items={allItems}
                scannedAt={scan?.scannedAt}
                errors={scan?.errors ?? []}
                onSection={setSection}
                onView={setViewing}
              />
            </motion.div>
          )}

          {scan !== null && section === "projects" && (
            <motion.div
              key="projects"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ProjectsPanel items={allItems} projects={projects} />
            </motion.div>
          )}

          {scan !== null && section === "mcp" && (
            <motion.div
              key="mcp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <McpPanel
                servers={mcpResult.servers}
                cloudServers={mcpResult.cloudServers ?? []}
                errors={mcpResult.errors}
                projects={projects}
                onChanged={load}
              />
            </motion.div>
          )}

          {scan !== null && section === "marketplace" && (
            <motion.div
              key="marketplace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MarketplacePanel marketplaces={marketplaces} installedPlugins={installedPlugins} onInstalled={load} />
            </motion.div>
          )}

          {scan !== null && section === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SettingsPanel onSaved={load} />
            </motion.div>
          )}

          {scan !== null && kind && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder={`Search ${kindLabel(kind).toLowerCase()}s…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="input"
                  style={{ width: "auto" }}
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value as "all" | "global" | "project")}
                >
                  <option value="all">All scopes</option>
                  <option value="global">Global only</option>
                  <option value="project">Project only</option>
                </select>
                {itemProjects.length > 0 && (
                  <select
                    className="input"
                    style={{ width: "auto", maxWidth: 260 }}
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  >
                    <option value="all">All projects</option>
                    <option value="__global">Global (no project)</option>
                    {itemProjects.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
                <div className="faint" style={{ display: "flex", alignItems: "center", fontSize: "0.8rem" }}>
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                </div>
              </div>

              {loading && <SkeletonList count={5} />}
              {!loading && filtered.length === 0 && (
                <motion.div
                  className="card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ padding: "40px 24px", textAlign: "center" }}
                >
                  <div style={{ fontSize: "var(--t-2xl)", color: "var(--tx-2)", marginBottom: 8 }}>
                    No {kindLabel(kind).toLowerCase()}s found.
                  </div>
                  <div className="faint" style={{ fontSize: "var(--t-md)" }}>
                    Try adjusting filters or rescanning.
                  </div>
                </motion.div>
              )}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.1,
                    },
                  },
                }}
              >
                {filtered.map((it) => (
                  <motion.div
                    key={it.id}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    <ItemRow
                      item={it}
                      projects={projects}
                      onChanged={load}
                      onView={setViewing}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {viewing && (
        <Viewer item={viewing} onClose={() => setViewing(null)} />
      )}

      <CommandPalette
        sections={commandSections}
        items={allItems}
        onNavigate={setSection}
        onViewItem={setViewing}
      />
    </div>
  );
}
