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
```

## Migration status

- [x] Core git read logic (`getChanges`, `getCommits`, `getBranch`, original/
      modified reads, base64) at parity with electron
- [x] `resolveBase` precedence at parity
- [x] `submitReview` (.md + .pending sidecar) at parity
- [ ] Tauri app shell (`tauri.conf.json`, commands, window) — not started
- [ ] Renderer IPC swap (`window.review.*` → Tauri `invoke`)
