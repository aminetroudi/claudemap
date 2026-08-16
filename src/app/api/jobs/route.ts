// GET /api/jobs — every background job the agents daemon has recorded under
// ~/.claude/jobs, newest activity first. Read-only: the daemon owns the state
// machine, claudemap only reports it.

import { NextResponse } from "next/server";
import { readJobs } from "@/lib/sessions/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { jobs, errors } = await readJobs();
    return NextResponse.json({ jobs, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
