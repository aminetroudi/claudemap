"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command } from "cmdk";
import { Search, Zap, Box, Bot, Brain, BookOpen, Files, FolderOpen, Server, Store, Settings, LayoutDashboard } from "lucide-react";
import type { Section } from "./Sidebar";
import type { AnyItem } from "@/lib/types";

interface CommandPaletteProps {
  sections: Array<{ id: Section; label: string; icon: React.ReactNode }>;
  items: AnyItem[];
  onNavigate: (section: Section) => void;
  onViewItem: (item: AnyItem) => void;
}

export default function CommandPalette({
  sections,
  items,
  onNavigate,
  onViewItem,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Cmd+K to toggle, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const filteredItems = search.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ backdropFilter: "blur(4px)" }}
          />
          <motion.div
            className="fixed left-1/2 top-1/4 z-50 w-full max-w-md -translate-x-1/2 overflow-hidden rounded-lg"
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            style={{ background: "var(--bg-2)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}
          >
            <Command
              className="command"
              style={{
                "--cmdk-border-radius": "8px",
              } as React.CSSProperties}
            >
              <div
                className="command-input-wrapper"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 11px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <Search size={16} style={{ color: "var(--tx-3)" }} />
                <Command.Input
                  placeholder="Search sections, items, actions..."
                  value={search}
                  onValueChange={setSearch}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    color: "var(--tx-1)",
                    fontSize: "var(--t-base)",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)" }}>ESC</span>
              </div>

              <Command.List
                style={{
                  maxHeight: 300,
                  overflowY: "auto",
                  padding: "6px 0",
                }}
              >
                {/* Sections */}
                {!search && (
                  <>
                    <Command.Group
                      heading="Navigate"
                      style={{
                        padding: "8px 0",
                        fontSize: "var(--t-2xs)",
                        color: "var(--tx-3)",
                        fontFamily: "var(--font-mono), monospace",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {sections.map((s) => (
                        <Command.Item
                          key={s.id}
                          value={s.id}
                          onSelect={() => {
                            onNavigate(s.id);
                            setOpen(false);
                            setSearch("");
                          }}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: "var(--t-xs)",
                            color: "var(--tx-2)",
                          }}
                        >
                          {s.icon}
                          {s.label}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}

                {/* Items */}
                {filteredItems.length > 0 && (
                  <Command.Group
                    heading="Items"
                    style={{
                      padding: "8px 0",
                      fontSize: "var(--t-2xs)",
                      color: "var(--tx-3)",
                      fontFamily: "var(--font-mono), monospace",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {filteredItems.slice(0, 8).map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.name}
                        onSelect={() => {
                          onViewItem(item);
                          setOpen(false);
                          setSearch("");
                        }}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "var(--t-xs)",
                          color: "var(--tx-2)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 500 }}>{item.name}</span>
                          {item.description && (
                            <div style={{ fontSize: "var(--t-2xs)", color: "var(--tx-3)" }}>
                              {item.description.substring(0, 50)}
                            </div>
                          )}
                        </span>
                        <span
                          className="badge badge-default"
                          style={{ flexShrink: 0, fontSize: "var(--t-2xs)" }}
                        >
                          {item.kind}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Empty style={{ padding: "20px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-xs)" }}>
                  No results found.
                </Command.Empty>
              </Command.List>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "8px 10px",
                  borderTop: "1px solid var(--line)",
                  fontSize: "var(--t-2xs)",
                  color: "var(--tx-3)",
                }}
              >
                <span>⌘K</span>
                <span>Toggle</span>
                <span style={{ marginLeft: "auto" }}>↵ Select</span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
