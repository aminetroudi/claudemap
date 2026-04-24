import fs from "node:fs/promises";
import path from "node:path";
import { memoryDir, memoryIndex } from "../paths";
import { hashId, isDir, readFrontmatter, safeStat } from "../util";
import type { MemoryItem } from "../types";

export async function scanMemory(): Promise<MemoryItem[]> {
  const memDir = memoryDir();
  const memIdx = memoryIndex();
  if (!(await isDir(memDir))) return [];
  const out: MemoryItem[] = [];
  let indexed: Set<string> = new Set();
  try {
    const idx = await fs.readFile(memIdx, "utf8");
    const re = /\(([^)]+\.md)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(idx))) indexed.add(m[1]);
  } catch {}
  const entries = await fs.readdir(memDir);
  for (const name of entries) {
    if (!name.endsWith(".md") || name === "MEMORY.md") continue;
    const file = path.join(memDir, name);
    const fm = await readFrontmatter(file);
    const stat = await safeStat(file);
    out.push({
      id: hashId("memory", file),
      kind: "memory",
      scope: "global",
      name: (fm?.data?.name as string) || name.replace(/\.md$/, ""),
      path: file,
      description: fm?.data?.description as string | undefined,
      modifiedAt: stat?.mtime.toISOString(),
      size: stat?.size,
      meta: {
        memoryType: fm?.data?.type as string | undefined,
        indexed: indexed.has(name),
      },
    });
  }
  // Index file itself
  const idxStat = await safeStat(memIdx);
  if (idxStat) {
    out.unshift({
      id: hashId("memory", memIdx),
      kind: "memory",
      scope: "global",
      name: "MEMORY.md (index)",
      path: memIdx,
      modifiedAt: idxStat.mtime.toISOString(),
      size: idxStat.size,
      meta: { memoryType: "index", indexed: true },
    });
  }
  return out;
}
