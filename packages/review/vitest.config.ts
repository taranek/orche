import { defineConfig } from 'vitest/config'

// Dedicated config so vitest does NOT load the app's vite.config.ts. These are
// plain node tests for the backend parity contract — no DOM, no Tauri build.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'contract/**/*.test.ts',
      'src-tauri/**/*.test.ts',
    ],
    // src-tauri/target holds the Rust build — never let vitest descend into it.
    exclude: ['**/node_modules/**', '**/target/**'],
  },
})
