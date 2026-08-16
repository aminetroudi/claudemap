"use client";

import { useState } from "react";
import type { AnyItem } from "@/lib/types";
import OverviewActivity from "./OverviewActivity";
import OverviewTree from "./OverviewTree";

type View = "tree" | "activity";

const MODES: Array<{ id: View; label: string }> = [
  { id: "tree", label: "tree" },
  { id: "activity", label: "activity" },
];

/**
 * Mode switch for the overview's main panel.
 *
 * The toggle used to be absolutely positioned over the active child's top-right
 * corner, which forced both children to reserve dead space for it
 * (paddingRight: 220 in the tree, 150 in the activity view) and still buried
 * any control they put there. It owns a real row now — nothing overlaps.
 */
export default function OverviewMap({
  items,
  onView,
}: {
  items: AnyItem[];
  onView?: (it: AnyItem) => void;
}) {
  const [mode, setMode] = useState<View>("tree");

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="eyebrow">map</span>
        <div className="seg" role="tablist" aria-label="Overview mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "tree" && <OverviewTree items={items} onView={onView} />}
      {mode === "activity" && <OverviewActivity />}
    </div>
  );
}
