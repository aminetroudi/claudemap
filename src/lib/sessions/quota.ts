// Anthropic usage-quota + service-status fetchers — port of csm quota.go and
// status.go. SERVER-SIDE ONLY.
//
// SECURITY: the OAuth access token is read here and used solely as a Bearer
// header on the upstream request. It MUST NEVER appear in a return value, an
// error message, or a log line. Do not log request headers. The /api endpoint
// returns only utilization percentages and reset times.
//
// The quota endpoint (api/oauth/usage) is UNOFFICIAL: every fetch is wrapped in
// try/catch, has a 5 s timeout, degrades to { available:false }, and is cached
// for 60 s so we never retry-storm upstream.

import fs from "node:fs/promises";
import path from "node:path";
import { CLAUDE_DIR } from "../paths";
import type { APIQuota, ClaudeStatus, QuotaBucket } from "./types";

const QUOTA_URL = "https://api.anthropic.com/api/oauth/usage";
const STATUS_URL = "https://status.claude.com/api/v2/status.json";
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

/**
 * Read the Claude Code OAuth access token from ~/.claude/.credentials.json
 * (csm getOAuthTokenLinux, oauth.go:54-78). Returns null when missing/empty.
 * The returned string stays inside this module — callers never receive it.
 */
async function getOAuthToken(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(CLAUDE_DIR, ".credentials.json"), "utf8");
    const creds = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    const token = creds.claudeAiOauth?.accessToken;
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseBucket(b: { utilization?: number; resets_at?: string } | undefined): QuotaBucket | null {
  if (!b || typeof b.utilization !== "number") return null;
  let resetsAt: string | null = null;
  if (b.resets_at) {
    const ms = Date.parse(b.resets_at);
    if (!Number.isNaN(ms)) resetsAt = new Date(ms).toISOString();
  }
  return { utilization: b.utilization, resetsAt };
}

interface RawQuota {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
  seven_day_sonnet?: { utilization?: number; resets_at?: string };
  seven_day_opus?: { utilization?: number; resets_at?: string };
  extra_usage?: { is_enabled?: boolean };
}

function parseQuota(raw: RawQuota): APIQuota {
  return {
    available: true,
    fiveHour: parseBucket(raw.five_hour),
    sevenDay: parseBucket(raw.seven_day),
    sevenDaySonnet: parseBucket(raw.seven_day_sonnet),
    sevenDayOpus: parseBucket(raw.seven_day_opus),
    extraUsage: raw.extra_usage ? { isEnabled: !!raw.extra_usage.is_enabled } : null,
  };
}

async function fetchQuotaUncached(): Promise<APIQuota> {
  const token = await getOAuthToken();
  if (!token) return { available: false, error: "OAuth token not found" };

  try {
    const res = await fetchWithTimeout(QUOTA_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    if (!res.ok) return { available: false, error: `API returned ${res.status}` };
    const raw = (await res.json()) as RawQuota;
    return parseQuota(raw);
  } catch (e) {
    // Network error / timeout / abort — never include the token in the message.
    const msg = e instanceof Error ? e.message : "request failed";
    return { available: false, error: msg };
  }
}

async function fetchStatusUncached(): Promise<ClaudeStatus> {
  try {
    const res = await fetchWithTimeout(STATUS_URL);
    if (!res.ok) return { available: false, error: `API returned ${res.status}` };
    const raw = (await res.json()) as { status?: { indicator?: string; description?: string } };
    return {
      available: true,
      indicator: raw.status?.indicator,
      description: raw.status?.description,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "request failed";
    return { available: false, error: msg };
  }
}

// 60 s in-memory caches (csm apiQuotaCache / claudeStatusCache). One upstream
// call per minute at most, regardless of how many clients poll.
let quotaCache: { result: APIQuota; fetchedAt: number } | null = null;
let statusCache: { result: ClaudeStatus; fetchedAt: number } | null = null;

export async function fetchAPIQuota(): Promise<APIQuota> {
  if (quotaCache && Date.now() - quotaCache.fetchedAt < CACHE_TTL_MS) {
    return quotaCache.result;
  }
  console.log("[sessions-quota] fetching upstream usage"); // no token, no headers
  const result = await fetchQuotaUncached();
  quotaCache = { result, fetchedAt: Date.now() };
  return result;
}

export async function fetchClaudeStatus(): Promise<ClaudeStatus> {
  if (statusCache && Date.now() - statusCache.fetchedAt < CACHE_TTL_MS) {
    return statusCache.result;
  }
  console.log("[sessions-quota] fetching upstream status");
  const result = await fetchStatusUncached();
  statusCache = { result, fetchedAt: Date.now() };
  return result;
}
