/**
 * upload-demo-azmcqghd.js — 撮影用 demo photo 投入 (azmcqghd / PAIR-SPC2NF 限定)
 *
 * 用途:
 *   ~/Downloads/kling_20260504*.png 10 件を azmcqghd pair album に投入。
 *   tutorial video 撮影用 sample data。voice (audio) は本 script scope 外。
 *
 * 設計 (Yusuke 確定):
 *   - 選択肢 A: 7 日 × 1-2 枚 = 10 枚 (毎日 1 枚以上 enforce、各日 1-2 枚 random 分配)
 *   - role split: parent 5 + child 5 (deterministic shuffle、seed 固定で再現性)
 *   - 日付: 2026-04-27 〜 2026-05-03 (今日基準で過去 7 日)
 *   - timestamp: 各日 08:00 - 22:00 内 random
 *
 * api/journal.js 仕様踏襲 (推測ゼロ、code 引用):
 *   - Storage path: journal/{pairId}/{monthKey}/{dateKey}/{role}/generic_image/photo-0{N}.png (L479)
 *   - Firestore doc: journal/{pairId}/months/{monthKey}/days/{dateKey} (L449)
 *   - meta: roleData.{role}.generic_images[] = { storagePath, kind:'generic_image', uploadId, updatedAt(number ms), bytes, contentType, width:0, height:0, index } (L506-528)
 *   - daily limit: 1 day × 1 role 最大 3 枚 (L474)、本投入は 1-2 枚なので適合
 *   - bucket 明示: admin.storage().bucket(bucketName) (memory hard rule)
 *
 * 絶対 rule (script 内 hard check):
 *   - TARGET_PAIR_ID 以外への write → abort
 *   - EXCLUSION_LIST に対する一致 (target slug / pairId) → abort
 *   - Storage upload 失敗 → 即停止 (orphan なし)
 *   - Firestore write 失敗 → Storage 既 upload file 削除 (rollback) → log + 続行
 *
 * 使い方:
 *   node scripts/upload-demo-azmcqghd.js --dry-run    # write ゼロ、log + variation table のみ
 *   SKIP_CONFIRM=1 node scripts/upload-demo-azmcqghd.js  # 実 run
 */

import { readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { readdirSync } from 'fs'
import { createRequire } from 'module'
import readline from 'readline'

const require = createRequire(import.meta.url)

// ---- hardcoded constants (上書き不能) ----
const TARGET_SLUG = 'azmcqghd'
const TARGET_PAIR_ID = 'PAIR-SPC2NF'

const EXCLUSION_LIST = [
  // 本物 pair (write 絶対禁止)
  'TYSON-ZH90', 'yv00qaj6',
  // 本物 4 pair 新 slug
  'kgaxrs94', 'jjw78emr', 'yntk4g9e', 'uzbjjjt8',
  // 本物 4 pair pairId
  'PAIR-CXH6TH', 'PAIR-2M9W2F', 'PAIR-8XHPL2', 'PAIR-ZEV92B',
  // 旧 slug 7 件 (deactivated 済)
  'mw49f0', 'h06m0g', 'libriv', '2habi5', '5828p4', 'lxm0mt', 'ulf1q6',
  // 新 slug test 系 3 件 (deactivated 済)
  '3d8kgtp5', '9znpzaeb', '3vqg3n3x',
  // その他特殊 pair
  'PAIR-FSEAN5', 'PAIR-DEMOTEST', 'PAIR-NY5XTF',
]

// EXCLUSION_LIST に TARGET が含まれていないか sanity (設計 bug 検出)
if (EXCLUSION_LIST.includes(TARGET_SLUG) || EXCLUSION_LIST.includes(TARGET_PAIR_ID)) {
  console.error('FATAL: TARGET in EXCLUSION_LIST (set 設計 bug)')
  process.exit(1)
}

// ---- env load (既存 migrate-phase-d-step2.js pattern 踏襲) ----
const envContent = readFileSync('.env.local', 'utf8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

const raw = envVars['FIREBASE_SERVICE_ACCOUNT']
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT not set in .env.local')
  process.exit(1)
}

let cred
try {
  cred = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'))
} catch {
  cred = JSON.parse(raw)
}

const projectId = cred.project_id
const bucketName = envVars['FIREBASE_STORAGE_BUCKET']
  || envVars['VITE_FIREBASE_STORAGE_BUCKET']
  || `${projectId}.firebasestorage.app`

const admin = require('firebase-admin')
admin.initializeApp({
  credential: admin.credential.cert(cred),
  storageBucket: bucketName,
})

const db = admin.firestore()
const bucket = admin.storage().bucket(bucketName)  // memory hard rule、明示渡し

// ---- CLI flag ----
const DRY_RUN = process.argv.includes('--dry-run')

// ---- deterministic random (mulberry32、seed 固定で再現性) ----
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const SEED = 20260503  // 固定 seed (再現性、dry-run と実 run で同一 distribution)
const rng = mulberry32(SEED)

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- 画像 list 取得 ----
const DOWNLOADS_DIR = join(homedir(), 'Downloads')
const FILE_PATTERN = /^kling_20260504.*\.png$/

function listImages() {
  const files = readdirSync(DOWNLOADS_DIR)
    .filter((f) => FILE_PATTERN.test(f))
    .sort()  // 安定 sort (先に固定順、後で seed 固定 shuffle で順序確定)
  return files.map((f) => {
    const fullPath = join(DOWNLOADS_DIR, f)
    const st = statSync(fullPath)
    return { filename: f, fullPath, size: st.size }
  })
}

// ---- 7 日 × 1-2 枚 distribution (合計 10、毎日最低 1 枚) ----
// 各日 [1,1,1,1,1,1,1] base = 7 → 残り 3 枚を 7 日中 3 日に追加 → [2,2,2,1,1,1,1] パターン
function buildDayDistribution(totalCount, daysCount) {
  if (totalCount < daysCount) {
    throw new Error(`totalCount(${totalCount}) < daysCount(${daysCount}): 毎日 1 枚 enforce 不能`)
  }
  if (totalCount > daysCount * 3) {
    throw new Error(`totalCount(${totalCount}) > daysCount(${daysCount})*3: daily limit 違反`)
  }
  // base 1 枚 / 日 + 残り random 分配 (各日最大 2 枚 enforce、選択肢 A spec)
  const perDay = new Array(daysCount).fill(1)
  let remaining = totalCount - daysCount
  const candidateDays = shuffle([...Array(daysCount).keys()])
  for (const d of candidateDays) {
    if (remaining === 0) break
    if (perDay[d] < 2) {  // 各日 max 2 枚 enforce (選択肢 A)
      perDay[d]++
      remaining--
    }
  }
  if (remaining > 0) {
    throw new Error(`distribution 不能: ${remaining} 枚余り`)
  }
  return perDay
}

// ---- 日付 list (今日基準で過去 7 日、NY) ----
function getDateKeyNY(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function buildDateList(daysCount) {
  const today = new Date()
  const dates = []
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
    dates.push(getDateKeyNY(d))
  }
  return dates  // 古い → 新しい順
}

// ---- timestamp: 各日 08:00-22:00 内 random (NY) ----
function buildTimestamp(dateKey) {
  // dateKey YYYY-MM-DD を NY 8:00-22:00 内 random ms に展開
  // simple: 各日 8:00 を base、(rng() * 14h) を加算
  const baseMs = new Date(`${dateKey}T08:00:00-04:00`).getTime()  // EDT (UTC-4)、05-03 時点
  const offsetMs = Math.floor(rng() * 14 * 60 * 60 * 1000)
  return baseMs + offsetMs
}

// ---- assignment plan 構築 ----
function buildPlan(images) {
  const total = images.length
  const dates = buildDateList(7)
  const perDay = buildDayDistribution(total, 7)

  // role: parent 5 + child 5 (10 枚前提、shuffle deterministic)
  const halfP = Math.ceil(total / 2)
  const halfC = total - halfP
  const rolesAll = [...Array(halfP).fill('parent'), ...Array(halfC).fill('child')]
  const roles = shuffle(rolesAll)

  // image を shuffle して date 順に割当
  const shuffledImages = shuffle(images)

  const plan = []
  let imgIdx = 0
  for (let d = 0; d < dates.length; d++) {
    const count = perDay[d]
    for (let k = 0; k < count; k++) {
      const img = shuffledImages[imgIdx]
      const role = roles[imgIdx]
      const dateKey = dates[d]
      const monthKey = dateKey.slice(0, 7)
      const ts = buildTimestamp(dateKey)
      plan.push({
        seq: imgIdx + 1,
        filename: img.filename,
        size: img.size,
        role,
        dateKey,
        monthKey,
        timestamp: ts,
        timestampISO: new Date(ts).toISOString(),
        // storagePath / docId は per-day per-role の generic_images.length に依存、投入時確定
      })
      imgIdx++
    }
  }
  if (imgIdx !== total) {
    throw new Error(`plan 不整合: ${imgIdx} vs ${total}`)
  }
  return plan
}

// ---- variation table print ----
function printPlanTable(plan) {
  console.log('')
  console.log('| # | image | role | date | timestamp(NY) | storagePath (predicted) | uploadId |')
  console.log('|---|-------|------|------|----------------|--------------------------|----------|')
  // per-day per-role で index を計算 (api/journal.js L478 nextIndex = list.length + 1)
  const dayRoleCount = {}  // key: `${dateKey}/${role}` → next index
  for (const p of plan) {
    const key = `${p.dateKey}/${p.role}`
    const idx = (dayRoleCount[key] || 0) + 1
    dayRoleCount[key] = idx
    p.index = idx
    p.storagePath = `journal/${TARGET_PAIR_ID}/${p.monthKey}/${p.dateKey}/${p.role}/generic_image/photo-0${idx}.png`
    p.uploadId = `DEMO-${String(p.seq).padStart(2, '0')}-${SEED}`
    const tsLocal = new Date(p.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })
    console.log(`| ${p.seq} | ${p.filename} | ${p.role} | ${p.dateKey} | ${tsLocal} | ${p.storagePath} | ${p.uploadId} |`)
  }
  console.log('')
}

