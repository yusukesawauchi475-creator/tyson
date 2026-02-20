# Tyson Journal MVP

写真アップして保存だけ。解析・ぼかし・一覧（月）は後回し。

## 変更ファイル一覧

| ファイル | 内容 |
|---------|------|
| `api/journal.js` | 新規: POST/GET /api/journal, OBSERVE journal_post_* / journal_get |
| `src/lib/journal.js` | 新規: uploadJournalImage, fetchTodayJournalMeta |
| `src/pages/PairDailyPage.jsx` | ジャーナルセクション追加（写真選ぶ/撮る, アップ済み, REQ+Copy） |
| `server.js` | /api/journal ルート追加 |
| `docs/JOURNAL_MVP.md` | 本ドキュメント |

## Storage パス（最終仕様）

```
journal/<pairId>/<YYYY-MM>/<YYYY-MM-DD>/<role>/page-01.<ext>
```

- 日付はサーバー側 `getDateKeyNY()` で確定（America/New_York）
- role: まず parent のみ実装（child も同型で後から可）
- ext: jpg / png / webp（Content-Type から決定）

例: `journal/demo/2026-02/2026-02-17/parent/page-01.jpg`

## Firestore パス（最終仕様）

```
journal/<pairId>/months/<YYYY-MM>/days/<YYYY-MM-DD>
```

保存フィールド（最小）:

- `requestId` (= uploadId)
- `dateKey` (YYYY-MM-DD)
- `monthKey` (YYYY-MM)
- `roleData.parent`: `{ storagePath, uploadId, updatedAt(serverTimestamp), bytes, contentType, width, height }`
- 後で `items[]` に拡張可能な形（いまは1枚固定）

## OBSERVE ログ例（clientDateKey / serverDateKey 必須）

POST 成功時:

```json
[OBSERVE] {"requestId":"REQ-XXXX","stage":"journal_post_storage","status":"ok","pairId":"demo","role":"parent","clientDateKey":null,"serverDateKey":"2026-02-17","storagePath":"journal/demo/2026-02/2026-02-17/parent/page-01.jpg","firestoreDocPath":"journal/demo/months/2026-02/days/2026-02-17","httpStatus":200,"errorCode":null,"errorMessage":null}
```

```json
[OBSERVE] {"requestId":"REQ-XXXX","stage":"journal_post_firestore","status":"ok","pairId":"demo","role":"parent","clientDateKey":null,"serverDateKey":"2026-02-17","storagePath":"journal/demo/2026-02/2026-02-17/parent/page-01.jpg","firestoreDocPath":"journal/demo/months/2026-02/days/2026-02-17","httpStatus":200,"errorCode":null,"errorMessage":null}
```

GET 時:

```json
[OBSERVE] {"requestId":"REQ-YYYY","stage":"journal_get","status":"ok","pairId":"demo","role":"parent","clientDateKey":"2026-02-17","serverDateKey":"2026-02-17","storagePath":"journal/demo/2026-02/2026-02-17/parent/page-01.jpg","firestoreDocPath":"journal/demo/months/2026-02/days/2026-02-17","httpStatus":200,"errorCode":null,"errorMessage":null}
```

- `serverDateKey` = サーバー側 `getDateKeyNY()` で確定（America/New_York）。Storage/Firestore/レスポンスの `dateKey` はこれを使う
- `clientDateKey` = クライアントから送られた日付（ログ用のみ）

## 本番（Vercel）での /api が SPA に吸われないようにする

- `vercel.json` の `rewrites` で **先頭**に `/api/(.*)` → `/api/$1` を置き、API を SPA より優先する
- `api/journal.js` は Vercel Function として JSON body のみ受付（`imageDataUrl` の data URL）。multipart は使わない

## 破壊的変更なし

- 既存の `api/pair-media.js`、録音/再生/REQ/OBSERVE/seenAt/ポーリング/FCM は未変更
- 新規 API は `api/journal.js` のみ。既存ルートはそのまま
- フロントは PairDailyPage にセクション追加のみ（既存 state/effect に影響なし）

## ローカルテスト手順

1. `npm run dev:all` で起動
2. 親画面 `http://localhost:5173/#/` を開く
3. 「ジャーナル写真をアップ」で写真を1枚選択（または撮影）
4. 送信完了後:
   - Firebase Storage に `journal/demo/<YYYY-MM>/<YYYY-MM-DD>/parent/page-01.jpg` ができる
   - Firestore に `journal/demo/months/<YYYY-MM>/days/<YYYY-MM-DD>` ができる
   - 画面に「保存済み」「REQ-XXXX」+ Copy が表示される
5. ターミナルに `[OBSERVE]` の `stage:"journal_post_*"` が requestId 付きで出る
