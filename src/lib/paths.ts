import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const CLAUDE_DIR = path.join(HOME, ".claude");
export const SKILLS_GLOBAL = path.join(CLAUDE_DIR, "skills");
export const AGENTS_GLOBAL = path.join(CLAUDE_DIR, "agents");
export const PLUGINS_DIR = path.join(CLAUDE_DIR, "plugins");
export const PLUGINS_CACHE = path.join(PLUGINS_DIR, "cache");
export const PLUGINS_INSTALLED = path.join(PLUGINS_DIR, "installed_plugins.json");
export const MARKETPLACES_DIR = path.join(PLUGINS_DIR, "marketplaces");
export const SETTINGS_GLOBAL = path.join(CLAUDE_DIR, "settings.json");
export const SETTINGS_LOCAL = path.join(CLAUDE_DIR, "settings.local.json");
export const HOME_MCP_JSON = path.join(HOME, ".mcp.json");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const HOME_PROJECT_KEY = pathToProjectKey(HOME);
export const MEMORY_DIR = path.join(PROJECTS_DIR, HOME_PROJECT_KEY, "memory");
export const MEMORY_INDEX = path.join(MEMORY_DIR, "MEMORY.md");

// Claude's main config (stores mcpServers)
export const CLAUDE_JSON = path.join(HOME, ".claude.json");

// Dashboard's own config file
export const APP_CONFIG_PATH = path.join(
  CLAUDE_DIR,
  "claude-dashboard.config.json",
);

/**
 * Convert a Claude project key (e.g. "-home-user-projects") back to the
 * filesystem path the project lives at. Best-effort: dashes are
 * ambiguous, so we prefer the longest existing matching path.
 */
export function projectKeyToPath(key: string): string {
  if (!key.startsWith("-")) return key;
  const guess = "/" + key.slice(1).replace(/-/g, "/");
  return guess;
}

export function pathToProjectKey(p: string): string {
  return p.replace(/\//g, "-");
}

export function isUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
