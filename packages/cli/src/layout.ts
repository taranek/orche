import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isSplit, type PaneConfig, type SplitConfig } from "./types.js";
import type { Multiplexer } from "./multiplexer.js";

export interface SessionInfo {
  multiplexer: string;
  panes: Record<string, string>; // name → pane/surface ID
  workspaceId?: string;
}

/**
 * Recursively build a pane layout using the given multiplexer.
 */
export function buildLayout(
  mux: Multiplexer,
  session: string,
  node: PaneConfig | SplitConfig,
  worktreePath: string
): void {
  const paneMap: Record<string, string> = {};

  if (!isSplit(node)) {
    const paneId = mux.getActivePaneId(session);
    paneMap[node.name] = paneId;
    mux.renamePaneTitle(paneId, node.name);
    if (node.command) mux.sendCommand(session, node.command);
    saveSessionInfo(mux.name, paneMap, worktreePath);
    return;
  }

  const paneIds = [mux.getActivePaneId(session)];

  for (let i = 1; i < node.panes.length; i++) {
    const child = node.panes[i];
    const sizePercent = child.size ?? Math.floor(100 / (node.panes.length - i + 1));
    mux.splitPane(paneIds[0], node.direction, sizePercent, worktreePath);
    paneIds.push(mux.getActivePaneId(session));
  }

  const allPaneIds = mux.listPaneIds(session);

  for (let i = 0; i < node.panes.length; i++) {
    const child = node.panes[i];
    const paneId = allPaneIds[i];

    if (isSplit(child)) {
      mux.focusPane(paneId);
      collectPaneMap(mux, session, child, paneId, worktreePath, paneMap);
    } else {
      paneMap[child.name] = paneId;
      mux.renamePaneTitle(paneId, child.name);
      if (child.command) mux.sendCommand(paneId, child.command);
    }
  }

  saveSessionInfo(mux.name, paneMap, worktreePath);
}

function collectPaneMap(
  mux: Multiplexer,
  session: string,
  node: SplitConfig,
  parentPaneId: string,
  worktreePath: string,
  paneMap: Record<string, string>
): void {
  const paneIds = [parentPaneId];

  for (let i = 1; i < node.panes.length; i++) {
    const child = node.panes[i];
    const sizePercent = child.size ?? Math.floor(100 / (node.panes.length - i + 1));
    mux.splitPane(paneIds[i - 1], node.direction, sizePercent, worktreePath);
    paneIds.push(mux.getActivePaneId(session));
  }

  for (let i = 0; i < node.panes.length; i++) {
    const child = node.panes[i];
    if (isSplit(child)) {
      collectPaneMap(mux, session, child, paneIds[i], worktreePath, paneMap);
    } else {
      paneMap[child.name] = paneIds[i];
      mux.renamePaneTitle(paneIds[i], child.name);
      if (child.command) mux.sendCommand(paneIds[i], child.command);
    }
  }
}

function saveSessionInfo(
  multiplexer: string,
  panes: Record<string, string>,
  worktreePath: string
): void {
  const orcheDir = path.join(worktreePath, ".orche");
  mkdirSync(orcheDir, { recursive: true });
  const workspaceId = process.env.CMUX_WORKSPACE_ID || undefined;
  const info: SessionInfo = { multiplexer, panes, workspaceId };
  writeFileSync(path.join(orcheDir, "session.json"), JSON.stringify(info, null, 2));
}
