import fs from "node:fs/promises";
import path from "node:path";
import { AGENTS_GLOBAL } from "../paths";
import { hashId, isDir, preview, readFrontmatter, safeStat } from "../util";
import type { AgentItem } from "../types";

async function scanAgentsDir(
  dir: string,
  scope: "global" | "project",
  projectRoot?: string,
): Promise<AgentItem[]> {
  if (!(await isDir(dir))) return [];
  const out: AgentItem[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(dir, name);
    const fm = await readFrontmatter(file);
    if (!fm) continue;
    const stat = await safeStat(file);
    out.push({
      id: hashId("agent", file),
      kind: "agent",
      scope,
      name: (fm.data.name as string) || name.replace(/\.md$/, ""),
      path: file,
      description: fm.data.description as string | undefined,
      modifiedAt: stat?.mtime.toISOString(),
      size: stat?.size,
      projectRoot,
      meta: {
        model: fm.data.model as string | undefined,
        tools: Array.isArray(fm.data.tools) ? (fm.data.tools as string[]) : undefined,
        bodyPreview: preview(fm.body),
      },
    });
  }
  return out;
}

export async function scanGlobalAgents(): Promise<AgentItem[]> {
  return scanAgentsDir(AGENTS_GLOBAL, "global");
}

export async function scanProjectAgents(projectRoot: string): Promise<AgentItem[]> {
  return scanAgentsDir(
    path.join(projectRoot, ".claude", "agents"),
    "project",
    projectRoot,
  );
}
