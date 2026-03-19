# orche

Orchestrate coding agents across isolated git worktrees with a built-in code review UI.

orche is two things:

- **`orche <task>`** — spins up a tmux session with your agent, dev server, and any other tools you need, each running in an isolated git worktree so agents never step on each other.
- **`orche review`** — opens a desktop app to review the agent's changes, add line-level comments, and send feedback directly back into the agent's terminal.

### Typical workflow

1. Run `orche fix-auth` — a tmux session opens with your agent (Claude, Codex, etc.), a dev server, and a spare terminal
2. The agent works on the task in its own worktree
3. When it's done, either tell the agent to run `orche review` or trigger it yourself from the spare terminal
4. Review the diff, leave comments, hit submit — feedback lands in the agent's pane
5. Move on to the next task

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [tmux](https://github.com/tmux/tmux) (`brew install tmux`)
- [git](https://git-scm.com/)

## Installation

```bash
npm install -g @taranek/orche --registry=https://npm.pkg.github.com
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
orche fix-auth
```

This will:
- Create an isolated git worktree in `.orche/worktrees/`
- Open a tmux session with your configured pane layout
- Run the specified commands in each pane

3. Review changes:

```bash
orche review
```

Opens the desktop review app for the current worktree.

## Usage

```
orche <task>                Start a new session for <task>
orche review [path]        Open the review UI for a worktree
  --tmux=<pane>            Send review feedback to a tmux pane
```

### Examples

```bash
orche fix-auth             # Create worktree + tmux session for "fix-auth"
orche review               # Review changes in current directory
orche review ./worktree    # Review changes in a specific worktree
```

## Configuration

### `.orche.json`

Defines the tmux pane layout for your session. Place it in your project root.

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

### `.orche.local.json`

Same format as `.orche.json`. If present, it takes priority over `.orche.json`. This file is gitignored by default, so you can use it for personal overrides without affecting the team config.

## Review app

The review app is a desktop application for reviewing agent-produced code changes before they land.

Run `orche review` from inside a worktree (or pass a path) to open it. If you're in a tmux session, the review is automatically linked to the agent's pane — submitted feedback gets pasted straight into the terminal.

### Interface

The app has three panels:

```
┌──────┬────────────┬──────────────────────────────────┐
│      │            │  tab1.ts | tab2.ts | tab3.ts     │
│ icon │   file     ├──────────────────────────────────┤
│ rail │   tree     │                                  │
│      │            │         diff editor              │
│      │            │                                  │
│      │            ├──────────────────────────────────┤
│      │            │  main ← 3 files · 0 comments     │
└──────┴────────────┴──────────────────────────────────┘
```

- **Icon rail** — switch between file tree, comments, and theme panels
- **Side panel** — browse changed files (with `+`/`~`/`-` status indicators), view pending comments, or switch themes
- **Editor** — split (side-by-side) or unified diff view with syntax highlighting for 15+ languages

### Reviewing workflow

1. Open the review app with `orche review`
2. Browse changed files in the file tree
3. Click any line in the diff to add a comment
4. Submit — your comments are saved as a markdown file in `.orche/reviews/` and, if a tmux target is set, pasted directly into the agent's pane

**Keyboard shortcuts in comment input:**

| Key | Action |
|-----|--------|
| `Enter` | Submit comment |
| `Shift+Enter` | Newline |
| `Escape` | Cancel |

### Themes

Four built-in color themes, persisted across sessions:

- **Obsidian** — dark, warm amber accent
- **Porcelain** — light, slate-blue accent
- **Sandstone** — warm light, burnt orange accent
- **Arctic** — dark, teal accent

## Contributing

### Setup

```bash
git clone https://github.com/anthropics/orche.git
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
