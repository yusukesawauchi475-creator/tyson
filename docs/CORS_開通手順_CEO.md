# Storage CORS 開通手順（CEO向け・コピペで完了）

**重要**: CORS は Firebase Console の画面からは設定できません。  
**Google Cloud のコマンド（gcloud）を 1 回叩く必要があります。** 以下はその「最後の手順」だけをまとめたものです。

---

## 前提

- パソコンで **ターミナル（Mac）** または **コマンドプロンプト / PowerShell（Windows）** が開けること
- プロジェクトのフォルダ（`Tyson`）が手元にあること
- **yusuke.sawauchi.475@gmail.com** で Google にログインできること

---

## ステップ 1: Google Cloud SDK（gcloud）を入れる

1. ブラウザで次のページを開く:  
   **https://cloud.google.com/sdk/docs/install**
2. 使っている OS（Mac / Windows）のタブを選ぶ。
3. 手順に従って **「Google Cloud CLI」** をインストールする。
   - Mac: インストーラーをダウンロード → 開く → 指示通りに進める。
   - Windows: インストーラーをダウンロード → 実行 → 指示通りに進める。
4. インストールが終わったら、**ターミナル / コマンドプロンプトを一度閉じて、あらためて開き直す。**

---

## ステップ 2: ターミナルでプロジェクトのフォルダに移動

1. ターミナル（またはコマンドプロンプト）を開く。
2. 次のコマンドを **そのままコピーして貼り付け**、Enter を押す。

   ```bash
   cd /Users/yusukesawauchi/mixc-nekolist/Tyson
   ```

   - あなたの環境で `Tyson` が別の場所にある場合は、そのパスに読み替える。
   - Windows の例: `cd C:\Users\あなたの名前\mixc-nekolist\Tyson`

3. カレントディレクトリが `Tyson` になったことを確認する（多くの場合、プロンプトに `Tyson` と出る）。

---

## ステップ 3: Google にログイン

1. 次のコマンドを **コピー＆ペースト** して Enter。

   ```bash
   gcloud auth login
   ```

2. ブラウザが開くので、**yusuke.sawauchi.475@gmail.com** でログインする。
3. 「このアプリに許可しますか？」と出たら **許可** を選ぶ。
4. ターミナルに「You are now logged in as ...」と出れば OK。

---

## ステップ 4: プロジェクトを指定

次のコマンドを **コピー＆ペースト** して Enter。

```bash
gcloud config set project tyson-3341f
```

「Updated property [core/project].」と出れば OK。

---

## ステップ 5: CORS を一発で設定（ここが「核爆弾」）

1. プロジェクトの `Tyson` フォルダに **`cors-gcloud.json`** があることを確認する。  
   （このファイルはすでにリポジトリに入っている想定です。）

2. 次のコマンドを **1 行そのままコピー** してターミナルに貼り付け、Enter を押す。

   ```bash
   gcloud storage buckets update gs://tyson-3341f.firebasestorage.app --cors-file=./cors-gcloud.json
   ```

3. 数秒待つ。
   - **成功**: 何も出ないか、バケット更新のメッセージが出る。
   - **失敗**: 「Permission denied」や「Not found」などのエラーが出る。  
     → その場合は、**ステップ 3** のログインと **ステップ 4** のプロジェクト指定を再度確認する。

---

## ステップ 6: 開通したか確認する

1. タイソン本番アプリ（例: https://tyson-two.vercel.app）を開く。
2. 録音 → 停止 → アップロードまで進める。
3. 「保存完了 ✅」や管理画面に記録が出れば、**Storage 経由の保存が開通している**と考えてよい。

---

## 図解（イメージ）

```
[ あなたのPC ]

  ターミナルを開く
        │
        ▼
  cd .../Tyson     ← プロジェクトフォルダへ
        │
        ▼
  gcloud auth login   ← ブラウザで yusuke.sawauchi.475@gmail.com ログイン
        │
        ▼
  gcloud config set project tyson-3341f
        │
        ▼
  gcloud storage buckets update gs://tyson-3341f.firebasestorage.app --cors-file=./cors-gcloud.json
        │
        ▼
  [ 完了 ]  →  アプリで録音テスト
```

---

## うまくいかないとき

| 症状 | やること |
|------|----------|
| `gcloud: command not found` | ステップ 1 の SDK を入れたか確認。入れたらターミナルを **開き直す**。 |
| `Permission denied` | ステップ 3 で **yusuke.sawauchi.475@gmail.com** でログインしているか確認。 |
| `Bucket not found` | ステップ 4 で `tyson-3341f` を指定しているか確認。 |
| `cors-gcloud.json` がない | プロジェクト内の `cors-gcloud.json` を探す。なければ、リポジトリの `cors-gcloud.json` を `Tyson` 直下にコピーする。 |

---

## コピペ用まとめ（まとめて実行したい人向け）

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
gcloud auth login
gcloud config set project tyson-3341f
gcloud storage buckets update gs://tyson-3341f.firebasestorage.app --cors-file=./cors-gcloud.json
```

※ `gcloud auth login` のあと、ブラウザでログインするまでは次に進めません。

---

**以上が、CORS を開通させるための「最後の手順」です。**
