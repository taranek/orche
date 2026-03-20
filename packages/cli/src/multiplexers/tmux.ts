import { execSync } from "node:child_process";
import type { Multiplexer } from "../multiplexer.js";

function esc(str: string): string {
  return `"${str.replace(/"/g, '\\"')}"`;
}

export class TmuxMultiplexer implements Multiplexer {
  readonly name = "tmux";

  createSession(name: string, cwd: string): void {
    // Kill existing session with same name
    try {
      execSync(`tmux kill-session -t "${name}"`, { stdio: "ignore" });
    } catch {
      // no existing session
    }
    execSync(`tmux new-session -d -s "${name}" -c "${cwd}"`, { stdio: "ignore" });
    execSync(`tmux set-option -t "${name}" mouse on`, { stdio: "ignore" });
  }

  killSession(name: string): void {
    try {
      execSync(`tmux kill-session -t "${name}"`, { stdio: "ignore" });
    } catch {
      // ignore
    }
  }

  attach(name: string): void {
    if (process.env.TMUX) {
      execSync(`tmux switch-client -t "${name}"`, { stdio: "inherit" });
    } else {
      execSync(`tmux attach-session -t "${name}"`, { stdio: "inherit" });
    }
  }

  getActivePaneId(session: string): string {
    return execSync(`tmux display-message -t ${session} -p "#{pane_id}"`)
      .toString()
      .trim();
  }

  listPaneIds(session: string): string[] {
    return execSync(`tmux list-panes -t ${session} -F "#{pane_id}"`)
      .toString()
      .trim()
      .split("\n");
  }

  splitPane(
    target: string,
    direction: "horizontal" | "vertical",
    sizePercent: number,
    cwd: string
  ): void {
    const flag = direction === "horizontal" ? "-h" : "-v";
    execSync(
      `tmux split-window ${flag} -t ${target} -p ${sizePercent} -c "${cwd}"`,
      { stdio: "ignore" }
    );
  }

  focusPane(paneId: string): void {
    execSync(`tmux select-pane -t ${paneId}`, { stdio: "ignore" });
  }

  renamePaneTitle(paneId: string, name: string): void {
    execSync(`tmux select-pane -t ${paneId} -T ${esc(name)}`, { stdio: "ignore" });
  }

  sendCommand(target: string, command: string): void {
    execSync(`tmux send-keys -t ${target} ${esc(command)} Enter`);
  }

  isInsideSession(): boolean {
    return !!process.env.TMUX;
  }

  detectFirstPane(): string | undefined {
    if (!process.env.TMUX) return undefined;
    try {
      const sessionName = execSync("tmux display-message -p '#S'")
        .toString()
        .trim();
      const paneId = execSync(
        `tmux list-panes -t "${sessionName}" -F "#{pane_id}" | head -1`
      )
        .toString()
        .trim();
      return paneId || undefined;
    } catch {
      return undefined;
    }
  }
}
