// GET /api/sessions/metrics?file= — aggregated metrics for one session log
// (port of csm handleMetrics, handlers.go:187-202). Same path guard as timeline.

import { NextResponse } from "next/server";
import { parseMetrics } from "@/lib/sessions/timeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") ?? "";
  if (!file) {
    return NextResponse.json({ error: "file parameter is required" }, { status: 400 });
  }

  try {
    const metrics = await parseMetrics(file);
    return NextResponse.json(metrics);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
