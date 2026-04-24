import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  AGENTS_GLOBAL,
  CLAUDE_DIR,
  CLAUDE_JSON,
  HOME,
  PLUGINS_INSTALLED,
  SETTINGS_GLOBAL,
  SKILLS_GLOBAL,
} from "./paths";
import type { McpServer } from "./types";
import { readJsonSafe } from "./util";

const execFileP = promisify(execFile);

/** Reject paths outside known-safe roots to prevent traversal. Lexical check only. */
export function assertSafePath(p: string) {
  const abs = path.resolve(p);
  const safeRoots = [HOME];
  if (!safeRoots.some((r) => abs === r || abs.startsWith(r + "/"))) {
    throw new Error(`Refusing to operate on path outside $HOME: ${abs}`);
  }
  // Block obviously dangerous paths
  const blocked = [HOME, "/", `${HOME}/.ssh`, `${HOME}/.gnupg`];
  if (blocked.includes(abs)) {
    throw new Error(`Refusing to operate on protected path: ${abs}`);
  }
}

/**
 * Realpath-aware safety check. Resolves symlinks on the path (or nearest
 * existing ancestor) and ensures the canonical result still lives under $HOME.
 * Defends against symlink traversal that a lexical check cannot catch.
 */
export async function assertSafeRealPath(p: string): Promise<string> {
  assertSafePath(p);
  let cur = path.resolve(p);
  // Walk up until we find an existing ancestor (in case target doesn't exist yet)
  while (true) {
    try {
      cur = await fs.realpath(cur);
      break;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) break; // reached root
      cur = parent;
    }
  }
  if (!(cur === HOME || cur.startsWith(HOME + "/"))) {
    throw new Error(`Refusing to operate on path escaping $HOME via symlink: ${cur}`);
  }
  // For file ops, return the fully-resolved path when the target itself existed;
  // otherwise return the input resolved lexically (caller uses it as-is).
  try {
    return await fs.realpath(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

export async function trashPath(p: string): Promise<{ trashedTo: string }> {
  assertSafePath(p);
  const trashRoot = path.join(CLAUDE_DIR, "claude-dashboard-trash");
  await fs.mkdir(trashRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(trashRoot, `${stamp}__${path.basename(p)}`);
  await fs.rename(p, dest);
  return { trashedTo: dest };
}

export async function movePath(
  src: string,
  dest: string,
): Promise<{ to: string }> {
  assertSafePath(src);
  assertSafePath(dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // If destination exists, refuse
  try {
    await fs.stat(dest);
    throw new Error(`Destination already exists: ${dest}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await fs.rename(src, dest);
  return { to: dest };
}

/** Promote a project-level skill/agent to global. */
export async function promoteToGlobal(
  src: string,
  kind: "skill" | "agent",
): Promise<{ to: string }> {
  assertSafePath(src);
  const root = kind === "skill" ? SKILLS_GLOBAL : AGENTS_GLOBAL;
  await fs.mkdir(root, { recursive: true });
  const dest = path.join(root, path.basename(src));
  return movePath(src, dest);
}

/** Demote global skill/agent into a chosen project. */
export async function demoteToProject(
  src: string,
  projectRoot: string,
  kind: "skill" | "agent",
): Promise<{ to: string }> {
  assertSafePath(src);
  assertSafePath(projectRoot);
  const root = path.join(projectRoot, ".claude", kind === "skill" ? "skills" : "agents");
  await fs.mkdir(root, { recursive: true });
  const dest = path.join(root, path.basename(src));
  return movePath(src, dest);
}

export async function readFileText(p: string): Promise<string> {
  const safe = await assertSafeRealPath(p);
  return fs.readFile(safe, "utf8");
}

export async function writeFileText(p: string, content: string): Promise<void> {
  const safe = await assertSafeRealPath(p);
  await fs.writeFile(safe, content, "utf8");
}

/** Toggle a plugin's enabled flag in ~/.claude/settings.json */
export async function togglePlugin(
  fullName: string,
  enabled: boolean,
): Promise<void> {
  const settings = await readJsonSafe<Record<string, unknown>>(SETTINGS_GLOBAL, {});
  const plugins = (settings.enabledPlugins as Record<string, boolean>) || {};
  plugins[fullName] = enabled;
  settings.enabledPlugins = plugins;
  await fs.writeFile(SETTINGS_GLOBAL, JSON.stringify(settings, null, 2), "utf8");
}

/** Uninstall a plugin by editing installed_plugins.json (does not delete cache). */
export async function uninstallPlugin(fullName: string): Promise<void> {
  let installed: { plugins?: Record<string, unknown[]> } = {};
  try {
    installed = JSON.parse(await fs.readFile(PLUGINS_INSTALLED, "utf8"));
  } catch {
    return;
  }
  if (installed.plugins && fullName in installed.plugins) {
    delete installed.plugins[fullName];
    await fs.writeFile(PLUGINS_INSTALLED, JSON.stringify(installed, null, 2), "utf8");
  }
  // also disable in settings
  await togglePlugin(fullName, false);
}

// ── MCP Server Management ─────────────────────────────────────────

async function readClaudeJson(): Promise<Record<string, unknown>> {
  return readJsonSafe<Record<string, unknown>>(CLAUDE_JSON, {});
}

async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(CLAUDE_JSON, JSON.stringify(data, null, 2), "utf8");
}

async function readMcpJson(projectRoot: string): Promise<Record<string, unknown>> {
  return readJsonSafe<Record<string, unknown>>(path.join(projectRoot, ".mcp.json"), {});
}

async function writeMcpJson(projectRoot: string, data: Record<string, unknown>): Promise<void> {
  assertSafePath(projectRoot);
  const p = path.join(projectRoot, ".mcp.json");
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

type McpEntry = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

function serverToEntry(s: Omit<McpServer, "name" | "scope" | "projectRoot">): McpEntry {
  const entry: McpEntry = {};
  if (s.type) entry.type = s.type;
  if (s.command) entry.command = s.command;
  if (s.args?.length) entry.args = s.args;
  if (s.env && Object.keys(s.env).length) entry.env = s.env;
  if (s.url) entry.url = s.url;
  return entry;
}

async function readHomeMcpJson(): Promise<Record<string, unknown>> {
  return readJsonSafe<Record<string, unknown>>(path.join(HOME, ".mcp.json"), {});
}
async function writeHomeMcpJson(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(HOME, ".mcp.json"), JSON.stringify(data, null, 2), "utf8");
}

export async function addMcpServer(server: McpServer): Promise<void> {
  if (server.scope === "global") {
    const data = await readClaudeJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    if (server.name in servers) throw new Error(`MCP server "${server.name}" already exists globally`);
    servers[server.name] = serverToEntry(server);
    data.mcpServers = servers;
    await writeClaudeJson(data);
  } else if (server.scope === "home") {
    const data = await readHomeMcpJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    if (server.name in servers) throw new Error(`MCP server "${server.name}" already exists in ~/.mcp.json`);
    servers[server.name] = serverToEntry(server);
    data.mcpServers = servers;
    await writeHomeMcpJson(data);
  } else {
    if (!server.projectRoot) throw new Error("projectRoot required for project-scoped MCP server");
    const data = await readMcpJson(server.projectRoot);
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    if (server.name in servers) throw new Error(`MCP server "${server.name}" already exists in this project`);
    servers[server.name] = serverToEntry(server);
    data.mcpServers = servers;
    await writeMcpJson(server.projectRoot, data);
  }
}

export async function updateMcpServer(oldName: string, server: McpServer): Promise<void> {
  if (server.scope === "global") {
    const data = await readClaudeJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[oldName]; servers[server.name] = serverToEntry(server);
    data.mcpServers = servers; await writeClaudeJson(data);
  } else if (server.scope === "home") {
    const data = await readHomeMcpJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[oldName]; servers[server.name] = serverToEntry(server);
    data.mcpServers = servers; await writeHomeMcpJson(data);
  } else {
    if (!server.projectRoot) throw new Error("projectRoot required");
    const data = await readMcpJson(server.projectRoot);
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[oldName]; servers[server.name] = serverToEntry(server);
    data.mcpServers = servers; await writeMcpJson(server.projectRoot, data);
  }
}

export async function deleteMcpServer(name: string, scope: "global" | "home" | "project", projectRoot?: string): Promise<void> {
  if (scope === "global") {
    const data = await readClaudeJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[name]; data.mcpServers = servers; await writeClaudeJson(data);
  } else if (scope === "home") {
    const data = await readHomeMcpJson();
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[name]; data.mcpServers = servers; await writeHomeMcpJson(data);
  } else {
    if (!projectRoot) throw new Error("projectRoot required");
    const data = await readMcpJson(projectRoot);
    const servers = (data.mcpServers as Record<string, McpEntry>) ?? {};
    delete servers[name]; data.mcpServers = servers; await writeMcpJson(projectRoot, data);
  }
}

/** Run `claude` CLI plugin install (best-effort; requires `claude` on PATH). */
export async function installPluginViaCli(
  fullName: string,
): Promise<{ stdout: string; stderr: string }> {
  // Prefer `claude plugin install`
  try {
    const { stdout, stderr } = await execFileP(
      "claude",
      ["plugin", "install", fullName],
      { timeout: 120_000 },
    );
    return { stdout, stderr };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `claude plugin install failed: ${err.stderr || err.stdout || err.message}`,
    );
  }
}
