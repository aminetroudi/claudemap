"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Bot, BookOpen, Box, Brain, Files, FolderOpen, Zap } from "lucide-react";
import type { AnyItem, ItemKind } from "@/lib/types";
import { kindLabel, shortDate } from "@/lib/client";
import type { Section } from "./Sidebar";
import OverviewMap from "./OverviewMap";

const STATS: Array<{ kind: ItemKind; icon: React.ReactNode; section: Section; color: string }> = [
  { kind: "skill",     icon: <Zap size={20} />,      section: "skill",     color: "#818cf8" },
  { kind: "plugin",    icon: <Box size={20} />,       section: "plugin",    color: "#fbbf24" },
  { kind: "agent",     icon: <Bot size={20} />,       section: "agent",     color: "#34d399" },
  { kind: "memory",    icon: <Brain size={20} />,     section: "memory",    color: "#c084fc" },
  { kind: "claude-md", icon: <BookOpen size={20} />,  section: "claude-md", color: "#38bdf8" },
  { kind: "loose-md",  icon: <Files size={20} />,     section: "loose-md",  color: "#94a3b8" },
];

export default function OverviewPanel({ items, scannedAt, errors, onSection, onView }: {
  items: AnyItem[];
  scannedAt?: string;
  errors: string[];
  onSection: (s: Section) => void;
  onView?: (it: AnyItem) => void;
}) {
  const byKind: Record<string, AnyItem[]> = {};
  for (const it of items) { if (!byKind[it.kind]) byKind[it.kind] = []; byKind[it.kind].push(it); }
  const projectCount = new Set(items.filter(i => i.projectRoot).map(i => i.projectRoot)).size;
  const recent = [...items].filter(i => i.modifiedAt).sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? "")).slice(0, 10);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Stat grid */}
      <motion.div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.08,
              delayChildren: 0.05,
            },
          },
        }}
      >
        {STATS.map(({ kind, icon, section, color }) => {
          const count = byKind[kind]?.length ?? 0;
          return (
            <motion.button
              key={kind}
              className="card card-interactive"
              onClick={() => onSection(section)}
              style={{ padding: "14px", textAlign: "left" }}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                visible: { opacity: 1, scale: 1 },
              }}
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ color, opacity: count === 0 ? 0.25 : 0.75, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontSize: "var(--t-display)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "var(--font-mono), monospace" }}>
                {count}
              </div>
              <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginTop: 4 }}>
                {kindLabel(kind)}{count !== 1 ? "s" : ""}
              </div>
            </motion.button>
          );
        })}
        <motion.button
          className="card card-interactive"
          onClick={() => onSection("projects")}
          style={{ padding: "14px", textAlign: "left" }}
          variants={{
            hidden: { opacity: 0, scale: 0.9 },
            visible: { opacity: 1, scale: 1 },
          }}
          whileHover={{ y: -4, scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div style={{ color: "#64748b", opacity: 0.75, marginBottom: 10 }}><FolderOpen size={20} /></div>
          <div style={{ fontSize: "var(--t-display)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "var(--font-mono), monospace" }}>
            {projectCount}
          </div>
          <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginTop: 4 }}>Project{projectCount !== 1 ? "s" : ""}</div>
        </motion.button>
      </motion.div>

      {/* Map viz */}
      <OverviewMap items={items} onView={onView} />

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card" style={{ padding: "12px 14px", borderColor: "rgba(251 191 36 / 0.25)", background: "var(--amber-dim)" }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", color: "var(--amber)", fontWeight: 600, fontSize: "var(--t-md)", marginBottom: 6 }}>
            <AlertTriangle size={17} /> {errors.length} scan warning{errors.length !== 1 ? "s" : ""}
          </div>
          {errors.map((e, i) => (
            <div key={i} className="mono" style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", lineHeight: 1.5 }}>{e}</div>
          ))}
        </div>
      )}

      {/* Recent */}
      <motion.div
        className="card"
        style={{ overflow: "hidden" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: "var(--t-md)", fontWeight: 600, color: "var(--tx-3)", letterSpacing: "0.06em", fontFamily: "var(--font-mono), monospace" }}>
          RECENT CHANGES
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: "28px 14px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-md)" }}>
            No items yet — hit Rescan
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05,
                },
              },
            }}
          >
            {recent.map((it, i) => (
              <motion.div
                key={it.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 14px", borderBottom: i < recent.length - 1 ? "1px solid var(--line)" : "none", gap: 10,
                }}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0 },
                }}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
                  <span className="badge badge-default" style={{ flexShrink: 0 }}>{kindLabel(it.kind)}</span>
                  <span className="truncate" style={{ fontSize: "var(--t-md)" }}>{it.name}</span>
                </div>
                <span style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", flexShrink: 0, fontFamily: "var(--font-mono), monospace" }}>
                  {shortDate(it.modifiedAt)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      {scannedAt && (
        <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", fontFamily: "var(--font-mono), monospace" }}>
          scanned · {new Date(scannedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