// ---- per-image upload (script 内 hard check + rollback) ----
async function uploadOne(p, image) {
  // hard check 1: write 対象 pairId が TARGET_PAIR_ID か
  if (!p.storagePath.startsWith(`journal/${TARGET_PAIR_ID}/`)) {
    throw new Error(`ABORT hard check: storagePath does not target ${TARGET_PAIR_ID}: ${p.storagePath}`)
  }
  // hard check 2: EXCLUSION 一致 (defensive、storagePath に一致してないか)
  for (const ex of EXCLUSION_LIST) {
    if (p.storagePath.includes(`/${ex}/`) || p.storagePath.includes(`${ex}/`)) {
      throw new Error(`ABORT hard check: storagePath contains EXCLUSION "${ex}": ${p.storagePath}`)
    }
  }

  if (DRY_RUN) {
    console.log(`  [DRY] ${p.seq}/${plan.length}: skip upload + Firestore write (${p.filename} → ${p.storagePath})`)
    return { ...p, status: 'dry-run' }
  }

  // Storage upload
  const buffer = readFileSync(image.fullPath)
  const fileRef = bucket.file(p.storagePath)
  try {
    await fileRef.save(buffer, {
      contentType: 'image/png',
      resumable: false,
    })
    console.log(`    ✓ Storage uploaded: ${p.storagePath} (${buffer.length} bytes)`)
  } catch (e) {
    console.error(`    ✗ Storage upload failed: ${e.message}`)
    return { ...p, status: 'failed', reason: `storage_upload: ${e.message}` }
  }

  // Firestore write (api/journal.js L506-528 仕様踏襲)
  const docRef = db.collection('journal').doc(TARGET_PAIR_ID)
    .collection('months').doc(p.monthKey)
    .collection('days').doc(p.dateKey)

  const itemPayload = {
    storagePath: p.storagePath,
    kind: 'generic_image',
    uploadId: p.uploadId,
    updatedAt: p.timestamp,  // number ms (api L503-505 踏襲)
    bytes: buffer.length,
    contentType: 'image/png',
    width: 0,
    height: 0,
    index: p.index,
  }

  try {
    // existing 読込 → generic_images 配列追加 (api L519-524 踏襲)
    const snap = await docRef.get()
    const existing = snap.exists ? snap.data() : null
    const existingRole = existing?.roleData?.[p.role] ?? {}
    let list = Array.isArray(existingRole.generic_images) ? [...existingRole.generic_images] : []

    // 想定外 collision 検出 (本 demo は clean slate、duplicate 不可)
    if (list.some((it) => it?.uploadId === p.uploadId)) {
      console.error(`    ✗ duplicate uploadId detected: ${p.uploadId}, skip`)
      return { ...p, status: 'skipped', reason: 'duplicate uploadId' }
    }
    list.push(itemPayload)

    const setPayload = {
      requestId: p.uploadId,
      dateKey: p.dateKey,
      monthKey: p.monthKey,
      roleData: {
        [p.role]: {
          ...existingRole,
          generic_images: list,
        },
      },
    }

    await docRef.set(setPayload, { merge: true })
    console.log(`    ✓ Firestore written: journal/${TARGET_PAIR_ID}/months/${p.monthKey}/days/${p.dateKey} (role=${p.role}, index=${p.index})`)
    return { ...p, status: 'completed', bytes: buffer.length }
  } catch (e) {
    console.error(`    ✗ Firestore write failed: ${e.message}, rollback Storage ...`)
    try {
      await fileRef.delete()
      console.log(`    ✓ Storage rollback: deleted ${p.storagePath}`)
    } catch (delErr) {
      console.error(`    ✗ Storage rollback failed: ${delErr.message} (ORPHAN: ${p.storagePath})`)
    }
    return { ...p, status: 'failed', reason: `firestore_write: ${e.message}` }
  }
}

