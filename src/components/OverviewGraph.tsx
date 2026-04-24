"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Box, Bot, Brain, BookOpen, Files } from "lucide-react";
import type { AnyItem, ItemKind, PluginItem, SkillItem, AgentItem, MemoryItem } from "@/lib/types";
import { kindLabel } from "@/lib/client";

type Mode = "kind" | "project";

const KIND_ORDER: ItemKind[] = ["skill", "plugin", "agent", "memory", "claude-md", "loose-md"];
const KIND_COLOR: Record<ItemKind, string> = {
  skill: "#818cf8",
  plugin: "#fbbf24",
  agent: "#34d399",
  memory: "#c084fc",
  "claude-md": "#38bdf8",
  "loose-md": "#94a3b8",
};
const KIND_ICON: Record<ItemKind, React.ComponentType<{ size?: number; color?: string }>> = {
  skill: Zap,
  plugin: Box,
  agent: Bot,
  memory: Brain,
  "claude-md": BookOpen,
  "loose-md": Files,
};

type Node = {
  item: AnyItem;
  x: number;
  y: number;
  r: number;
  color: string;
};

type Cluster = {
  key: string;
  label: string;
  cx: number;
  cy: number;
  count: number;
  color: string;
};

type Edge = { from: string; to: string; kind: "plugin-owns" | "memory-index" };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function sizeOf(it: AnyItem): number {
  if (it.size) return it.size;
  const m = it.meta as { bytes?: number } | undefined;
  return m?.bytes ?? 100;
}

