import { loadConfig } from "../config";
import { scanGlobalAgents, scanProjectAgents } from "./agents";
import { scanClaudeMd, scanLooseMd } from "./markdown";
import { scanMemory } from "./memory";
import { scanPlugins } from "./plugins";
import { discoverProjects } from "./projects";
import {
  scanGlobalSkills,
  scanPluginSkills,
  scanProjectSkills,
} from "./skills";
import type { AnyItem, ScanResult } from "../types";

export async function scanAll(): Promise<ScanResult> {
  const cfg = await loadConfig();
  const errors: string[] = [];
  const items: AnyItem[] = [];

  const safe = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return null;
    }
  };

  const [
    globalSkills,
    pluginSkills,
    globalAgents,
    plugins,
    memory,
    claudeMd,
    looseMd,
    projects,
  ] = await Promise.all([
    safe("globalSkills", scanGlobalSkills()),
    safe("pluginSkills", scanPluginSkills()),
    safe("globalAgents", scanGlobalAgents()),
    safe("plugins", scanPlugins()),
    safe("memory", scanMemory()),
    safe("claudeMd", scanClaudeMd(cfg)),
    safe("looseMd", scanLooseMd(cfg)),
    safe("projects", discoverProjects(cfg.scanPaths, cfg.excludeProjects, cfg.excludePaths)),
  ]);

  if (globalSkills) items.push(...globalSkills);
  if (pluginSkills) items.push(...pluginSkills);
  if (globalAgents) items.push(...globalAgents);
  if (plugins) items.push(...plugins);
  if (memory) items.push(...memory);
  if (claudeMd) items.push(...claudeMd);
  if (looseMd) items.push(...looseMd);

  // Per-project scans
  if (projects) {
    const perProj = await Promise.all(
      projects.map(async (proj) => {
        const [s, a] = await Promise.all([
          scanProjectSkills(proj).catch(() => []),
          scanProjectAgents(proj).catch(() => []),
        ]);
        return [...s, ...a];
      }),
    );
    for (const arr of perProj) items.push(...arr);
  }

  // Single chokepoint: drop any item whose path or projectRoot falls under an
  // excluded path/project. All UI consumers derive project lists from items[],
  // so filtering here keeps Projects/Overview/MCP panels consistent with
  // discoverProjects().
  const excludedRoots = [
    ...(cfg.excludeProjects ?? []),
    ...(cfg.excludePaths ?? []),
  ];
  const isExcluded = (p?: string) =>
    !!p && excludedRoots.some((ex) => p === ex || p.startsWith(ex + "/"));
  const filtered = items.filter(
    (it) => !isExcluded(it.path) && !isExcluded(it.projectRoot),
  );

  // Deduplicate by id (same path can be discovered via multiple scan sources)
  const seen = new Set<string>();
  const unique = filtered.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  return {
    items: unique,
    scannedAt: new Date().toISOString(),
    errors,
  };
}

export async function listProjects(): Promise<string[]> {
  const cfg = await loadConfig();
  return discoverProjects(cfg.scanPaths, cfg.excludeProjects, cfg.excludePaths);
}
