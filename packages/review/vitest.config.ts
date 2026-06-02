import { defineConfig } from 'vitest/config'

// Dedicated config so vitest does NOT load the app's vite.config.ts (which wires
// the electron + react plugins). These are plain node tests for the backend
// contract — no DOM, no electron build.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'contract/**/*.test.ts'],
  },
})
