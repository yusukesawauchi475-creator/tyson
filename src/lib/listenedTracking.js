// Phase 1 (未聴 voice 通知機能): localStorage ベースの per-item listened state。
// 公理 1 (URL=SoT): Firestore voice = 真実 source、localStorage = cache。
// 公理 2 (pair world 内完結): voice ID prefix=pairId、cross-pair 経路ゼロ。
// 公理 3 (副作用明示): get/set 命名分離 (isVoiceListened / markVoiceListened)。

const KEY = 'hum_listened_voices'
const MAX_ENTRIES = 500

function readSet() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

function writeSet(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)) } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

export function makeVoiceId(pairId, dateKey, role, hhmm) {
  return `${pairId}:${dateKey}:${role}:${hhmm || 'legacy'}`
}

export function isVoiceListened(pairId, dateKey, role, hhmm) {
  if (!pairId || !dateKey || !role) return false
  return !!readSet()[makeVoiceId(pairId, dateKey, role, hhmm)]
}

export function markVoiceListened(pairId, dateKey, role, hhmm) {
  if (!pairId || !dateKey || !role) return
  const id = makeVoiceId(pairId, dateKey, role, hhmm)
  const cur = readSet()
  if (cur[id]) return
  cur[id] = Date.now()
  const keys = Object.keys(cur)
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => cur[a] - cur[b])
    sorted.slice(0, Math.floor(MAX_ENTRIES / 2)).forEach(k => delete cur[k])
  }
  writeSet(cur)
}
