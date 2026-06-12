// GET /api/sessions/timeline?file=&offset=&limit= — paginated message timeline
// (port of csm handleTimeline, handlers.go:134-172). The path guard inside
// parseTimeline rejects anything outside ~/.claude/projects — a guard failure
// surfaces as 400, never as a file read.

import { NextResponse } from "next/server";
import { parseTimeline } from "@/lib/sessions/timeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 500;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") ?? "";
  if (!file) {
    return NextResponse.json({ error: "file parameter is required" }, { status: 400 });
  }

  let offset = 0;
  const o = url.searchParams.get("offset");
  if (o) {
    const parsed = Number.parseInt(o, 10);
    if (Number.isFinite(parsed) && parsed >= 0) offset = parsed;
  }

  let limit = 50;
  const l = url.searchParams.get("limit");
  if (l) {
    const parsed = Number.parseInt(l, 10);
    if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(parsed, MAX_LIMIT);
  }

  try {
    const { entries, total } = await parseTimeline(file, offset, limit);
    return NextResponse.json({ entries, total, offset, limit });
  } catch (e) {
    // Bad/disallowed path or unreadable file → 400 (csm returns 400 here).
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
