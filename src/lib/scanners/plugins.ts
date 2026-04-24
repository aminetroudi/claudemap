import fs from "node:fs/promises";
import path from "node:path";
import {
  PLUGINS_INSTALLED,
  MARKETPLACES_DIR,
  SETTINGS_GLOBAL,
} from "../paths";
import { hashId, isDir, safeStat } from "../util";
import type { PluginItem } from "../types";

interface InstalledRecord {
  scope: "user" | "project";
  projectPath?: string;
  installPath: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
}

interface InstalledFile {
  version: number;
  plugins: Record<string, InstalledRecord[]>;
}

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
}

export async function scanPlugins(): Promise<PluginItem[]> {
  let installed: InstalledFile | null = null;
  let settings: SettingsFile = {};
  try {
    installed = JSON.parse(await fs.readFile(PLUGINS_INSTALLED, "utf8"));
  } catch {
    return [];
  }
  try {
    settings = JSON.parse(await fs.readFile(SETTINGS_GLOBAL, "utf8"));
  } catch {}

  const enabled = settings.enabledPlugins ?? {};
  const out: PluginItem[] = [];

  for (const [fullName, records] of Object.entries(installed?.plugins ?? {})) {
    for (const rec of records) {
      const dir = rec.installPath;
      let pluginJson: Record<string, unknown> = {};
      try {
        pluginJson = JSON.parse(
          await fs.readFile(path.join(dir, ".claude-plugin", "plugin.json"), "utf8"),
        );
      } catch {}
      const skills = await listDirNames(path.join(dir, "skills"));
      const agents = await listDirNames(path.join(dir, "agents"));
      const commands = await listFileNames(path.join(dir, "commands"), ".md");
      const stat = await safeStat(dir);
      out.push({
        id: hashId("plugin", fullName, dir),
        kind: "plugin",
        scope: rec.scope === "user" ? "global" : "project",
        name: (pluginJson.name as string) || fullName.split("@")[0],
        path: dir,
        description: pluginJson.description as string | undefined,
        modifiedAt: stat?.mtime.toISOString(),
        projectRoot: rec.projectPath,
        meta: {
          fullName,
          marketplace: fullName.split("@")[1] ?? "",
          version: rec.version,
          installedAt: rec.installedAt,
          enabled: enabled[fullName] === true,
          skills,
          agents,
          commands,
        },
      });
    }
  }
  return out;
}

async function listDirNames(dir: string): Promise<string[]> {
  if (!(await isDir(dir))) return [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listFileNames(dir: string, ext: string): Promise<string[]> {
  if (!(await isDir(dir))) return [];
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith(ext)).map((e) => e.replace(ext, ""));
  } catch {
    return [];
  }
}

export async function scanMarketplaces(): Promise<
  Array<{
    name: string;
    path: string;
    description?: string;
    plugins: Array<{ name: string; description?: string; category?: string; source?: string }>;
  }>
> {
  if (!(await isDir(MARKETPLACES_DIR))) return [];
  const out = [];
  const mps = await fs.readdir(MARKETPLACES_DIR);
  for (const mp of mps) {
    const mpDir = path.join(MARKETPLACES_DIR, mp);
    if (!(await isDir(mpDir))) continue;
    // Look for marketplace.json in .claude-plugin/
    const candidates = [
      path.join(mpDir, ".claude-plugin", "marketplace.json"),
      path.join(mpDir, "marketplace.json"),
    ];
    let data: Record<string, unknown> | null = null;
    for (const c of candidates) {
      try {
        data = JSON.parse(await fs.readFile(c, "utf8"));
        break;
      } catch {}
    }
    if (!data) continue;
    out.push({
      name: (data.name as string) || mp,
      path: mpDir,
      description: data.description as string | undefined,
      plugins: ((data.plugins as Array<Record<string, unknown>>) || []).map(
        (p) => ({
          name: p.name as string,
          description: p.description as string | undefined,
          category: p.category as string | undefined,
          source: p.source as string | undefined,
        }),
      ),
    });
  }
  return out;
}
