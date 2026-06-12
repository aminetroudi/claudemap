import { NextResponse } from "next/server";
import {
  addMcpServer,
  deleteMcpServer,
  demoteToProject,
  installPluginViaCli,
  movePath,
  promoteToGlobal,
  togglePlugin,
  trashPath,
  uninstallPlugin,
  updateMcpServer,
} from "@/lib/actions";
import { killGhostProcesses } from "@/lib/sessions/ghosts";
import { spawnSessionTerminal, type TerminalMode } from "@/lib/sessions/terminal";
import type { McpServer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ActionBody {
  action:
    | "trash"
    | "move"
    | "promote"
    | "demote"
    | "togglePlugin"
    | "uninstallPlugin"
    | "installPlugin"
    | "addMcp"
    | "updateMcp"
    | "deleteMcp"
    | "session-open-terminal"
    | "session-kill-ghosts";
  // shared
  path?: string;
  // move
  dest?: string;
  // promote/demote
  kind?: "skill" | "agent";
  projectRoot?: string;
  // plugin
  fullName?: string;
  enabled?: boolean;
  // mcp
  server?: McpServer;
  oldName?: string;
  mcpName?: string;
  mcpScope?: "global" | "project";
  // session terminal
  mode?: TerminalMode;
  attachId?: string;
  sessionId?: string;
  cwd?: string;
}

export async function POST(req: Request) {
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "trash":
        if (!body.path) throw new Error("path required");
        return NextResponse.json(await trashPath(body.path));
      case "move":
        if (!body.path || !body.dest) throw new Error("path & dest required");
        return NextResponse.json(await movePath(body.path, body.dest));
      case "promote":
        if (!body.path || !body.kind) throw new Error("path & kind required");
        return NextResponse.json(await promoteToGlobal(body.path, body.kind));
      case "demote":
        if (!body.path || !body.kind || !body.projectRoot)
          throw new Error("path, kind, projectRoot required");
        return NextResponse.json(
          await demoteToProject(body.path, body.projectRoot, body.kind),
        );
      case "togglePlugin":
        if (!body.fullName || typeof body.enabled !== "boolean")
          throw new Error("fullName & enabled required");
        await togglePlugin(body.fullName, body.enabled);
        return NextResponse.json({ ok: true });
      case "uninstallPlugin":
        if (!body.fullName) throw new Error("fullName required");
        await uninstallPlugin(body.fullName);
        return NextResponse.json({ ok: true });
      case "installPlugin":
        if (!body.fullName) throw new Error("fullName required");
        return NextResponse.json(await installPluginViaCli(body.fullName));
      case "addMcp":
        if (!body.server) throw new Error("server required");
        await addMcpServer(body.server);
        return NextResponse.json({ ok: true });
      case "updateMcp":
        if (!body.server || !body.oldName) throw new Error("server & oldName required");
        await updateMcpServer(body.oldName, body.server);
        return NextResponse.json({ ok: true });
      case "deleteMcp":
        if (!body.mcpName || !body.mcpScope) throw new Error("mcpName & mcpScope required");
        await deleteMcpServer(body.mcpName, body.mcpScope, body.projectRoot);
        return NextResponse.json({ ok: true });
      case "session-open-terminal": {
        if (!body.cwd || !body.mode) throw new Error("cwd & mode required");
        const result = await spawnSessionTerminal({
          mode: body.mode,
          cwd: body.cwd,
          attachId: body.attachId,
          sessionId: body.sessionId,
        });
        return NextResponse.json(result);
      }
      case "session-kill-ghosts":
        return NextResponse.json({ ok: true, ...(await killGhostProcesses()) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
