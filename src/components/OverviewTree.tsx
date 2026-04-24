"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Zap, Box, Bot, Brain, BookOpen, Files, Home } from "lucide-react";
import type { AnyItem, ItemKind } from "@/lib/types";
import { kindLabel, shortDate } from "@/lib/client";

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

type TreeNode = {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  items: AnyItem[];
};

function makeNode(name: string, fullPath: string): TreeNode {
  return { name, fullPath, children: new Map(), items: [] };
}

function insert(root: TreeNode, relPath: string, rootAbs: string, item: AnyItem) {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    root.items.push(item);
    return;
  }
  // The last part is the file/dir owning the item; intermediate parts are directories
  let cur = root;
  let abs = rootAbs;
  for (let i = 0; i < parts.length - 1; i++) {
    abs = abs + "/" + parts[i];
    let child = cur.children.get(parts[i]);
    if (!child) {
      child = makeNode(parts[i], abs);
      cur.children.set(parts[i], child);
    }
    cur = child;
  }
  const last = parts[parts.length - 1];
  abs = abs + "/" + last;
  let leaf = cur.children.get(last);
  if (!leaf) {
    leaf = makeNode(last, abs);
    cur.children.set(last, leaf);
  }
  leaf.items.push(item);
}

/** Collapse chains of single-child dirs with no items into "a/b/c" nodes. */
function collapse(node: TreeNode): TreeNode {
  const kids = [...node.children.values()].map(collapse);
  node.children = new Map();
  for (const k of kids) {
    let merged = k;
    while (
      merged.items.length === 0 &&
      merged.children.size === 1
    ) {
      const only = [...merged.children.values()][0];
      merged = {
        name: merged.name + "/" + only.name,
        fullPath: only.fullPath,
        children: only.children,
        items: only.items,
      };
    }
    node.children.set(merged.name, merged);
  }
  return node;
}

function buildRoots(items: AnyItem[]): TreeNode[] {
  // Infer home from any global item whose path contains "/.claude/"
  let claudeBase = "";
  for (const it of items) {
    if (it.projectRoot) continue;
    const m = it.path.match(/^(.*)\/\.claude(\/|$)/);
    if (m) {
      claudeBase = m[1] + "/.claude";
      break;
    }
  }
  const globalRoot: TreeNode = makeNode("~/.claude", claudeBase || "global");
  const projectRoots = new Map<string, TreeNode>();

  for (const it of items) {
    if (it.projectRoot) {
      let root = projectRoots.get(it.projectRoot);
      if (!root) {
        root = makeNode(it.projectRoot, it.projectRoot);
        projectRoots.set(it.projectRoot, root);
      }
      const rel = it.path.startsWith(it.projectRoot)
        ? it.path.slice(it.projectRoot.length)
        : it.path;
      insert(root, rel, it.projectRoot, it);
    } else {
      const rel =
        claudeBase && it.path.startsWith(claudeBase)
          ? it.path.slice(claudeBase.length)
          : it.path;
      insert(globalRoot, rel, claudeBase || "global", it);
    }
  }

  const roots = [globalRoot, ...[...projectRoots.values()].sort((a, b) => a.name.localeCompare(b.name))];
  return roots.map(collapse);
}

function countDescendants(n: TreeNode): { dirs: number; files: number } {
  let dirs = 0;
  let files = n.items.length;
  for (const c of n.children.values()) {
    if (c.items.length === 0 && c.children.size > 0) dirs++;
    const d = countDescendants(c);
    dirs += d.dirs;
    files += d.files;
  }
  return { dirs, files };
}

function Row({
  node,
  depth,
  expanded,
  onToggle,
  onView,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (k: string) => void;
  onView?: (it: AnyItem) => void;
}) {
  const hasChildren = node.children.size > 0;
  const isOpen = expanded.has(node.fullPath);
  const isDir = hasChildren || node.items.length === 0;
  const pad = 10 + depth * 16;

  if (isDir) {
    const { files } = countDescendants(node);
    return (
      <>
        <div
          className="tree-row"
          onClick={() => hasChildren && onToggle(node.fullPath)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: `4px 10px 4px ${pad}px`,
            cursor: hasChildren ? "pointer" : "default",
            fontSize: "var(--t-md)",
            borderRadius: 4,
          }}
        >
          <span style={{ width: 14, display: "inline-flex", color: "var(--tx-3)" }}>
            {hasChildren ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </span>
          <span style={{ color: "var(--tx-3)" }}>
            {depth === 0 ? <Home size={13} /> : isOpen ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <span style={{ fontFamily: "var(--font-mono), monospace" }}>{node.name}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-3)", fontFamily: "var(--font-mono), monospace" }}>
            {files} {files === 1 ? "file" : "files"}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="children"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ overflow: "hidden" }}
            >
              {[...node.children.values()]
                .sort((a, b) => {
                  const ad = a.children.size > 0 || a.items.length === 0;
                  const bd = b.children.size > 0 || b.items.length === 0;
                  if (ad !== bd) return ad ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((c) => (
                  <Row key={c.fullPath} node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onView={onView} />
                ))}
              {node.items.map((it) => (
                <LeafRow key={it.id} item={it} depth={depth + 1} onView={onView} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Leaf-only node (no subdirs) — render its items
  return (
    <>
      {node.items.map((it) => (
        <LeafRow key={it.id} item={it} depth={depth} onView={onView} />
      ))}
    </>
  );
}

function LeafRow({ item, depth, onView }: { item: AnyItem; depth: number; onView?: (it: AnyItem) => void }) {
  const Icon = KIND_ICON[item.kind];
  const pad = 10 + depth * 16;
  return (
    <motion.div
      className="tree-row"
      onClick={() => onView?.(item)}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: `4px 10px 4px ${pad + 14}px`,
        cursor: "pointer",
        fontSize: "var(--t-md)",
        borderRadius: 4,
      }}
    >
      <span style={{ color: KIND_COLOR[item.kind] }}>
        <Icon size={12} />
      </span>
      <span style={{ fontFamily: "var(--font-mono), monospace" }}>{item.name}</span>
      <span className="badge badge-default" style={{ fontSize: 9 }}>
        {kindLabel(item.kind)}
      </span>
      <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-3)", fontFamily: "var(--font-mono), monospace" }}>
        {shortDate(item.modifiedAt)}
      </span>
    </motion.div>
  );
}

export default function OverviewTree({
  items,
  onView,
}: {
  items: AnyItem[];
  onView?: (it: AnyItem) => void;
}) {
  const roots = useMemo(() => buildRoots(items), [items]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Expand all top-level roots by default
    return new Set(roots.map((r) => r.fullPath));
  });

  const toggle = (k: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    const walk = (n: TreeNode) => {
      all.add(n.fullPath);
      for (const c of n.children.values()) walk(c);
    };
    roots.forEach(walk);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set(roots.map((r) => r.fullPath)));

  return (
    <div
      className="card"
      style={{
        position: "relative",
        padding: 0,
        overflow: "auto",
        height: "clamp(520px, 72vh, 900px)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--line)",
          padding: "8px 12px",
          paddingRight: 220,
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 1,
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
          FILE TREE · {items.length} files
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={expandAll}>
            expand all
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={collapseAll}>
            collapse all
          </button>
        </div>
      </div>
      <div style={{ padding: "6px 0" }}>
        {roots.map((r) => (
          <Row key={r.fullPath} node={r} depth={0} expanded={expanded} onToggle={toggle} onView={onView} />
        ))}
      </div>
    </div>
  );
}
