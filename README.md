# Tyson - 修行記録アプリ

「おかん」の音声を録音し、AI分析で修行の成果を記録するアプリです。

## 機能

- 🎤 音声録音機能
- 🔥 連続日数管理（localStorage + Firestore）
- ☁️ Firebase Storageへの音声ファイルアップロード
- 🤖 AI分析機能（Whisper API + GPT-4o-mini / Gemini 1.5 Flash）
  - リスク管理能力の評価
  - マイク・タイソン指数（規律・強気メンタリティ）
  - 今日の元気度
  - ユーモア溢れる一言アドバイス

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```env
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Google Gemini API Key (optional)
GEMINI_API_KEY=your_gemini_api_key_here

# Use OpenAI or Gemini (options: 'openai' or 'gemini')
AI_PROVIDER=openai

# Server Port
SERVER_PORT=3001
```

### 3. 開発サーバーの起動

フロントエンドとバックエンドを同時に起動：

```bash
npm run dev:all
```

または、別々に起動：

```bash
# バックエンドサーバー（ターミナル1）
npm run dev:server

# フロントエンド（ターミナル2）
npm run dev
```

## 使い方

1. ブラウザでアプリを開く（通常は `http://localhost:5173`）
2. 中央の赤い録音ボタンをクリックして録音開始
3. もう一度クリックして録音停止
4. 音声がFirebase Storageにアップロードされ、Firestoreに保存されます
5. 自動的にAI分析が実行され、結果がFirestoreに保存されます

## プロジェクト構造

```
Tyson/
├── server.js              # Express APIサーバー
├── src/
│   ├── App.jsx            # メインアプリケーション
│   ├── App.css            # スタイル
│   └── lib/
│       └── firebase.js    # Firebase設定
├── .env.local            # 環境変数（.gitignoreに含まれています）
└── package.json
```

## API エンドポイント

### POST /api/analyze

音声ファイルを分析します。

**リクエスト:**
```json
{
  "audioURL": "https://firebasestorage.googleapis.com/...",
  "docId": "firestore_document_id"
}
```

**レスポンス:**
```json
{
  "success": true,
  "transcription": "文字起こしテキスト",
  "analysis": {
    "riskManagement": {
      "score": 85,
      "reason": "慎重な判断ができる"
    },
    "mikeTysonIndex": {
      "score": 90,
      "reason": "強気なメンタリティ"
    },
    "energyLevel": {
      "score": 75,
      "reason": "ポジティブな内容"
    },
    "advice": "ユーモア溢れるアドバイス"
  }
}
```

## Firebase設定

Firestoreの`shugyo`コレクションに以下の形式でデータが保存されます：

```javascript
{
  date: "2025-01-XX",
  timestamp: Timestamp,
  userName: "修行者",
  audioURL: "https://...",
  streakCount: 1,
  createdAt: Timestamp,
  analysisResult: {
    transcription: "文字起こしテキスト",
    riskManagement: { score: 85, reason: "..." },
    mikeTysonIndex: { score: 90, reason: "..." },
    energyLevel: { score: 75, reason: "..." },
    advice: "アドバイス",
    analyzedAt: Timestamp
  }
}
```

## 技術スタック

- **Frontend**: React + Vite
- **Backend**: Vercel Serverless Functions (本番) / Express.js (ローカル開発)
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **AI**: OpenAI Whisper API, GPT-4o-mini / Google Gemini 1.5 Flash
- **Deployment**: Vercel

## デプロイ

Vercelへのデプロイ手順は [DEPLOY.md](./DEPLOY.md) を参照してください。

環境変数の設定方法は [VERCEL_ENV.md](./VERCEL_ENV.md) を参照してください。