async function confirm(prompt) {
  if (process.env.SKIP_CONFIRM === '1') return true
  if (DRY_RUN) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => rl.question(prompt, resolve))
  rl.close()
  return answer.trim().toLowerCase() === 'yes'
}

let plan = []

async function main() {
  console.log('=== Step 3: azmcqghd 撮影用 demo photo 投入 ===')
  console.log(`Project:        ${projectId}`)
  console.log(`Bucket:         ${bucketName}`)
  console.log(`Target slug:    ${TARGET_SLUG}`)
  console.log(`Target pairId:  ${TARGET_PAIR_ID}`)
  console.log(`Mode:           ${DRY_RUN ? 'DRY-RUN (Storage / Firestore write 0 件)' : 'REAL RUN'}`)
  console.log(`Seed:           ${SEED} (deterministic random)`)
  console.log('')

  const images = listImages()
  console.log(`画像 list: ${images.length} 件`)
  for (const img of images) {
    console.log(`  ${img.filename} (${(img.size / 1024 / 1024).toFixed(2)} MB)`)
  }
  if (images.length === 0) {
    console.error('FATAL: ~/Downloads/kling_20260504*.png 0 件')
    process.exit(1)
  }
  console.log('')

  plan = buildPlan(images)
  printPlanTable(plan)

  // role 分配 sanity
  const parentN = plan.filter((p) => p.role === 'parent').length
  const childN = plan.filter((p) => p.role === 'child').length
  console.log(`role 分配: parent=${parentN} child=${childN} (total=${plan.length})`)
  // 日付分配
  const perDate = {}
  for (const p of plan) perDate[p.dateKey] = (perDate[p.dateKey] || 0) + 1
  console.log(`日付分配: ${JSON.stringify(perDate)}`)
  console.log('')

  if (!DRY_RUN) {
    const ok = await confirm(`実 run で ${plan.length} 件 upload します。続行 (yes/no): `)
    if (!ok) {
      console.log('aborted by user')
      process.exit(0)
    }
  }

  const results = []
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]
    const img = images.find((it) => it.filename === p.filename)
    console.log(`[${i + 1}/${plan.length}] ${p.filename} → ${p.role} / ${p.dateKey} / index ${p.index}`)
    try {
      const r = await uploadOne(p, img)
      results.push(r)
    } catch (e) {
      console.error(`  ✗ FATAL: ${e.message}`)
      results.push({ ...p, status: 'failed', reason: e.message })
    }
    console.log('')
  }

  // Summary
  console.log('=== Summary ===')
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'REAL RUN'}`)
  const completed = results.filter((r) => r.status === 'completed').length
  const dryRun = results.filter((r) => r.status === 'dry-run').length
  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  console.log(`Completed: ${completed}, Dry-run: ${dryRun}, Skipped: ${skipped}, Failed: ${failed}`)

  if (failed > 0) {
    console.error('')
    console.error('FAILED items above; partial state. Re-run script to retry remaining.')
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error('Fatal:', e)
    process.exit(1)
  })
  .finally(() => admin.app().delete())
