/**
 * Firestore 旧スキーマ → 新スキーマ移行スクリプト
 *
 * 対象: pair_media/{pairId}/days/{dateKey} の各doc
 * 条件: docに audioPath があり、かつ parent が無い場合だけ
 * 動作: parent = { audioPath, mimeType, extension, uploadedAt, uploadedBy, version } を set({merge:true})
 * 移行後: 旧フィールド(audioPath/mimeType/extension/uploadedAt/uploadedBy) を削除
 *
 * 実行: node scripts/migrate_pair_media_legacy_to_parent.js --pairId=demo --dryRun=true
 * 実際に書く: node scripts/migrate_pair_media_legacy_to_parent.js --pairId=demo --dryRun=false
 * 環境変数: FIREBASE_SERVICE_ACCOUNT (.env.local から読み込み)
 */

import dotenv from 'dotenv'
import admin from 'firebase-admin'
import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

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
  admin.initializeApp({
    credential: admin.credential.cert(cred),
  })
  return admin.firestore()
}

function parseArgs() {
  const args = process.argv.slice(2)
  const pairId = args.find(arg => arg.startsWith('--pairId='))?.split('=')[1]
  const dryRunArg = args.find(arg => arg.startsWith('--dryRun='))?.split('=')[1]
  const dryRun = dryRunArg !== 'false' // デフォルトは true（安全）
  
  if (!pairId) {
    throw new Error('--pairId が必要です。例: node scripts/migrate_pair_media_legacy_to_parent.js --pairId=demo --dryRun=true')
  }
  return { pairId, dryRun }
}

async function main() {
  const { pairId, dryRun } = parseArgs()
  
  if (dryRun) {
    console.log('\n=== pair_media 旧スキーマ → 新スキーマ移行 (DRY-RUN) ===\n')
  } else {
    console.log('\n=== pair_media 旧スキーマ → 新スキーマ移行 (実実行) ===\n')
  }

  const firestore = initFirebaseAdmin()
  const daysRef = firestore.collection('pair_media').doc(pairId).collection('days')

  // 全docを取得
  const snapshot = await daysRef.get()

  let targetCount = 0
  let migratedCount = 0
  let skippedCount = 0
  let errorCount = 0
  const targetDateKeys = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const dateKey = doc.id

    // 条件チェック: audioPath があり、かつ parent が無い場合だけ
    if (!data.audioPath) {
      skippedCount++
      continue
    }
    if (data.parent) {
      skippedCount++
      continue
    }

    targetCount++
    targetDateKeys.push(dateKey)

    if (dryRun) {
      // dry-run: 書き込みせず、移行対象の日付だけ表示
      continue
    }

    try {
      // version を計算（uploadedAt から、なければ現在時刻）
      const version = data.uploadedAt?.toMillis?.() || Date.now()

      // parent フィールドを追加
      const parentData = {
        audioPath: data.audioPath,
        mimeType: data.mimeType,
        extension: data.extension,
        uploadedAt: data.uploadedAt,
        uploadedBy: data.uploadedBy,
        version,
      }

      // 旧フィールドを削除するための更新
      const updateData = {
        parent: parentData,
        latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        audioPath: admin.firestore.FieldValue.delete(),
        mimeType: admin.firestore.FieldValue.delete(),
        extension: admin.firestore.FieldValue.delete(),
        uploadedAt: admin.firestore.FieldValue.delete(),
        uploadedBy: admin.firestore.FieldValue.delete(),
      }

      await doc.ref.set(updateData, { merge: true })
      migratedCount++
    } catch (e) {
      errorCount++
      console.error(`  ❌ エラー: ${dateKey} - ${e.message}`)
    }
  }

  if (dryRun) {
    console.log(`移行対象件数: ${targetCount}`)
    if (targetCount > 0) {
      console.log(`移行対象日付: ${targetDateKeys.join(', ')}`)
    }
  } else {
    console.log(`移行対象件数: ${targetCount}`)
    console.log(`実移行件数: ${migratedCount}`)
  }
  console.log(`スキップ件数: ${skippedCount}`)
  if (errorCount > 0) {
    console.log(`エラー件数: ${errorCount}`)
  }
  console.log('')
}

main().catch((e) => {
  console.error('migrate_pair_media_legacy_to_parent:', e)
  process.exit(1)
})
