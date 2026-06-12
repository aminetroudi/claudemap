// SSE broadcast hub for live session updates. One poller per server process
// (port of csm's hub, /tmp/csm-src/internal/web/sse.go:32-109) with one
// deliberate improvement: csm ticks forever, but the claudemap server is
// long-lived, so we pause the poller when no clients are connected and resume
// on the next subscribe. Server-side only — never import from a client module.

import { discoverSessions, filterLiveSessions } from "./discover";

/** Discovery cadence (csm hub ticks every 2 s, sse.go:60). */
const TICK_MS = 2000;
/** Keep-alive cadence so idle proxies don't drop the connection (sse.go:62). */
const HEARTBEAT_MS = 30_000;
/** Drop a client once this many frames back up unflushed (csm channel buffer 16). */
export const MAX_BACKLOG = 16;

export interface Subscriber {
  /** Enqueue one preformatted SSE frame. Return false to request being dropped. */
  write(frame: string): boolean;
}

const subscribers = new Set<Subscriber>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
/** Most recent broadcast frame, replayed instantly to a freshly connected client. */
let lastFrame: string | null = null;

/**
 * Build a wire frame (csm formatSSE, sse.go:83-95): each data line gets its own
 * `data:` prefix so embedded newlines survive, terminated by a blank line.
 */
function formatSSE(event: string, data: string): string {
  const payload = data
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: ${event}\n${payload}\n\n`;
}

/** Send one frame to every subscriber, dropping any that error or refuse it. */
function broadcast(frame: string): void {
  for (const sub of subscribers) {
    let ok = false;
    try {
      ok = sub.write(frame);
    } catch {
      ok = false;
    }
    if (!ok) subscribers.delete(sub);
  }
  if (subscribers.size === 0) stop();
}

/** Run discovery and broadcast. Never overlaps with a prior in-flight scan. */
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const sessions = filterLiveSessions(await discoverSessions());
    lastFrame = formatSSE("sessions", JSON.stringify({ sessions }));
    if (subscribers.size > 0) {
      // One log line per tick — verifies a single poller serves all clients.
      console.log(
        `[sessions-hub] tick → ${sessions.length} session(s), ${subscribers.size} client(s)`,
      );
      broadcast(lastFrame);
    }
  } catch (e) {
    // Transient scan failure: keep the poller alive and skip just this frame.
    console.error("[sessions-hub] tick failed:", (e as Error).message);
  } finally {
    ticking = false;
  }
}

function start(): void {
  if (tickTimer) return;
  console.log("[sessions-hub] poller starting");
  void tick(); // immediate first scan so a new client gets data without waiting 2 s
  tickTimer = setInterval(() => void tick(), TICK_MS);
  heartbeatTimer = setInterval(() => {
    if (subscribers.size > 0) broadcast(formatSSE("heartbeat", "{}"));
  }, HEARTBEAT_MS);
}

function stop(): void {
  if (tickTimer) clearInterval(tickTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  tickTimer = null;
  heartbeatTimer = null;
  console.log("[sessions-hub] poller stopped (no clients)");
}

/**
 * Register an SSE client: replay the cached snapshot immediately (so the first
 * frame is instant even before the next tick), start the poller if idle, and
 * return an unsubscribe function that stops the poller once the last client
 * leaves.
 */
export function subscribe(sub: Subscriber): () => void {
  subscribers.add(sub);
  if (lastFrame) {
    try {
      sub.write(lastFrame);
    } catch {
      // If the very first write fails the next broadcast will drop it.
    }
  }
  start();
  return () => {
    subscribers.delete(sub);
    if (subscribers.size === 0) stop();
  };
}
