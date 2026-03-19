export interface PaneConfig {
  name: string;
  command: string;
}

export interface SplitConfig {
  direction: "horizontal" | "vertical";
  panes: (PaneConfig | SplitConfig)[];
  /** Percentage size of this split (optional, defaults to equal) */
  size?: number;
}

export interface AgentsConfig {
  layout: PaneConfig | SplitConfig;
}

export function isSplit(node: PaneConfig | SplitConfig): node is SplitConfig {
  return "direction" in node && "panes" in node;
}
