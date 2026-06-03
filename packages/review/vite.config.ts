import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plain SPA build for the Tauri shell. (Previously also built the electron
// main/preload via vite-plugin-electron; that's gone now that Tauri is the
// only backend.) `vite build` emits dist/ which Tauri embeds as frontendDist.
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Relative base so embedded assets resolve under Tauri's asset protocol.
  base: './',
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', { target: '19' }],
        ],
      },
    }),
    tailwindcss(),
  ],
  // Tauri expects a fixed dev-server port (see tauri.conf.json devUrl).
  server: {
    port: 5173,
    strictPort: true,
  },
})
