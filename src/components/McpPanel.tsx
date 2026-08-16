"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Cloud, Edit2, Eye, EyeOff, FolderOpen, Globe, Plus, Server, Terminal, Trash2, X } from "lucide-react";
import { callAction } from "@/lib/client";
import type { CloudMcpServer, McpServer } from "@/lib/types";

// ── McpPanel ─────────────────────────────────────────────────────
export default function McpPanel({
  servers,
  cloudServers,
  errors,
  projects,
  onChanged,
}: {
  servers: McpServer[];
  cloudServers: CloudMcpServer[];
  errors: string[];
  projects: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const global = servers.filter(s => s.scope === "global");
  const home = servers.filter(s => s.scope === "home");
  const byProject: Record<string, McpServer[]> = {};
  for (const s of servers.filter(s => s.scope === "project")) {
    const key = s.projectRoot ?? "unknown";
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(s);
  }

  async function deleteServer(s: McpServer) {
    setDeleting(s.name);
    setErrMsg(null);
    try {
      await callAction({ action: "deleteMcp", mcpName: s.name, mcpScope: s.scope, projectRoot: s.projectRoot });
      onChanged();
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Header actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)" }}>
          {servers.length} server{servers.length !== 1 ? "s" : ""} configured
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add Server
        </button>
      </div>

      {errMsg && (
        <div style={{ padding: "7px 11px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>
          {errMsg}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ padding: "7px 11px", borderRadius: "var(--r)", background: "var(--amber-dim)", border: "1px solid rgba(251 191 36 / 0.2)", color: "var(--amber)", fontSize: "var(--t-sm)" }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      {/* Global servers (~/.claude.json) */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Globe size={16} style={{ color: "var(--ac)" }} />
          <span style={{ fontWeight: 600, fontSize: "var(--t-xl)" }}>Global</span>
          <span className="badge badge-default" style={{ fontSize: "var(--t-sm)" }}>~/.claude.json</span>
          <span className="badge badge-ac">{global.length}</span>
        </div>
        {global.length === 0 ? (
          <div className="card" style={{ padding: "28px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-md)" }}>
            No global MCP servers. Add one above.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {global.map(s => (
              <ServerRow key={s.name} server={s} onEdit={() => setEditing(s)} onDelete={() => deleteServer(s)} deleting={deleting === s.name} />
            ))}
          </div>
        )}
      </section>

      {/* Home-level servers (~/.mcp.json) */}
      {home.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Globe size={16} style={{ color: "var(--green)" }} />
            <span style={{ fontWeight: 600, fontSize: "var(--t-xl)" }}>Home</span>
            <span className="badge badge-default" style={{ fontSize: "var(--t-sm)" }}>~/.mcp.json</span>
            <span className="badge badge-green">{home.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {home.map(s => (
              <ServerRow key={s.name} server={s} onEdit={() => setEditing(s)} onDelete={() => deleteServer(s)} deleting={deleting === s.name} />
            ))}
          </div>
        </section>
      )}

      {/* Project-scoped servers */}
      {Object.entries(byProject).map(([root, list]) => (
        <section key={root}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <FolderOpen size={16} style={{ color: "var(--amber)" }} />
            <span className="mono truncate" style={{ fontWeight: 600, fontSize: "var(--t-md)" }} title={root}>{root}</span>
            <span className="badge badge-amber">{list.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {list.map(s => (
              <ServerRow key={s.name} server={s} onEdit={() => setEditing(s)} onDelete={() => deleteServer(s)} deleting={deleting === s.name} />
            ))}
          </div>
        </section>
      ))}

      {/* Cloud MCPs — inferred from mcp__*__* permission entries */}
      {cloudServers.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Cloud size={16} style={{ color: "#a78bfa" }} />
            <span style={{ fontWeight: 600, fontSize: "var(--t-xl)" }}>Cloud / Remote</span>
            <span className="badge badge-default" style={{ fontSize: "var(--t-sm)" }}>inferred from permissions</span>
            <span className="badge" style={{ background: "rgba(167 139 250 / 0.12)", color: "#a78bfa", border: "1px solid rgba(167 139 250 / 0.25)", fontSize: "var(--t-xs)" }}>{cloudServers.length}</span>
          </div>
          <div style={{ marginBottom: 8, fontSize: "var(--t-sm)", color: "var(--tx-3)" }}>
            These servers are connected via claude.ai or remote URL — not locally configured. Detected from <span className="mono" style={{ fontSize: "var(--t-sm)" }}>mcp__*</span> permission entries in project settings.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {cloudServers.map(s => (
              <CloudServerRow key={s.name} server={s} />
            ))}
          </div>
        </section>
      )}

      {servers.length === 0 && cloudServers.length === 0 && errors.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <Server size={32} style={{ color: "var(--tx-3)", margin: "0 auto 14px" }} />
          <div style={{ fontSize: "var(--t-xl)", color: "var(--tx-2)", marginBottom: 6 }}>No MCP servers configured</div>
          <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginBottom: 18 }}>MCP servers extend Claude with tools like databases, APIs, and file systems.</div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add your first server
          </button>
        </div>
      )}

      {/* Add / Edit modal */}
      {(adding || editing) && (
        <McpFormModal
          initial={editing ?? undefined}
          projects={projects}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

// ── ServerRow ─────────────────────────────────────────────────────
function ServerRow({ server, onEdit, onDelete, deleting }: {
  server: McpServer;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);
  const hasEnv = server.env && Object.keys(server.env).length > 0;
  const hasArgs = server.args && server.args.length > 0;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "var(--r)", background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Terminal size={17} style={{ color: "var(--ac)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: "var(--t-xl)" }}>{server.name}</span>
            {server.type && <span className="badge badge-default">{server.type}</span>}
            <span className={`badge ${server.scope === "global" ? "badge-ac" : server.scope === "home" ? "badge-green" : "badge-amber"}`}>{server.scope}</span>
            {server.disabled && <span className="badge badge-red">disabled</span>}
          </div>
          <div className="mono truncate faint" style={{ fontSize: "var(--t-sm)" }}>
            {server.command ? `${server.command}${hasArgs ? " " + server.args!.join(" ") : ""}` : server.url ?? "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {(hasArgs || hasEnv) && (
            <button className="btn btn-ghost btn-icon" onClick={() => setExpanded(v => !v)} title="Details">
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={onEdit} title="Edit">
            <Edit2 size={16} />
          </button>
          {confirming ? (
            <>
              <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#0a0a14" }} onClick={() => { setConfirming(false); onDelete(); }} disabled={deleting}>
                <Trash2 size={15} /> Confirm delete
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => setConfirming(false)} disabled={deleting} title="Cancel">
                <X size={15} />
              </button>
            </>
          ) : (
            <button className="btn btn-danger btn-icon" onClick={() => setConfirming(true)} disabled={deleting} title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      <div className={`accordion-body${expanded ? " open" : ""}`} style={{ borderTop: expanded ? "1px solid var(--line)" : "none" }}>
        <div className="accordion-inner">
          <div style={{ padding: "10px 12px", display: "grid", gap: 10 }}>
            {hasArgs && (
              <div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 4, fontFamily: "var(--font-mono), monospace" }}>ARGS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {server.args!.map((a, i) => (
                    <span key={i} className="badge badge-default mono" style={{ fontSize: "var(--t-sm)", wordBreak: "break-all" }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
            {hasEnv && (
              <div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 4, fontFamily: "var(--font-mono), monospace" }}>ENV</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {Object.entries(server.env!).map(([k, v]) => (
                    <EnvRow key={k} envKey={k} envVal={v} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mask sensitive env values by default
function EnvRow({ envKey, envVal }: { envKey: string; envVal: string }) {
  const [show, setShow] = useState(false);
  const isSensitive = /key|secret|pass|token|pwd|credential/i.test(envKey);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", borderRadius: "var(--r)", padding: "6px 10px" }}>
      <span className="mono" style={{ fontSize: "var(--t-sm)", color: "var(--ac)", flexShrink: 0 }}>{envKey}</span>
      <span style={{ color: "var(--tx-3)", flexShrink: 0 }}>=</span>
      <span className="mono truncate" style={{ fontSize: "var(--t-sm)", flex: 1 }}>
        {isSensitive && !show ? "•".repeat(Math.min(envVal.length, 20)) : envVal}
      </span>
      {isSensitive && (
        <button className="btn btn-ghost btn-icon" style={{ padding: 4, minHeight: 0, minWidth: 0 }} onClick={() => setShow(v => !v)}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
    </div>
  );
}

// ── CloudServerRow ────────────────────────────────────────────────
function CloudServerRow({ server }: { server: CloudMcpServer }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card" style={{ overflow: "hidden", borderColor: "rgba(167 139 250 / 0.2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "var(--r)", background: "rgba(167 139 250 / 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Cloud size={17} style={{ color: "#a78bfa" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: "var(--t-xl)" }}>{server.displayName}</span>
            <span className="badge" style={{ background: "rgba(167 139 250 / 0.12)", color: "#a78bfa", border: "1px solid rgba(167 139 250 / 0.25)", fontSize: "var(--t-xs)" }}>cloud</span>
            <span className="badge badge-default">{server.tools.length} tools</span>
          </div>
          <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
            Authorized in {server.projects.length > 0 ? server.projects.length + " project(s)" : "global settings"}
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={() => setExpanded(v => !v)} title="Show tools">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <div className={`accordion-body${expanded ? " open" : ""}`} style={{ borderTop: expanded ? "1px solid var(--line)" : "none" }}>
        <div className="accordion-inner">
          <div style={{ padding: "10px 12px", display: "grid", gap: 12 }}>
            {server.projects.length > 0 && (
              <div>
                <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6, fontFamily: "var(--font-mono), monospace" }}>AUTHORIZED IN PROJECTS</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {server.projects.map(p => (
                    <div key={p} className="mono faint" style={{ fontSize: "var(--t-sm)" }}>{p}</div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6, fontFamily: "var(--font-mono), monospace" }}>PERMITTED TOOLS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {server.tools.map(t => (
                  <span key={t} className="badge badge-default mono" style={{ fontSize: "var(--t-xs)" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── McpFormModal ──────────────────────────────────────────────────
type FormState = {
  name: string;
  type: string;
  command: string;
  args: string;      // newline-separated
  url: string;
  scope: "global" | "home" | "project";
  projectRoot: string;
  envPairs: { key: string; value: string }[];
};

function McpFormModal({ initial, projects, onClose, onSaved }: {
  initial?: McpServer;
  projects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? "",
    type: initial?.type ?? "stdio",
    command: initial?.command ?? "",
    args: (initial?.args ?? []).join("\n"),
    url: initial?.url ?? "",
    scope: initial?.scope ?? "global",
    projectRoot: initial?.projectRoot ?? projects[0] ?? "",
    envPairs: Object.entries(initial?.env ?? {}).map(([key, value]) => ({ key, value })),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addEnvPair() {
    setForm(f => ({ ...f, envPairs: [...f.envPairs, { key: "", value: "" }] }));
  }
  function removeEnvPair(i: number) {
    setForm(f => ({ ...f, envPairs: f.envPairs.filter((_, idx) => idx !== i) }));
  }
  function setEnvPair(i: number, field: "key" | "value", val: string) {
    setForm(f => {
      const pairs = [...f.envPairs];
      pairs[i] = { ...pairs[i], [field]: val };
      return { ...f, envPairs: pairs };
    });
  }

  async function submit() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (form.type === "stdio" && !form.command.trim()) { setErr("Command is required for stdio type"); return; }
    if (form.type !== "stdio" && !form.url.trim()) { setErr("URL is required for non-stdio type"); return; }

    const server: McpServer = {
      name: form.name.trim(),
      type: form.type || undefined,
      command: form.type === "stdio" ? form.command.trim() : undefined,
      args: form.type === "stdio" ? form.args.split("\n").map(s => s.trim()).filter(Boolean) : undefined,
      url: form.type !== "stdio" ? form.url.trim() : undefined,
      env: Object.fromEntries(form.envPairs.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value])),
      scope: form.scope,
      projectRoot: form.scope === "project" ? form.projectRoot : undefined,
    };

    setBusy(true); setErr(null);
    try {
      if (initial) {
        await callAction({ action: "updateMcp", oldName: initial.name, server });
      } else {
        await callAction({ action: "addMcp", server });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isStdio = form.type === "stdio";

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0 0 0 / 0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        className="card modal-sheet"
        style={{ width: "min(900px,100%)", maxHeight: "90dvh", display: "flex", flexDirection: "column", background: "var(--bg-1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "var(--t-2xl)" }}>{initial ? "Edit MCP Server" : "Add MCP Server"}</div>
          <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", marginTop: 2 }}>
            {initial ? `Editing "${initial.name}"` : "Configure a new MCP server"}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "grid", gap: 16 }}>
          {err && (
            <div style={{ padding: "7px 11px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-sm)" }}>
              {err}
            </div>
          )}

          {/* Name + Type row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>Server name *</label>
              <input className="input" placeholder="my-server" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>Type</label>
              <select className="input" style={{ width: "auto" }} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
              </select>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 8 }}>Scope</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["global", "home", "project"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`btn ${form.scope === s ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setForm(f => ({ ...f, scope: s }))}
                >
                  {s === "global" ? <Globe size={15} /> : s === "home" ? <Globe size={15} /> : <FolderOpen size={15} />}
                  {s === "global" ? "Global (~/.claude.json)" : s === "home" ? "Home (~/.mcp.json)" : "Project (.mcp.json)"}
                </button>
              ))}
            </div>
            {form.scope === "project" && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>Project root</label>
                {projects.length > 0 ? (
                  <select className="input" value={form.projectRoot} onChange={e => setForm(f => ({ ...f, projectRoot: e.target.value }))}>
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input className="input" placeholder="/path/to/project" value={form.projectRoot} onChange={e => setForm(f => ({ ...f, projectRoot: e.target.value }))} />
                )}
              </div>
            )}
          </div>

          {/* Command / URL */}
          {isStdio ? (
            <>
              <div>
                <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>Command *</label>
                <input className="input mono" placeholder="npx / node / python3 …" value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>
                  Args <span style={{ opacity: 0.6 }}>(one per line)</span>
                </label>
                <textarea
                  className="input mono"
                  style={{ resize: "vertical", minHeight: 90, fontSize: "var(--t-sm)", lineHeight: 1.6 }}
                  placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/home/user"}
                  value={form.args}
                  onChange={e => setForm(f => ({ ...f, args: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: "block", fontSize: "var(--t-sm)", color: "var(--tx-3)", marginBottom: 6 }}>URL *</label>
              <input className="input mono" placeholder="https://…" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            </div>
          )}

          {/* Env vars */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)" }}>Environment variables</label>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", minHeight: 0 }} onClick={addEnvPair}>
                <Plus size={14} /> Add
              </button>
            </div>
            {form.envPairs.length === 0 ? (
              <div style={{ fontSize: "var(--t-sm)", color: "var(--tx-3)", padding: "10px 0" }}>No env vars set.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {form.envPairs.map((pair, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
                    <input className="input mono" style={{ fontSize: "var(--t-sm)" }} placeholder="KEY" value={pair.key} onChange={e => setEnvPair(i, "key", e.target.value)} />
                    <input className="input mono" style={{ fontSize: "var(--t-sm)" }} placeholder="value" value={pair.value} onChange={e => setEnvPair(i, "value", e.target.value)} />
                    <button className="btn btn-danger btn-icon" onClick={() => removeEnvPair(i)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add server"}
          </button>
        </div>
      </div>
    </div>
  );
}
