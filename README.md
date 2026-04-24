# claudemap

**A Claude Code plugin** that boots a local web dashboard for your whole `~/.claude/` — skills, agents, plugins, MCP servers, memory, marketplaces, and project-scoped config.

The plugin runs a Next.js app in the background. Open `http://127.0.0.1:3737` in your browser; browse, toggle, edit, promote/demote, install, uninstall — without hunting through scattered JSON and Markdown files.

> ![screenshot placeholder — overview page]()
> *screenshot placeholder*

---

## Install

### As a Claude Code plugin (recommended)

```text
/plugin marketplace add protoxy/claudemap
/plugin install claudemap@claudemap
```

On first install, the `Setup` hook runs `bun install` + `bun run build` inside the plugin's cache dir (one-time, ~1–2 min). Subsequent sessions just boot the server. Open `http://127.0.0.1:3737`.

In any Claude Code session, `/claudemap` verifies the server is up and surfaces the URL.

### From source (dev)

```bash
git clone https://github.com/protoxy/claudemap
cd claudemap
bun install
bun run dev       # hot-reload dev server on :3000
# or
bun run build && bun run start    # prod server on :3000
```

---

## Requirements

- **[bun](https://bun.sh)** ≥ 1.1 (or `pnpm` / `npm` — auto-detected by `scripts/smart-install.mjs`)
- **Claude Code** installed locally (`~/.claude/` must exist)
- Linux, macOS, or WSL2 on Windows (native Windows shells are not supported)

---

## What it shows

| Section       | What you see                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| Overview      | Stat grid + recent changes across your whole Claude setup                    |
| Skills        | All skills (global + project), view/edit `SKILL.md`, promote/demote          |
| Plugins       | Installed plugins, enable/disable, uninstall                                 |
| Agents        | Agent definitions, scope (global vs project), edit frontmatter               |
| Memory        | Memory files indexed via `MEMORY.md`, view/edit                              |
| CLAUDE.md     | All `CLAUDE.md` files found under scanned paths                              |
| Loose `.md`   | Stray Markdown files that might belong as a skill/agent/memory               |
| Projects      | Projects discovered in `~/.claude/projects/`                                 |
| MCP Servers   | Local (`~/.claude.json`, `~/.mcp.json`, per-project) + cloud MCP — add/edit/delete |
| Marketplace   | Browse and install plugins from configured marketplaces                      |
| Settings      | Scan paths, depth, and ignore rules                                          |

Plus a `⌘K` command palette for quick navigation and item search.

---

## Configuration

| Env var            | Default     | What it does                                      |
| ------------------ | ----------- | ------------------------------------------------- |
| `CLAUDEMAP_HOST`   | `127.0.0.1` | Host the Next.js server binds to                  |
| `CLAUDEMAP_PORT`   | `3737`      | Port the dashboard listens on                     |

State is written to `~/.claudemap/`:

| File                    | Purpose                         |
| ----------------------- | ------------------------------- |
| `~/.claudemap/server.pid` | Detached server PID (written on boot) |
| `~/.claudemap/server.log` | Server + `smart-install` logs   |

---

## Troubleshooting

**Dashboard not reachable**
```bash
tail -n 50 ~/.claudemap/server.log
curl -sf http://127.0.0.1:3737/ -o /dev/null -w "HTTP %{http_code}\n"
```

**Force a clean rebuild**
```bash
_R=$(ls -dt ~/.claude/plugins/cache/*/claudemap/[0-9]*/ | head -1)
rm -rf "$_R/.next" "$_R/node_modules"
node "$_R/scripts/smart-install.mjs"
```

**Kill the detached server**
```bash
kill "$(cat ~/.claudemap/server.pid)" 2>/dev/null
```

**Uninstall**
```text
/plugin uninstall claudemap@claudemap
```
Then optionally `rm -rf ~/.claudemap`.

---

## Security

This is a **local power-user tool**, not a hosted service. It reads and writes files under `~/.claude/` and any directories you scan.

- Server binds to `127.0.0.1` by default. **Do not expose the port** — there is no auth.
- The Docker compose setup mounts your entire host `$HOME` into the container and binds the dev server to `0.0.0.0`. On an untrusted network, close the port at the firewall or edit `Dockerfile.dev` to bind `-H 127.0.0.1`.
- API routes enforce a **same-origin check** on mutating requests (`src/middleware.ts`). A malicious page cannot silently POST/PUT/DELETE to the local API. This mitigates simple CSRF but is not a substitute for auth.
- Trash actions move files to the OS trash (reversible), but back up `~/.claude/` before bulk operations.

> **Do not run this on a shared machine, jumphost, or production server.** Run it where you develop, stop it when you're done.

---

## Screenshots

> ![screenshot placeholder — skills list]()
> *screenshot placeholder*

> ![screenshot placeholder — MCP panel]()
> *screenshot placeholder*

> ![screenshot placeholder — marketplace]()
> *screenshot placeholder*

---

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind v4 + custom CSS design tokens
- `lucide-react` icons, `framer-motion` animations, `cmdk` command palette
- `zod` for config validation, `gray-matter` for frontmatter, `fast-glob` for scanning
- bun for runtime, package manager, and lockfile

---

## Project layout

```
.claude-plugin/
  plugin.json             # plugin manifest
  marketplace.json        # single-plugin marketplace so the repo can be added directly
hooks/
  hooks.json              # Setup (build) + SessionStart (boot) hooks
skills/
  claudemap/SKILL.md      # /claudemap — surface URL, verify reachability
scripts/
  smart-install.mjs       # install deps + build on first run (idempotent)
  boot-server.mjs         # spawn `next start` detached, health-check, write pid
  gen-icons.mjs           # PWA icon generation
src/
  app/
    api/                  # REST handlers (items, mcp, file, actions, config, projects, marketplaces, search)
    layout.tsx            # root layout, next/font, metadata
    page.tsx              # single-page shell
  components/             # Sidebar, Viewer, ItemRow, OverviewPanel, McpPanel, MarketplacePanel, SettingsPanel, ProjectsPanel, CommandPalette, Skeleton, LocalEnvIndicator
  lib/
    paths.ts              # derives all ~/.claude file locations from $HOME
    config.ts             # dashboard's own config file (~/.claude/claude-dashboard.config.json)
    actions.ts            # trash/promote/demote/install/uninstall/toggle/read/write
    client.ts             # typed fetch wrappers for /api/*
    scanners/             # per-kind scanners (skills, agents, plugins, mcp, projects, memory, markdown)
    types.ts, util.ts, theme.ts
  middleware.ts           # same-origin CSRF hardening
public/
  icon-192.png, icon-512.png, manifest.json
```

---

## Paths the app touches

All derived from `$HOME` in `src/lib/paths.ts`:

| Path                                          | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `~/.claude/`                                  | Skills, agents, plugins, marketplaces, settings, projects |
| `~/.claude/projects/<key>/memory/MEMORY.md`   | Memory index for your home project           |
| `~/.claude/claude-dashboard.config.json`      | This app's own config (scan paths, excludes) |
| `~/.claude.json`                              | Claude's main config (includes `mcpServers`) |
| `~/.mcp.json`                                 | Host-level MCP servers                       |

---

## Scripts

```bash
bun run dev     # dev server (hot reload) on :3000
bun run build   # production build
bun run start   # serve production build on :3000
```

The plugin itself uses `scripts/boot-server.mjs` which runs `next start` on `:3737` — this is independent of `bun run start`.

---

## Docker Compose (alternative to the plugin)

Runs the dev server in a container. Mounts your host `$HOME` into the container at the same absolute path so paths stored in `~/.claude/` resolve identically inside and out.

```bash
docker compose up
```

Open [http://localhost:3000](http://localhost:3000). Source is bind-mounted; `node_modules` and `.next` live in named volumes.

```bash
docker compose down      # stop
docker compose down -v   # stop + drop volumes
```

**Windows:** run from WSL2. `~/.claude` lives at `/home/<user>/.claude` inside WSL, and the bind mount needs a POSIX `$HOME`. Native PowerShell/cmd won't work.

---

## Conventions

See `AGENTS.md`. This repo targets **Next.js 16** with breaking changes vs. older versions. If you're contributing and something feels off, consult `node_modules/next/dist/docs/` before assuming your memory of Next is correct.

---

## Contributing

PRs welcome, especially for:
- Additional scanners (settings lint, hook inspector, model presets)
- Light-mode polish
- MCP server exposing scanner output to in-session Claude
- Proper auth layer for multi-user deployments

Issues are handled best-effort — this is a side project, not a product.

---

## License

[MIT](./LICENSE) © protoxy
