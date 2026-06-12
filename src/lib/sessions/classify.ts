// Heuristic: was this session deliberately started by the user, or spawned by
// a plugin / skill / hook (e.g. claude-mem's observer-sessions)?
//
// Automated sessions run with a cwd inside a hidden directory at $HOME root
// (~/.claude-mem/observer-sessions, ~/.claude/..., plugin caches) — places a
// person doesn't open an editor in. Real work lives under ~/Projects, ~/workspace,
// ~/work, etc. We classify by path; the UI hides these by default but offers
// a toggle, so a false positive only means one extra click. Server-side only.

import { HOME, isUnder } from "../paths";

/**
 * True when a session's working directory falls under one of the app's
 * configured excludePaths (the same list that scopes file scanning). These are
 * hard-excluded from the Sessions views — not merely hidden behind a toggle.
 */
export function isExcludedCwd(cwd: string | undefined, excludePaths: string[]): boolean {
  if (!cwd) return false;
  return excludePaths.some((ex) => ex && (cwd === ex || isUnder(cwd, ex)));
}

/** True when the session looks plugin/skill/automation-spawned, not user-initiated. */
export function isAutomatedSession(opts: { cwd?: string; project?: string }): boolean {
  const cwd = opts.cwd ?? "";
  // cwd directly inside a dotfile dir at $HOME (~/.claude-mem, ~/.claude, …)
  if (cwd.startsWith(`${HOME}/.`)) return true;
  // any .claude / .claude-mem segment anywhere in the path
  if (/\/\.claude(-mem)?(\/|$)/.test(cwd)) return true;
  // fall back to the decoded project name when no cwd is known
  const project = opts.project ?? "";
  if (project.startsWith(".")) return true;
  return false;
}
