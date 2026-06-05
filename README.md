<p align="center">
  <img src="assets/orche.svg" alt="orche" width="128" height="128" />
</p>

<h1 align="center">orche</h1>

<p align="center">Orchestrate coding agents across isolated git worktrees with a built-in code review UI.</p>

https://github.com/user-attachments/assets/35150d31-84ce-4f1d-8df9-4aef179dc532

orche runs your coding agents in isolated git worktrees, so several can work at once without stepping on each other. When an agent finishes, you review its diff in a desktop app and send comments straight back to its terminal.

Three commands do the work:

- `orche start <task>` opens a tmux or cmux session with your agent, a dev server, and a spare terminal, each in its own worktree.
- `orche review` opens the review app for a worktree. Leave line-level comments, hit submit, and the feedback lands in the agent's pane.
- `orche prune` cleans up the worktrees you're done with.

### How it works

1. Run `orche start fix-auth`. A session opens with your agent (Claude, Codex, whatever you configured), a dev server, and a spare terminal.
2. The agent works in its own worktree.
3. When it's done, run `orche review`, or tell the agent to.
4. Read the diff, leave comments, submit. The feedback goes to the agent's pane.
5. On to the next task.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- [tmux](https://github.com/tmux/tmux) or [cmux](https://cmux.dev/) for session management
- [git](https://git-scm.com/)

## Installation

```bash
npm install -g @taranek/orche
```

## Quick start

From inside a git repo, run:

```bash
orche init
```

That writes a starter `.orche.json` and adds `.orche/` to your `.gitignore`. Open the config and set the panes you want, an agent and a dev server to start with:

```json
{
  "layout": {
    "direction": "horizontal",
    "panes": [
      { "name": "agent", "command": "claude" },
      { "name": "dev", "command": "yarn dev" }
    ]
  }
}
```

Then start a session:

```bash
orche start fix-auth
```

This creates a worktree under `.orche/worktrees/`, opens a tmux or cmux session with your panes, and runs each pane's command. When you want to look at the result, run `orche review`.

## Commands

```
orche init [-f]                    Bootstrap .orche.json + .gitignore entry
orche start <task> [-p <preset>]   Start a session for <task>
orche review [path]                Open the review UI for a worktree
orche prune [--all] [-f]           Remove orche worktrees
```

```bash
orche init                         # write .orche.json + ignore .orche/
orche start fix-auth               # worktree + session for "fix-auth"
orche start fix-auth -p mobile     # use .orche.mobile.json
orche review                       # review the current directory
orche review ./worktree            # review a specific worktree
orche prune                        # pick worktrees to remove
orche prune --all                  # remove every orche worktree
orche prune --force                # remove even with uncommitted changes
```

`orche prune` lists every worktree under `.orche/worktrees/` in a multiselect. Anything with uncommitted changes is flagged and skipped unless you pass `--force`.

## Configuration

### `.orche.json`

This file defines your pane layout. Put it in the project root; it works with both tmux and cmux. Splits can nest as deep as you need:

```json
{
  "layout": {
    "direction": "horizontal",
    "panes": [
      { "name": "agent", "command": "claude" },
      {
        "direction": "vertical",
        "panes": [
          { "name": "dev", "command": "npm run dev" },
          { "name": "tests", "command": "npm run test:watch" }
        ]
      }
    ]
  }
}
```

That config produces:

```
┌─────────────────┬─────────────────┐
│                 │      dev        │
│     agent       ├─────────────────┤
│                 │     tests       │
└─────────────────┴─────────────────┘
```

| Field | Type | Description |
|-------|------|-------------|
| `direction` | `"horizontal"` \| `"vertical"` | Split direction |
| `panes` | array | Panes or nested splits |
| `name` | string | Pane label |
| `command` | string | Command to run in the pane |
| `size` | number | Split percentage (optional) |

### Multiplexer

orche detects whether you're in tmux or [cmux](https://cmux.dev/). To force one, set it in your config:

```json
{
  "multiplexer": "cmux",
  "layout": { ... }
}
```

Use `"tmux"` (the default) or `"cmux"`.

### Gitignored files in worktrees (`.worktreeinclude`)

A worktree is a clean checkout, so untracked files like `.env` from your main checkout aren't there. List the ones you want carried over in a `.worktreeinclude` file at the project root. It uses `.gitignore` syntax, and only untracked files matching a pattern are placed — tracked files are never duplicated:

```text
.env
.env.local
config/secrets.json
```

By default the files are **copied**, so each worktree gets its own independent copy. To **symlink** them back to the main checkout instead (shared, so edits propagate both ways), set `worktree.includeMode`:

```json
{
  "worktree": {
    "includeMode": "symlink"
  },
  "layout": { ... }
}
```

Use `"copy"` (the default) or `"symlink"`. Note that with `"symlink"`, a worktree editing a file like `.env` mutates the main checkout.

### `.orche.local.json`

Same format as `.orche.json`, and it wins when both exist. It's gitignored by default, so it's the place for personal overrides that shouldn't touch the team config.

### Presets

Name a preset file `.orche.<name>.json` and load it with `-p`:

```bash
orche start fix-auth -p mobile    # loads .orche.mobile.json
orche start fix-auth -p debug     # loads .orche.debug.json
```

A preset overrides both `.orche.json` and `.orche.local.json`. Ask for one that doesn't exist and orche lists the presets it can find.

## Review app

`orche review` opens a desktop app to look over an agent's changes before they land. Run it from inside a worktree, or pass a path. If you're in a tmux or cmux session, the review links to the agent's pane automatically, so submitted feedback gets pasted straight into the terminal.

The window has three columns:

```
┌──────┬────────────┬──────────────────────────────────┐
│      │            │                                  │
│ icon │   file     │    multi-file diff view           │
│ rail │   tree     │    (virtualized scroll)           │
│      │            │                                  │
│      │            ├──────────────────────────────────┤
│      │            │  main ← 3 files · 2 comments     │
└──────┴────────────┴──────────────────────────────────┘
```

The icon rail switches between the file tree, comments, and theme panels. The side panel browses changed files (with `+`/`~`/`-` status) or your pending comments. The diff viewer is a virtualized split diff with syntax highlighting, collapsible unchanged regions, and sticky file headers.

To review: scroll through every changed file in one view (the sidebar tracks where you are), click a line to comment, then submit with `Cmd+Enter` on macOS or `Ctrl+Enter` on Linux. Your comments are saved as markdown under `.orche/reviews/` and pasted into the agent's pane.

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+Enter` | Submit review |
| `Enter` (in comment) | Submit comment |
| `Shift+Enter` (in comment) | Newline |
| `Escape` (in comment) | Cancel |

Four color themes ship with the app and persist between sessions:

- Obsidian: dark, with a warm amber accent
- Porcelain: light, with a slate-blue accent
- Sandstone: warm light, with a burnt orange accent
- Arctic: dark, with a teal accent

## Contributing

```bash
git clone https://github.com/taranek/orche.git
cd orche
pnpm install
pnpm run build
pnpm run link:cli
```

Workspace management uses [pnpm](https://pnpm.io/). Common scripts:

```bash
pnpm run dev:cli           # watch + rebuild the CLI (linked globally)
pnpm run dev:review        # run the review app in dev mode
pnpm run build             # build all packages
pnpm run typecheck         # type-check all packages
```

The code lives in three packages:

```
packages/
  cli/       @orche/cli      CLI for session and worktree management
  review/    @orche/review   Electron code review app
  shared/    @orche/shared   shared components, themes, and state
```

## License

MIT
