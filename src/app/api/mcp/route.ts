import { NextResponse } from "next/server";
import { scanMcpServers } from "@/lib/scanners/mcp";
import { listProjects } from "@/lib/scanners";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const roots = await listProjects();
    const result = await scanMcpServers(roots);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
