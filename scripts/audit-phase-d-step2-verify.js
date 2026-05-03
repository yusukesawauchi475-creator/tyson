/**
 * Phase D Step 2 verify (read-only)
 *
 * 旧 slug 7 件の pair_numbers doc の deactivated / migratedTo / migratedAt 状態確認。
 * Q3 Boss 指示: admin 「発行済みペア」 list に旧 slug が新 slug と並列表示される screenshot 検出 →
 *   全件 deactivated:true なら admin UI filter logic backlog 化。
 *   一部 deactivated:false / 不在なら緊急 補填 migration phase。
 *
 * 絶対 rule:
 * - admin SDK の get のみ使用、set / update / delete / add / batch.commit 禁止
 * - 旧 slug 7 件 + 新 slug 4 件 の read のみ
 */
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

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
let cred
try { cred = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) }
catch { cred = JSON.parse(raw) }

const admin = require('firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(cred) })
const db = admin.firestore()

const OLD_SLUGS = ['mw49f0', 'h06m0g', 'libriv', '2habi5', '5828p4', 'lxm0mt', 'ulf1q6']
const NEW_SLUGS = ['kgaxrs94', 'jjw78emr', 'yntk4g9e', 'uzbjjjt8']

function serializeData(data) {
  if (!data) return null
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

async function readSlug(slug) {
  const ref = db.collection('pair_numbers').doc(slug)
  const snap = await ref.get()
  if (!snap.exists) return { slug, exists: false }
  return { slug, exists: true, data: serializeData(snap.data()) }
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), oldSlugs: [], newSlugs: [] }
  console.error('[verify] reading 7 old slugs (read-only) ...')
  for (const s of OLD_SLUGS) {
    const r = await readSlug(s)
    out.oldSlugs.push(r)
    console.error(`  ${s}: exists=${r.exists} deactivated=${r.data?.deactivated} migratedTo=${r.data?.migratedTo}`)
  }
  console.error('[verify] reading 4 new slugs (read-only, sanity check) ...')
  for (const s of NEW_SLUGS) {
    const r = await readSlug(s)
    out.newSlugs.push(r)
    console.error(`  ${s}: exists=${r.exists} deactivated=${r.data?.deactivated} pairId=${r.data?.pairId}`)
  }
  console.log(JSON.stringify(out, null, 2))
}

main()
  .catch(e => { console.error('[verify] fatal:', e); process.exit(1) })
  .finally(() => admin.app().delete())
