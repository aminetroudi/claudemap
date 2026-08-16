// GET /api/jobs/timeline?id= — one background job's append-only progress log.
// `id` must match the daemon's 8-hex job-id shape (enforced in readJobTimeline
// before the value reaches the filesystem), so this is not a file-read
// primitive; a rejected id surfaces as 400.

import { NextResponse } from "next/server";
import { readJobTimeline } from "@/lib/sessions/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: await readJobTimeline(id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
