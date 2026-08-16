// GET /api/prompts?q=&limit=&project= — search the CLI's own prompt history
// (~/.claude/history.jsonl). Read-only, and it touches exactly one fixed file:
// no caller-supplied path reaches the filesystem.

import { NextResponse } from "next/server";
import { promptProjects, searchPrompts } from "@/lib/sessions/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 500;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const project = url.searchParams.get("project") || undefined;

  let limit = 100;
  const l = url.searchParams.get("limit");
  if (l) {
    const parsed = Number.parseInt(l, 10);
    if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(parsed, MAX_LIMIT);
  }

  try {
    const [result, projects] = await Promise.all([
      searchPrompts(q, limit, project),
      promptProjects(),
    ]);
    return NextResponse.json({ ...result, projects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
