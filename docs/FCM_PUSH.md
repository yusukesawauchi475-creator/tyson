# Phase 2-3: FCM Push 通知

「届いたPush通知」の最小実装。

## 変更ファイル一覧

| ファイル | 内容 |
|---------|------|
| `scripts/generate-firebase-sw.js` | 新規: ビルド時に Service Worker を生成 |
| `public/firebase-messaging-sw.js` | 自動生成: FCM バックグラウンド受信 |
| `src/lib/fcm.js` | 新規: 通知許可・token取得・Firestore保存 |
| `src/lib/firebase.js` | `app` をエクスポート |
| `src/pages/PairDailyPage.jsx` | 「通知をON」ボタン追加 |
| `api/pair-media.js` | POST成功後に未再生ならPush送信、OBSERVE |
| `package.json` | `dev`/`build` に SW 生成を追加 |

## Firestore 構造（最小）

```
pair_users/{pairId}/
  parentDevices/{deviceId}     # 親のデバイス（PairDailyPage で登録）
    token: string
    platform: "web"
    createdAt: string (ISO)
    updatedAt: string (ISO)
    lastSeenAt: string (ISO)

  childDevices/{deviceId}      # 子のデバイス（将来用・親送信時に通知）
    （同構造）
```

## 環境変数

追加で設定:

```env
VITE_FIREBASE_VAPID_KEY=...   # Firebase Console > プロジェクト設定 > Cloud Messaging > Web Push 証明書 > キーペア生成
```

## 手動テスト手順（Android Chrome）

1. **親側** (`/#/` PairDailyPage):
   - 「通知をON」をタップ
   - ブラウザの通知許可ダイアログで「許可」
   - 許可済みならボタンは非表示になる

2. **子側** (`/#/tyson` HomePage):
   - 録音して送信（role=child）

3. **親側**:
   - アプリがバックグラウンド or 別タブのとき、Push通知「新しい音声が届きました」が届く

4. **OBSERVE ログ確認**:
   ```
   [OBSERVE] {"requestId":"REQ-XXXX","stage":"push_send","status":"ok","pairId":"demo","role":"child","dateKey":"2025-02-15","tokenCount":1,"successCount":1}
   ```

## 注意

- iOS Safari は Web Push に制約あり。まず Android Chrome / Desktop Chrome で確認
- 無効な token は自動削除（`messaging/invalid-registration-token` 等）
- Push 失敗しても POST は成功扱い（ベストエフォート）
