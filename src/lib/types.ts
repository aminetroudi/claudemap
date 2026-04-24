export type Scope = "global" | "project";

export type ItemKind =
  | "skill"
  | "plugin"
  | "agent"
  | "memory"
  | "claude-md"
  | "loose-md";

export interface BaseItem {
  id: string; // stable id (kind + path hash)
  kind: ItemKind;
  scope: Scope;
  name: string;
  path: string; // absolute path to file or folder
  size?: number;
  modifiedAt?: string; // ISO
  description?: string;
  tags?: string[];
  // For project-scoped items, the project root
  projectRoot?: string;
  // Free-form extra metadata per-kind
  meta?: Record<string, unknown>;
}

export interface SkillItem extends BaseItem {
  kind: "skill";
  meta: {
    skillName?: string;
    triggers?: string;
    bodyPreview?: string;
    pluginOwned?: boolean; // came from a plugin install
    pluginName?: string;
  };
}

export interface PluginItem extends BaseItem {
  kind: "plugin";
  meta: {
    fullName: string; // e.g. caveman@caveman
    marketplace: string;
    version?: string;
    installedAt?: string;
    enabled: boolean;
    skills?: string[];
    commands?: string[];
    agents?: string[];
  };
}

export interface AgentItem extends BaseItem {
  kind: "agent";
  meta: {
    model?: string;
    tools?: string[];
    bodyPreview?: string;
  };
}

export interface MemoryItem extends BaseItem {
  kind: "memory";
  meta: {
    memoryType?: string;
    indexed?: boolean; // listed in MEMORY.md
  };
}

export interface ClaudeMdItem extends BaseItem {
  kind: "claude-md";
  meta: {
    bytes: number;
  };
}

export interface LooseMdItem extends BaseItem {
  kind: "loose-md";
  meta: {
    bytes: number;
    headingPreview?: string;
  };
}

export type AnyItem =
  | SkillItem
  | PluginItem
  | AgentItem
  | MemoryItem
  | ClaudeMdItem
  | LooseMdItem;

// ── MCP Servers ──────────────────────────────────────────
export interface McpServer {
  name: string;
  type?: "stdio" | "sse" | string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;        // for SSE/HTTP transport
  scope: "global" | "home" | "project";
  projectRoot?: string;
  disabled?: boolean;  // listed in disabledMcpjsonServers
}

/** A cloud/remote MCP server inferred from mcp__<name>__<tool> permission entries */
export interface CloudMcpServer {
  name: string;          // e.g. "claude_ai_Atlassian"
  displayName: string;   // e.g. "Atlassian"
  tools: string[];       // all unique tool names seen
  projects: string[];    // project roots where it's authorized
}

export interface McpResult {
  servers: McpServer[];
  cloudServers: CloudMcpServer[];
  errors: string[];
}

export interface ScanResult {
  items: AnyItem[];
  scannedAt: string;
  errors: string[];
}

export interface AppConfig {
  scanPaths: string[]; // additional dirs to scan for loose md / projects
  excludePaths: string[]; // exclude prefixes
  excludeProjects: string[]; // project roots to skip
  looseMdMaxDepth: number;
  looseMdMaxFiles: number;
}
