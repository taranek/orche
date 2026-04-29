# orche

Orchestrate coding agents across isolated git worktrees with a built-in code review UI.

orche is two things:

- **`orche start <task>`** — spins up a tmux/cmux session with your agent, dev server, and any other tools you need, each running in an isolated git worktree so agents never step on each other.
- **`orche review`** — opens a desktop app to review the agent's changes, add line-level comments, and send feedback directly back into the agent's terminal.
- **`orche prune`** — interactive multiselect for cleaning up worktrees you no longer need.

### Typical workflow

1. Run `orche start fix-auth` — a session opens (tmux or cmux) with your agent (Claude, Codex, etc.), a dev server, and a spare terminal
2. The agent works on the task in its own worktree
3. When it's done, either tell the agent to run `orche review` or trigger it yourself from the spare terminal
4. Review the diff, leave comments, hit submit — feedback lands in the agent's pane
5. Move on to the next task

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [tmux](https://github.com/tmux/tmux) or [cmux](https://cmux.dev/) — terminal multiplexer for session management
- [git](https://git-scm.com/)

## Installation

```bash
npm install -g @taranek/orche
```

## Quick start

1. Create a `.orche.json` in your project root:

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

2. Start a session:

```bash
orche start fix-auth
```

This will:
- Create an isolated git worktree in `.orche/worktrees/`
- Open a tmux/cmux session with your configured pane layout
- Run the specified commands in each pane

3. Review changes:

```bash
orche review
```

Opens the desktop review app for the current worktree.

## Usage

```
orche start <task> [-p <preset>]   Start a new session for <task>
orche review [path]                Open the review UI for a worktree
orche prune [--all] [-f]           Remove orche worktrees (interactive multiselect)
```

### Examples

```bash
orche start fix-auth               # Create worktree + session for "fix-auth"
orche start fix-auth -p mobile     # Use .orche.mobile.json preset
orche start fix-auth --preset=debug  # Use .orche.debug.json preset
orche review                       # Review changes in current directory
orche review ./worktree            # Review changes in a specific worktree
orche prune                        # Pick worktrees to remove
orche prune --all                  # Remove every orche worktree
orche prune --force                # Remove worktrees even if they have uncommitted changes
```

### Pruning worktrees

`orche prune` lists every worktree under `.orche/worktrees/` in an interactive multiselect. Worktrees with uncommitted changes are marked and skipped during removal unless you pass `--force`. Use `--all` to skip the prompt and target every orche worktree at once.

## Configuration

### `.orche.json`

Defines the pane layout for your session. Place it in your project root. Works with both tmux and cmux.

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

This produces:

```
┌─────────────────┬─────────────────┐
│                 │      dev        │
│     agent       ├─────────────────┤
│                 │     tests       │
└─────────────────┴─────────────────┘
```

**Layout options:**

| Field | Type | Description |
|-------|------|-------------|
| `direction` | `"horizontal"` \| `"vertical"` | Split direction |
| `panes` | array | List of panes or nested splits |
| `name` | string | Pane label |
| `command` | string | Command to run in the pane |
| `size` | number | Split percentage (optional) |

Layouts can be nested arbitrarily deep.

### Multiplexer

orche auto-detects whether you're running inside tmux or [cmux](https://cmux.dev/). You can also set it explicitly in your config:

```json
{
  "multiplexer": "cmux",
  "layout": { ... }
}
```

Supported values: `"tmux"` (default) or `"cmux"`.

### `.orche.local.json`

Same format as `.orche.json`. If present, it takes priority over `.orche.json`. This file is gitignored by default, so you can use it for personal overrides without affecting the team config.

### Presets

Create named preset files like `.orche.mobile.json`, `.orche.debug.json`, etc. Use them with the `-p` flag:

```bash
orche start fix-auth -p mobile    # loads .orche.mobile.json
orche start fix-auth -p debug     # loads .orche.debug.json
```

When a preset is specified, it takes priority over both `.orche.json` and `.orche.local.json`. If the preset file doesn't exist, orche will list all available presets in the current directory.

## Review app

The review app is a desktop application for reviewing agent-produced code changes before they land.

Run `orche review` from inside a worktree (or pass a path) to open it. If you're in a tmux or cmux session, the review is automatically linked to the agent's pane — submitted feedback gets pasted straight into the terminal.

### Interface

The app has three panels:

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

- **Icon rail** — switch between file tree, comments, and theme panels
- **Side panel** — browse changed files (with `+`/`~`/`-` status indicators), view pending comments, or switch themes
- **Diff viewer** — virtualized multi-file split diff with syntax highlighting, collapsible unchanged regions, and sticky file headers

### Reviewing workflow

1. Open the review app with `orche review`
2. Scroll through all changed files in a single view — the sidebar highlights the current file as you scroll
3. Click any line in the diff to add a comment (or use the `+` gutter button on hover)
4. Submit with `Cmd+Enter` (macOS) or `Ctrl+Enter` (Linux) — your comments are saved as a markdown file in `.orche/reviews/` and pasted directly into the agent's pane

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+Enter` | Submit review |
| `Enter` (in comment) | Submit comment |
| `Shift+Enter` (in comment) | Newline |
| `Escape` (in comment) | Cancel |

### Themes

Four built-in color themes, persisted across sessions:

- **Obsidian** — dark, warm amber accent
- **Porcelain** — light, slate-blue accent
- **Sandstone** — warm light, burnt orange accent
- **Arctic** — dark, teal accent

## Contributing

### Setup

```bash
git clone https://github.com/taranek/orche.git
cd orche
pnpm install
pnpm run build
pnpm run link:cli
```

Requires [pnpm](https://pnpm.io/) for workspace management.

### Development

```bash
pnpm run dev:cli           # Watch + rebuild CLI (linked globally)
pnpm run dev:review        # Run review app in dev mode
pnpm run build             # Build all packages
pnpm run typecheck         # Type-check all packages
```

### Project structure

```
packages/
  cli/       @orche/cli      — CLI for session and worktree management
  review/    @orche/review   — Electron code review app
  shared/    @orche/shared   — Shared components, themes, and state
```

## License

MIT
