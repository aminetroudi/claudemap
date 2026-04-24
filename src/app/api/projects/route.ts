import { NextResponse } from "next/server";
import { listProjects } from "@/lib/scanners";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}
