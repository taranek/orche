import { execSync } from "node:child_process";
import type { MultiplexerType } from "./types.js";
import { TmuxMultiplexer } from "./multiplexers/tmux.js";
import { CmuxMultiplexer } from "./multiplexers/cmux.js";

export interface Multiplexer {
  readonly name: string;

  // Session lifecycle
  createSession(name: string, cwd: string): void;
  killSession(name: string): void;
  attach(name: string): void;

  // Pane operations
  getActivePaneId(session: string): string;
  listPaneIds(session: string): string[];
  splitPane(
    target: string,
    direction: "horizontal" | "vertical",
    sizePercent: number,
    cwd: string
  ): void;
  focusPane(paneId: string): void;
  renamePaneTitle(paneId: string, name: string): void;
  sendCommand(target: string, command: string): void;

  // Detection
  isInsideSession(): boolean;
  detectFirstPane(): string | undefined;
}

function isAvailable(bin: string): boolean {
  try {
    execSync(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getMultiplexer(preference: MultiplexerType = "auto"): Multiplexer {
  if (preference === "tmux") {
    if (!isAvailable("tmux")) throw new Error("tmux not found — brew install tmux");
    return new TmuxMultiplexer();
  }

  if (preference === "cmux") {
    if (!isAvailable("cmux")) throw new Error("cmux not found — https://cmux.com");
    return new CmuxMultiplexer();
  }

  // auto: prefer cmux if available, fall back to tmux
  if (isAvailable("cmux")) return new CmuxMultiplexer();
  if (isAvailable("tmux")) return new TmuxMultiplexer();

  throw new Error("no multiplexer found — install tmux (brew install tmux) or cmux (https://cmux.com)");
}
