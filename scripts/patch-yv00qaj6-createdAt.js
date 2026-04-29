/**
 * Phase II-share-bug-fix: yv00qaj6 doc に createdAt field 追加
 *
 * root cause: yv00qaj6 doc に createdAt 不在 → Firestore orderBy('createdAt', 'desc') query で除外
 * → AdminPage 発行済みペア tab に表示されない
 *
 * 修正: pair_numbers/yv00qaj6 doc に createdAt = migratedAt の値 (TYSON-ZH9O migration 時) を set
 * これで AdminPage query で正常表示、5 variation table の「migration 先」 row が期待通り動作
 *
 * 実行: node scripts/patch-yv00qaj6-createdAt.js
 *
 * 注: 1 回限りの patch、実行後は audit trail として残す
 */
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// .env.local から FIREBASE_SERVICE_ACCOUNT (base64 or 生 JSON) load
const envContent = readFileSync('.env.local', 'utf8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

const raw = envVars.FIREBASE_SERVICE_ACCOUNT
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT not set in .env.local')
  process.exit(1)
}
let cred
try { cred = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) }
catch { cred = JSON.parse(raw) }

const admin = require('firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(cred) })

const firestore = admin.firestore()

async function patch() {
  const slug = 'yv00qaj6'
  const ref = firestore.collection('pair_numbers').doc(slug)
  const snap = await ref.get()

  if (!snap.exists) {
    console.error(`[patch] doc ${slug} NOT EXIST、abort`)
    process.exit(1)
  }

  const data = snap.data()
  console.log(`[patch] current ${slug} fields:`)
  Object.keys(data).sort().forEach((key) => {
    const val = data[key]
    let display
    if (val && typeof val === 'object' && val.toDate) {
      display = `Timestamp(${val.toDate().toISOString()})`
    } else {
      display = String(val)
    }
    console.log(`  ${key}: ${display}`)
  })

  if (data.createdAt) {
    console.log(`\n[patch] ${slug} already has createdAt、no-op`)
    process.exit(0)
  }

  // migratedAt を createdAt として使う (migration 時刻 = pair 発行時刻として扱う)
  // migratedAt 不在の場合は serverTimestamp
  const newCreatedAt = data.migratedAt || admin.firestore.FieldValue.serverTimestamp()

  await ref.update({
    createdAt: newCreatedAt,
  })

  console.log(`\n[patch] ${slug} createdAt updated`)

  // verify
  const verifySnap = await ref.get()
  const verifyData = verifySnap.data()
  const ts = verifyData.createdAt?.toDate?.()?.toISOString() || 'serverTimestamp pending'
  console.log(`[patch] verify ${slug} createdAt: ${ts}`)
}

patch()
  .catch((err) => {
    console.error('[patch] error:', err)
    process.exit(1)
  })
  .finally(() => admin.app().delete())
