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

/** How `.worktreeinclude` files are placed into a new worktree. */
export type WorktreeIncludeMode = "copy" | "symlink";

export interface WorktreeConfig {
  /**
   * Whether gitignored files matched by `.worktreeinclude` are copied into the
   * worktree (independent per-worktree copies, the default) or symlinked back
   * to the main checkout (shared, so edits propagate). Defaults to "copy".
   */
  includeMode?: WorktreeIncludeMode;
}

export interface AgentsConfig {
  multiplexer?: MultiplexerType;
  worktree?: WorktreeConfig;
  layout: PaneConfig | SplitConfig;
}

export function isSplit(node: PaneConfig | SplitConfig): node is SplitConfig {
  return "direction" in node && "panes" in node;
}
