# Plan 01 — Sessions Monitor: port all csm features into claudemap + terminal attach

**Goal:** Add a "Sessions" section to claudemap that replicates every feature of
[yepzdk/claude-sessions-monitor](https://github.com/yepzdk/claude-sessions-monitor) (csm) —
live dashboard, status detection, context bars, git branch, origin detection, last message,
history view, usage view (API quota + local tokens), ghost detection/kill, session detail
(metrics + timeline), REST API, SSE auto-refresh — **plus** an "Open terminal / attach"
action csm does not have.

Each phase is self-contained and executable in a fresh chat context. Every phase begins by
re-reading its **Doc refs**. The csm reference clone is required for Phases 1–5:

```bash
[ -d /tmp/csm-src ] || git clone --depth 1 https://github.com/yepzdk/claude-sessions-monitor /tmp/csm-src
```

---

## Phase 0 — Consolidated documentation discovery (DONE — findings below are the contract)

### 0.1 claudemap conventions (source: $HOME/workspace/claudemap)

- Next.js **16.2.3**, App Router, bun, port **3737** (`scripts/boot-server.mjs`), CSRF Origin
  middleware in `src/middleware.ts`, localhost-only.
- **AGENTS.md rule:** "This is NOT the Next.js you know" — before writing route handlers or
  SSE code, read the relevant guide in `node_modules/next/dist/docs/`. Do not trust training data.
- API route pattern (copy from `src/app/api/mcp/route.ts:8-15`):
  ```ts
  export const dynamic = "force-dynamic";
  export const runtime = "nodejs";
  export async function GET() {
    try { return NextResponse.json(await work()); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
  ```
- Mutations go through `POST /api/actions` switch dispatch (`src/app/api/actions/route.ts:48-103`),
  client calls via `callAction()` (`src/lib/client.ts`) which throws on `{error}`.
- Panel pattern: copy `src/components/McpPanel.tsx` — `"use client"`, data via props,
  `onChanged` callback, CSS vars (`var(--ac)`, `.card`, `.btn`, `.badge-*`), lucide-react icons,
  framer-motion transitions.
- Section registration: `src/components/Sidebar.tsx:9-25` (Section union + NAV array),
  rendered in `src/app/page.tsx` (state `section`, conditional panel blocks).
- Path safety helpers exist: `assertSafePath` / `assertSafeRealPath` in `src/lib/actions.ts`.
- `child_process` precedent: `execFile("claude", [...])` in `src/lib/actions.ts:265-282`.
- **No SSE/polling infra exists** — Phase 2 builds it.

### 0.2 csm algorithms (source: /tmp/csm-src, exact file:line)

| Feature | Location |
|---|---|
| Session discovery + active-log selection | `internal/session/session.go:285-346`, `425-504` |
| JSONL `LogEntry`/`Message`/`Usage` structs + mixed-content unmarshal | `session.go:59-182`, `101-160` |
| **Status machine** (Working/NeedsInput/Waiting/Inactive, exact rules) | `session.go:875-1042` |
| Last message / git branch / unsandboxed / task extraction | `session.go:636-694`, `1045-1069` |
| Context % + model window table (200k default, 1M for opus/sonnet ≥4.6) | `session.go:700-734`, `811-865` |
| Process detection (`ps` + `/proc/<pid>/cwd`) | `session.go:196-265` |
| Ghost criteria (pid + lastActivity > 1h) + kill (re-verify, SIGTERM) | `session.go:1080-1154` |
| Origin classifier (pure fn) + Linux /proc walk + cache `~/.claude-monitor/origins/` | `internal/session/origin.go:88-207`, `origin_detect_linux.go:15-86`, `origin_store.go` |
| History discovery (sessions-index.json + jsonl scan) + QuickSessionStats | `internal/session/history.go:48-196`, `247-301` |
| Timeline + metrics + **path validation guard** | `internal/session/timeline.go:96-147`, `157-252`, `53-84` |
| Local 5h usage window + Anthropic quota API | `internal/session/quota.go:61-117`, `145-175`, `249-292` |
| Web endpoints + SSE hub (2s tick, `sessions` + `heartbeat` events) | `internal/web/handlers.go`, `sse.go:32-153` |

### 0.3 Verified machine facts (Ubuntu/GNOME, Claude Code 2.1.175)

- Session logs: `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`. Encoding replaces `/`, `.`, `_`
  with `-`. Sidecar dirs `<uuid>/subagents/agent-*.jsonl` exist — **skip `agent-` files** and
  skip non-`.jsonl` entries.
- Extra line types beyond csm's set: `attachment`, `file-history-snapshot`, `last-prompt`,
  `mode`, `permission-mode`, `ai-title`. Parser must ignore unknown types gracefully.
  `ai-title.aiTitle` and `customTitle` both exist — prefer `customTitle`, fall back to `aiTitle`.
- `message.usage` is a superset of csm's 4 fields (nested `cache_creation`, `iterations[]`…) —
  read only the 4 top-level token fields.
- `~/.claude/.credentials.json` → `{ claudeAiOauth: { accessToken, ... } }` (confirmed present).
- **`claude agents --json`** returns `[{ pid, cwd, kind: "interactive"|"background", startedAt,
  sessionId, name?, status: "idle"|"busy", state?, id? }]` — `id` (short 8-hex) only on
  background jobs.
- **`claude attach <id>` works ONLY for background jobs** (short `id`). Interactive session
  UUIDs → "No job matching". `claude --resume <sessionId>` exists for past sessions.
- Terminals installed: `gnome-terminal`, `tilix`, `x-terminal-emulator` (→ gnome-terminal).
  No kitty/alacritty/wezterm/konsole/xterm. `XDG_CURRENT_DESKTOP=ubuntu:GNOME`, X11.
- Verified spawn syntax: `gnome-terminal --title=T --working-directory=DIR -- bash -c 'CMD; exec bash'`
  and `tilix -w DIR -e 'bash -c "CMD; exec bash"'`. (`gnome-terminal -e` is deprecated.)
- User's interactive sessions launch from **Tilix** — env marker `TILIX_ID` (+ `VTE_VERSION`).
  csm's classifier misses Tilix; our port adds it.

### 0.4 Allowed APIs (do not invent beyond these)

- Node: `fs/promises`, `path`, `os`, `child_process` (`execFile` promisified, `spawn` with
  `detached: true` + `unref()`), `readline`/manual line split for JSONL.
- Next 16: `NextResponse.json`, route `GET/POST(req: Request)`, SSE via returning a
  `Response(ReadableStream)` — confirm exact streaming idiom in `node_modules/next/dist/docs/`
  before coding.
- Anthropic quota: `GET https://api.anthropic.com/api/oauth/usage` with
  `Authorization: Bearer <accessToken>`, `anthropic-beta: oauth-2025-04-20` — **undocumented,
  may break**; handle failure as "quota unavailable", never crash the usage view.
- Status page: `GET https://status.claude.com/api/v2/status.json` → `status.indicator/description`.
- Browser: `EventSource` for SSE.
- **Anti-APIs:** no WebSocket lib, no SWR/react-query (project uses plain fetch), no node-pty /
  xterm.js (attach = spawn external terminal, NOT embedded), no `gnome-terminal -e`,
  no shell-string interpolation (`exec`) — always argv arrays.

---

## Phase 1 — Core session library + `/api/sessions` + basic Live panel

### What to implement

Create `src/lib/sessions/` (new module, server-side only):

1. `types.ts` — TS port of csm wire shapes. Use **camelCase + ISO strings + milliseconds**
   (do NOT copy Go's nanosecond durations):
   ```ts
   export type SessionStatus = "working" | "needs_input" | "waiting" | "inactive";
   export interface Origin { category: "terminal" | "ide" | "desktop"; app: string; display: string }
   export interface LiveSession {
     sessionId: string; project: string; projectPath?: string; logFile: string;
     status: SessionStatus; task: string; lastMessage?: string; summary?: string;
     sessionTitle?: string; lastActivity: string; gitBranch?: string; origin?: Origin;
     pid?: number; kind?: "interactive" | "background"; attachId?: string;
     isGhost?: boolean; hasUnsandboxed?: boolean;
     contextPercent?: number; contextTokens?: number; model?: string;
   }
   ```
2. `jsonl.ts` — line parser. Copy semantics from `session.go:59-182` + the mixed-content
   unmarshal (`session.go:101-160`): `message.content` may be a string, an array of blocks,
   or an array mixing blocks and bare single-char strings (concatenate consecutive strings
   into one text block). Implement `readLastEntries(file, 100)` (tail-read, tolerate huge
   lines) and a streaming full-file scanner.
3. `discover.ts` — port `Discover()` + `findActiveLogs` (`session.go:285-346`, `425-504`):
   scan `~/.claude/projects/*`, skip dot-dirs, only `*.jsonl`, **skip `agent-*` files and the
   `<uuid>/` sidecar dirs**, mtime-sorted active-log selection (top-N by running process count
   + anything touched in last 5 min), sort by status priority then lastActivity.
4. `process.ts` — **deviation from csm (better source available):** primary process source is
   `execFile("claude", ["agents", "--json"])` → pid, cwd, kind, sessionId, attachId(`id`),
   status. Fallback/supplement (for ghosts and if the command fails): port the `ps ax` +
   `/proc/<pid>/cwd` scan from `session.go:196-265`. Join to sessions by `sessionId` first,
   then by encoded-cwd match (`session.go:275-282`).
5. `status.ts` — port the status machine **exactly** from `session.go:875-1042`, including
   constants: tool-pending 2 min, progress heartbeat 2 min, file-mtime 30 s, stale 5 min, and
   rule order 1→12. Also port `extractTask` (`session.go:1045-1069`), last-message
   (`session.go:636-664`, first line, strip `#` headers), git branch, unsandboxed flag.
6. `context.ts` — port `extractContextUsage` (`session.go:700-734`): respect
   `compact_boundary`/`microcompact_boundary` reset; window table from `session.go:811-865`
   (default 200_000; 1_000_000 for opus/sonnet ≥ 4.6; unparseable → 200_000). Keep the table
   a single exported map so new model families (e.g. fable) are one-line additions.
7. API route `src/app/api/sessions/route.ts` — copy handler shell from
   `src/app/api/mcp/route.ts`. Returns `{ sessions: LiveSession[] }` filtered like csm's
   `filterLiveSessions` (`handlers.go:31-42`): non-inactive + inactive with activity < 1 h.
8. Client helper `fetchSessions()` in `src/lib/client.ts` (copy `fetchItems` shape).
9. `src/components/SessionsPanel.tsx` — copy `McpPanel.tsx` skeleton. **Deviation:** this
   panel self-fetches (its data is volatile; do not wire into page.tsx `load()`). v1: plain
   table — status dot (`● ▲ ◉ ◌` with `--green/--amber/--tx-3` colors), project, branch,
   last activity (relative), task/last message line.
10. Register section: `Sidebar.tsx` Section union + NAV entry
    `{ id: "sessions", label: "Sessions", icon: <Activity size={18} />, sep: true }`;
    render block in `page.tsx`.

### Doc refs
- `/tmp/csm-src/internal/session/session.go` (whole file — the core)
- `$HOME/workspace/claudemap/src/app/api/mcp/route.ts`, `src/components/McpPanel.tsx`,
  `src/components/Sidebar.tsx`, `src/app/page.tsx`, `src/lib/client.ts`, `src/lib/paths.ts`
- `node_modules/next/dist/docs/` — route handler guide (AGENTS.md mandate)

### Verification
- [ ] `bun run build` clean.
- [ ] `curl -s localhost:3737/api/sessions | jq '.sessions[0]'` shows this very session as
      `working` or `waiting` with correct project + branch.
- [ ] Start a dummy session (`cd /tmp && claude` in another terminal), confirm it appears;
      exit it, confirm it drops to inactive then disappears after 1 h window (or stub-test
      the filter with a fake old file).
- [ ] Unit-ish check: feed a captured JSONL with a pending `tool_use` and no `tool_result`
      older than 2 min → `needs_input`.
- [ ] `grep -rn "exec(" src/lib/sessions/` → no shell-string exec.

### Anti-pattern guards
- Do NOT parse every line of every log on each request — last-100 tail for live data
  (csm does exactly this; full scans only in history/metrics phases).
- Do NOT trust the encoded dir name for project identity — prefer JSONL `cwd`
  (encoding is lossy: `my_app` and `my-app` collide).
- Do NOT add `sessions` to `SECTION_TO_KIND` item filtering — it is not an ItemKind.

---

## Phase 2 — SSE live updates + full live-row UI

### What to implement

1. `src/lib/sessions/hub.ts` — singleton poller (module-level, like csm's hub
   `sse.go:32-109`): every **2 s** run discovery, broadcast to subscribers; **30 s**
   heartbeat; drop slow clients (bounded queue 16); stop ticking when zero subscribers
   (csm ticks always — improve: pause when idle, claudemap server is long-lived).
2. `src/app/api/sessions/events/route.ts` — SSE endpoint. Read the Next 16 streaming-response
   doc first (AGENTS.md). Emit csm-compatible frames: `event: sessions` + `data: <json>`,
   `event: heartbeat`. `dynamic = "force-dynamic"`, `runtime = "nodejs"`; clean up
   subscription on `req.signal` abort.
3. `SessionsPanel` switches from fetch-once to `EventSource("/api/sessions/events")` with
   fetch fallback if SSE errors. Reconnect with backoff.
4. Origin detection: `src/lib/sessions/origin.ts` — port `classifyOrigin` (`origin.go:88-207`,
   precedence: IDE env → IDE ancestor → terminal env → terminal ancestor → Claude Desktop →
   unknown) + Linux `/proc` walking (`origin_detect_linux.go:15-86`, max 10 hops).
   **Add Tilix**: env `TILIX_ID` → terminal/tilix/"Tilix" (also add to ancestor catalog:
   comm `tilix`). Cache compatible with csm: `~/.claude-monitor/origins/<sessionId>.json`,
   atomic tmp+rename write (`origin_store.go:52-82`); detect only when running & uncached.
5. Full row UI (model on csm TUI `ui/ui.go:293-355` + csm web): context bar (10 blocks or CSS
   gradient; green <76, yellow 76–90, red ≥91; ` (1M)` suffix on extended window), origin
   badge, `[!S]` unsandboxed badge (`.badge-red`), git branch, status summary header
   (`● Working: N  ▲ Needs Input: N  ◉ Waiting: N`).

### Doc refs
- `/tmp/csm-src/internal/web/sse.go`, `internal/session/origin.go`,
  `origin_detect_linux.go`, `origin_store.go`, `internal/ui/ui.go:240-360`
- `node_modules/next/dist/docs/` — streaming/route-handler section (MANDATORY before SSE)

### Verification
- [ ] `curl -N localhost:3737/api/sessions/events | head -20` shows immediate `event: sessions`
      frame, then updates every ~2 s.
- [ ] Two browser tabs open → one poller (log a line on tick start; confirm no doubling).
- [ ] Close all tabs → ticking stops (log line ceases).
- [ ] This session's row shows origin **Tilix** (TILIX_ID present on the claude process).
- [ ] Type in a session → status flips to Working within ~2–4 s in the browser.

### Anti-pattern guards
- One poller per process, not per connection.
- Never run origin `/proc` walks for non-running sessions (cache-only, csm rule
  `session.go:527-534`).
- Don't buffer SSE through Next compression — set `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, and verify flush behavior against the Next 16 docs.

---

## Phase 3 — History view + session detail (timeline + metrics)

### What to implement

1. `src/lib/sessions/history.ts` — port `DiscoverHistory` (`history.go:48-196`):
   phase 1 read `~/.claude/projects/*/sessions-index.json` (fields `sessionId, fullPath,
   created, modified, messageCount, firstPrompt, gitBranch, projectPath, isSidechain` — skip
   sidechains); phase 2 scan remaining `*.jsonl` (skip `agent-*`, empty, old) with
   `QuickSessionStats` port (`history.go:247-301` — string-match scan, no full JSON parse:
   messageCount = lines with `"type":"user"` minus tool_results, firstPrompt 120 chars,
   last gitBranch, first cwd, customTitle, first/last timestamp). Duration in **ms**.
2. `src/lib/sessions/timeline.ts` — port metrics (`timeline.go:157-252`) and timeline
   (`timeline.go:96-147`): metrics = token sums, `toolUsageCounts` map, userPromptCount,
   toolResultCount, assistantMessageCount, **turnCount** (system turn_duration),
   compactCount (resets lastUsage→context 0), final context %. Timeline keeps
   user/assistant/summary/system, drops progress types, **newest first**, offset/limit
   (default 50, max 500).
3. **Path guard (security-critical):** port `timeline.go:53-84` — resolve symlinks
   (`fs.realpath`), require prefix = real `~/.claude/projects/` and suffix `.jsonl`. Wire
   through existing `assertSafeRealPath` conventions in `src/lib/actions.ts`.
4. API routes: `GET /api/sessions/history?days=N` (default 7, clamp 1–365; merge live-inactive
   like `handlers.go:56-132`, dedup by logFile, sort startTime desc),
   `GET /api/sessions/timeline?file=&offset=&limit=`, `GET /api/sessions/metrics?file=`.
5. UI: tabs inside SessionsPanel — **Live / History / Usage** (mirrors csm's `h`/`l`/`u`).
   History: search/filter input (project + firstPrompt substring), date grouping
   Today/Yesterday/"Jan 2" (`history.go:397-412`). Row click (both tabs) → detail drawer
   (framer-motion, copy modal pattern from McpPanel): metrics summary cards + paginated
   timeline with All/Assistant/User filter buttons.

### Doc refs
- `/tmp/csm-src/internal/session/history.go`, `timeline.go`, `internal/web/handlers.go:56-202`
- `~/.claude/projects/-home-user-work/` — real data to test against (sessions-index.json
  presence varies; handle absence)

### Verification
- [ ] `curl -s 'localhost:3737/api/sessions/history?days=30' | jq length` ≥ number of
      sessions visible in `claude --resume` picker for a known project.
- [ ] `curl -s 'localhost:3737/api/sessions/timeline?file=/etc/passwd'` → 400 error.
      Same for a path with `../` and a symlink pointing outside projects dir.
- [ ] Metrics for this session: turnCount > 0, toolUsageCounts non-empty, token sums > 0.
- [ ] Timeline pagination: offset=0&limit=5 then offset=5&limit=5 → no overlap, newest first.

### Anti-pattern guards
- NEVER serve a file path that fails the guard — this endpoint is arbitrary-file-read if
  skipped.
- QuickSessionStats is string-matching by design (fast) — don't "improve" it into full JSON
  parsing of every history file.
- `duration` is ms in our API — do not copy Go's nanoseconds.

---

## Phase 4 — Usage view (local 5h window + API quota)

### What to implement

1. `src/lib/sessions/usage.ts` — port `ComputeUsage` (`quota.go:61-117`, `249-292`): window
   = last 5 h; per-log streaming scan, pre-filter lines containing `"usage"`, per-line
   timestamp filter, sum the 4 token fields; aggregate per session + totals.
2. `src/lib/sessions/quota.ts` — read `~/.claude/.credentials.json` →
   `claudeAiOauth.accessToken` (server-side only, **never include token in any response,
   error message, or log**). `GET https://api.anthropic.com/api/oauth/usage`, headers
   `Authorization: Bearer …`, `anthropic-beta: oauth-2025-04-20`, 5 s timeout, **60 s
   in-memory cache** (`quota.go:126`). Parse `five_hour`, `seven_day`, `seven_day_sonnet`,
   `seven_day_opus` each `{utilization, resets_at}` + `extra_usage.is_enabled`
   (`quota.go:178-245`). Any failure → `{ available: false, error }`.
3. Optional health badge: `GET https://status.claude.com/api/v2/status.json` →
   indicator/description, 60 s cache (`status.go:51-84`).
4. API: `GET /api/sessions/usage` → `{ local: UsageStats, apiQuota: APIQuota }`
   (`handlers.go:175-179`).
5. UI Usage tab: quota progress bars (green <75, yellow 75–90, red >90 — csm `ui/usage.go`),
   reset countdowns from `resets_at`, per-session local token table sorted by total desc.

### Doc refs
- `/tmp/csm-src/internal/session/quota.go`, `oauth.go`, `status.go`, `internal/ui/usage.go`

### Verification
- [ ] `curl -s localhost:3737/api/sessions/usage | jq '.apiQuota.fiveHour'` returns utilization
      matching `csm` TUI's `u` view (run `csm` side by side).
- [ ] `curl -s localhost:3737/api/sessions/usage | grep -ci token` — response contains token
      **counts** but: `curl -s ... | grep -c sk-` and grep for `accessToken` → 0 occurrences.
- [ ] Rename credentials file temporarily → usage tab shows local stats + "quota unavailable"
      (no crash); restore file.
- [ ] Two requests < 60 s apart → one upstream call (log it).

### Anti-pattern guards
- The quota endpoint is **unofficial** — wrap in try/catch, degrade gracefully, never retry-storm.
- Token never crosses the server boundary. No `console.log` of headers.

---

## Phase 5 — Ghost kill + terminal attach (the new capability)

### What to implement

1. `src/lib/sessions/ghosts.ts` — port `FindGhostProcesses` + `KillGhostProcesses`
   (`session.go:1080-1154`): ghost = session with live pid AND lastActivity > **1 h**;
   before SIGTERM re-verify `ps -p <pid> -o comm=` ends with `claude` (PID-reuse guard);
   `process.kill(pid, "SIGTERM")`.
2. `src/lib/sessions/terminal.ts` — terminal spawner:
   - Pick emulator: try in order `x-terminal-emulator`, `gnome-terminal`, `tilix`
     (existence via `which`/access on PATH). Optional `terminalEmulator` override added to
     `AppConfig` (`src/lib/config.ts` DEFAULT + type).
   - Spawn **detached** with argv arrays only (`spawn(bin, args, { detached: true,
     stdio: "ignore" }); child.unref()`):
     - gnome-terminal/x-terminal-emulator: `["--title", title, "--working-directory", cwd, "--", "bash", "-c", script]`
     - tilix: `["-w", cwd, "-e", script]`
   - `script` is built ONLY from validated tokens: `claude attach <id>; exec bash` /
     `claude --resume <uuid>; exec bash` / `exec bash`. Validation: attachId
     `^[0-9a-f]{8}$`, sessionId UUID regex, cwd must `realpath` to an existing directory
     under `$HOME` (reuse `assertSafeRealPath`).
   - If `process.env.DISPLAY` and `WAYLAND_DISPLAY` are both unset (server booted headless),
     return a clear error: "no graphical session available to claudemap server".
3. Actions — extend `POST /api/actions` switch (follow existing dispatch pattern):
   - `{ action: "session-open-terminal", mode: "attach"|"resume"|"shell", attachId?, sessionId?, cwd }`
   - `{ action: "session-kill-ghosts" }` → `{ ok: true, killed: n }`
4. UI per-row action button (semantics from Phase 0.3 — **this is the part csm cannot do**):
   - `kind === "background"` && attachId → **"Attach"** → mode attach (`claude attach <id>`).
   - `kind === "interactive"` && running → **"Terminal here"** → mode shell (attach is
     impossible for interactive sessions — verified; do not pretend otherwise).
   - inactive/history rows → **"Resume"** → mode resume (`claude --resume <uuid>`).
   - Ghost badge + header "Kill ghosts (n)" button with confirm dialog (`.btn-danger`).
5. CommandPalette: extend with an "Actions" group (it has none today —
   `CommandPalette.tsx` currently renders Navigate + Items only): "Attach: <session>" entries
   for background jobs, "Kill ghosts".

### Doc refs
- `/tmp/csm-src/internal/session/session.go:1080-1154`
- `src/lib/actions.ts` (execFile precedent + assertSafeRealPath), `src/app/api/actions/route.ts`
- Phase 0.3 spawn syntax (verified on this machine)

### Verification
- [ ] `claude -p 'sleep via Bash for 60 seconds' &` style background job → row shows kind
      background → Attach button → a terminal window opens running `claude attach <id>` and
      shows the session TUI; Ctrl+Z detaches, job keeps running.
- [ ] "Terminal here" on this session → window opens in `$HOME/work` (or project cwd).
- [ ] Resume on an old history row → `claude --resume <uuid>` picker/session opens.
- [ ] `curl -X POST localhost:3737/api/actions -H 'content-type: application/json' -H 'Origin: http://evil.example' -d '{"action":"session-open-terminal",...}'` → blocked by CSRF middleware.
- [ ] Malformed attachId (`"../x"`, `"foo; rm"`) → 400, nothing spawned.
- [ ] Kill-ghosts with a fabricated stale session (touch old mtime + orphan `sleep` renamed?
      simpler: assert the 1 h + comm re-check logic via unit test) → only true ghosts killed.
- [ ] `grep -rn "exec(\|execSync\|shell: true" src/lib/sessions/ src/app/api/` → empty.

### Anti-pattern guards
- NEVER interpolate request strings into a shell line — argv arrays + strict regex validation.
- NEVER SIGKILL; SIGTERM only, after comm re-verification (PID reuse).
- Don't offer "Attach" on interactive sessions — verified impossible; the button would
  silently fail.
- Spawned terminals must be detached + unref'd or they die with the Next.js server.

---

## Phase 6 — Final verification

1. **Build & lint:** `bun run build` clean; `bunx tsc --noEmit` if standalone check needed.
2. **API contract sweep** (csm parity):
   ```bash
   for ep in sessions 'sessions/history?days=7' sessions/usage; do
     curl -sf "localhost:3737/api/$ep" | jq type; done
   curl -N localhost:3737/api/sessions/events | head -5
   ```
3. **Anti-pattern greps:**
   - `grep -rn "shell: true\|execSync\|child_process.exec(" src/` → empty
   - `grep -rn "accessToken" src/components/` → empty (token never reaches client code)
   - `grep -rn "9847" src/` → empty (no csm port copy-paste leftovers)
4. **Status-machine spot check vs csm:** run `csm -l -json` and diff statuses against
   `curl /api/sessions` for the same instant (allowing the 2 s tick skew).
5. **Security review of new surface:** timeline/metrics path guard tests (Phase 3), CSRF on
   actions (Phase 5), credentials never logged (Phase 4). Run `/security-review` on the diff.
6. **Feature parity checklist vs csm README:** live dashboard ✓ status types ✓ context bars ✓
   git branch ✓ origin (incl. Tilix bonus) ✓ last message ✓ ghost detect/kill ✓ history +
   search ✓ usage (quota + local) ✓ session detail (metrics, timeline, filters) ✓ REST API ✓
   SSE ✓ — plus attach/resume/terminal (new).
7. Update `README.md` (Sessions section + screenshot) and `graphify update .` if graph exists.

---

## Risks / honest caveats

- **`api/oauth/usage` is undocumented** — quota view may break on Anthropic changes; degrade,
  don't crash.
- **Attach is background-only** — a per-row "Attach" for interactive sessions is impossible
  today (Claude Code limitation, verified 2.1.175). UI copy must say "Terminal here" instead.
- **DISPLAY availability** — claudemap server is spawned by a SessionStart hook from a GUI
  terminal, so it inherits DISPLAY today; a headless boot (ssh) will break terminal spawn.
  Handled with explicit error in Phase 5.2.
- **Status machine drift** — Claude Code's JSONL format evolves (already richer than csm's
  model at 2.1.175); parser must ignore unknown entry types and missing fields.
- **Next 16 unfamiliarity** — AGENTS.md warns APIs differ from training data; every phase
  touching routes/SSE must read `node_modules/next/dist/docs/` first.
