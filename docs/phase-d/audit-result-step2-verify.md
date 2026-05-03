# Phase D Step 2 verify 漏れ audit 結果

生成: 2026-05-02
script: `scripts/audit-phase-d-step2-verify.js` (read-only、admin SDK get のみ)
raw: `docs/phase-d/raw-query-step2-verify.json`

## 1. 旧 slug 7 件 deactivated state

| slug | exists | deactivated | migratedTo | deactivatedAt |
|------|--------|-------------|-----------|---------------|
| mw49f0 | true | **true** | 3d8kgtp5 | 2026-04-29T19:35:39.154Z |
| h06m0g | true | **true** | kgaxrs94 | 2026-04-29T19:35:39.768Z |
| libriv | true | **true** | jjw78emr | 2026-04-29T19:35:40.400Z |
| 2habi5 | true | **true** | yntk4g9e | 2026-04-29T19:35:40.968Z |
| 5828p4 | true | **true** | uzbjjjt8 | 2026-04-29T19:35:41.448Z |
| lxm0mt | true | **true** | 9znpzaeb | 2026-04-29T19:35:42.040Z |
| ulf1q6 | true | **true** | 3vqg3n3x | 2026-04-29T19:35:42.646Z |

→ **7/7 件全件 `deactivated: true` + `migratedTo` + `deactivatedAt` 完備**。Phase D Step 2 migration は Firestore 層で完全成功。

新 slug 4 件 sanity (kgaxrs94 / jjw78emr / yntk4g9e / uzbjjjt8): 全件 `deactivated: false` で正常 active、各々が旧 slug に `migratedFrom` で逆 link 保持。

## 2. admin 画面 filter logic (発行済みペア tab)

`src/pages/AdminPage.jsx` `PairNumberManager` component。

L572-578 (fetchNumbers):
```js
const q = query(collection(db, 'pair_numbers'), orderBy('createdAt', 'desc'), limit(20))
const snap = await getDocs(q)
const list = []
snap.forEach(doc => {
  const d = doc.data()
  list.push({ number: doc.id, pairId: d.pairId, memo: d.memo || '', createdAt: d.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') || '' })
})
```

→ **`d.deactivated` を一切 read していない** (list 内 field は number / pairId / memo / createdAt のみ)。

L659 (render filter):
```jsx
{!listLoading && numbers.filter(n => !HIDDEN_PAIR_IDS.includes(n.pairId)).map(n => (
```

→ filter 条件は **`HIDDEN_PAIR_IDS` (TYSON-ZH90 等の hardcoded 隠蔽 list) のみ**、`deactivated:true` は除外していない。

deactivated filter 条件: **含まない** (= deactivated 旧 slug が active 新 slug と並列表示される)。

## 3. 結論

- **仮説 A (admin filter bug): YES** ✅
  - 根拠: Firestore 7 件全件 `deactivated: true` 確認済 (1. の table) + admin filter logic は deactivated 未参照 (2. の code 引用)。Firestore 整合 OK、UI render layer のみが古い slug を出してる
- **仮説 B (admin design 仕様): NO**
  - 根拠: `deactivated` field 自体は migration script (`migrate-phase-d-step2.js` 系) で意図的に書かれた lifecycle field、admin で「履歴表示」する意図なら deactivated 表示用 badge が render code に存在するはず。L659 の素 list には badge なく、単に filter 漏れ
- **仮説 C (migration 不完全): NO**
  - 根拠: 7/7 件 `deactivated: true` + `migratedTo` + `deactivatedAt` 完備。Firestore 層では migration 完了、URL access が Page not found 動くのも Step 2 機能として一致

## 4. 修正必要範囲

**A の admin filter logic 修正** (別 phase backlog or 即修正、Boss judgment 必須):

修正案 (素案、実装は Boss 承認後):
```js
// L575-578 の forEach に deactivated field 取得追加
list.push({
  number: doc.id,
  pairId: d.pairId,
  memo: d.memo || '',
  createdAt: ...,
  deactivated: d.deactivated === true,  // ← 追加
})

// L659 の filter に deactivated 除外追加
{!listLoading && numbers
  .filter(n => !HIDDEN_PAIR_IDS.includes(n.pairId))
  .filter(n => !n.deactivated)  // ← 追加
  .map(n => (...))}
```

副作用 risk:
- 純 client-side filter、書き込みゼロ
- 履歴確認したい場合のため後日「deactivated 含む」 toggle 追加検討余地あり (Phase D Step 2 完了 marker と整合確認)

緊急 補填 migration phase: **不要** (仮説 C 否定済)

## verify
- 旧 slug 7 件 read のみ、write 系 method 0 件 (script は admin.firestore() の get のみ使用)
- TYSON-ZH90 / yv00qaj6 / PAIR-* には access せず
- 新 slug 4 件 sanity も read のみ
- src/* 改変ゼロ (audit script 1 file 新規追加のみ)
