// Review submission, extracted from main.ts and electron-free so it can be
// contract-tested and ported. The output — a `<now>.md` review file plus a
// `<now>.md.pending` sidecar — is consumed by the orche CLI watcher
// (deliverReview in packages/cli), so the .pending JSON shape is a cross-process
// contract the Rust backend must reproduce exactly.

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { SubmitTarget, SubmitResult } from '../contract/types'

export async function submitReview(opts: {
  worktreePath: string
  markdown: string
  target: SubmitTarget
  now: number
}): Promise<SubmitResult> {
  const { worktreePath, markdown, target, now } = opts

  // Worktrees live at <repo>/.orche/worktrees/<name>; reviews go to the sibling
  // <repo>/.orche/reviews/<name> — the same dir the CLI watcher polls.
  const worktreeName = path.basename(worktreePath)
  const reviewsDir = path.join(worktreePath, '..', '..', 'reviews', worktreeName)
  await mkdir(reviewsDir, { recursive: true })

  const filename = `${now}.md`
  const reviewPath = path.join(reviewsDir, filename)
  await writeFile(reviewPath, markdown, 'utf-8')

  // Sidecar the CLI watcher picks up. Field names are the cross-process contract.
  const pendingPath = path.join(reviewsDir, `${filename}.pending`)
  await writeFile(pendingPath, JSON.stringify({
    reviewPath,
    multiplexer: target.multiplexer,
    paneId: target.paneId,
    workspaceId: target.workspaceId,
  }), 'utf-8')

  return { success: true, path: reviewPath }
}
