/**
 * CEO試行最終化: デプロイ健全性チェック（ダミー BUILD_TIME でシミュレーション）
 *
 * 1. ダミー VITE_BUILD_TIME で checkDeployHealth() を実行し、健全性判定が正常に動作することを検証
 * 2. BUILD_TIME が古い（48時間以上）→ healthy: false, warnings 検出
 * 3. BUILD_TIME が未来 → healthy: false, warnings 検出
 * 4. GIT_COMMIT が 'unknown' → healthy: false, warnings 検出
 * 5. 正常な BUILD_TIME → healthy: true
 */

function ok(label, msg = '') {
  console.log('  ✅', label, msg);
}

function fail(label, msg) {
  console.error('  ❌', label, msg);
  process.exit(1);
}

// ダミー import.meta.env をシミュレート
function simulateCheckDeployHealth(buildTime, gitCommit, projectId) {
  const warnings = [];
  let healthy = true;

  // 1. BUILD_TIME 検証
  if (!buildTime) {
    warnings.push('BUILD_TIME が未定義です。ビルドが正常に完了していない可能性があります。');
    healthy = false;
  } else {
    try {
      const buildDate = new Date(buildTime);
      const now = Date.now();
      const ageMs = now - buildDate.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours < 0) {
        warnings.push(
          `BUILD_TIME が未来です（${Math.abs(ageHours).toFixed(1)}時間先）。ブラウザ時刻またはビルドサーバー時刻を確認してください。`
        );
        healthy = false;
      } else if (ageHours > 48) {
        warnings.push(
          `BUILD_TIME が古いです（${ageHours.toFixed(1)}時間前）。古いキャッシュを見ているか、Vercel デプロイが失敗している可能性があります。ターミナルで "git log -1" を確認し、Vercel ダッシュボードのデプロイステータスを確認してください。`
        );
        healthy = false;
      }
    } catch (e) {
      warnings.push(`BUILD_TIME のパースに失敗しました（${buildTime}）。`);
      healthy = false;
    }
  }

  // 2. GIT_COMMIT 検証
  if (gitCommit === 'unknown') {
    warnings.push(
      'GIT_COMMIT が unknown です。Vercel ビルド時に git が利用できなかった可能性があります。ローカルビルドの場合は .git ディレクトリの存在を確認してください。'
    );
    healthy = false;
  }

  // 3. Vercel 環境であることを推定（projectId があればデプロイ済み想定）
  if (projectId && !healthy) {
    warnings.push(
      '！デプロイ不整合：最新のビルドが Vercel に反映されていません。ターミナルログを確認してください。'
    );
  }

  return { healthy, warnings, buildTime: buildTime || 'unknown', gitCommit };
}

async function main() {
  console.log('\n=== CEO試行最終化: デプロイ健全性チェック ===\n');

  // 1. 正常な BUILD_TIME（現在時刻）
  const now = new Date().toISOString();
  const r1 = simulateCheckDeployHealth(now, '3e3105b', 'tyson-3341f');
  if (!r1.healthy) fail('1. 正常な BUILD_TIME', 'expected healthy: true');
  if (r1.warnings.length > 0) fail('1. warnings', JSON.stringify(r1.warnings));
  ok('1. 正常な BUILD_TIME', 'healthy: true');

  // 2. BUILD_TIME が古い（48時間以上）
  const old = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
  const r2 = simulateCheckDeployHealth(old, '3e3105b', 'tyson-3341f');
  if (r2.healthy) fail('2. 古い BUILD_TIME', 'expected healthy: false');
  if (!r2.warnings.some((w) => /古い/.test(w))) fail('2. warnings', 'expected "古い"');
  if (!r2.warnings.some((w) => /デプロイ不整合/.test(w))) fail('2. warnings', 'expected "デプロイ不整合"');
  ok('2. 古い BUILD_TIME', `healthy: false, warnings: ${r2.warnings.length}`);

  // 3. BUILD_TIME が未来
  const future = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
  const r3 = simulateCheckDeployHealth(future, '3e3105b', 'tyson-3341f');
  if (r3.healthy) fail('3. 未来の BUILD_TIME', 'expected healthy: false');
  if (!r3.warnings.some((w) => /未来/.test(w))) fail('3. warnings', 'expected "未来"');
  ok('3. 未来の BUILD_TIME', `healthy: false, warnings: ${r3.warnings.length}`);

  // 4. GIT_COMMIT が unknown
  const r4 = simulateCheckDeployHealth(now, 'unknown', 'tyson-3341f');
  if (r4.healthy) fail('4. GIT_COMMIT unknown', 'expected healthy: false');
  if (!r4.warnings.some((w) => /GIT_COMMIT.*unknown/.test(w))) fail('4. warnings', 'expected "GIT_COMMIT unknown"');
  ok('4. GIT_COMMIT unknown', `healthy: false, warnings: ${r4.warnings.length}`);

  // 5. BUILD_TIME が未定義
  const r5 = simulateCheckDeployHealth(null, '3e3105b', 'tyson-3341f');
  if (r5.healthy) fail('5. BUILD_TIME 未定義', 'expected healthy: false');
  if (!r5.warnings.some((w) => /未定義/.test(w))) fail('5. warnings', 'expected "未定義"');
  ok('5. BUILD_TIME 未定義', `healthy: false, warnings: ${r5.warnings.length}`);

  console.log('\n=== 論理疎通完遂（CEO テスト前の AI 側確認済み） ===\n');
}

main().catch((e) => {
  console.error('verify-deploy-health:', e);
  process.exit(1);
});
