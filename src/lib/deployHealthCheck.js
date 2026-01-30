/**
 * デプロイ健全性チェック（Bulletproof）
 *
 * 1. BUILD_TIME が古い（48時間以上）→ キャッシュ or デプロイ失敗の疑い
 * 2. GIT_COMMIT が 'unknown' → ビルド時に git が利用できなかった（Vercel では通常ありえない）
 * 3. BUILD_TIME が未来 → ブラウザ時刻の不整合 or ビルドサーバー時刻異常
 *
 * @returns {{ healthy: boolean, warnings: string[], buildTime: string, gitCommit: string }}
 */
export function checkDeployHealth() {
  const buildTime = import.meta.env.VITE_BUILD_TIME || null;
  const gitCommit = import.meta.env.VITE_GIT_COMMIT || 'unknown';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || null;

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
