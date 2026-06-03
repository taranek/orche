# orche-review (Tauri)

The review app is a Tauri v2 desktop app: a React frontend (`../src`) over a
Rust backend. This directory is the Tauri crate.

```
src/main.rs        #[tauri::command] wrappers + window setup (vibrancy, title)
tauri.conf.json    v2 config (frontendDist, devUrl, beforeDev/BuildCommand)
capabilities/      invoke permissions
icons/             app icon set (generated via `tauri icon`)
core/              orche-review-core: the git + submit backend logic (a lib +
                   a contract CLI), kept as a separate crate so the contract
                   tests never pull the Tauri dependency tree
rust-adapter.ts                 binds the contract CLI to the parity contract
rust-backend.contract.test.ts   runs the contract against the Rust backend
```

## Backend logic + the parity contract

All git-backed logic (`get_changes`, `get_commits`, `get_branch`, original/
modified reads + base64, `resolve_base`, `submit_review`, `resolve_submit_target`)
lives in `core/src/lib.rs`. The `#[tauri::command]`s in `src/main.rs` are thin
wrappers over it.

`core` is exercised by a backend-agnostic contract in [`../contract/`](../contract):
the `review-contract-cli` binary is driven by `rust-adapter.ts` so the same
assertions validate the real Rust backend.

```bash
# from packages/review/
pnpm test:parity     # cargo build core + vitest (54 contract assertions)
```

These assertions were authored during the electron→Tauri migration to prove the
Rust backend matched the original TypeScript one byte-for-byte; they now stand
as the regression guard for the backend.

## Build & run

```bash
# from packages/review/
pnpm tauri dev       # vite dev server + app (debug; MCP bridge active)
pnpm tauri build     # production bundle (.app/.dmg/AppImage)
```

Always go through the `tauri` CLI. A bare `cargo build --release` leaves
`devUrl` active, so the binary tries to load the dev server and renders blank
with nothing there — `tauri build` embeds the frontend instead.

`orche review` launches the built binary
(`src-tauri/target/release/orche-review`) in the monorepo, or the downloaded
release bundle for end users.
