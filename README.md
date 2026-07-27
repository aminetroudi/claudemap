# claudemap

A **local web dashboard** for your whole `~/.claude/` — skills, agents, plugins, MCP servers, memory, marketplaces, project-scoped config, and **live Claude Code sessions**.

It runs a Next.js app on `http://127.0.0.1:3737`. Browse, toggle, edit, promote/demote, install, uninstall, watch running sessions — without hunting through scattered JSON and Markdown.

![Overview](./public/screenshots/overview.png)

> Not a Claude Code plugin. It's a plain local server you start yourself and leave running — a host-introspection tool that needs real filesystem, process, and (for the Sessions terminal buttons) GUI access, none of which fit the plugin/container model.

---

## Quick start

```bash
git clone https://github.com/aminetroudi/claudemap
cd claudemap
bun install
./claudemap.sh start      # builds on first run, then serves detached on :3737
```

Open `http://127.0.0.1:3737`. The server is **detached** — it keeps running after you close the terminal that launched it.

For development with hot reload:

```bash
bun run dev               # :3000, hot reload
```

---

## Running & stopping

`claudemap.sh` manages a detached production server (bound to `127.0.0.1` only):

```bash
./claudemap.sh start      # build if needed, start detached
./claudemap.sh stop
./claudemap.sh restart
./claudemap.sh status
./claudemap.sh logs       # tail ~/.claudemap.log
```

Override the port: `PORT=4000 ./claudemap.sh start`.

It survives the shell that launched it, but **not a reboot**. To start it at login, add a cron line:

```cron
@reboot cd $HOME/workspace/claudemap && ./claudemap.sh start
```

Your data (skills, plugins, settings, sessions) is read live from `~/.claude/` via `$HOME` — nothing is copied or cached elsewhere.

---

## What it shows

| Section       | What you see                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| Overview      | Stat grid + recent changes across your whole Claude setup                    |
| **Sessions**  | **Live Claude Code sessions, history, and usage** (see below)                |
| Skills        | All skills (global + project), view/edit `SKILL.md`, promote/demote          |
| Plugins       | Installed plugins, enable/disable, uninstall                                 |
| Agents        | Agent definitions, scope (global vs project), edit frontmatter               |
| Memory        | Memory files indexed via `MEMORY.md`, view/edit                              |
| CLAUDE.md     | All `CLAUDE.md` files found under scanned paths                              |
| Loose `.md`   | Stray Markdown that might belong as a skill/agent/memory                     |
| Projects      | Projects discovered in `~/.claude/projects/`                                 |
| MCP Servers   | Local (`~/.claude.json`, `~/.mcp.json`, per-project) + cloud MCP — add/edit/delete |
| Marketplace   | Browse and install plugins from configured marketplaces                      |
| Settings      | Scan paths, depth, and ignore rules                                          |

Plus a `⌘K` command palette for quick navigation and item search.

---

## Sessions

A live monitor for your Claude Code sessions, parsed from `~/.claude/projects/*/*.jsonl` and the `claude agents` process list. Three tabs:

- **Live** — currently-active sessions (working / needs input / waiting), updated every ~2 s over SSE. Per row: status, project, **context-window bar** (with `(1M)` for extended-window models), origin (terminal/IDE — incl. **Tilix**, which upstream tooling misses), git branch, last activity, and the current task. Inactive sessions drop to History.
- **History** — past sessions within a day window, grouped Today / Yesterday / date, filterable by project or first prompt.
- **Usage** — local token usage over a rolling 5-hour window per session, plus your **API quota** (5-hour / 7-day utilization bars with reset countdowns) and Claude service status.

Click any row for a **detail drawer**: token/turn/tool metrics and a paginated, filterable message timeline.

**Actions** (per row):

- **Attach** — for background agents: opens a terminal running `claude attach <id>` (detach with `Ctrl+Z`, the agent keeps running).
- **Terminal here** — for running interactive sessions: opens a new shell in the session's directory.
- **Resume** — for past sessions: opens `claude --resume <uuid>`.
- **Kill ghosts** — SIGTERM processes that are alive but idle > 1 h (re-verified against `ps comm` to avoid PID reuse).

