import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ビルド日時のみ（git sha は Build Command で VITE_BUILD_SHA に注入）
const buildTime = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Vercelデプロイ用の設定
  build: {
    outDir: 'dist',
  },
})
