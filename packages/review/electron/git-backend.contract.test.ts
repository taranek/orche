// Runs the backend-agnostic review contract against the electron (git.ts)
// implementation. When the Tauri backend lands, add a sibling test that calls
// the same two functions with the Tauri adapter — green on both = parity.

import {
  defineReviewContract,
  defineBaseResolutionContract,
  defineSubmitContract,
  defineTargetResolutionContract,
} from '../contract/review-contract'
import { createGitBackend, resolveBaseElectron } from './git-backend'
import { submitReview } from './submit'
import { resolveSubmitTarget } from './session'

defineReviewContract('electron-git', createGitBackend)

defineBaseResolutionContract('electron-git', (repo, explicit) => resolveBaseElectron(repo, explicit))

defineSubmitContract('electron', submitReview)

defineTargetResolutionContract('electron', resolveSubmitTarget)
