import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { hashId, preview, safeStat } from "../util";
import type { ClaudeMdItem, LooseMdItem } from "../types";
import type { AppConfig } from "../types";

const HEAVY_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/target/**",
  "**/vendor/**",
  "**/.pnpm-store/**",
  "**/coverage/**",
];

/**
 * Find CLAUDE.md files (any case) anywhere under the configured scan paths.
 */
export async function scanClaudeMd(cfg: AppConfig): Promise<ClaudeMdItem[]> {
  const out: ClaudeMdItem[] = [];
  for (const root of cfg.scanPaths) {
    const matches = await fg(["**/CLAUDE.md", "**/claude.md"], {
      cwd: root,
      absolute: true,
      caseSensitiveMatch: false,
      suppressErrors: true,
      deep: cfg.looseMdMaxDepth,
      ignore: [...HEAVY_IGNORES, ...cfg.excludePaths.map((p) => `${p}/**`)],
    });
    for (const m of matches) {
      if (cfg.excludePaths.some((ex) => m.startsWith(ex + "/"))) continue;
      const stat = await safeStat(m);
      if (!stat) continue;
      out.push({
        id: hashId("claude-md", m),
        kind: "claude-md",
        scope: "project",
        name: path.basename(path.dirname(m)) + "/CLAUDE.md",
        path: m,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size,
        projectRoot: path.dirname(m),
        meta: { bytes: stat.size },
      });
    }
  }
  return dedupeById(out);
}

/**
 * Find loose *.md files (excluding CLAUDE.md, README.md noise from libraries).
 * Restrictive: caps result count, lighter depth.
 */
export async function scanLooseMd(cfg: AppConfig): Promise<LooseMdItem[]> {
  const out: LooseMdItem[] = [];
  let collected = 0;
  for (const root of cfg.scanPaths) {
    if (collected >= cfg.looseMdMaxFiles) break;
    const matches = await fg(["**/*.md"], {
      cwd: root,
      absolute: true,
      caseSensitiveMatch: false,
      suppressErrors: true,
      deep: cfg.looseMdMaxDepth,
      ignore: [
        ...HEAVY_IGNORES,
        ...cfg.excludePaths.map((p) => `${p}/**`),
        "**/CLAUDE.md",
        "**/claude.md",
        "**/SKILL.md",
        "**/skill.md",
      ],
    });
    for (const m of matches) {
      if (cfg.excludePaths.some((ex) => m.startsWith(ex + "/"))) continue;
      if (collected >= cfg.looseMdMaxFiles) break;
      const stat = await safeStat(m);
      if (!stat) continue;
      let head = "";
      try {
        const fd = await fs.open(m, "r");
        const buf = Buffer.alloc(512);
        await fd.read(buf, 0, 512, 0);
        await fd.close();
        head = preview(buf.toString("utf8"), 160);
      } catch {}
      out.push({
        id: hashId("loose-md", m),
        kind: "loose-md",
        scope: "global",
        name: path.basename(m),
        path: m,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size,
        meta: { bytes: stat.size, headingPreview: head },
      });
      collected++;
    }
  }
  return dedupeById(out);
}

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}
