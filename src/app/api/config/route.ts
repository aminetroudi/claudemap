import { NextResponse } from "next/server";
import { invalidateConfigCache, loadConfig, saveConfig } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await loadConfig());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<AppConfig>;
  invalidateConfigCache();
  const current = await loadConfig();
  const next: AppConfig = { ...current, ...body };
  await saveConfig(next);
  return NextResponse.json(next);
}
