import fs from "node:fs/promises";
import path from "node:path";
import { SKILLS_GLOBAL, PLUGINS_CACHE } from "../paths";
import { hashId, isDir, preview, readFrontmatter, safeStat } from "../util";
import type { SkillItem } from "../types";

async function scanSkillsDir(
  dir: string,
  scope: "global" | "project",
  projectRoot?: string,
  pluginName?: string,
): Promise<SkillItem[]> {
  if (!(await isDir(dir))) return [];
  const out: SkillItem[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const skillDir = path.join(dir, name);
    if (!(await isDir(skillDir))) continue;
    const skillFile = path.join(skillDir, "SKILL.md");
    const fm = await readFrontmatter(skillFile);
    if (!fm) continue;
    const stat = await safeStat(skillFile);
    out.push({
      id: hashId("skill", skillDir),
      kind: "skill",
      scope,
      name: (fm.data.name as string) || name,
      path: skillDir,
      description: fm.data.description as string | undefined,
      modifiedAt: stat?.mtime.toISOString(),
      size: stat?.size,
      projectRoot,
      meta: {
        skillName: (fm.data.name as string) || name,
        triggers: undefined,
        bodyPreview: preview(fm.body),
        pluginOwned: !!pluginName,
        pluginName,
      },
    });
  }
  return out;
}

export async function scanGlobalSkills(): Promise<SkillItem[]> {
  return scanSkillsDir(SKILLS_GLOBAL, "global");
}

export async function scanProjectSkills(projectRoot: string): Promise<SkillItem[]> {
  return scanSkillsDir(path.join(projectRoot, ".claude", "skills"), "project", projectRoot);
}

export async function scanPluginSkills(): Promise<SkillItem[]> {
  // Walk plugins cache for any plugin's bundled skills
  if (!(await isDir(PLUGINS_CACHE))) return [];
  const out: SkillItem[] = [];
  // Layout: cache/<marketplace>/<plugin>/<version>/skills/*
  let mps: string[] = [];
  try {
    mps = await fs.readdir(PLUGINS_CACHE);
  } catch {
    return [];
  }
  for (const mp of mps) {
    const mpDir = path.join(PLUGINS_CACHE, mp);
    if (!(await isDir(mpDir))) continue;
    const plugins = await fs.readdir(mpDir).catch(() => []);
    for (const pl of plugins) {
      const plDir = path.join(mpDir, pl);
      if (!(await isDir(plDir))) continue;
      const versions = await fs.readdir(plDir).catch(() => []);
      for (const v of versions) {
        const skillsRoot = path.join(plDir, v, "skills");
        const items = await scanSkillsDir(
          skillsRoot,
          "global",
          undefined,
          `${pl}@${mp}`,
        );
        // Tag plugin name on each
        for (const it of items) {
          it.meta.pluginName = `${pl}@${mp}`;
          it.meta.pluginOwned = true;
        }
        out.push(...items);
      }
    }
  }
  return out;
}
