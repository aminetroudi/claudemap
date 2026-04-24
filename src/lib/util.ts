import crypto from "node:crypto";
import fs from "node:fs/promises";
import matter from "gray-matter";

export function hashId(...parts: string[]): string {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

export async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

export async function readFrontmatter(file: string): Promise<{
  data: Record<string, unknown>;
  body: string;
} | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const fm = matter(raw);
    return { data: fm.data as Record<string, unknown>, body: fm.content };
  } catch {
    return null;
  }
}

export function preview(text: string, n = 240): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export async function isDir(p: string): Promise<boolean> {
  const s = await safeStat(p);
  return !!s && s.isDirectory();
}

export async function isFile(p: string): Promise<boolean> {
  const s = await safeStat(p);
  return !!s && s.isFile();
}

/** Read JSON from disk, returning fallback on any failure. */
export async function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
