import { NextResponse } from "next/server";
import { scanMarketplaces } from "@/lib/scanners/plugins";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ marketplaces: await scanMarketplaces() });
}
