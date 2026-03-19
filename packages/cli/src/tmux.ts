import { execSync } from "node:child_process";
import { isSplit, type PaneConfig, type SplitConfig } from "./types.js";

/**
 * Recursively build tmux layout by splitting panes.
 *
 * tmux works by splitting an existing pane — so we track pane IDs
 * and split them as we walk the tree.
 */
export function buildLayout(
  session: string,
  node: PaneConfig | SplitConfig,
  worktreePath: string
): void {
  if (!isSplit(node)) {
    // Single pane — just send the command to the initial pane
    sendCommand(session, node.command);
    return;
  }

  // First pane is already created by tmux new-session
  const paneIds = [getActivePaneId(session)];

  // Create the remaining panes by splitting
  for (let i = 1; i < node.panes.length; i++) {
    const splitFlag = node.direction === "horizontal" ? "-h" : "-v";
    const sizePercent = Math.floor(100 / (node.panes.length - i + 1));

    execSync(
      `tmux split-window ${splitFlag} -t ${paneIds[0]} -p ${sizePercent} -c "${worktreePath}"`,
      { stdio: "ignore" }
    );
    paneIds.push(getActivePaneId(session));
  }

  // Now assign commands / recurse into nested splits
  const allPaneIds = listPaneIds(session);

  for (let i = 0; i < node.panes.length; i++) {
    const child = node.panes[i];
    const paneId = allPaneIds[i];

    if (isSplit(child)) {
      // For nested splits, select the pane then recurse
      execSync(`tmux select-pane -t ${paneId}`, { stdio: "ignore" });
      buildNestedSplit(session, child, paneId, worktreePath);
    } else {
      sendCommandToPane(paneId, child.command);
    }
  }
}

function buildNestedSplit(
  session: string,
  node: SplitConfig,
  parentPaneId: string,
  worktreePath: string
): void {
  const paneIds = [parentPaneId];

  for (let i = 1; i < node.panes.length; i++) {
    const splitFlag = node.direction === "horizontal" ? "-h" : "-v";
    const sizePercent = Math.floor(100 / (node.panes.length - i + 1));

    execSync(
      `tmux split-window ${splitFlag} -t ${paneIds[i - 1]} -p ${sizePercent} -c "${worktreePath}"`,
      { stdio: "ignore" }
    );
    paneIds.push(getActivePaneId(session));
  }

  for (let i = 0; i < node.panes.length; i++) {
    const child = node.panes[i];
    if (isSplit(child)) {
      buildNestedSplit(session, child, paneIds[i], worktreePath);
    } else {
      sendCommandToPane(paneIds[i], child.command);
    }
  }
}

function getActivePaneId(session: string): string {
  return execSync(`tmux display-message -t ${session} -p "#{pane_id}"`)
    .toString()
    .trim();
}

function listPaneIds(session: string): string[] {
  return execSync(`tmux list-panes -t ${session} -F "#{pane_id}"`)
    .toString()
    .trim()
    .split("\n");
}

function sendCommand(session: string, command: string): void {
  execSync(`tmux send-keys -t ${session} ${escapeForTmux(command)} Enter`);
}

function sendCommandToPane(paneId: string, command: string): void {
  execSync(`tmux send-keys -t ${paneId} ${escapeForTmux(command)} Enter`);
}

function escapeForTmux(str: string): string {
  return `"${str.replace(/"/g, '\\"')}"`;
}
