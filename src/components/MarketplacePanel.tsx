"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, ExternalLink, Search, Star } from "lucide-react";
import { callAction, searchGitHub } from "@/lib/client";

type GhResult = { fullName: string; description: string | null; url: string; stars: number; updatedAt: string; owner: string; avatar: string };
type Plugin = { name: string; description?: string; category?: string };
type LocalMarketplace = { name: string; path: string; description?: string; plugins: Plugin[] };
type InstalledPlugins = Record<string, boolean>;

export default function MarketplacePanel({
  marketplaces, installedPlugins, onInstalled,
}: {
  marketplaces: LocalMarketplace[];
  installedPlugins: InstalledPlugins;
  onInstalled: () => void;
}) {
  const [tab, setTab] = useState<"registries" | "search">("registries");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"marketplace" | "skill" | "plugin">("marketplace");
  const [results, setResults] = useState<GhResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true); setSearchErr(null);
    try { setResults(await searchGitHub(query, kind)); }
    catch (e) { setSearchErr((e as Error).message); }
    finally { setSearching(false); }
  }

  async function install(fullName: string) {
    setInstalling(fullName);
    try {
      const r = await callAction<{ stdout: string; stderr: string }>({ action: "installPlugin", fullName });
      setInstallMsg(m => ({ ...m, [fullName]: r.stdout || "Installed." }));
      onInstalled();
    } catch (e) {
      setInstallMsg(m => ({ ...m, [fullName]: `Error: ${(e as Error).message}` }));
    } finally { setInstalling(null); }
  }

  const tabs = [
    { id: "registries" as const, label: "Registries" },
    { id: "search" as const,     label: "Search GitHub" },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "7px 14px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? "var(--ac)" : "transparent"}`,
              color: tab === t.id ? "var(--tx)" : "var(--tx-3)",
              fontFamily: "var(--font-sans), sans-serif",
              fontSize: "var(--t-md)",
              fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer",
              transition: "color var(--t) var(--ease), border-color var(--t) var(--ease)",
              marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ── REGISTRIES TAB ── */}
      {tab === "registries" && (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", fontFamily: "var(--font-mono), monospace" }}>
            Registries contain plugins. Expand one to browse and install.
          </p>

          {marketplaces.map(mp => {
            const isOpen = expanded[mp.name] ?? false;
            const installedCount = mp.plugins.filter(p => installedPlugins[`${p.name}@${mp.name}`] !== undefined).length;
            return (
              <div key={mp.name} className="registry-card" style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
                background: "var(--bg-1)",
                transition: "border-color var(--t) var(--ease)",
              }}>
                {/* Registry header — full-width clickable row */}
                <div
                  role="button"
                  tabIndex={0}
                  className="registry-header"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "16px 18px",
                    cursor: "pointer",
                    userSelect: "none",
                    background: isOpen ? "var(--bg-2)" : "transparent",
                    transition: "background var(--t) var(--ease)",
                  }}
                  onClick={() => setExpanded(e => ({ ...e, [mp.name]: !isOpen }))}
                  onKeyDown={e => (e.key === "Enter" || e.key === " ") && setExpanded(ex => ({ ...ex, [mp.name]: !isOpen }))}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, flexShrink: 0,
                      color: "var(--tx-3)",
                      transition: "transform 220ms var(--ease), color var(--t) var(--ease)",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}>
                      <ChevronRight size={18} />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "var(--t-xl)" }}>{mp.name}</span>
                    <span className="badge badge-default">registry</span>
                    {mp.description && (
                      <span className="truncate" style={{ fontSize: "var(--t-md)", color: "var(--tx-3)" }}>{mp.description}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    {installedCount > 0 && <span className="badge badge-green">{installedCount} installed</span>}
                    <span className="badge badge-default">{mp.plugins.length} plugins</span>
                  </div>
                </div>

                {/* Accordion body */}
                <div className={`accordion-body${isOpen ? " open" : ""}`} style={{
                  borderTop: isOpen ? "1px solid var(--line)" : "none",
                  transition: "grid-template-rows 260ms var(--ease), border-top 260ms var(--ease)",
                }}>
                  <div className="accordion-inner">
                    <PluginList
                      plugins={mp.plugins}
                      mpName={mp.name}
                      installedPlugins={installedPlugins}
                      install={install}
                      installing={installing}
                      installMsg={installMsg}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SEARCH TAB ── */}
      {tab === "search" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Search GitHub for skills, plugins…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
            />
            <select className="input" style={{ width: "auto", flex: "none" }} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
              <option value="marketplace">Marketplace</option>
              <option value="skill">Skill</option>
              <option value="plugin">Plugin</option>
            </select>
            <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
              <Search size={16} /> {searching ? "…" : "Search"}
            </button>
          </div>

          {searchErr && (
            <div style={{ padding: "8px 11px", borderRadius: "var(--r)", background: "var(--red-dim)", border: "1px solid rgba(248 113 113 / 0.2)", color: "var(--red)", fontSize: "var(--t-md)" }}>
              {searchErr}
            </div>
          )}

          {results.length === 0 && !searching && query && (
            <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--tx-3)", fontSize: "var(--t-md)" }}>
              No results for "{query}"
            </div>
          )}

          <div style={{ display: "grid", gap: 5 }}>
            {results.map(r => (
              <div key={r.fullName} className="card" style={{ padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                    {r.avatar && <img src={r.avatar} alt={r.owner} width={16} height={16} style={{ borderRadius: "50%" }} />}
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: "var(--ac)", fontSize: "var(--t-xl)", display: "flex", alignItems: "center", gap: 4 }}>
                      {r.fullName} <ExternalLink size={14} />
                    </a>
                    <span className="badge badge-default"><Star size={12} /> {r.stars.toLocaleString()}</span>
                  </div>
                  {r.description && <div style={{ fontSize: "var(--t-md)", color: "var(--tx-2)" }}>{r.description}</div>}
                  {installMsg[r.fullName] && (
                    <div className="mono" style={{ fontSize: "var(--t-md)", marginTop: 5, color: "var(--green)" }}>{installMsg[r.fullName]}</div>
                  )}
                </div>
                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => install(r.fullName)} disabled={installing === r.fullName}>
                  <Download size={16} /> {installing === r.fullName ? "…" : "Install"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PluginList({ plugins, mpName, installedPlugins, install, installing, installMsg }: {
  plugins: Plugin[];
  mpName: string;
  installedPlugins: InstalledPlugins;
  install: (fn: string) => Promise<void>;
  installing: string | null;
  installMsg: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? plugins.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.description ?? "").toLowerCase().includes(q.toLowerCase()))
    : plugins;

  return (
    <div>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <input
          className="input"
          style={{ fontSize: "var(--t-md)" }}
          placeholder={`Filter ${plugins.length} plugins…`}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {filtered.map((p, i) => {
          const fullName = `${p.name}@${mpName}`;
          const isInstalled = installedPlugins[fullName] !== undefined;
          const msg = installMsg[fullName];
          return (
            <div key={p.name} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              padding: "8px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--t-md)", fontWeight: 500 }}>{p.name}</span>
                  {p.category && <span className="badge badge-default">{p.category}</span>}
                  {isInstalled && <span className="badge badge-green"><Check size={12} /> installed</span>}
                </div>
                {p.description && <div style={{ fontSize: "var(--t-md)", color: "var(--tx-3)", marginTop: 2 }}>{p.description}</div>}
                {msg && <div className="mono" style={{ fontSize: "var(--t-sm)", marginTop: 3, color: msg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>{msg}</div>}
              </div>
              <button
                className={isInstalled ? "btn" : "btn btn-primary"}
                style={{ flexShrink: 0 }}
                onClick={() => install(fullName)}
                disabled={installing === fullName}
              >
                <Download size={11} /> {installing === fullName ? "…" : isInstalled ? "Reinstall" : "Install"}
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "20px 14px", color: "var(--tx-3)", fontSize: "var(--t-md)" }}>No matches for "{q}"</div>
        )}
      </div>
    </div>
  );
}
