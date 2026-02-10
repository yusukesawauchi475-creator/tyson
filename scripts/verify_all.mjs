#!/usr/bin/env node
/**
 * verify_all.mjs
 * 全検証を順次実行する統合スクリプト
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const steps = [
  { name: 'smoke:uiCopy', cmd: 'npm', args: ['run', 'smoke:uiCopy'] },
  { name: 'verify:date', cmd: 'npm', args: ['run', 'verify:date'] },
  { name: 'verify:audio', cmd: 'npm', args: ['run', 'verify:audio'] },
  { name: 'verify:admin', cmd: 'npm', args: ['run', 'verify:admin'] },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
]

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`[VERIFY] Starting: ${step.name}`)
    const startTime = Date.now()

    const proc = spawn(step.cmd, step.args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
    })

    proc.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[VERIFY] ✓ ${step.name} passed (${duration}s)`)
        resolve()
      } else {
        console.error(`[VERIFY] ✗ ${step.name} failed (exit ${code}, ${duration}s)`)
        reject(new Error(`${step.name} failed with exit code ${code}`))
      }
    })

    proc.on('error', (err) => {
      console.error(`[VERIFY] ✗ ${step.name} error:`, err.message)
      reject(err)
    })
  })
}

async function main() {
  console.log('[VERIFY] Starting verification suite...\n')

  for (const step of steps) {
    try {
      await runStep(step)
    } catch (err) {
      console.error(`\n[VERIFY] Verification failed at: ${step.name}`)
      process.exit(1)
    }
  }

  console.log('\n[VERIFY] All verifications passed ✓')
  process.exit(0)
}

main().catch((err) => {
  console.error('[VERIFY] Fatal error:', err)
  process.exit(1)
})
