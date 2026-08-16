# claudemap

A **local web dashboard** for your whole `~/.claude/` — skills, agents, plugins, MCP servers, memory, marketplaces, project-scoped config, and **live Claude Code sessions**.

It runs a Next.js app on `http://127.0.0.1:3737`. Browse, toggle, edit, promote/demote, install, uninstall, watch running sessions — without hunting through scattered JSON and Markdown.

```bash
npx claudemap
```

<!-- Absolute URL, not a repo-relative path: npmjs.com does not resolve relative
     images when it renders this README on the package page. -->

![Overview](https://raw.githubusercontent.com/aminetroudi/claudemap/main/public/screenshots/overview.png)

> Not a Claude Code plugin. It's a plain local server you start yourself and leave running — a host-introspection tool that needs real filesystem, process, and (for the Sessions terminal buttons) GUI access, none of which fit the plugin/container model. Read [Threat model](#threat-model) before running it.

---

## Quick start

```bash
npx claudemap              # :3737, or the next free port
```

That's the whole install — the published package ships a prebuilt server, so there is no build step and no `node_modules` to install. Requires Node 20+. Then open `http://127.0.0.1:3737`.

`npx claudemap` runs in the foreground; Ctrl-C stops it. For a **detached** server that outlives the terminal that launched it, use the repo's `claudemap.sh` (below).

| Flag / env      | Effect                                                        |
| --------------- | ------------------------------------------------------------- |
| `--port <n>`    | Port to listen on (default `3737`; busy → next free port)     |
| `PORT=<n>`      | Same, via env                                                 |
| `--help`        | Usage                                                         |

The bind address is **not** configurable — see [Threat model](#threat-model).

### From a clone

```bash
git clone https://github.com/aminetroudi/claudemap
cd claudemap
bun install
./claudemap.sh start      # builds on first run, then serves detached on :3737
```

For development with hot reload:

```bash
bun run dev               # :3000, hot reload
```

To build the publishable bundle the way `npx` consumes it:

```bash
npm run build && npm run stage   # -> dist/server.js
node bin/claudemap.js
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
| Overview      | Stat grid, a file **tree** / **activity** heatmap toggle, and recent changes |
| **Sessions**  | **Live Claude Code sessions, history, prompt search, and usage** (see below) |
| **Jobs**      | **Background jobs: state, blocked reasons, results, timelines** (see below)  |
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

A live monitor for your Claude Code sessions, parsed from `~/.claude/projects/*/*.jsonl`, the `~/.claude/sessions/` registry the CLI itself writes, and the `claude agents` process list. Four tabs:

- **Live** — currently-active sessions (working / needs input / waiting), updated every ~2 s over SSE. Per row: status, project, **context-window bar** (with `(1M)` for extended-window models), origin (terminal/IDE — incl. **Tilix**, which upstream tooling misses), git branch, last activity, and the current task. Inactive sessions drop to History.
- **History** — past sessions within a day window, grouped Today / Yesterday / date, filterable by project or first prompt.
- **Prompts** — literal search across **every prompt you have ever submitted**, read from `~/.claude/history.jsonl`. Filter by project, jump straight to `claude --resume` for the session a prompt came from. No index to build: the CLI already records the prompt text, project, timestamp, and session id.
- **Usage** — local token usage over a rolling 5-hour window per session, plus your **API quota** (5-hour / 7-day utilization bars with reset countdowns) and Claude service status.

Click any row for a **detail drawer**: token/turn/tool metrics, the **subagents** that session delegated to (task, message count, output tokens, duration, and the answer each returned — read from `projects/<key>/<uuid>/subagents/agent-*.jsonl`, which the session list itself deliberately hides), and a paginated, filterable message timeline.

**Actions** (per row):

- **Attach** — for background agents: opens a terminal running `claude attach <id>` (detach with `Ctrl+Z`, the agent keeps running).
- **Terminal here** — for running interactive sessions: opens a new shell in the session's directory.
- **Resume** — for past sessions: opens `claude --resume <uuid>`.
- **Kill ghosts** — SIGTERM processes that are alive but idle > 1 h (re-verified against `ps comm` to avoid PID reuse).

**Noise control:**

- Plugin/skill/hook-spawned sessions (e.g. claude-mem observers) are **hidden by default** — toggle "Show plugin sessions".
- Sessions whose working directory is under a configured **excludePath** (Settings) are filtered out entirely.

---

## Jobs

A cross-project console for Claude Code's **background jobs**, read from `~/.claude/jobs/<id>/`. The agents daemon owns the state machine and the respawn policy; claudemap only reports it — nothing here dispatches, retries, or schedules work.

Jobs sort **pinned first, then blocked, then by last activity**, because a blocked job is the only thing on the page that wants something from you right now. The nav badge turns amber and counts them, so you see it from any other section.

Per job: state (`working` / `blocked` / `done`), the daemon's one-line detail, project, model, tokens spent, in-flight and queued task counts, and last activity. Expand for intent, working directory, permission mode, template, backend, CLI version, the structured result once it finishes, and the full append-only transition timeline from `timeline.jsonl`.

**Blocked jobs** surface inline, without expanding: what the job `needs`, the `suggestedReply` it drafted for you, a one-click copy, and **Attach** (still running) or **Resume** (exited) into the job's own working directory.

> claudemap does **not** write to a job's message socket. Every session registers a `messagingSocketPath` under `/run/user/<uid>/cc-socks/`, but its wire protocol is undocumented; sending on it blind risks wedging a live session. Unblocking goes through a real terminal, the same way you would do it by hand.

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

If Claude Code runs on **native Windows** while claudemap runs in WSL, it will not work. You can point the file scanners at the Windows-side config — every path derives from `os.homedir()` (`src/lib/paths.ts`), which honors `$HOME`, so `HOME=/mnt/c/Users/<you> npx claudemap` redirects them, the same mechanism `scripts/demo-run.mjs` uses for screenshots. But the Sessions view still won't work: WSL's `/proc` is a separate kernel and cannot see Windows processes, and the Windows-side project keys (`C--Users-you-...`) decode to invalid paths. Reading `~/.claude` over `/mnt/c` is also slow enough on 9p to be unpleasant.

### `@reboot` cron / systemd

A server started outside a graphical shell inherits no `DISPLAY`, which used to fail the terminal buttons closed. It now falls back to `display` from the config file, then to WSLg's defaults when `/mnt/wslg/.X11-unix` exists. On a plain Linux box started from cron, set `display` explicitly.

### macOS

Not supported today, but the gap has narrowed and PRs are welcome — macOS is POSIX, so `ps`, the launcher script, `claude` on `PATH`, project-key encoding, the Jobs and Prompts views, and the Memory view all work as-is. The `~/.claude/sessions/` registry now *states* each session's pid, cwd, sessionId, kind and jobId, so the `lsof`/`ps eww` shims that used to be needed to recover them are no longer on the critical path.

What still needs a platform shim: process liveness (`registry.ts` reads `/proc/<pid>/stat` field 22 for the PID-reuse guard — macOS would use `ps -o lstart`), origin detection, and terminal spawning (`open -a` / `osascript`). That reaches near-parity with Linux, unlike Windows, where per-process cwd and environ are simply not exposed.

### iOS

Not applicable, and not a roadmap item. claudemap introspects the machine Claude Code runs on: it needs unrestricted filesystem access to `~/.claude`, the process table, and the ability to spawn terminals. iOS grants an app none of those, and Claude Code does not run there. The remote-viewer idea it suggests — a phone watching sessions on your workstation — would be a different product with a different security model, since it requires exposing the dashboard off-host, which this one is explicitly built not to do.

---

## Threat model

Read this before you run it, and before reporting anything as a vulnerability.

**What it is.** A single-user tool that introspects the machine it runs on. It holds the privileges of the user who started it, and it is designed for exactly one trust boundary: **the loopback interface on a machine you control**.

**What it can do, by design:**

- **Read and write everything under `~/.claude/`** — skills, agents, settings, `MEMORY.md`, `~/.claude.json`, `~/.mcp.json`. Editing and toggling from the UI writes real files.
- **Read your Claude Code session logs** in `~/.claude/projects/*/*.jsonl`, which contain full prompt and response transcripts — including subagent transcripts under `<uuid>/subagents/`.
- **Read your entire prompt history** from `~/.claude/history.jsonl` and make it searchable. That is every prompt you have ever typed, across every project, in one box.
- **Read background job records** from `~/.claude/jobs/`, which include each job's intent, result, and blocked-state detail.
- **Read your OAuth access token** from `~/.claude/.credentials.json`, server-side, to fetch the quota view. It stays in the server process; responses carry utilization percentages only.
- **Spawn graphical terminals** running `claude attach` / `claude --resume`, and **send SIGTERM** to processes it identifies as idle `claude` sessions.
- **Invoke `claude plugin install`** when you install from the Marketplace tab.

**There is no authentication.** None. Anything that can issue HTTP requests to the port has all of the above. That is why the bind address is hardcoded to `127.0.0.1` in `bin/claudemap.js` and is not exposeable by flag or env — an ambient `HOSTNAME=0.0.0.0` is overwritten, not honored.

**What is still yours to get right:**

- Don't put it behind a tunnel, reverse proxy, port-forward, or `kubectl port-forward`. "Localhost-only" stops being true the moment you do, and every capability above becomes remote.
- Any other **local** process running as you can reach the port. On a shared or multi-user box, so can anything running as you via a compromised dependency. Run it where you develop, not on a jumphost, build agent, or production server.
- A **malicious web page** you visit cannot mutate state — mutating routes require a same-origin `Origin` header (`src/middleware.ts`) — but treat that as defense in depth, not a licence to leave it running unattended on a machine you don't trust.
- **Back up `~/.claude/` before bulk operations.** Trash actions are reversible; not everything else is.

**Reporting.** If you find something that breaks the model above — a path that escapes `~/.claude/`, a way to reach the server off-loopback, a shell injection in the terminal spawner — open an issue at [github.com/aminetroudi/claudemap/issues](https://github.com/aminetroudi/claudemap/issues). "It has no auth" and "it reads my files" are documented above, not findings.

---

## Security

The mitigations behind the model above. This is a **local power-user tool**, not a hosted service: it reads and writes files under `~/.claude/`, spawns terminals, and can signal processes.

- The server binds to **`127.0.0.1` only** (`claudemap.sh`). It has no auth — **never expose the port**.
- Mutating API routes enforce a **same-origin check** (`src/middleware.ts`): a malicious page can't silently POST/PUT/DELETE to the local API.
- The session **timeline/metrics/subagents** endpoints resolve symlinks and require the target under `~/.claude/projects/` ending in `.jsonl` — no arbitrary file read. The subagents endpoint derives its sidecar directory from the already-guarded path, so it adds no new input.
- The **jobs** endpoints take a job id matched against `^[0-9a-f]{8}$` before it reaches the filesystem; **prompts** reads one fixed file. Neither accepts a caller-supplied path.
- The per-session **peer tokens** in `~/.claude/sessions/*.key` are never read, and claudemap never opens a session's message socket — see the note under [Jobs](#jobs).
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
                          #   projects, marketplaces, search, prompts,
                          #   jobs/*, sessions/*)
    layout.tsx            # root layout, next/font, metadata
    page.tsx              # single-page shell
  components/             # Sidebar, Viewer, panels, CommandPalette, …
    sessions/             # SessionsPanel deps: HistoryView, SessionDrawer,
                          #   PromptsView, UsageView, format helpers
  lib/
    paths.ts              # derives all ~/.claude file locations from $HOME
    config.ts             # dashboard's own config (scan paths, excludePaths)
    actions.ts            # trash/promote/demote/install/uninstall/read/write
    client.ts             # typed fetch wrappers for /api/*
    scanners/             # per-kind scanners (skills, agents, plugins, mcp, …)
    sessions/             # session monitor: discover, jsonl, status, context,
                          #   origin, history, timeline, usage, quota, ghosts,
                          #   terminal, classify, pathguard, hub,
                          #   registry (CLI session registry), jobs,
                          #   subagents, prompts
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
| `~/.claude/projects/<key>/<uuid>/subagents/`  | Subagent transcripts (session detail drawer) |
| `~/.claude/sessions/<pid>.json`               | CLI session registry — pid, cwd, sessionId, status, jobId |
| `~/.claude/jobs/<id>/`                        | Background job state + timeline (Jobs view)  |
| `~/.claude/history.jsonl`                     | Prompt history (Sessions → Prompts, Overview → activity) |
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
