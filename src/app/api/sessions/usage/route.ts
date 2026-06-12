// GET /api/sessions/usage — local 5 h token usage + API quota + service status
// (port of csm handleUsage, handlers.go:174-179). The OAuth token never leaves
// the server: this response carries only token counts and utilization percents.

import { NextResponse } from "next/server";
import { fetchAPIQuota, fetchClaudeStatus } from "@/lib/sessions/quota";
import { computeUsage } from "@/lib/sessions/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const [local, apiQuota, status] = await Promise.all([
      computeUsage(),
      fetchAPIQuota(),
      fetchClaudeStatus(),
    ]);
    return NextResponse.json({ local, apiQuota, status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
