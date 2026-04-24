import fs from "node:fs/promises";
import path from "node:path";
import { APP_CONFIG_PATH, HOME } from "./paths";
import type { AppConfig } from "./types";

const DEFAULT: AppConfig = {
  scanPaths: [HOME],
  excludePaths: [
    `${HOME}/.cache`,
    `${HOME}/.local`,
    `${HOME}/.npm`,
    `${HOME}/.nvm`,
    `${HOME}/snap`,
    `${HOME}/.mozilla`,
    `${HOME}/.config`,
    `${HOME}/.vscode`,
    `${HOME}/.cursor`,
    `${HOME}/google-cloud-sdk`,
    `${HOME}/.claude/plugins/cache`,
    `${HOME}/.claude/file-history`,
    `${HOME}/.claude/projects`,
    `${HOME}/.claude/sessions`,
    `${HOME}/.claude/backups`,
    `${HOME}/.claude/shell-snapshots`,
    `${HOME}/.claude/session-env`,
    `${HOME}/.claude/telemetry`,
    `${HOME}/.claude/debug`,
    `${HOME}/.claude/tasks`,
    `${HOME}/.claude/paste-cache`,
    `${HOME}/.claude/downloads`,
    `${HOME}/.claude/plans`,
  ],
  excludeProjects: [],
  looseMdMaxDepth: 6,
  looseMdMaxFiles: 2000,
};

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~" || p.startsWith("~/")) return path.join(HOME, p.slice(1));
  return p.replace(/\$\{HOME\}|\$HOME(?![A-Za-z_])/g, HOME);
}

function expandList(arr: string[] | undefined): string[] {
  return (arr ?? []).map(expandHome);
}

let cached: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(APP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const merged = { ...DEFAULT, ...parsed };
    cached = {
      ...merged,
      scanPaths: expandList(merged.scanPaths),
      excludePaths: expandList(merged.excludePaths),
      excludeProjects: expandList(merged.excludeProjects),
    };
  } catch {
    cached = { ...DEFAULT };
  }
  return cached;
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  cached = cfg;
  await fs.writeFile(APP_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

export function defaultConfig(): AppConfig {
  return { ...DEFAULT };
}

export function invalidateConfigCache() {
  cached = null;
}
