import type { AnyItem, AppConfig, McpResult, ScanResult } from "./types";
import type {
  HistoryResult,
  SessionMetrics,
  SessionsResult,
  TimelineResult,
} from "./sessions/types";

export async function fetchItems(): Promise<ScanResult> {
  const r = await fetch("/api/items", { cache: "no-store" });
  return r.json();
}

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch("/api/config", { cache: "no-store" });
  return r.json();
}

export async function saveConfig(cfg: Partial<AppConfig>): Promise<AppConfig> {
  const r = await fetch("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return r.json();
}

export async function fetchProjects(): Promise<string[]> {
  const r = await fetch("/api/projects", { cache: "no-store" });
  const j = await r.json();
  return j.projects ?? [];
}

export async function fetchMcp(): Promise<McpResult> {
  const r = await fetch("/api/mcp", { cache: "no-store" });
  return r.json();
}

export async function fetchSessions(): Promise<SessionsResult> {
  const r = await fetch("/api/sessions", { cache: "no-store" });
  return r.json();
}

export async function fetchHistory(days = 7): Promise<HistoryResult> {
  const r = await fetch(`/api/sessions/history?days=${days}`, { cache: "no-store" });
  return r.json();
}

export async function fetchTimeline(file: string, offset = 0, limit = 50): Promise<TimelineResult> {
  const q = new URLSearchParams({ file, offset: String(offset), limit: String(limit) });
  const r = await fetch(`/api/sessions/timeline?${q}`, { cache: "no-store" });
  return r.json();
}

export async function fetchMetrics(file: string): Promise<SessionMetrics> {
  const r = await fetch(`/api/sessions/metrics?file=${encodeURIComponent(file)}`, {
    cache: "no-store",
  });
  return r.json();
}

export async function fetchMarketplaces() {
  const r = await fetch("/api/marketplaces", { cache: "no-store" });
  return (await r.json()).marketplaces;
}

export async function fetchFile(path: string): Promise<string> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.content;
}

export async function saveFile(path: string, content: string): Promise<void> {
  const r = await fetch("/api/file", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
}

export async function callAction<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j as T;
}

export async function searchGitHub(q: string, kind: "marketplace" | "skill" | "plugin") {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&kind=${kind}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.results as Array<{
    fullName: string;
    description: string | null;
    url: string;
    stars: number;
    updatedAt: string;
    owner: string;
    avatar: string;
  }>;
}

export function bytes(n?: number): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function kindLabel(k: AnyItem["kind"]): string {
  return {
    skill: "Skill",
    plugin: "Plugin",
    agent: "Agent",
    memory: "Memory",
    "claude-md": "CLAUDE.md",
    "loose-md": "Markdown",
  }[k];
}
