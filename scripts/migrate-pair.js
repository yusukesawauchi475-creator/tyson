/**
 * migrate-pair.js — slug 移行 admin script
 *
 * 用途: Hum の pair slug を新 random 8 文字 slug に置き換え、旧 slug は deactivated flag で 404 化する。
 *
 * 設計:
 *   - Hum schema: pair_numbers/{slug} -> { pairId, memo, createdAt } が slug→pairId mapping。
 *   - 内部 pairId は変更しない（pair_media / journal / pair_members 配下のデータは触らない）。
 *   - 新 slug doc を pair_numbers に追加（pairId は流用）。
 *   - 旧 slug doc に { deactivated, deactivatedAt, migratedTo } を merge:true 禁止で追記
 *     （絶対ルール: 既存 fields を全て読み出してから完全 set）。
 *   - listCollections() で深いネストを recursive コピー（pair_numbers slug doc に subcollection
 *     が無くても future-proof）。
 *
 * 使い方:
 *   node scripts/migrate-pair.js TYSON-ZH90
 *   SKIP_CONFIRM=1 node scripts/migrate-pair.js TYSON-ZH90   # 確認 prompt skip
 *
 * 環境変数 (.env.local 必須):
 *   FIREBASE_SERVICE_ACCOUNT       — base64 encoded service account JSON もしくは生 JSON
 *   FIREBASE_STORAGE_BUCKET        — bucket 名（無くても動作）
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import readline from 'readline';
import { findUniqueSlug } from '../src/lib/pairSlug.js';

const require = createRequire(import.meta.url);

// ---- env load (既存 admin script pattern を踏襲) ----
const envContent = readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const raw = envVars['FIREBASE_SERVICE_ACCOUNT'];
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT not set in .env.local');
  process.exit(1);
}

let cred;
try {
  cred = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
} catch {
  cred = JSON.parse(raw);
}

const projectId = cred.project_id;
const bucketName = envVars['FIREBASE_STORAGE_BUCKET']
  || envVars['VITE_FIREBASE_STORAGE_BUCKET']
  || `${projectId}.firebasestorage.app`;

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(cred),
  storageBucket: bucketName,
});

const db = admin.firestore();
const SLUGS_COLLECTION = 'pair_numbers';

// Phase X-1: slug 生成は src/lib/pairSlug.js の generateSlug() / findUniqueSlug() に統一
// length 8 + Crockford Base32 風 chars (l/o/0/1 除外) 強制

/** subcollection を recursive にコピー。戻り値は document 数。 */
async function copyCollection(sourceRef, targetRef) {
  const snapshot = await sourceRef.get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const targetDocRef = targetRef.doc(doc.id);
    await targetDocRef.set(doc.data());
    count++;

    const subcollections = await doc.ref.listCollections();
    for (const subColl of subcollections) {
      const targetSubColl = targetDocRef.collection(subColl.id);
      const subCount = await copyCollection(subColl, targetSubColl);
      count += subCount;
    }
  }
  return count;
}

async function confirm(prompt) {
  if (process.env.SKIP_CONFIRM === '1') return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function main() {
  const sourceSlug = process.argv[2];
  if (!sourceSlug) {
    console.error('Usage: node scripts/migrate-pair.js <source-slug>');
    console.error('       SKIP_CONFIRM=1 node scripts/migrate-pair.js <source-slug>');
    process.exit(1);
  }

  console.log(`=== Pair slug migration ===`);
  console.log(`Source slug: ${sourceSlug}`);
  console.log(`Project: ${projectId}`);
  console.log('');

  // 1. source 存在確認
  const sourceRef = db.collection(SLUGS_COLLECTION).doc(sourceSlug);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    console.error(`Source slug not found in ${SLUGS_COLLECTION}/${sourceSlug}`);
    process.exit(1);
  }
  const sourceData = sourceSnap.data();
  console.log(`Source data:`, JSON.stringify(sourceData, null, 2));

  if (sourceData.deactivated === true) {
    console.error(`Source slug is already deactivated (migratedTo=${sourceData.migratedTo ?? '?'})`);
    process.exit(1);
  }

  // 2. 衝突しない新 slug 生成 (helper 経由)
  const newSlug = await findUniqueSlug(async (candidate) => {
    const snap = await db.collection(SLUGS_COLLECTION).doc(candidate).get();
    return snap.exists;
  });
  console.log(`New slug: ${newSlug}`);
  console.log(`  → URL: https://www.humfamily.com/pair/${newSlug}`);
  console.log('');

  // 3. confirm
  const ok = await confirm(`Proceed with migration ${sourceSlug} → ${newSlug}? (yes/no): `);
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const migratedAt = admin.firestore.FieldValue.serverTimestamp();

  // 4. 新 slug doc 作成（pairId などは source から流用、migration メタを追加）
  const targetRef = db.collection(SLUGS_COLLECTION).doc(newSlug);
  const targetExisting = await targetRef.get();
  if (targetExisting.exists) {
    console.error(`Target slug already exists: ${newSlug}（race condition）`);
    process.exit(1);
  }
  // Phase II-share-bug-fix: createdAt 必須化
  // root cause: Firestore orderBy('createdAt') query は createdAt 不在 doc を物理的に除外
  // → AdminPage 発行済みペア tab で migration 先 doc が表示されない bug
  // → sourceData.createdAt 不在 (legacy founder family) でも serverTimestamp で補完
  await targetRef.set({
    ...sourceData,
    createdAt: sourceData.createdAt || migratedAt,
    deactivated: false,
    migratedFrom: sourceSlug,
    migratedAt,
  });
  console.log(`✓ Created ${SLUGS_COLLECTION}/${newSlug}`);

  // 5. subcollection 再帰コピー（pair_numbers の slug doc に subcollection が無い設計だが
  //    将来の schema 変更に備えて defensive にコピー）
  const subcollections = await sourceRef.listCollections();
  let totalSubDocs = 0;
  for (const subColl of subcollections) {
    const targetSubColl = targetRef.collection(subColl.id);
    const subCount = await copyCollection(subColl, targetSubColl);
    console.log(`✓ Subcollection ${subColl.id}: ${subCount} docs copied`);
    totalSubDocs += subCount;
  }
  if (subcollections.length === 0) {
    console.log(`✓ Subcollections: none (pair_numbers slug doc 想定通り)`);
  }

  // 6. 旧 slug doc に deactivation flag を追記（merge:true 禁止 →
  //    既存 sourceData に新 fields を上書きして完全 set）
  await sourceRef.set({
    ...sourceData,
    deactivated: true,
    deactivatedAt: migratedAt,
    migratedTo: newSlug,
  });
  console.log(`✓ Deactivated ${SLUGS_COLLECTION}/${sourceSlug} (migratedTo=${newSlug})`);

  // 7. summary
  console.log('');
  console.log('=== Migration completed ===');
  console.log(`From: ${sourceSlug}`);
  console.log(`To:   ${newSlug}`);
  console.log(`Sub-docs copied: ${totalSubDocs}`);
  console.log(`Internal pairId (unchanged): ${sourceData.pairId ?? '(unset)'}`);
  console.log(`New URL: https://www.humfamily.com/pair/${newSlug}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. 段階2: PairWorld.jsx に deactivated flag check を実装');
  console.log('  2. 段階7 hotfix: deactivated 検知時に localStorage hum_last_slug を clear + / にリダイレクト');
  console.log(`  3. Yusuke が母に新 URL を LINE 等で共有: https://www.humfamily.com/pair/${newSlug}`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => admin.app().delete());
