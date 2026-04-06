import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  listOrcheWorktrees,
  removeWorktree,
  type OrcheWorktree,
} from "./worktree.js";

interface PruneOptions {
  all: boolean;
  force: boolean;
}

function parseOptions(argv: string[]): PruneOptions {
  return {
    all: argv.includes("--all"),
    force: argv.includes("--force") || argv.includes("-f"),
  };
}

async function selectWorktrees(
  worktrees: OrcheWorktree[]
): Promise<OrcheWorktree[] | null> {
  const choice = await p.multiselect<string>({
    message: "Select worktrees to remove",
    required: false,
    options: worktrees.map((wt) => {
      const branch = wt.branch ? ` ${pc.cyan(wt.branch)}` : "";
      const hint = wt.dirty ? "uncommitted changes" : undefined;
      return {
        value: wt.worktreePath,
        label: `${path.basename(wt.worktreePath)}${branch}`,
        hint,
      };
    }),
  });

  if (p.isCancel(choice)) return null;
  const picked = choice as string[];
  return worktrees.filter((wt) => picked.includes(wt.worktreePath));
}

function pruneWorktrees(
  repoRoot: string,
  targets: OrcheWorktree[],
  force: boolean
): { removed: number; skipped: number; failed: number } {
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  for (const wt of targets) {
    const name = path.basename(wt.worktreePath);
    if (wt.dirty && !force) {
      p.log.warn(`${name} — uncommitted changes (pass --force to remove)`);
      skipped++;
      continue;
    }
    try {
      removeWorktree(repoRoot, wt.worktreePath, force);
      p.log.success(`removed ${name}`);
      removed++;
    } catch (err: any) {
      p.log.error(`${name}: ${err?.message ?? err}`);
      failed++;
    }
  }

  return { removed, skipped, failed };
}

export async function pruneCommand(repoRoot: string, argv: string[]): Promise<void> {
  const opts = parseOptions(argv);

  p.intro("orche prune");

  const worktrees = listOrcheWorktrees(repoRoot);
  if (worktrees.length === 0) {
    p.outro("no orche worktrees found");
    return;
  }

  let targets: OrcheWorktree[];
  if (opts.all) {
    targets = worktrees;
  } else {
    const picked = await selectWorktrees(worktrees);
    if (picked === null) {
      p.cancel("cancelled");
      return;
    }
    if (picked.length === 0) {
      p.outro("nothing selected");
      return;
    }
    targets = picked;
  }

  const { removed, skipped, failed } = pruneWorktrees(repoRoot, targets, opts.force);
  p.outro(`${removed} removed · ${skipped} skipped · ${failed} failed`);
}
