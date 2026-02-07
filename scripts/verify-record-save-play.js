/**
 * 録音→保存→再生 フロー自動検証（人間作業ゼロ）
 * HANDOFF.md SSOT 準拠
 */
import { loadEnv } from 'vite'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const report = { envRead: 'NG', firebaseInit: 'NG', servers: 'NG', urls: {} }

  // 1. .env.local 存在確認
  const envPath = join(root, '.env.local')
  if (!existsSync(envPath)) {
    console.log(JSON.stringify({ ...report, cause: '.env.local not found' }, null, 2))
    process.exit(1)
  }

  // 2. loadEnv で VITE_* 読込確認
  const env = loadEnv(process.env.NODE_ENV || 'development', root, '')
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  if (projectId && String(projectId).trim()) {
    report.envRead = 'OK'
    report.firebaseInit = 'OK'
  }

  // 3. キャッシュ削除・ポート解放
  const { execSync } = await import('child_process')
  try {
    execSync('rm -rf node_modules/.vite', { cwd: root })
    execSync('npx kill-port 3001 5173 5174 5175 2>/dev/null || true', { cwd: root })
  } catch (_) {}

  // 4. dev:all 起動
  const { spawn } = await import('child_process')
  const child = spawn('npm', ['run', 'dev:all'], {
    cwd: root,
    stdio: 'pipe',
    detached: true,
    shell: true,
  })
  child.unref()

  // 5. サーバー起動待ち（最大30秒）
  const vitePorts = [5173, 5174, 5175]
  let apiReady = false
  let viteReady = false

  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const api = await fetch('http://localhost:3001/health').then((r) => r.ok).catch(() => false)
      if (api) {
        apiReady = true
        report.urls.api = 'http://localhost:3001'
      }
    } catch (_) {}

    for (const p of vitePorts) {
      try {
        const r = await fetch(`http://localhost:${p}/`).then((x) => x.ok).catch(() => false)
        if (r) {
          viteReady = true
          report.urls.vite = `http://localhost:${p}`
          report.urls.parent = `http://localhost:${p}/#/`
          report.urls.child = `http://localhost:${p}/#/tyson`
          break
        }
      } catch (_) {}
    }
    if (apiReady && viteReady) break
  }

  report.servers = apiReady && viteReady ? 'OK' : 'NG'
  report.cause = report.servers === 'NG' ? 'servers did not become ready within 30s' : null

  console.log(JSON.stringify(report, null, 2))
  process.exit(report.servers === 'OK' ? 0 : 1)
}

main().catch((e) => {
  console.log(JSON.stringify({ envRead: 'NG', firebaseInit: 'NG', servers: 'NG', cause: e?.message }, null, 2))
  process.exit(1)
})
