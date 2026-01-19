import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/observatory/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/observatory/api': {
        target: 'http://localhost:18789',
        changeOrigin: true,
      },
      '/observatory/events': {
        target: 'http://localhost:18789',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
