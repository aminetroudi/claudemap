import { NextResponse } from "next/server";
import { readFileText, writeFileText } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams.get("path");
  if (!p) return NextResponse.json({ error: "missing path" }, { status: 400 });
  try {
    return NextResponse.json({ path: p, content: await readFileText(p) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const { path: p, content } = (await req.json()) as {
    path: string;
    content: string;
  };
  if (!p) return NextResponse.json({ error: "missing path" }, { status: 400 });
  try {
    await writeFileText(p, content);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
