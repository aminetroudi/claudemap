import fs from "node:fs/promises";
import path from "node:path";
import { MEMORY_DIR, MEMORY_INDEX } from "../paths";
import { hashId, isDir, readFrontmatter, safeStat } from "../util";
import type { MemoryItem } from "../types";

export async function scanMemory(): Promise<MemoryItem[]> {
  if (!(await isDir(MEMORY_DIR))) return [];
  const out: MemoryItem[] = [];
  let indexed: Set<string> = new Set();
  try {
    const idx = await fs.readFile(MEMORY_INDEX, "utf8");
    const re = /\(([^)]+\.md)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(idx))) indexed.add(m[1]);
  } catch {}
  const entries = await fs.readdir(MEMORY_DIR);
  for (const name of entries) {
    if (!name.endsWith(".md") || name === "MEMORY.md") continue;
    const file = path.join(MEMORY_DIR, name);
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
  const idxStat = await safeStat(MEMORY_INDEX);
  if (idxStat) {
    out.unshift({
      id: hashId("memory", MEMORY_INDEX),
      kind: "memory",
      scope: "global",
      name: "MEMORY.md (index)",
      path: MEMORY_INDEX,
      modifiedAt: idxStat.mtime.toISOString(),
      size: idxStat.size,
      meta: { memoryType: "index", indexed: true },
    });
  }
  return out;
}
