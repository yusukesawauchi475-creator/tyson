#!/usr/bin/env node
/**
 * soak_verify.mjs
 * 長時間ループで検証を繰り返すスクリプト
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// 引数解析
const args = process.argv.slice(2)
const minutesArg = args.find((a) => a.startsWith('--minutes='))
const minutes = minutesArg ? parseInt(minutesArg.split('=')[1], 10) : 60

if (isNaN(minutes) || minutes <= 0) {
  console.error('Usage: node scripts/soak_verify.mjs [--minutes=120]')
  process.exit(1)
}

const sleepSeconds = 10
const startTime = Date.now()
const endTime = startTime + minutes * 60 * 1000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runVerify() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/verify_all.mjs'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`verify_all.mjs failed with exit code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

async function main() {
  console.log(`[SOAK] Starting soak verification for ${minutes} minutes`)
  console.log(`[SOAK] Sleep interval: ${sleepSeconds} seconds\n`)

  let loopCount = 0

  while (Date.now() < endTime) {
    loopCount++
    const elapsed = Date.now() - startTime
    const remaining = endTime - Date.now()

    console.log(`\n[SOAK] Loop #${loopCount} | Elapsed: ${formatTime(elapsed)} | Remaining: ${formatTime(remaining)}`)
    console.log(`[SOAK] Time: ${new Date().toISOString()}\n`)

    try {
      await runVerify()
      console.log(`[SOAK] Loop #${loopCount} passed ✓`)
    } catch (err) {
      console.error(`\n[SOAK] Loop #${loopCount} failed:`)
      console.error(err.message)
      process.exit(1)
    }

    // 終了時刻を過ぎていたら終了
    if (Date.now() >= endTime) {
      break
    }

    // 次のループまで待機
    console.log(`[SOAK] Sleeping ${sleepSeconds} seconds...`)
    await sleep(sleepSeconds * 1000)
  }

  const totalElapsed = Date.now() - startTime
  console.log(`\n[SOAK] Soak verification completed`)
  console.log(`[SOAK] Total loops: ${loopCount}`)
  console.log(`[SOAK] Total duration: ${formatTime(totalElapsed)}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[SOAK] Fatal error:', err)
  process.exit(1)
})
