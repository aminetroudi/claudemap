"use client";

import { useState } from "react";
import type { AnyItem } from "@/lib/types";
import OverviewGraph from "./OverviewGraph";
import OverviewTree from "./OverviewTree";

type View = "tree" | "constellation";

const MODES: Array<{ id: View; label: string }> = [
  { id: "tree", label: "tree" },
  { id: "constellation", label: "constellation" },
];

export default function OverviewMap({
  items,
  onView,
}: {
  items: AnyItem[];
  onView?: (it: AnyItem) => void;
}) {
  const [mode, setMode] = useState<View>("tree");

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          zIndex: 3,
          display: "flex",
          gap: 2,
          padding: 2,
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              padding: "3px 10px",
              opacity: mode === m.id ? 1 : 0.55,
              fontWeight: mode === m.id ? 600 : 400,
              background: mode === m.id ? "var(--bg-3)" : "transparent",
            }}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "tree" && <OverviewTree items={items} onView={onView} />}
      {mode === "constellation" && <OverviewGraph items={items} onView={onView} />}
    </div>
  );
}
