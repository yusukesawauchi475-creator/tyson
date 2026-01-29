/**
 * 除霊（Data Cleanup）: Firestore diagnoses 内の status: "pending" ドキュメントを物理削除
 *
 * 実行例:
 *   KILL_ORANGE_USER_ID=<あなたのユーザーID> node scripts/kill-orange.js
 *   KILL_ORANGE_ALL=1 node scripts/kill-orange.js   … userId 問わず全削除
 *
 * .env.local の FIREBASE_SERVICE_ACCOUNT を使用。npm run kill-orange でも可。
 */

import dotenv from 'dotenv'
import admin from 'firebase-admin'
import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const USER_ID = process.env.KILL_ORANGE_USER_ID || ''
const KILL_ALL = process.env.KILL_ORANGE_ALL === '1'
const COLLECTION = 'diagnoses'

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length > 0) {
    return { firestore: admin.firestore() }
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  const parsed = parseFirebaseServiceAccount(raw)
  if (!parsed.success) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT パース失敗: ' + (parsed.error?.message || ''))
  }
  const cred = parsed.data
  const projectId = cred.project_id ?? process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
    || (projectId ? `${projectId}.firebasestorage.app` : null)
    || 'tyson-3341f.firebasestorage.app'
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    storageBucket: bucket,
  })
  return { firestore: admin.firestore() }
}

async function main() {
  if (!KILL_ALL && !USER_ID.trim()) {
    console.error('❌ KILL_ORANGE_USER_ID が未設定です。')
    console.error('   例: KILL_ORANGE_USER_ID=<あなたのユーザーID> node scripts/kill-orange.js')
    console.error('   全削除: KILL_ORANGE_ALL=1 node scripts/kill-orange.js')
    process.exit(1)
  }

  const { firestore } = initFirebaseAdmin()
  const col = firestore.collection(COLLECTION)
  let q = col.where('status', '==', 'pending')
  if (!KILL_ALL) q = q.where('userId', '==', USER_ID)
  const snap = await q.get()
  const ids = snap.docs.map((d) => d.id)
  const BATCH_SIZE = 500
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = firestore.batch()
    const chunk = snap.docs.slice(i, i + BATCH_SIZE)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  console.log('削除したドキュメント ID:', ids.length ? ids.join(', ') : '(なし)')
  console.log('\nFirestore 側のゴミ掃除が完了した。')
}

main().catch((e) => {
  console.error('❌ kill-orange 失敗:', e?.message ?? e)
  process.exit(1)
})
