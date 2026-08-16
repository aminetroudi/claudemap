"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchActivity } from "@/lib/client";
import type { ActivityDay, ActivityResult } from "@/lib/sessions/prompts";

const RANGES: Array<{ days: number; label: string }> = [
  { days: 91, label: "3m" },
  { days: 182, label: "6m" },
  { days: 365, label: "1y" },
];

/** Weekday gutter width, and the cell-size bounds the grid is allowed to pick. */
const GUTTER = 28;
const GAP = 4;
const MIN_CELL = 11;
const MAX_CELL = 26;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Five-step ramp: absent, then quartiles of the busiest day in range. */
function level(count: number, peak: number): number {
  if (count === 0) return 0;
  if (peak <= 1) return 4;
  return Math.min(4, Math.ceil((count / peak) * 4));
}

const LEVEL_BG = [
  "var(--bg-3)",
  "color-mix(in srgb, var(--ac) 22%, transparent)",
  "color-mix(in srgb, var(--ac) 45%, transparent)",
  "color-mix(in srgb, var(--ac) 70%, transparent)",
  "var(--ac)",
];

/** Group days into week columns, Sunday-first, padding the first week. */
function toWeeks(days: ActivityDay[]): Array<Array<ActivityDay | null>> {
  if (days.length === 0) return [];
  const weeks: Array<Array<ActivityDay | null>> = [];
  let week: Array<ActivityDay | null> = [];

  const firstDow = new Date(`${days[0].date}T00:00:00`).getDay();
  for (let i = 0; i < firstDow; i++) week.push(null);

  for (const d of days) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function shortName(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}

/**
 * Prompt-volume heatmap plus busiest projects, from ~/.claude/history.jsonl.
 * Replaces the constellation view: same slot, but it answers a question the
 * tree does not — when you worked, and on what.
 */
export default function OverviewActivity() {
  const [range, setRange] = useState(182);
  const [data, setData] = useState<ActivityResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<ActivityDay | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchActivity(range)
      .then((r) => {
        if (cancelled) return;
        if (r.error) setErr(r.error);
        else {
          setErr(null);
          setData(r);
        }
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Track the container so cells can grow to fill it instead of sitting at a
  // fixed 11px regardless of how much room the card actually has.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    obs.observe(el);
    setWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const weeks = useMemo(() => toWeeks(data?.days ?? []), [data?.days]);

  // Size cells to the available width: a 3-month range gets large squares, a
  // full year shrinks to MIN_CELL and scrolls horizontally rather than clipping.
  const cell = useMemo(() => {
    if (!width || weeks.length === 0) return MIN_CELL;
    const fit = Math.floor((width - GUTTER) / weeks.length) - GAP;
    return Math.max(MIN_CELL, Math.min(MAX_CELL, fit));
  }, [width, weeks.length]);

  // One label per week column that starts a new month.
  const monthLabels = useMemo(() => {
    const out: Array<{ col: number; label: string }> = [];
    let last = -1;
    weeks.forEach((w, col) => {
      const first = w.find(Boolean);
      if (!first) return;
      const m = new Date(`${first.date}T00:00:00`).getMonth();
      if (m !== last) {
        out.push({ col, label: MONTHS[m] });
        last = m;
      }
    });
    return out;
  }, [weeks]);

  if (err) {
    return (
      <div className="card" style={{ padding: "12px", color: "var(--red)", fontSize: "var(--t-sm)" }}>
        {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card" style={{ padding: "40px 16px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-sm)" }}>
        Loading activity…
      </div>
    );
  }

  const topProjects = data.projects.slice(0, 8);
  const maxProject = topProjects[0]?.count ?? 1;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* OverviewMap owns its own row now, so this header is free to use the
          full width — no reserved corner. */}
      <div className="panel-head">
        <span className="eyebrow truncate">
          <span className="num">{data.total.toLocaleString()}</span> prompts ·{" "}
          <span className="num">{data.projects.length}</span> projects
          {data.streak > 0 && <> · <span className="num">{data.streak}d</span> streak</>}
        </span>
        <div className="seg" role="tablist" aria-label="Activity range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              role="tab"
              aria-selected={range === r.days}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px" }}>
      {/* Heatmap */}
      <div ref={gridRef} style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "inline-block", minWidth: "min-content" }}>
          <div style={{ position: "relative", height: 15, marginLeft: GUTTER }}>
            {monthLabels.map((m) => (
              <span
                key={`${m.col}-${m.label}`}
                style={{
                  position: "absolute",
                  left: m.col * (cell + GAP),
                  fontSize: "var(--t-2xs)",
                  color: "var(--tx-3)",
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: GAP }}>
            <div style={{ display: "grid", gridTemplateRows: `repeat(7, ${cell}px)`, gap: GAP, width: GUTTER - GAP }}>
              {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                <span key={i} style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", lineHeight: `${cell}px` }}>
                  {d}
                </span>
              ))}
            </div>

            {weeks.map((w, col) => (
              <div key={col} style={{ display: "grid", gridTemplateRows: `repeat(7, ${cell}px)`, gap: GAP }}>
                {w.map((d, row) =>
                  d === null ? (
                    <span key={row} style={{ width: cell, height: cell }} />
                  ) : (
                    <span
                      key={row}
                      onMouseEnter={() => setHover(d)}
                      onMouseLeave={() => setHover(null)}
                      title={`${d.count} prompt${d.count !== 1 ? "s" : ""} · ${d.date}`}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: Math.max(2, Math.round(cell / 6)),
                        background: LEVEL_BG[level(d.count, data.peak)],
                        outline: hover?.date === d.date ? "1px solid var(--tx-2)" : "none",
                        cursor: "default",
                      }}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", minHeight: 14 }}>
          {hover
            ? `${hover.count} prompt${hover.count !== 1 ? "s" : ""} · ${hover.date}`
            : `peak ${data.peak} prompts/day`}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--t-2xs)", color: "var(--tx-3)" }}>
          less
          {LEVEL_BG.map((bg, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
          ))}
          more
        </span>
      </div>
      </div>

      {/* Busiest projects */}
      {topProjects.length > 0 && (
        <>
          <div className="panel-head" style={{ borderTop: "1px solid var(--line)" }}>
            <span className="eyebrow">busiest projects</span>
          </div>
          <div style={{ padding: "8px 12px 12px", display: "grid", gap: 4 }}>
            {topProjects.map((p) => (
              <div key={p.project} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="truncate mono" style={{ fontSize: "var(--t-xs)", flex: "0 0 38%", minWidth: 0, color: "var(--tx-2)" }} title={p.project}>
                  {shortName(p.project)}
                </span>
                <span style={{ flex: 1, height: 5, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden", minWidth: 40 }}>
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${Math.max(2, (p.count / maxProject) * 100)}%`,
                      background: "var(--ac)",
                    }}
                  />
                </span>
                <span className="num" style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)", flexShrink: 0, minWidth: 32, textAlign: "right" }}>
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
