// Runs the identical review contract against the Rust backend. Green here AND
// in electron/git-backend.contract.test.ts = the two backends are at parity.
//
// Requires the CLI binary to be built first:
//   (cd packages/review/src-tauri && cargo build)
// If it's missing, the whole suite is skipped with a clear message rather than
// failing — so `pnpm test` still works on machines without a Rust toolchain.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import {
  defineReviewContract,
  defineBaseResolutionContract,
  defineSubmitContract,
  defineTargetResolutionContract,
} from '../contract/review-contract'
import { createRustBackend, rustResolveBase, rustSubmit, rustResolveTarget } from './rust-adapter'

const here = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.join(here, 'target', 'debug', 'review-contract-cli')

if (existsSync(BIN)) {
  defineReviewContract('rust', createRustBackend(BIN))
  defineBaseResolutionContract('rust', rustResolveBase(BIN))
  defineSubmitContract('rust', rustSubmit(BIN))
  defineTargetResolutionContract('rust', rustResolveTarget(BIN))
} else {
  describe('rust backend contract', () => {
    it.skip('skipped — build the CLI first: (cd src-tauri && cargo build)', () => {})
  })
}
