#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node_modules/.bin/electron" "$DIR/dist-electron/main.js" --worktree=/Users/tomasztaranek/code/orche-public/packages/review "$@"