**Noise control:**

- Plugin/skill/hook-spawned sessions (e.g. claude-mem observers) are **hidden by default** — toggle "Show plugin sessions".
- Sessions whose working directory is under a configured **excludePath** (Settings) are filtered out entirely.

---

## Configuration

| Env var  | Default | What it does                       |
| -------- | ------- | ---------------------------------- |
| `PORT`   | `3737`  | Port the dashboard listens on      |

`claudemap.sh` logs to `~/.claudemap.log`. The dashboard's own config (scan paths, excludePaths) lives at `~/.claude/claude-dashboard.config.json` and is editable from the Settings tab.

Two config keys are not surfaced in Settings:

| Key                | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `terminalEmulator` | Emulator binary to prefer over `gnome-terminal` / `tilix` / `x-terminal-emulator`                                 |
| `display`          | X display (e.g. `":0"`) for spawned terminals, when the server inherited none — see the `@reboot` cron note below |

---

## Platform support

**Linux, and WSL2 with WSLg. Native Windows and macOS are not supported.**

This is a host-introspection tool. It reads `/proc/<pid>/{cwd,environ,status,comm,exe}` for live session discovery and origin detection, shells out to `ps`, and spawns an X/Wayland terminal emulator. Those are Linux interfaces, and the Sessions view — the reason the tool exists — is built directly on them.

### WSL2

Works unmodified, provided **Claude Code also runs inside WSL**. Same kernel, same `/proc`, `claude` is a native Linux binary, and `~/.claude` is the WSL home. Two things to know:

