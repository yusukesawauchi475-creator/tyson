/**
 * migrate-phase-d-step2.js — Phase D Step 2: 7 件一括 slug migration (α-2 scope)
 *
 * 用途:
 *   6 文字 active slug 7 件を generateSlug() (8 文字 Crockford Base32) で再発行、
 *   旧 slug は deactivated:true + migratedTo flag で 404 化。
 *   test 系 3 件 (mw49f0 / lxm0mt / ulf1q6) は新 slug doc も即 deactivated:true で発行。
 *
 * 設計:
 *   - 既存 scripts/migrate-pair.js (TYSON-ZH90 用) の logic を流用、7 件 loop + EXCLUSION + dry-run 拡張
 *   - hardcoded MIGRATION_TARGETS / EXCLUSION_LIST / TEST_PAIRS、外部入力なし
 *   - 各 pair は逐次 set()、batch なし → partial rollback 可能
 *   - 内部 pairId は変更しない (pair_media / journal / pair_members は touch なし)
 *   - pair_numbers/{slug} のみ migration、軸 1 (upstream format 統一) 整合
 *
 * 使い方:
 *   node scripts/migrate-phase-d-step2.js --dry-run    # mapping log のみ、Firestore write ゼロ
 *   SKIP_CONFIRM=1 node scripts/migrate-phase-d-step2.js  # 実 run、各 pair 確認 prompt skip
 *   node scripts/migrate-phase-d-step2.js              # 実 run、各 pair 確認 prompt あり
 *
 * 環境変数 (.env.local):
 *   FIREBASE_SERVICE_ACCOUNT  — base64 encoded service account JSON or 生 JSON
 *   FIREBASE_STORAGE_BUCKET   — bucket 名 (デフォルト <project>.firebasestorage.app)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import readline from 'readline';
import { findUniqueSlug } from '../src/lib/pairSlug.js';

const require = createRequire(import.meta.url);

// ---- hardcoded lists (上書き不能) ----
const MIGRATION_TARGETS = ['mw49f0', 'h06m0g', 'libriv', '2habi5', '5828p4', 'lxm0mt', 'ulf1q6'];
const EXCLUSION_LIST = ['TYSON-ZH90', 'yv00qaj6', 'PAIR-FSEAN5', 'PAIR-DEMOTEST', 'PAIR-NY5XTF'];
const TEST_PAIRS = ['mw49f0', 'lxm0mt', 'ulf1q6'];

// ---- env load (既存 migrate-pair.js pattern を踏襲) ----
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

// CLI flag
const DRY_RUN = process.argv.includes('--dry-run');

/** subcollection を recursive にコピー、戻り値は document 数 (defensive、pair_numbers slug doc には通常 subcoll なし) */
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
  if (DRY_RUN) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

/**
 * 1 pair を migration、各 step の log 出力。
 * dry-run の場合は Firestore write を skip し mapping のみ log。
 * @returns {Promise<{ sourceSlug, newSlug, pairId, isTest, deactivatedNew, status, reason? }>}
 */
