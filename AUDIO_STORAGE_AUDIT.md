# 音声ファイル保存・再生の確定情報レポート

## 1. ✅ データの物理所在 - 確定情報

### バケット名
```
nacho-city.firebasestorage.app
```
**根拠**: `src/lib/firebase.js` 9行目
```javascript
storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "nacho-city.firebasestorage.app"
```

### 保存パス
```
shugyo/shugyo_{timestamp}_{userName}.webm
```
**根拠**: `src/pages/HomePage.jsx` 164-165行目
```javascript
const fileName = `shugyo_${timestamp}_${userName}.webm`
const storageRef = ref(storage, `shugyo/${fileName}`)
```

**具体例**:
```
shugyo/shugyo_1704067200000_修行者.webm
```

### 拡張子
```
.webm
```
**根拠**: `src/pages/HomePage.jsx` 164行目
```javascript
const fileName = `shugyo_${timestamp}_${userName}.webm`
```

### 録音形式
```
audio/webm (Blob type)
```
**根拠**: `src/pages/HomePage.jsx` 347行目
```javascript
const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
```

**MediaRecorder設定**: 
```javascript
const mediaRecorder = new MediaRecorder(stream) // デフォルト設定（ブラウザ依存）
```

---

## 2. ⚠️ 再生互換性の問題 - 重大なリスク発見

### 現状の問題

**iPhoneのSafariでの録音形式**:
- iPhoneのSafariは`MediaRecorder`を使用する場合、**WebM形式をサポートしていない**
- iPhoneのSafariは`audio/mp4`または`audio/m4a`形式で録音される可能性が高い
- しかし、コードでは`.webm`拡張子で保存しているため、**形式の不一致が発生する可能性がある**

**AdminPageでの再生**:
```javascript
const audio = new Audio(audioURL)
audio.play()
```
**根拠**: `src/pages/AdminPage.jsx` 81行目

**問題点**:
1. iPhoneで録音した場合、実際の形式は`audio/mp4`または`audio/m4a`だが、ファイル名は`.webm`
2. SafariはWebMをネイティブサポートしていないため、`.webm`ファイルが再生できない可能性がある
3. ブラウザ間で録音形式が異なる（Chrome: WebM, Safari: MP4/M4A）

### 修正案: サーバー側でMP3変換

**理由**: 
- MP3はすべてのブラウザでサポートされている
- 形式の統一により、再生互換性の問題を完全に解決

**実装方法**: `api/analyze.js`で音声をダウンロード後、MP3に変換して再アップロード

---

## 3. ✅ Firestoreとの紐付け - 確定情報

### 保存フィールド
```javascript
{
  audioURL: "https://firebasestorage.googleapis.com/v0/b/nacho-city.firebasestorage.app/o/shugyo%2Fshugyo_1704067200000_%E4%BF%AE%E8%A1%8C%E8%80%85.webm?alt=media&token=..."
}
```
**根拠**: `src/pages/HomePage.jsx` 202行目
```javascript
const docRef = await addDoc(collection(db, 'shugyo'), {
  date: dateString,
  timestamp: today,
  userName: userName,
  audioURL: audioURL,  // ← ここに保存
  streakCount: currentStreak,
  createdAt: new Date()
})
```

### 取得と再生
**根拠**: `src/pages/AdminPage.jsx` 199-202行目
```javascript
{record.audioURL ? (
  <button
    className={`play-button ${playingAudioId === record.id ? 'playing' : ''}`}
    onClick={() => handlePlayAudio(record.audioURL, record.id)}
  >
```

**再生処理**: `src/pages/AdminPage.jsx` 64-81行目
```javascript
const handlePlayAudio = (audioURL, recordId) => {
  // ...
  const audio = new Audio(audioURL)  // ← FirestoreのaudioURLフィールドを使用
  audio.play()
}
```

### 配管の確認結果
✅ **問題なし**: 
- `uploadAudioToStorage()` → `audioURL`取得
- `saveToFirestore(audioURL, ...)` → Firestoreの`audioURL`フィールドに保存
- `loadRecords()` → Firestoreから`record.audioURL`を取得
- `handlePlayAudio(record.audioURL, ...)` → 再生

**漏れなし**: 配管は完璧に接続されている

---

## 🎯 確定情報サマリー

| 項目 | 確定情報 |
|------|---------|
| **バケット** | `nacho-city.firebasestorage.app` |
| **パス** | `shugyo/shugyo_{timestamp}_{userName}.webm` |
| **拡張子** | `.webm` |
| **録音形式** | `audio/webm` (Blob) |
| **Firestoreフィールド** | `audioURL` |
| **再生方法** | `new Audio(audioURL).play()` |
| **互換性リスク** | ⚠️ **iPhoneのSafariでWebMが再生できない可能性** |

---

## ⚠️ 緊急修正が必要

iPhoneのSafariで録音した場合、WebM形式が再生できない可能性が高いため、**サーバー側でMP3変換する修正が必要**です。
