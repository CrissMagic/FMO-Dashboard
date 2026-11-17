import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    target: ['chrome111', 'safari16.4', 'firefox128'],
    cssTarget: ['chrome111', 'safari16.4', 'firefox128']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/grid/api': {
        target: 'https://fmo.bh1jss.net',
        changeOrigin: true
      },
      '/aprs/api': {
        target: 'https://fmo.bh1jss.net',
        changeOrigin: true
      }
    }
  }
})
