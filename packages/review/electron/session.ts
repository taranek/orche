// Resolves where a submitted review is delivered, from .orche/session.json plus
// any tmux/cmux CLI flags. Extracted from main.ts so it's contract-tested and
// mirrored by the Rust backend (core::resolve_submit_target).
//
// Parity trap: "first pane" is the FIRST-INSERTED entry of session.json's panes
// map (JS object insertion order). The Rust side must use an insertion-ordered
// map (serde_json preserve_order), not a sorted one, or it picks a different pane.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SubmitTarget } from '../contract/types'

interface SessionInfo {
  multiplexer?: string
  panes?: Record<string, string>
  workspaceId?: string
}

export function resolveSubmitTarget(
  worktreePath: string,
  opts: { tmuxTarget?: string; cmuxSurface?: string } = {},
): SubmitTarget {
  const { tmuxTarget, cmuxSurface } = opts

  let session: SessionInfo | null = null
  try {
    const p = path.join(worktreePath, '.orche', 'session.json')
    session = JSON.parse(readFileSync(p, 'utf-8'))
  } catch (err) {
    console.log('[review] session.json read error:', (err as Error).message)
  }

  const multiplexer = session?.multiplexer ?? (tmuxTarget ? 'tmux' : cmuxSurface ? 'cmux' : null)
  const firstPane = session?.panes ? Object.values(session.panes)[0] : undefined
  const paneId = tmuxTarget ?? cmuxSurface ?? firstPane
  const workspaceId = session?.workspaceId

  return { multiplexer, paneId, workspaceId }
}
