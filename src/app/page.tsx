"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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
import SessionsPanel from "@/components/SessionsPanel";
import JobsPanel from "@/components/JobsPanel";
import {
  fetchItems,
  fetchJobs,
  fetchMarketplaces,
  fetchMcp,
  fetchProjects,
  kindLabel,
} from "@/lib/client";
import type { AnyItem, ItemKind, McpResult, ScanResult } from "@/lib/types";
import type { Job } from "@/lib/sessions/types";

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
  const [jobs, setJobs] = useState<Job[]>([]);

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

  // Jobs are polled independently of the item scan: the nav badge has to stay
  // honest about blocked jobs while you are looking at some other section.
  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetchJobs()
        .then((r) => !cancelled && setJobs(r.jobs ?? []))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const allItems = scan?.items ?? [];
  const blockedJobs = jobs.filter((j) => j.state === "blocked").length;

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
    sessions: "Sessions",
    jobs: "Background Jobs",
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
    { id: "sessions", label: "Sessions", icon: null },
    { id: "jobs", label: "Jobs", icon: null },
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
        loading={loading}
        mcpCount={mcpResult.servers.length + (mcpResult.cloudServers?.length ?? 0)}
        projectsCount={projects.length}
        jobsCount={jobs.length}
        jobsBlocked={blockedJobs}
      />

      <main className="app-main" style={{ flex: 1, minWidth: 0, overflowY: "auto", maxHeight: "100dvh" }}>
        {/* Sticky readout. Replaces the old per-section <h1>, which restated
            the sidebar's active state and burned 60px before any data. */}
        <div className="statusline">
          <h1>{sectionTitle[section]}</h1>
          <div className="readout">
            <span><b>{allItems.length}</b> items</span>
            <span aria-hidden style={{ opacity: 0.35 }}>·</span>
            {blockedJobs > 0 ? (
              <button
                className="badge badge-amber"
                style={{ cursor: "pointer" }}
                onClick={() => setSection("jobs")}
                title="Background jobs waiting on you"
              >
                <span className="dot dot-warn" />
                {blockedJobs} blocked
              </button>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span className={jobs.length > 0 ? "dot dot-live" : "dot"} />
                <b>{jobs.length}</b> jobs
              </span>
            )}
            <span aria-hidden style={{ opacity: 0.35 }}>·</span>
            <span className="truncate">
              {scan?.scannedAt
                ? new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </span>
            <button
              className="btn btn-ghost btn-icon"
              onClick={load}
              disabled={loading}
              title="Rescan ~/.claude"
              aria-label="Rescan"
            >
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
        </div>

        {scan === null && <SkeletonFullPage />}

        {scan !== null && (
          <div key={section} className="fade-in">
            {section === "overview" && (
              <OverviewPanel
                items={allItems}
                scannedAt={scan?.scannedAt}
                errors={scan?.errors ?? []}
                onSection={setSection}
                onView={setViewing}
              />
            )}

            {section === "projects" && <ProjectsPanel items={allItems} projects={projects} />}
            {section === "sessions" && <SessionsPanel />}
            {section === "jobs" && <JobsPanel />}

            {section === "mcp" && (
              <McpPanel
                servers={mcpResult.servers}
                cloudServers={mcpResult.cloudServers ?? []}
                errors={mcpResult.errors}
                projects={projects}
                onChanged={load}
              />
            )}

            {section === "marketplace" && (
              <MarketplacePanel marketplaces={marketplaces} installedPlugins={installedPlugins} onInstalled={load} />
            )}

            {section === "settings" && <SettingsPanel onSaved={load} />}

            {kind && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 180 }}
                    placeholder={`Filter ${kindLabel(kind).toLowerCase()}s…`}
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
                      style={{ width: "auto", maxWidth: 240 }}
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
                  <span className="num faint" style={{ fontSize: "var(--t-xs)", paddingLeft: 2 }}>
                    {filtered.length}/{(kind ? allItems.filter((i) => i.kind === kind) : allItems).length}
                  </span>
                </div>

                {loading && <SkeletonList count={5} />}
                {!loading && filtered.length === 0 && (
                  <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: "var(--t-md)", color: "var(--tx-2)", marginBottom: 4 }}>
                      No {kindLabel(kind).toLowerCase()}s match.
                    </div>
                    <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
                      Adjust the filters, or rescan.
                    </div>
                  </div>
                )}

                {filtered.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    projects={projects}
                    onChanged={load}
                    onView={setViewing}
                  />
                ))}
              </>
            )}
          </div>
        )}
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
