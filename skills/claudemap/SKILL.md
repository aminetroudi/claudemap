---
name: claudemap
description: Open the claudemap local dashboard — a browser-based inspector for your Claude Code setup (skills, agents, plugins, MCP servers, memory, marketplaces, projects). Use when the user asks to open claudemap, inspect their Claude setup, audit installed skills/agents/plugins, review MCP config, or find loose markdown files. Also use when the user says "/claudemap", "show my skills", "where are my plugins", or wants a visual overview of ~/.claude.
---

# claudemap

Local web dashboard at `http://127.0.0.1:3737` (override via `CLAUDEMAP_PORT`).

The SessionStart hook auto-boots the server in the background. This skill's job is to surface the URL to the user and verify it is reachable.

## What it shows

- **Overview** — stat grid + recent changes across your whole Claude setup
- **Skills / Agents / Plugins** — scope (global vs project), edit frontmatter, promote/demote
- **Memory** — files indexed via `MEMORY.md`
- **CLAUDE.md** — every `CLAUDE.md` under scanned paths
- **Loose `.md`** — stray Markdown that may belong as a skill/agent/memory
- **MCP Servers** — local + cloud, add/edit/delete
- **Marketplace** — browse and install plugins
- **⌘K palette** — quick nav and item search

## How to respond

1. Run a quick reachability check:
   ```bash
   curl -sf http://127.0.0.1:${CLAUDEMAP_PORT:-3737}/ >/dev/null && echo up || echo down
   ```
2. If **up**: tell the user the URL and (optionally) which section fits their question.
3. If **down**: check `~/.claudemap/server.log`, then guide them:
   - First time? `cd` into the claudemap project and run `bun install && bun run build`. Restart the session so SessionStart reboots the server.
   - Built already? Start manually: `bun run start -- -p 3737`.

Do **not** re-implement the dashboard in chat. Point the user to the URL.

## When NOT to use

- The user wants to edit a specific file they already know the path of — just edit it.
- The user asks about claude-mem (persistent memory) — different plugin.