- **Reaching the UI from Windows.** The server binds `127.0.0.1` only, and WSL2's legacy NAT-mode localhost forwarding is unreliable for loopback-only binds. Enable mirrored networking in `%UserProfile%\.wslconfig` (WSL 2.0+, Windows 11):

  ```ini
  [wsl2]
  networkingMode=mirrored
  ```

  Then `http://localhost:3737` works from a Windows browser. **Do not** work around this by binding `0.0.0.0` — the dashboard has no auth (see [Security](#security)).

- **Terminal buttons.** WSLg supplies `DISPLAY`/`WAYLAND_DISPLAY` and renders Linux windows on the Windows desktop, but no default WSL distro ships a terminal emulator — `apt install gnome-terminal`. `wt.exe` is deliberately not driven through the WSL interop layer: its command line is reassembled under Windows quoting rules and `wt.exe` splits on `;`, which the `<cmd>; exec bash` payload contains, so supporting it would mean building a shell string and giving up the argv-only guarantee in [Security](#security).

If Claude Code runs on **native Windows** while claudemap runs in WSL, it will not work and cannot be configured to: `~/.claude` resolves to the WSL home (`src/lib/paths.ts` derives every path from `os.homedir()` with no override), and WSL's `/proc` cannot see Windows processes.

### `@reboot` cron / systemd

A server started outside a graphical shell inherits no `DISPLAY`, which used to fail the terminal buttons closed. It now falls back to `display` from the config file, then to WSLg's defaults when `/mnt/wslg/.X11-unix` exists. On a plain Linux box started from cron, set `display` explicitly.

### macOS

Not supported today, but the gap is small and PRs are welcome — macOS is POSIX, so `ps`, the launcher script, `claude` on `PATH`, project-key encoding, and the Memory view all work as-is. What needs a platform shim is process `cwd` (`lsof -p <pid> -a -d cwd`), process environ (`ps eww -p <pid>`, own uid only), and terminal spawning (`open -a` / `osascript`). That reaches near-parity with Linux, unlike Windows, where per-process cwd and environ are simply not exposed.

### iOS

Not applicable, and not a roadmap item. claudemap introspects the machine Claude Code runs on: it needs unrestricted filesystem access to `~/.claude`, the process table, and the ability to spawn terminals. iOS grants an app none of those, and Claude Code does not run there. The remote-viewer idea it suggests — a phone watching sessions on your workstation — would be a different product with a different security model, since it requires exposing the dashboard off-host, which this one is explicitly built not to do.

---

## Security

This is a **local power-user tool**, not a hosted service. It reads and writes files under `~/.claude/`, spawns terminals, and can signal processes.

- The server binds to **`127.0.0.1` only** (`claudemap.sh`). It has no auth — **never expose the port**.
- Mutating API routes enforce a **same-origin check** (`src/middleware.ts`): a malicious page can't silently POST/PUT/DELETE to the local API.
- The session **timeline/metrics** endpoints resolve symlinks and require the target under `~/.claude/projects/` ending in `.jsonl` — no arbitrary file read.
- Terminal spawning uses **argv arrays only** with strict regex-validated tokens (attach id, session UUID) and a cwd that must resolve under `$HOME` — no shell-string interpolation.
- Ghost kill is **SIGTERM only**, after re-verifying the PID still maps to a `claude` process.
- Your **OAuth token** (read for the quota view) never leaves the server — responses carry utilization percentages only, never the token.
- Trash actions move files to a reversible trash, but back up `~/.claude/` before bulk operations.

> Run it where you develop, not on a shared machine, jumphost, or production server.

---

## Demo mode (for screenshots / evaluation)

The repo ships a curated fixture `$HOME` at `fixtures/demo-home/` — fake skills, agents, plugins, MCP servers, memory entries. Boot a separate dashboard against it without touching your real `~/.claude/`:

```bash
bun install && bun run build       # one-time
node scripts/demo-run.mjs          # http://127.0.0.1:3738
```

- Demo `$HOME` is assembled at `/tmp/claudemap-demo/` — override with `CLAUDEMAP_DEMO_HOME`.
- Reseed (after editing via the UI) with `CLAUDEMAP_DEMO_RESEED=1 node scripts/demo-run.mjs`.
- Stop with Ctrl+C. Nothing persists outside `/tmp/claudemap-demo/`.

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
claudemap.sh              # detached local runner (start/stop/restart/status/logs)
scripts/
  demo-run.mjs            # boot the dashboard against the demo fixture
  gen-icons.mjs           # PWA icon generation
src/
  app/
    api/                  # REST handlers (items, mcp, file, actions, config,
                          #   projects, marketplaces, search, sessions/*)
    layout.tsx            # root layout, next/font, metadata
    page.tsx              # single-page shell
  components/             # Sidebar, Viewer, panels, CommandPalette, …
    sessions/             # SessionsPanel deps: HistoryView, SessionDrawer,
                          #   UsageView, format helpers
  lib/
    paths.ts              # derives all ~/.claude file locations from $HOME
    config.ts             # dashboard's own config (scan paths, excludePaths)
    actions.ts            # trash/promote/demote/install/uninstall/read/write
    client.ts             # typed fetch wrappers for /api/*
    scanners/             # per-kind scanners (skills, agents, plugins, mcp, …)
    sessions/             # session monitor: discover, jsonl, status, context,
                          #   origin, history, timeline, usage, quota, ghosts,
                          #   terminal, classify, pathguard, hub
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
| `~/.claude/projects/<key>/*.jsonl`            | Session logs (Sessions monitor)              |
| `~/.claude/.credentials.json`                 | OAuth token (read server-side for quota; never returned) |
| `~/.claude/claude-dashboard.config.json`      | This app's own config (scan paths, excludes) |
| `~/.claude.json`                              | Claude's main config (includes `mcpServers`) |
| `~/.mcp.json`                                 | Host-level MCP servers                       |

---

## Scripts

```bash
bun run dev     # dev server (hot reload) on :3000
bun run build   # production build
bun run start   # serve production build (use ./claudemap.sh for detached + localhost bind)
```

---

## Conventions

See `AGENTS.md`. This repo targets **Next.js 16** with breaking changes vs. older versions. If something feels off while contributing, consult `node_modules/next/dist/docs/` before assuming your memory of Next is correct.

---

## License

[MIT](./LICENSE) © Mohamed Amine Troudi
