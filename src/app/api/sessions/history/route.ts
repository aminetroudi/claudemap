// GET /api/sessions/history?days=N — past sessions, merging index/scan history
// with recently-inactive live sessions (port of csm handleHistory,
// handlers.go:56-132). days defaults to 7, clamped to 1–365.

import { NextResponse } from "next/server";
import { discoverSessions } from "@/lib/sessions/discover";
import { discoverHistory, quickSessionStats } from "@/lib/sessions/history";
import type { HistorySession } from "@/lib/sessions/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    let days = 7;
    const d = url.searchParams.get("days");
    if (d) {
      const parsed = Number.parseInt(d, 10);
      if (Number.isFinite(parsed) && parsed > 0) days = Math.min(parsed, 365);
    }

    const sessions = await discoverHistory(days);
    const seen = new Set(sessions.map((s) => s.logFile));
    const cutoff = Date.now() - days * DAY_MS;

    // Merge inactive sessions from the live scan so they always appear here.
    // Uses the unfiltered list — filterLiveSessions now strips inactive ones.
    const live = await discoverSessions();
    for (const s of live) {
      if (s.status !== "inactive") continue;
      const la = Date.parse(s.lastActivity);
      if (Number.isNaN(la) || la < cutoff) continue;
      if (seen.has(s.logFile)) continue;

      const q = await quickSessionStats(s.logFile);
      const start = q.startTime || la;
      const end = q.endTime || la;
      const merged: HistorySession = {
        project: s.project,
        gitBranch: s.gitBranch || q.gitBranch || undefined,
        firstPrompt: q.firstPrompt,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        durationMs: Math.max(0, end - start),
        messageCount: q.messageCount,
        lastMessage: s.lastMessage,
        logFile: s.logFile,
        cwd: s.projectPath || q.cwd || undefined,
        automated: s.automated,
      };
      sessions.push(merged);
      seen.add(s.logFile);
    }

    sessions.sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
