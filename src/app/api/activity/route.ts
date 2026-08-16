// GET /api/activity?days= — daily prompt volume and per-project totals,
// aggregated from ~/.claude/history.jsonl. Read-only, one fixed file, no
// caller-supplied path.

import { NextResponse } from "next/server";
import { promptActivity } from "@/lib/sessions/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_DAYS = 730;

export async function GET(req: Request): Promise<Response> {
  let days = 182;
  const d = new URL(req.url).searchParams.get("days");
  if (d) {
    const parsed = Number.parseInt(d, 10);
    if (Number.isFinite(parsed) && parsed > 0) days = Math.min(parsed, MAX_DAYS);
  }

  try {
    return NextResponse.json(await promptActivity(days));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
