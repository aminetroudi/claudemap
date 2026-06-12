import { NextResponse } from "next/server";
import { discoverSessions, filterLiveSessions } from "@/lib/sessions/discover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sessions = await discoverSessions();
    return NextResponse.json({ sessions: filterLiveSessions(sessions) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
