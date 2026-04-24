import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { CLAUDE_DIR, HOME, PROJECTS_DIR } from "../paths";
import { isDir } from "../util";

/**
 * Discover project roots that Claude Code has interacted with.
 * Sources:
 *   1. ~/.claude/projects/<key> directories — derive path from key.
 *   2. Any directory in the user's scanPaths that contains a .claude/ folder.
 */
export async function discoverProjects(
  extraScanRoots: string[],
  excludeProjects: string[] = [],
  excludePaths: string[] = [],
): Promise<string[]> {
  const set = new Set<string>();

  // From Claude's own projects index
  if (await isDir(PROJECTS_DIR)) {
    const keys = await fs.readdir(PROJECTS_DIR).catch(() => []);
    for (const k of keys) {
      const guess = "/" + k.replace(/^-/, "").replace(/-/g, "/");
      // Skip $HOME itself and ~/.claude — these are the global scope, not projects
      if (guess === HOME || guess === CLAUDE_DIR) continue;
      if (await isDir(guess)) set.add(guess);
    }
  }

  // Walk scan roots looking for .claude folders (limited depth)
  for (const root of extraScanRoots) {
    if (!(await isDir(root))) continue;
    try {
      const matches = await fg("**/.claude", {
        cwd: root,
        absolute: true,
        onlyDirectories: true,
        deep: 5,
        suppressErrors: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.next/**",
          "**/.cache/**",
        ],
      });
      for (const m of matches) {
        const projectRoot = path.dirname(m);
        // Skip the global ~/.claude itself (its parent is $HOME — not a project)
        if (projectRoot === HOME) continue;
        set.add(projectRoot);
      }
    } catch {}
  }

  for (const ex of excludeProjects) set.delete(ex);
  // Also drop any project rooted inside an excluded path
  for (const proj of [...set]) {
    if (excludePaths.some((ex) => proj === ex || proj.startsWith(ex + "/"))) {
      set.delete(proj);
    }
  }
  return [...set].sort();
}
