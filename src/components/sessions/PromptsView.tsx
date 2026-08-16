"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Search, TerminalSquare } from "lucide-react";
import { openSessionTerminal, searchPrompts } from "@/lib/client";
import { relativeTime } from "./format";

type Entry = {
  text: string;
  project: string;
  sessionId: string;
  at: string;
  hasPaste?: boolean;
};

/** Wrap every case-insensitive occurrence of `q` in a highlight span. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const hit = lower.indexOf(needle, i);
    if (hit === -1) {
      out.push(text.slice(i));
      break;
    }
    if (hit > i) out.push(text.slice(i, hit));
    out.push(
      <mark
        key={k++}
        style={{ background: "var(--ac-dim)", color: "var(--tx-1)", borderRadius: 2 }}
      >
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    i = hit + needle.length;
  }
  return out;
}

/**
 * Cross-session prompt search over ~/.claude/history.jsonl — every prompt you
 * have ever submitted, with the project and session it belongs to.
 */
export default function PromptsView() {
  const [q, setQ] = useState("");
  const [project, setProject] = useState("all");
  const [data, setData] = useState<{
    entries: Entry[];
    total: number;
    scanned: number;
    projects: string[];
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Debounced: the file is re-read per query, so do not fire on every keystroke.
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      searchPrompts(q, { limit: 200, project: project === "all" ? undefined : project })
        .then((r) => {
          if (mine !== seq.current) return; // a newer query already landed
          if (r.error) {
            setErr(r.error);
            return;
          }
          setErr(null);
          setData({
            entries: r.entries,
            total: r.total,
            scanned: r.scanned,
            projects: r.projects ?? [],
          });
        })
        .catch((e) => mine === seq.current && setErr((e as Error).message))
        .finally(() => mine === seq.current && setLoading(false));
    }, 180);
    return () => clearTimeout(t);
  }, [q, project]);

  // Keep the project list stable while typing narrows the results.
  const projects = useMemo(() => data?.projects ?? [], [data?.projects]);

  if (err) {
    return (
      <div
        style={{
          padding: "7px 11px",
          borderRadius: "var(--r)",
          background: "var(--red-dim)",
          border: "1px solid rgba(248 113 113 / 0.2)",
          color: "var(--red)",
          fontSize: "var(--t-md)",
        }}
      >
        {err}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--tx-3)",
              pointerEvents: "none",
            }}
          />
          <input
            className="input"
            style={{ width: "100%", paddingLeft: 32 }}
            placeholder="Search every prompt you've sent…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        {projects.length > 0 && (
          <select
            className="input"
            style={{ width: "auto", maxWidth: 280 }}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {data && (
        <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
          {loading
            ? "Searching…"
            : `${data.total} of ${data.scanned} prompts${
                data.total > data.entries.length ? ` · showing ${data.entries.length}` : ""
              }`}
        </div>
      )}

      {data && data.entries.length === 0 && !loading && (
        <div className="card" style={{ padding: "36px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "var(--t-xl)", color: "var(--tx-2)" }}>No matching prompts.</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 7 }}>
        {data?.entries.map((e, i) => (
          <div
            key={`${e.sessionId}-${e.at}-${i}`}
            className="card"
            style={{ padding: "11px 13px", display: "flex", gap: 11, alignItems: "flex-start" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "var(--t-md)",
                  color: "var(--tx-1)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                {highlight(e.text, q.trim())}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 6,
                  fontSize: "var(--t-2xs)",
                  color: "var(--tx-3)",
                  alignItems: "center",
                }}
              >
                {e.project && <span className="truncate">{e.project}</span>}
                {e.at && <span>{relativeTime(e.at)}</span>}
                {e.hasPaste && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Paperclip size={10} />
                    paste
                  </span>
                )}
                <span className="mono">{e.sessionId.slice(0, 8)}</span>
              </div>
            </div>
            {e.project && e.sessionId && (
              <button
                className="btn btn-ghost btn-icon"
                title="Resume this session"
                onClick={() =>
                  openSessionTerminal({
                    mode: "resume",
                    cwd: e.project,
                    sessionId: e.sessionId,
                  }).catch(() => {})
                }
              >
                <TerminalSquare size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
