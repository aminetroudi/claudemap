import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GhSearchItem {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  updated_at: string;
  owner: { login: string; avatar_url: string };
}

/**
 * Search GitHub for Claude Code marketplaces / skills / plugins.
 * Heuristic: search for repos containing "marketplace.json" or matching name terms.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const kind = url.searchParams.get("kind") ?? "marketplace"; // marketplace | skill | plugin

  const queries: Record<string, string> = {
    marketplace: `${q} "marketplace.json" in:path`,
    skill: `${q} "SKILL.md" in:path`,
    plugin: `${q} ".claude-plugin" in:path`,
  };
  const apiUrl = new URL("https://api.github.com/search/repositories");
  apiUrl.searchParams.set(
    "q",
    `${q} ${kind === "marketplace" ? "claude-code marketplace" : kind === "skill" ? "claude skill" : "claude plugin"}`,
  );
  apiUrl.searchParams.set("sort", "stars");
  apiUrl.searchParams.set("per_page", "30");

  // Allow code-search if user provides a token
  const token = process.env.GITHUB_TOKEN;
  let useCodeSearch = !!token && !!q;

  let res: Response;
  if (useCodeSearch) {
    const codeUrl = new URL("https://api.github.com/search/code");
    codeUrl.searchParams.set("q", queries[kind] ?? queries.marketplace);
    codeUrl.searchParams.set("per_page", "30");
    res = await fetch(codeUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
  } else {
    res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub: ${res.status} ${res.statusText}` },
      { status: 502 },
    );
  }
  const data = await res.json();
  const items: GhSearchItem[] = useCodeSearch
    ? (data.items as { repository: GhSearchItem }[]).map((i) => i.repository)
    : (data.items as GhSearchItem[]);

  // Dedupe by full_name
  const seen = new Set<string>();
  const out = items
    .filter((i) => {
      if (!i || seen.has(i.full_name)) return false;
      seen.add(i.full_name);
      return true;
    })
    .map((i) => ({
      fullName: i.full_name,
      description: i.description,
      url: i.html_url,
      stars: i.stargazers_count,
      updatedAt: i.updated_at,
      owner: i.owner.login,
      avatar: i.owner.avatar_url,
    }));

  return NextResponse.json({ kind, query: q, results: out });
}
