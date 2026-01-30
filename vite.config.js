import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Gitコミットハッシュとビルド日時を取得（物理仕様: VERCEL_GIT_COMMIT_SHA 優先）
let gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
let buildTime = new Date().toISOString()

try {
  if (gitCommit === 'unknown') {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  }
} catch (e) {
  // Gitがない場合は無視
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(gitCommit),
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
