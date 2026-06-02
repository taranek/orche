# orche-review-core (Tauri backend)

The Rust backend for the review app, the target of the electron → Tauri
migration. It is a **behavioral mirror** of the electron backend
(`../electron/git.ts` + `../electron/submit.ts`): same git invocations, same
parsing, same fallbacks.

## How parity is proven

The review backend has a single backend-agnostic contract in
[`../contract/`](../contract). The same assertion suite runs against **both**
implementations:

| Backend  | Adapter                                   | Test file                                          |
| -------- | ----------------------------------------- | -------------------------------------------------- |
| electron | `electron/git-backend.ts` (calls git.ts)  | `electron/git-backend.contract.test.ts`            |
| rust     | `src-tauri/rust-adapter.ts` (drives CLI)  | `src-tauri/rust-backend.contract.test.ts`          |

`rust-adapter.ts` shells out to the `review-contract-cli` binary — a thin
JSON-over-stdio wrapper around `lib.rs` — so the TypeScript contract can
exercise the Rust functions exactly as it exercises electron's. If both suites
are green, the backends behave identically.

## Run it

```bash
# from packages/review/
pnpm test:parity     # cargo build + vitest (electron + rust)
```

Or manually:

```bash
cargo build                       # builds lib + review-contract-cli
pnpm test                         # rust suite auto-detects the built binary;
                                  # skipped (not failed) if it isn't there
```

## Layout

```
src/lib.rs                 core git + submit logic (the real backend)
src/bin/contract_cli.rs    JSON-over-stdio harness for the contract suite
rust-adapter.ts            TS adapter binding the CLI to the contract interface
rust-backend.contract.test.ts   wires the adapter into the shared contract
tauri-app/                 Tauri shell crate (separate package; depends on
                           orche-review-core via path = "..")
  src/main.rs              #[tauri::command] wrappers + window/startup
  tauri.conf.json          v2 config (frontendDist → ../../dist, withGlobalTauri)
  capabilities/            invoke permissions
```

`tauri-app/` is a **separate crate** so the contract crate here stays lean —
`cargo build` / `pnpm test:parity` never pull the (large) Tauri dependency tree.

To build the shell (needs the Tauri toolchain / system webview):

```bash
cd tauri-app && cargo check        # type-checks the commands + config
# cargo tauri dev                  # run the app (requires @tauri-apps/cli)
```

## Migration status

- [x] Core git read logic (`getChanges`, `getCommits`, `getBranch`, original/
      modified reads, base64) at parity with electron
- [x] `resolveBase` precedence at parity
- [x] `submitReview` (.md + .pending sidecar) at parity
- [x] Renderer routed through a backend seam (`src/lib/reviewClient.ts`) that
      already dispatches to Tauri `invoke` when running under Tauri
- [x] Tauri app shell — `#[tauri::command]` wrappers over core + window config;
      `cargo check` passes
- [x] session.json delivery-target resolution at parity (insertion-ordered
      "first pane" — needs serde_json `preserve_order`)
- [x] End-to-end runtime: `cargo build` → runnable binary; launched against a
      test repo the window opens, reviewClient routes through the __TAURI__
      invoke bridge, and the diff renders correctly (same as electron)
- [ ] Wire `cargo tauri` (or `cargo build --release` + bundling) into the
      release pipeline and ship a signed packaged app
- [ ] Retire the electron backend once the Tauri build is shipping
