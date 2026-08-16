// GET /api/sessions/subagents?file= — subagents spawned by one session.
// `file` goes through the same guard as the timeline endpoint (must resolve
// under ~/.claude/projects and end in .jsonl); the sidecar directory is then
// derived from the guarded path, so this adds no new file-read surface.

import { NextResponse } from "next/server";
import { assertLogFilePath } from "@/lib/sessions/pathguard";
import { readSubagents } from "@/lib/sessions/subagents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const file = new URL(req.url).searchParams.get("file") ?? "";
  if (!file) {
    return NextResponse.json({ error: "file parameter is required" }, { status: 400 });
  }
  try {
    const guarded = await assertLogFilePath(file);
    return NextResponse.json({ subagents: await readSubagents(guarded) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
