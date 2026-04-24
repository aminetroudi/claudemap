import fs from "node:fs/promises";
import path from "node:path";
import { CLAUDE_DIR, CLAUDE_JSON, HOME, HOME_MCP_JSON, SETTINGS_LOCAL } from "../paths";
import type { McpServer, CloudMcpServer, McpResult } from "../types";

type RawMcpEntry = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

async function readJsonSafe(p: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return {};
  }
}

/** Read the set of server names disabled via disabledMcpjsonServers */
async function readDisabledSet(): Promise<Set<string>> {
  const local = await readJsonSafe(SETTINGS_LOCAL);
  const list = local.disabledMcpjsonServers;
  if (Array.isArray(list)) return new Set(list as string[]);
  return new Set();
}

function parseServers(
  raw: Record<string, unknown>,
  scope: McpServer["scope"],
  disabled: Set<string>,
  projectRoot?: string,
): McpServer[] {
  const mcpServers = raw.mcpServers as Record<string, RawMcpEntry> | undefined;
  if (!mcpServers || typeof mcpServers !== "object") return [];
  return Object.entries(mcpServers).map(([name, cfg]) => ({
    name,
    type: cfg.type,
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    url: cfg.url,
    scope,
    projectRoot,
    disabled: disabled.has(name),
  }));
}

/** Parse mcp__<server>__<tool> permission strings from a settings.local.json */
function extractCloudPerms(raw: Record<string, unknown>): Array<{ server: string; tool: string }> {
  const allow = (raw.permissions as { allow?: unknown[] } | undefined)?.allow ?? [];
  const result: Array<{ server: string; tool: string }> = [];
  for (const entry of allow) {
    if (typeof entry !== "string") continue;
    const m = entry.match(/^mcp__([^_][^_]*)__(.+)$/);
    // pattern: mcp__<server>__<tool>  where server may contain single underscores
    // more robust: split on first and last __ pair
    if (!m) {
      // try splitting differently for names like "claude_ai_Atlassian"
      const parts = entry.split("__");
      if (parts.length >= 3 && parts[0] === "mcp") {
        const server = parts.slice(1, -1).join("__");
        const tool = parts[parts.length - 1];
        result.push({ server, tool });
      }
    } else {
      result.push({ server: m[1], tool: m[2] });
    }
  }
  return result;
}

function makeDisplayName(serverKey: string): string {
  // "claude_ai_Atlassian" → "Atlassian (claude.ai)"
  // "postgres-dev" → "postgres-dev"
  // "google-sheets" → "google-sheets"
  const claudeAi = serverKey.match(/^claude_ai_(.+)$/);
  if (claudeAi) return `${claudeAi[1]} (claude.ai)`;
  return serverKey;
}

async function scanCloudMcpServers(projectRoots: string[]): Promise<CloudMcpServer[]> {
  // Map: serverKey → { tools: Set, projects: Set }
  const map = new Map<string, { tools: Set<string>; projects: Set<string> }>();

  function merge(perms: Array<{ server: string; tool: string }>, projectRoot: string) {
    for (const { server, tool } of perms) {
      if (!map.has(server)) map.set(server, { tools: new Set(), projects: new Set() });
      map.get(server)!.tools.add(tool);
      map.get(server)!.projects.add(projectRoot);
    }
  }

  // Global settings.local.json
  try {
    const raw = await readJsonSafe(SETTINGS_LOCAL);
    merge(extractCloudPerms(raw), "global");
  } catch { /* ignore */ }

  // Per-project settings.local.json
  for (const root of projectRoots) {
    try {
      const raw = await readJsonSafe(path.join(root, ".claude", "settings.local.json"));
      merge(extractCloudPerms(raw), root);
    } catch { /* ignore */ }
  }

  // Also scan all .claude/settings.local.json under HOME (Claude creates these for every project it touches)
  try {
    const walk = async (dir: string, depth: number) => {
      if (depth > 6) return;
      let entries: import("node:fs").Dirent[];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          const skip = ["node_modules", ".cache", ".git", "snap", "chromium", "brave", "Trash", ".windsurf", "venv", ".venv"];
          if (!skip.includes(e.name)) await walk(full, depth + 1);
        } else if (e.name === "settings.local.json" && dir.endsWith("/.claude")) {
          const projectRoot = path.dirname(dir);
          if (projectRoot === HOME || projectRoot.startsWith(CLAUDE_DIR)) continue;
          if (projectRoots.includes(projectRoot)) continue; // already covered
          try {
            const raw = await readJsonSafe(full);
            merge(extractCloudPerms(raw), projectRoot);
          } catch { /* ignore */ }
        }
      }
    };
    await walk(HOME, 0);
  } catch { /* ignore */ }

  return Array.from(map.entries()).map(([name, { tools, projects }]) => ({
    name,
    displayName: makeDisplayName(name),
    tools: Array.from(tools).sort(),
    projects: Array.from(projects).filter(p => p !== "global").sort(),
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function scanMcpServers(projectRoots: string[] = []): Promise<McpResult> {
  const servers: McpServer[] = [];
  const errors: string[] = [];

  const disabled = await readDisabledSet();

  // 1. Global: ~/.claude.json
  try {
    const globalJson = await readJsonSafe(CLAUDE_JSON);
    servers.push(...parseServers(globalJson, "global", disabled));
  } catch (e) {
    errors.push(`~/.claude.json: ${(e as Error).message}`);
  }

  // 2. Home-level: ~/.mcp.json (Claude also reads this)
  try {
    const homeMcp = await readJsonSafe(HOME_MCP_JSON);
    const found = parseServers(homeMcp, "home", disabled);
    if (found.length) servers.push(...found);
  } catch (e) {
    errors.push(`~/.mcp.json: ${(e as Error).message}`);
  }

  // 3. Project-level: .mcp.json in each project root
  for (const root of projectRoots) {
    const mcpFile = path.join(root, ".mcp.json");
    try {
      const raw = await readJsonSafe(mcpFile);
      const found = parseServers(raw, "project", disabled, root);
      if (found.length) servers.push(...found);
    } catch (e) {
      errors.push(`${mcpFile}: ${(e as Error).message}`);
    }
  }

  // Cloud MCPs from permission entries
  const cloudServers = await scanCloudMcpServers(projectRoots);

  return { servers, cloudServers, errors };
}
