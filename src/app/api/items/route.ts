import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanners";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await scanAll();
  return NextResponse.json(result);
}
