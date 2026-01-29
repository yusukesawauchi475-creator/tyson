#!/usr/bin/env node
/**
 * 1. CORS (origin: ["*"]) を tyson-3341f バケットに強制適用
 * 2. 1バイト書き込みでバケット実在・書き込み可能を証明
 *
 * 要: GOOGLE_APPLICATION_CREDENTIALS または gcloud auth application-default login
 */

import { existsSync, readFileSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUCKET = 'tyson-3341f.firebasestorage.app'
const CORS_JSON = join(__dirname, '..', 'cors.json')

async function runGsutilCors() {
  return new Promise((resolve, reject) => {
    if (!existsSync(CORS_JSON)) {
      reject(new Error(`cors.json not found: ${CORS_JSON}`))
      return
    }
    const c = spawn('gsutil', ['cors', 'set', CORS_JSON, `gs://${BUCKET}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    let out = ''
    let err = ''
    c.stdout?.on('data', (d) => { out += d.toString() })
    c.stderr?.on('data', (d) => { err += d.toString() })
    c.on('close', (code) => {
      if (code === 0) {
        console.log('[CORS] gsutil OK')
        resolve()
      } else {
        reject(new Error(`gsutil exit ${code}: ${err || out}`))
      }
    })
    c.on('error', (e) => reject(e))
  })
}

async function runNodeCorsAndProve() {
  const { Storage } = await import('@google-cloud/storage')
  const corsRaw = readFileSync(CORS_JSON, 'utf8')
  const corsArr = JSON.parse(corsRaw)
  const corsConfig = corsArr.map((c) => ({
    maxAgeSeconds: c.maxAgeSeconds ?? 3600,
    method: c.method || ['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
    origin: c.origin || ['*'],
    responseHeader:
      c.responseHeader ||
      ['Content-Type', 'Authorization', 'Content-Length', 'x-goog-resumable'],
  }))

  const storage = new Storage()
  const bucket = storage.bucket(BUCKET)

  console.log('[CORS] Applying origin:* to gs://' + BUCKET)
  await bucket.setCorsConfiguration(corsConfig)
  console.log('[CORS] OK @google-cloud/storage')

  const path = `test/proof_${Date.now()}.txt`
  const oneByte = Buffer.from('x')
  const file = bucket.file(path)
  await file.save(oneByte, { resumable: false })
  const [meta] = await file.getMetadata()
  const size = Number(meta?.size ?? 0)

  console.log('[PROOF] 1-byte write OK')
  console.log('[PROOF] gs://' + BUCKET + '/' + path + ' size=' + size)
  if (meta?.mediaLink) {
    console.log('[PROOF] mediaLink=' + meta.mediaLink)
  }
  return { path, size, bucket: BUCKET }
}

async function main() {
  console.log('Bucket: ' + BUCKET)

  let gsutilOk = false
  try {
    await runGsutilCors()
    gsutilOk = true
  } catch (e) {
    console.warn('[CORS] gsutil skip:', e.message)
    if (e.message?.includes('ENOENT') || e.message?.includes('gsutil')) {
      console.warn('[CORS] Install Google Cloud SDK, then: npm run cors:set')
    }
  }

  try {
    const proof = await runNodeCorsAndProve()
    if (!gsutilOk) {
      console.log('[CORS] Applied via @google-cloud/storage only')
    }
    console.log('[DONE] CORS set + 1-byte proof:', JSON.stringify(proof))
    process.exit(0)
  } catch (e) {
    console.error('[ERROR]', e.message || e)
    if (e.code === 'CREDENTIALS_MISSING' || e.message?.includes('Could not load the default credentials')) {
      console.error('Run: gcloud auth application-default login')
      console.error('Or set GOOGLE_APPLICATION_CREDENTIALS to a service account key JSON')
    }
    process.exit(1)
  }
}

main()
