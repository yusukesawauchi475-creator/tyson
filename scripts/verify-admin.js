/**
 * 管理画面整合性検証: ダミーデータを Firestore shugyo に書き込み、管理画面と同じクエリで取得できることを確認
 *
 * 1. Firebase Admin で shugyo にダミードキュメントを追加
 * 2. orderBy('timestamp', 'desc') で取得
 * 3. ダミーが含まれることを確認
 * 4. テスト用ドキュメントを削除（オプション）
 *
 * 実行: node scripts/verify-admin.js
 * 環境変数: FIREBASE_SERVICE_ACCOUNT (.env.local から読み込み)
 */

import dotenv from 'dotenv'
import admin from 'firebase-admin'
import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const COLLECTION = 'shugyo'
const TEST_DOC_PREFIX = 'verify-admin-'

function ok(msg) {
  console.log('  ✅', msg)
}

function fail(msg) {
  console.error('  ❌', msg)
  process.exit(1)
}

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length > 0) {
    return admin.firestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  const parsed = parseFirebaseServiceAccount(raw)
  if (!parsed.success) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT パース失敗: ' + (parsed.error?.message || ''))
  }
  const cred = parsed.data
  const projectId = cred.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
    || (projectId ? `${projectId}.firebasestorage.app` : null)
    || 'tyson-3341f.firebasestorage.app'
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    storageBucket: bucket,
  })
  return admin.firestore()
}

async function main() {
  console.log('\n=== verify-admin: 管理画面整合性検証 ===\n')

  const firestore = initFirebaseAdmin()
  const col = firestore.collection(COLLECTION)

  // 1. ダミードキュメントを追加（api/upload と同じ構造）
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const docData = {
    date: dateStr,
    timestamp: now,
    userName: 'verify-admin-test',
    audioURL: 'https://example.com/verify-admin-dummy.mp3',
    streakCount: 1,
    createdAt: now,
    source: 'verify-admin',
    _testMark: true,
  }

  let testDocId = null
  try {
    const docRef = await col.add(docData)
    testDocId = docRef.id
    ok(`ダミードキュメントを追加: ${testDocId}`)
  } catch (e) {
    fail(`Firestore 書き込み失敗: ${e.message}`)
  }

  // 2. 管理画面と同じクエリで取得
  try {
    const q = col.orderBy('timestamp', 'desc').limit(50)
    const snapshot = await q.get()

    const found = snapshot.docs.find((d) => d.id === testDocId)
    if (!found) {
      fail(`ダミードキュメントが見つかりません。クエリ条件が保存時と一致しているか確認してください。取得件数: ${snapshot.size}`)
    }
    ok(`管理画面クエリでダミーを検出: orderBy('timestamp','desc')`)

    const data = found.data()
    if (data.userName !== docData.userName) {
      fail(`userName 不一致: ${data.userName} !== ${docData.userName}`)
    }
    if (data.date !== dateStr) {
      fail(`date 不一致: ${data.date} !== ${dateStr}`)
    }
    ok('ドキュメント構造検証 OK')
  } catch (e) {
    fail(`Firestore 取得失敗: ${e.message}`)
  }

  // 3. テスト用ドキュメントを削除
  try {
    await col.doc(testDocId).delete()
    ok('テスト用ドキュメントを削除')
  } catch (e) {
    console.warn('  ⚠ 削除失敗（非致命的）:', e.message)
  }

  console.log('\n=== 管理画面整合性検証 完遂 ===\n')
}

main().catch((e) => {
  console.error('verify-admin:', e)
  process.exit(1)
})
