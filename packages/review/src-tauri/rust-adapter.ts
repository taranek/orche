// Drives the Rust `review-contract-cli` binary through the backend-agnostic
// contract interfaces, so the parity assertions run against the real Rust
// backend that ships in the Tauri app.

import { execFileSync } from 'node:child_process'
import type {
  ReviewBackend,
  ReviewBackendFactory,
  BaseResolver,
  SubmitFn,
  TargetResolver,
  Range,
} from '../contract/types'

function call(bin: string, method: string, payload: Record<string, unknown>): unknown {
  const input = JSON.stringify({ method, ...payload })
  const out = execFileSync(bin, [], { input, encoding: 'utf-8' })
  return out.length ? JSON.parse(out) : null
}

export function createRustBackend(bin: string): ReviewBackendFactory {
  return (worktreePath: string, base: string): ReviewBackend => ({
    getChanges: (range: Range) =>
      Promise.resolve(call(bin, 'getChanges', { worktreePath, base, range }) as never),
    getCommits: () => Promise.resolve(call(bin, 'getCommits', { worktreePath, base }) as never),
    getBranch: () => Promise.resolve(call(bin, 'getBranch', { worktreePath, base }) as never),
    readOriginal: (filePath, range) =>
      Promise.resolve(call(bin, 'readOriginal', { worktreePath, base, range, filePath }) as never),
    readModified: (filePath, range) =>
      Promise.resolve(call(bin, 'readModified', { worktreePath, base, range, filePath }) as never),
    readOriginalBase64: (filePath, range) =>
      Promise.resolve(call(bin, 'readOriginalBase64', { worktreePath, base, range, filePath }) as never),
    readModifiedBase64: (filePath, range) =>
      Promise.resolve(call(bin, 'readModifiedBase64', { worktreePath, base, range, filePath }) as never),
  })
}

export function rustResolveBase(bin: string): BaseResolver {
  return (worktreePath: string, explicit?: string) =>
    call(bin, 'resolveBase', { worktreePath, explicit }) as string
}

export function rustSubmit(bin: string): SubmitFn {
  return ({ worktreePath, markdown, target, now }) =>
    Promise.resolve(call(bin, 'submit', { worktreePath, markdown, target, now }) as never)
}

export function rustResolveTarget(bin: string): TargetResolver {
  return (worktreePath, opts = {}) =>
    call(bin, 'resolveSubmitTarget', {
      worktreePath,
      tmuxTarget: opts.tmuxTarget,
      cmuxSurface: opts.cmuxSurface,
    }) as never
}