function shortProject(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function layout(
  items: AnyItem[],
  w: number,
  h: number,
  mode: Mode,
): { nodes: Node[]; clusters: Cluster[]; nodeById: Map<string, Node> } {
  const cx = w / 2;
  const cy = h / 2;

  // Group items into buckets
  const buckets = new Map<string, AnyItem[]>();
  const bucketMeta = new Map<string, { label: string; color: string }>();

  if (mode === "kind") {
    for (const k of KIND_ORDER) {
      buckets.set(k, []);
      bucketMeta.set(k, { label: kindLabel(k), color: KIND_COLOR[k] });
    }
    for (const it of items) buckets.get(it.kind)?.push(it);
  } else {
    const projectSet = new Set<string>();
    for (const it of items) if (it.projectRoot) projectSet.add(it.projectRoot);
    const projects = [...projectSet].sort();
    buckets.set("__global", []);
    bucketMeta.set("__global", { label: "global", color: "#94a3b8" });
    for (const p of projects) {
      buckets.set(p, []);
      bucketMeta.set(p, { label: shortProject(p), color: "#38bdf8" });
    }
    for (const it of items) buckets.get(it.projectRoot ?? "__global")?.push(it);
  }

  const keys = [...buckets.keys()];
  const n = keys.length;
  const ringR = Math.min(w, h) * (n > 8 ? 0.38 : 0.33);

  const clusters: Cluster[] = keys.map((key, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const meta = bucketMeta.get(key)!;
    return {
      key,
      label: meta.label,
      cx: n === 1 ? cx : cx + Math.cos(a) * ringR,
      cy: n === 1 ? cy : cy + Math.sin(a) * ringR,
      count: buckets.get(key)?.length ?? 0,
      color: meta.color,
    };
  });

  const nodes: Node[] = [];
  const nodeById = new Map<string, Node>();
  for (const cluster of clusters) {
    const arr = buckets.get(cluster.key) ?? [];
    const maxBytes = Math.max(1, ...arr.map(sizeOf));
    arr.forEach((it, idx) => {
      const spiralR = Math.sqrt(idx + 0.5) * 9;
      const a = idx * GOLDEN;
      const bytes = sizeOf(it);
      const r = 1.5 + 2.2 * Math.sqrt(bytes / maxBytes);
      const node: Node = {
        item: it,
        x: cluster.cx + Math.cos(a) * spiralR,
        y: cluster.cy + Math.sin(a) * spiralR,
        r,
        color: KIND_COLOR[it.kind],
      };
      nodes.push(node);
      nodeById.set(it.id, node);
    });
  }
  return { nodes, clusters, nodeById };
}

function buildEdges(items: AnyItem[]): Edge[] {
  const edges: Edge[] = [];
  const pluginsByFullName = new Map<string, PluginItem>();
  for (const it of items) {
    if (it.kind === "plugin") pluginsByFullName.set((it as PluginItem).meta.fullName, it as PluginItem);
  }
  // plugin-owned skills/agents → plugin
  for (const it of items) {
    if (it.kind === "skill") {
      const pn = (it as SkillItem).meta.pluginName;
      if (pn && pluginsByFullName.has(pn)) {
        edges.push({ from: pluginsByFullName.get(pn)!.id, to: it.id, kind: "plugin-owns" });
      }
    }
    if (it.kind === "agent") {
      const meta = (it as AgentItem).meta as { pluginName?: string };
      if (meta.pluginName && pluginsByFullName.has(meta.pluginName)) {
        edges.push({ from: pluginsByFullName.get(meta.pluginName)!.id, to: it.id, kind: "plugin-owns" });
      }
    }
  }
  // memory index
  const memIndex = items.find(
    (i) => i.kind === "memory" && (i as MemoryItem).meta.memoryType === "index",
  );
  if (memIndex) {
    for (const it of items) {
      if (it.kind === "memory" && it.id !== memIndex.id && (it as MemoryItem).meta.indexed) {
        edges.push({ from: memIndex.id, to: it.id, kind: "memory-index" });
      }
    }
  }
  return edges;
}

export default function OverviewGraph({
  items,
  onView,
}: {
  items: AnyItem[];
  onView?: (it: AnyItem) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 640 });
  const [hover, setHover] = useState<Node | null>(null);
  const [mode, setMode] = useState<Mode>("project");
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: number } | null>(null);
  const lastDragDistRef = useRef(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      const cr = e.contentRect;
      const h = Math.max(520, Math.min(900, Math.round(window.innerHeight * 0.72)));
      setSize({ w: Math.max(320, cr.width), h });
    });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const HEADER_H = 42;
  const innerH = Math.max(200, size.h - HEADER_H);
  const { nodes, clusters, nodeById } = useMemo(
    () => layout(items, size.w, innerH, mode),
    [items, size.w, innerH, mode],
  );
  const edges = useMemo(() => buildEdges(items), [items]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newS = Math.min(6, Math.max(0.4, v.s * factor));
        const k = newS / v.s;
        const tx = mx - k * (mx - v.tx);
        const ty = my - k * (my - v.ty);
        return { tx, ty, s: newS };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: 0 };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.moved = Math.max(d.moved, Math.hypot(dx, dy));
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    };
    const onUp = () => {
      lastDragDistRef.current = dragRef.current?.moved ?? 0;
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const reset = () => setView({ tx: 0, ty: 0, s: 1 });

  const showIcons = view.s >= 2.5;
  const transform = `translate(${view.tx} ${view.ty}) scale(${view.s})`;

  return (
    <div
      ref={wrapRef}
      className="card"
      style={{ position: "relative", padding: 0, overflow: "hidden", height: size.h, display: "flex", flexDirection: "column" }}
    >
      {/* Header (matches tree view) */}
      <div
        style={{
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--line)",
          padding: "8px 12px",
          paddingRight: 220,
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 2,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: "var(--t-md)",
            fontWeight: 600,
            color: "var(--tx-3)",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          CONSTELLATION · {items.length} files · {edges.length} links
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              opacity: mode === "kind" ? 1 : 0.55,
              fontWeight: mode === "kind" ? 600 : 400,
            }}
            onClick={() => setMode("kind")}
          >
            by kind
          </button>
          <button
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              opacity: mode === "project" ? 1 : 0.55,
              fontWeight: mode === "project" ? 600 : 400,
            }}
            onClick={() => setMode("project")}
          >
            by project
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={reset}
            title="Reset view"
          >
            reset
          </button>
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>

      <svg
        ref={svgRef}
        width={size.w}
        height={innerH}
        style={{ display: "block", cursor: dragRef.current ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
      >
        <defs>
          {KIND_ORDER.map((k) => (
            <radialGradient key={k} id={`glow-${k}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={KIND_COLOR[k]} stopOpacity="0.12" />
              <stop offset="100%" stopColor={KIND_COLOR[k]} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="glow-cluster" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background capture for pan */}
        <rect x={0} y={0} width={size.w} height={innerH} fill="transparent" />

        <g transform={transform}>
          {/* Cluster halos */}
          {clusters.map((c) => (
            <g key={c.key}>
              <circle
                cx={c.cx}
                cy={c.cy}
                r={Math.max(40, 14 + Math.sqrt(c.count) * 14)}
                fill={mode === "kind" && c.key in KIND_COLOR ? `url(#glow-${c.key})` : "url(#glow-cluster)"}
              />
              <text
                x={c.cx}
                y={c.cy + Math.max(40, 14 + Math.sqrt(c.count) * 14) + 12}
                textAnchor="middle"
                fill="var(--tx-3)"
                opacity={0.6}
                style={{
                  fontSize: 9.5,
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {c.label} · {c.count}
              </text>
            </g>
          ))}

          {/* Edges */}
          <g strokeLinecap="round">
            {edges.map((e, i) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              const highlighted =
                hover && (hover.item.id === e.from || hover.item.id === e.to);
              const stroke = e.kind === "plugin-owns" ? "#fbbf24" : "#c084fc";
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeOpacity={highlighted ? 0.7 : 0.12}
                  strokeWidth={highlighted ? 0.8 : 0.35}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>

          {/* Nodes */}
          {nodes.map((n, i) => {
            const Icon = KIND_ICON[n.item.kind];
            return (
              <g
                key={n.item.id}
                data-node
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (lastDragDistRef.current > 4) return;
                  onView?.(n.item);
                }}
              >
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={n.color}
                  fillOpacity={n.item.scope === "global" ? 0.95 : 0.4}
                  stroke={n.item.scope === "project" ? n.color : "transparent"}
                  strokeWidth={0.7}
                  strokeOpacity={0.9}
                  vectorEffect="non-scaling-stroke"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: Math.min(0.8, i * 0.003),
                    type: "spring",
                    stiffness: 180,
                    damping: 16,
                  }}
                  whileHover={{ scale: 2.2 }}
                />
                {showIcons && (
                  <g transform={`translate(${n.x - 7} ${n.y - 7})`} pointerEvents="none">
                    <Icon size={14} color="#0b0d12" />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 12,
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: "var(--tx-3)",
          fontFamily: "var(--font-mono), monospace",
          pointerEvents: "none",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--tx-2)", opacity: 0.9, marginRight: 4 }} />
          global
        </span>
        <span>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "1px solid var(--tx-2)", background: "transparent", marginRight: 4 }} />
          project
        </span>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 2, background: "#fbbf24", marginRight: 4, verticalAlign: "middle" }} />
          plugin owns
        </span>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 2, background: "#c084fc", marginRight: 4, verticalAlign: "middle" }} />
          mem index
        </span>
        <span>· scroll=zoom · drag=pan</span>
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 12,
          fontSize: 10,
          color: "var(--tx-3)",
          fontFamily: "var(--font-mono), monospace",
          pointerEvents: "none",
        }}
      >
        {(view.s * 100).toFixed(0)}%
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(size.w - 260, hover.x * view.s + view.tx + 14),
            top: Math.max(8, hover.y * view.s + view.ty - 44),
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "6px 9px",
            fontSize: "var(--t-sm)",
            pointerEvents: "none",
            maxWidth: 280,
            zIndex: 3,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: hover.color,
              }}
            />
            <span style={{ fontWeight: 600 }}>{hover.item.name}</span>
            <span className="badge badge-default" style={{ marginLeft: "auto" }}>
              {kindLabel(hover.item.kind)}
            </span>
          </div>
          <div className="mono truncate" style={{ color: "var(--tx-3)", fontSize: 10 }}>
            {hover.item.path}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