async function migrateOne(sourceSlug) {
  // 1. EXCLUSION hard check (二重防御、MIGRATION_TARGETS と EXCLUSION_LIST が disjoint なら hit しないはず)
  if (EXCLUSION_LIST.includes(sourceSlug)) {
    throw new Error(`ABORT: source slug "${sourceSlug}" is in EXCLUSION_LIST`);
  }

  // 2. source 存在確認
  const sourceRef = db.collection(SLUGS_COLLECTION).doc(sourceSlug);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    return { sourceSlug, status: 'skipped', reason: 'source slug not found' };
  }
  const sourceData = sourceSnap.data();

  // EXCLUSION 二重 check (source の pairId field も EXCLUSION 対象でないか)
  const pairId = sourceData.pairId || sourceSlug;
  if (EXCLUSION_LIST.includes(pairId)) {
    throw new Error(`ABORT: source slug "${sourceSlug}" maps to EXCLUSION pairId "${pairId}"`);
  }

  if (sourceData.deactivated === true) {
    return { sourceSlug, status: 'skipped', reason: `already deactivated (migratedTo=${sourceData.migratedTo ?? '?'})` };
  }

  // 3. 衝突しない新 slug 生成
  const newSlug = await findUniqueSlug(async (candidate) => {
    const snap = await db.collection(SLUGS_COLLECTION).doc(candidate).get();
    return snap.exists;
  });

  const isTest = TEST_PAIRS.includes(sourceSlug);
  const deactivatedNew = isTest;  // test pair は新 slug doc も即 deactivated

  console.log(`  ${sourceSlug} → ${newSlug}${isTest ? ' (test、新 slug 即 deactivate)' : ''}`);
  console.log(`    pairId: ${pairId}`);
  console.log(`    URL:    https://www.humfamily.com/pair/${newSlug}`);

  if (DRY_RUN) {
    return { sourceSlug, newSlug, pairId, isTest, deactivatedNew, status: 'dry-run' };
  }

  // 4. confirm (per-pair)
  const ok = await confirm(`    Proceed ${sourceSlug} → ${newSlug}? (yes/no): `);
  if (!ok) {
    return { sourceSlug, newSlug, pairId, isTest, deactivatedNew, status: 'aborted' };
  }

  const migratedAt = admin.firestore.FieldValue.serverTimestamp();

  // 5. 新 slug doc 作成
  const targetRef = db.collection(SLUGS_COLLECTION).doc(newSlug);
  const targetExisting = await targetRef.get();
  if (targetExisting.exists) {
    throw new Error(`Target slug already exists: ${newSlug} (race condition)`);
  }
  await targetRef.set({
    ...sourceData,
    createdAt: sourceData.createdAt || migratedAt,
    deactivated: deactivatedNew,
    migratedFrom: sourceSlug,
    migratedAt,
    ...(deactivatedNew ? { deactivatedAt: migratedAt, deactivatedReason: 'test_pair_migration' } : {}),
  });
  console.log(`    ✓ Created ${SLUGS_COLLECTION}/${newSlug} (deactivated=${deactivatedNew})`);

  // 6. subcollection recursive copy (defensive)
  const subcollections = await sourceRef.listCollections();
  let totalSubDocs = 0;
  for (const subColl of subcollections) {
    const targetSubColl = targetRef.collection(subColl.id);
    const subCount = await copyCollection(subColl, targetSubColl);
    console.log(`    ✓ Subcollection ${subColl.id}: ${subCount} docs copied`);
    totalSubDocs += subCount;
  }

  // 7. 旧 slug doc に deactivation flag (merge:true 禁止、完全 set)
  await sourceRef.set({
    ...sourceData,
    deactivated: true,
    deactivatedAt: migratedAt,
    migratedTo: newSlug,
  });
  console.log(`    ✓ Deactivated ${SLUGS_COLLECTION}/${sourceSlug} (migratedTo=${newSlug})`);

  return { sourceSlug, newSlug, pairId, isTest, deactivatedNew, status: 'completed' };
}

async function main() {
  console.log('=== Phase D Step 2: Slug Migration (α-2 scope) ===');
  console.log(`Project:    ${projectId}`);
  console.log(`Mode:       ${DRY_RUN ? 'DRY-RUN (Firestore write 0 件)' : 'REAL RUN'}`);
  console.log(`Targets:    ${MIGRATION_TARGETS.length} 件 (${MIGRATION_TARGETS.join(', ')})`);
  console.log(`Test pairs: ${TEST_PAIRS.length} 件 (新 slug 即 deactivate: ${TEST_PAIRS.join(', ')})`);
  console.log(`Exclusion:  ${EXCLUSION_LIST.length} 件 (${EXCLUSION_LIST.join(', ')})`);
  console.log('');

  // EXCLUSION sanity check (MIGRATION_TARGETS と disjoint であること)
  const overlap = MIGRATION_TARGETS.filter((s) => EXCLUSION_LIST.includes(s));
  if (overlap.length > 0) {
    console.error(`FATAL: MIGRATION_TARGETS ∩ EXCLUSION_LIST = ${overlap.join(', ')} (set 設計 bug)`);
    process.exit(1);
  }

  const results = [];
  for (const sourceSlug of MIGRATION_TARGETS) {
    console.log(`[${MIGRATION_TARGETS.indexOf(sourceSlug) + 1}/${MIGRATION_TARGETS.length}] ${sourceSlug}`);
    try {
      const r = await migrateOne(sourceSlug);
      results.push(r);
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`);
      results.push({ sourceSlug, status: 'failed', reason: e.message });
    }
    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'REAL RUN'}`);
  console.log('');
  console.log('| # | sourceSlug | newSlug | pairId | isTest | deactivatedNew | status |');
  console.log('|---|------------|---------|--------|--------|----------------|--------|');
  results.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.sourceSlug} | ${r.newSlug ?? '-'} | ${r.pairId ?? '-'} | ${r.isTest ?? '-'} | ${r.deactivatedNew ?? '-'} | ${r.status}${r.reason ? ` (${r.reason})` : ''} |`);
  });

  const completed = results.filter((r) => r.status === 'completed').length;
  const dryRun = results.filter((r) => r.status === 'dry-run').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const aborted = results.filter((r) => r.status === 'aborted').length;

  console.log('');
  console.log(`Completed: ${completed}, Dry-run: ${dryRun}, Skipped: ${skipped}, Aborted: ${aborted}, Failed: ${failed}`);

  if (failed > 0) {
    console.error('');
    console.error('FAILED items above; partial state. Re-run with same script (each pair independent, completed pairs auto-skipped via deactivated flag).');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => admin.app().delete());
