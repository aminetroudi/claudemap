// Log-file path guard — port of csm ValidateLogFilePath (timeline.go:53-84).
// SECURITY-CRITICAL: the timeline and metrics endpoints accept a caller-supplied
// `file`; without this guard either endpoint is an arbitrary-file-read primitive.
// We resolve symlinks on BOTH the requested path and the projects dir, then
// require the canonical path to live strictly under the canonical projects dir
// and end in ".jsonl". Resolving symlinks is what defeats `../` traversal and a
// symlink inside the projects dir pointing elsewhere. Server-side only.

import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR } from "../paths";

/** Validate and canonicalize a session log path; throws on any violation. */
export async function assertLogFilePath(filePath: string): Promise<string> {
  if (!filePath) throw new Error("file parameter is required");

  const abs = path.resolve(filePath);

  // EvalSymlinks-equivalent: realpath fails for nonexistent targets, which is
  // the behavior we want — you cannot peek at paths that do not resolve.
  let realPath: string;
  try {
    realPath = await fs.realpath(abs);
  } catch {
    throw new Error("invalid path");
  }

  let realProjects: string;
  try {
    realProjects = await fs.realpath(PROJECTS_DIR);
  } catch {
    throw new Error("cannot resolve projects directory");
  }

  if (!realPath.startsWith(realProjects + path.sep)) {
    throw new Error("path is not under Claude projects directory");
  }
  if (!realPath.endsWith(".jsonl")) {
    throw new Error("path must end with .jsonl");
  }

  return realPath;
}
