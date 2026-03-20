export interface PaneConfig {
  name: string;
  command: string;
  /** Percentage size of this pane (optional, defaults to equal) */
  size?: number;
}

export interface SplitConfig {
  direction: "horizontal" | "vertical";
  panes: (PaneConfig | SplitConfig)[];
  /** Percentage size of this split (optional, defaults to equal) */
  size?: number;
}

export type MultiplexerType = "tmux" | "cmux" | "auto";

export interface AgentsConfig {
  multiplexer?: MultiplexerType;
  layout: PaneConfig | SplitConfig;
}

export function isSplit(node: PaneConfig | SplitConfig): node is SplitConfig {
  return "direction" in node && "panes" in node;
}
