# Tyson Project Handoff (SSOT)

このファイルは **Tyson の唯一の引き継ぎ真実（SSOT）**。
作業開始前に必ず読む。スレッドが変わっても、迷ったらここに戻る。

> ⚠️ 重要  
> このファイルには **秘密情報（APIキー/秘密鍵の値）は一切書かない**。  
> 値は **Vercel Environment Variables をSSOT** とし、ローカルは `vercel env pull` で同期する。

---

## 0. ゴール（絶対）

### 長期
- **100Mアプリ**
  - 親子の習慣・記録・振り返りのプラットフォーム

### 短期（常に今）
- **親が今日使える Web MVP**
  - iPhone / Android の Safari / Chrome で動く

### 最上位制約
- **データ喪失ゼロ**
  - 録音したのに消えた／保存されてない／上書き事故 → 即死

---

## 1. プロダクト思想（不変）

- 1日1分、LINEより軽い「声のルーティン」
- 継続が価値（データが貯まるほどAI/振り返り価値が増す）
- 親に責任を負わせないUX
  - 失敗しても「設定して直す」前提にしない
  - 画面エラーは1行のみ、詳細はログ側

---

## 2. 技術スタック（確定）

- Frontend: **Vite + React**
- Hosting / Functions: **Vercel**
- Backend / Data: **Firebase**
  - Auth（匿名ログイン）
  - Firestore（メタデータ）
  - Storage（音声/画像バイナリ）
- Routing: **HashRouter（/#/）**
  - SPA fallback や直叩き事故回避のため

---

## 3. 運用アカウント（恒久）

- GitHub / Vercel / Firebase は同一運用アカウント
  - 末尾：`.475@gmail`
- 設定の正は **Vercel / Firebase Console**
- repo に秘密情報は入れない

---

## 4. 本番URL

### Production (Vercel)
- 親（再生・確認）: https://tyson-two.vercel.app/#/
- 子（録音・送信）: https://tyson-two.vercel.app/#/tyson

※ HashRouter のため `#` 以降で画面が分かれる

---

## 5. 画面仕様（MVP）

### 子（/#/tyson）
- 録音（開始→停止）
- 停止後、自動アップロード
- 状態表示：
  - 録音中…
  - 送信中…
  - 送信しました（時刻）
- 無音判定：
  - duration < 1s または blob < 4KB はアップロードしない

### 親（/#/）
- 状態文言：
  - 「今日は声が届いています」
  - or「まだです（今日はこれで大丈夫です）」
- 更新ボタンで再取得
- 音声がある時だけ再生ボタン有効

---

## 6. Engineering 絶対ルール

### UX
- 画面エラーは1行のみ  
  `うまくいきませんでした。もう一度お試しください（ID: REQ-XXXX）`
- 詳細ボタン不要
- console/log には `requestId` / `errorCode` を必ず出す

### データ保全（最重要）
- 成功条件＝**サーバー保存完了が確認できた時のみ**
- 2段階コミット（概念）
  1. Storage にバイナリ保存
  2. Firestore にメタ確定
- 冪等設計（途中失敗→再実行OK）

### iOS Safari 対策
- 録音フォーマット優先順：
  - audio/mp4 → audio/aac → webm(opus) → webm

---

## 7. データ構造（現状）

- Storage  
  `pairs/{pairId}/days/{YYYY-MM-DD}/audio.{ext}`

- Firestore  
  日付キー配下にメタ（mimeType / ext / updatedAt など）

※ pairId は MVP では固定でも可  
※ 将来 inviteToken で拡張

---

## 8. API（現行）

### Pair MVP
- `POST /api/pair-media`
  - FormData: `audio`, `pairId`, `dateKey`
  - Header: `Authorization: Bearer <Firebase ID Token>`
- `GET /api/pair-media`
  - Query: `pairId`, `dateKey`, `type=audio`, `mode=blob|signed`

### Legacy（整理予定）
- `/api/upload`
- `/api/analyze`
- `/api/convert-audio`
- `/api/daily-theme`
- `/api/health-check`
- `/api/env-check`
- `/api/notify`
- `/api/admin/*`

---

## 9. 環境変数（値は書かない）

### Client（Vite / Browser）
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`（Analytics使う場合）

※ Firebase Console → Web App config が発行元

### Serverless（Vercel）
- `FIREBASE_SERVICE_ACCOUNT`
  - Firebase Console → Project Settings → Service Accounts
  - JSON秘密鍵（絶対にrepoに入れない）
- `OPENAI_API_KEY`
  - OpenAI Dashboard で発行
- `ADMIN_PASSWORD`（必要な場合のみ）

---

## 10. ローカル環境（固定手順）

```bash
cd ~/mixc-nekolist/Tyson
npx vercel env pull .env.local
```

.env.local 更新後は必ず再起動：

```bash
Ctrl + C
rm -rf node_modules/.vite
npm run dev
```

- 親: http://localhost:5173/#/
- 子: http://localhost:5173/#/tyson

---

## 11. デプロイ

```bash
git add -A
git commit -m "..."
git push origin main
```

- push → Vercel 自動 build & deploy
- env 変更時や挙動怪しい時は Vercel で Redeploy

---

## 12. いま詰まったら（チェック順）

1. `.env.local` が最新か（vercel pull 済みか）
2. Vite 再起動したか
3. `/api/pair-media` の status（401/403/500）
4. Storage 保存は成功しているか
5. Firestore メタが落ちていないか
6. iOS Safari で無音 blob になっていないか

---

## 13. 作業ルール（運用）

- UI修理より **保存の証拠** を最優先
- 曖昧点・提案がある場合は **実装前に質問**
- 「壊れたら直す」ではなく「壊れない設計」

---

## 14. メモ（次スレ持ち越し用）

- ここに注意点を書く
- **キー値・秘密は絶対に書かない**
