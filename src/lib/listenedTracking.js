// Phase 1 (未聴 voice 通知機能): localStorage ベースの per-item listened state。
// 公理 1 (URL=SoT): Firestore voice = 真実 source、localStorage = cache。
// 公理 2 (pair world 内完結): voice ID prefix=pairId、cross-pair 経路ゼロ。
// 公理 3 (副作用明示): get/set 命名分離 (isVoiceListened / markVoiceListened)。

import { getIdTokenForApi } from './firebase.js'
import { getDateKeyNY } from './pairDaily.js'

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

function logListenedDebug(event, payload) {
  try {
    console.log(`[listenedTracking:${event}]`, payload)
  } catch {
    // Debug logging must never affect badge calculation.
  }
}

/**
 * 全期間 (最大 90 日) で partner role の未聴 voice 合計件数を返す。
 * Fix 2: date またぎ関係なく 🔴 表示 + Fix 1: Album badge 全期間カウント用。
 * getTodayPartnerUnlistenedStats (today scope) とは別 helper、改変禁止。
 * @returns {Promise<number>} 未聴件数 (0 = 全聴済み or エラー)
 */
export async function getAnyPartnerUnlistenedFlag(pairId, partnerRole) {
  if (!pairId || !partnerRole) return 0
  try {
    const idToken = await getIdTokenForApi()
    if (!idToken) return 0
    const res = await fetch(
      `/api/pair-media?action=voice-history&pairId=${encodeURIComponent(pairId)}&limit=90&v=${Date.now()}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const days = Array.isArray(data?.days) ? data.days : []
    let count = 0
    for (const day of days) {
      const items = Array.isArray(day[partnerRole]?.items) ? day[partnerRole].items : []
      for (const item of items) {
        if (!isVoiceListened(pairId, day.dateKey, partnerRole, item.hhmm)) count++
      }
    }
    return count
  } catch {
    return 0
  }
}

/**
 * 全期間 badge 用。server の day/role isUnseen=false は既読済み source として尊重する。
 * 既存 getAnyPartnerUnlistenedFlag は互換維持のため残し、badge caller だけこちらへ移行する。
 * @returns {Promise<number>} 未聴件数 (0 = 全聴済み or エラー)
 */
export async function getAnyPartnerUnlistenedFlagServerSeen(pairId, partnerRole) {
  if (!pairId || !partnerRole) return 0
  try {
    const idToken = await getIdTokenForApi()
    if (!idToken) return 0
    const res = await fetch(
      `/api/pair-media?action=voice-history&pairId=${encodeURIComponent(pairId)}&limit=90&v=${Date.now()}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const days = Array.isArray(data?.days) ? data.days : []
    let count = 0
    for (const day of days) {
      const roleData = day?.[partnerRole]
      const items = Array.isArray(roleData?.items) ? roleData.items : []
      if (!roleData?.isUnseen) {
        for (const item of items) {
          logListenedDebug('badge-skip-server-seen', {
            id: makeVoiceId(pairId, day.dateKey, partnerRole, item.hhmm),
            dateKey: day.dateKey,
            role: partnerRole,
            hhmm: item.hhmm || null,
            isUnseen: roleData?.isUnseen ?? null,
          })
        }
        continue
      }
      for (const item of items) {
        const listened = isVoiceListened(pairId, day.dateKey, partnerRole, item.hhmm)
        logListenedDebug('badge-check', {
          id: makeVoiceId(pairId, day.dateKey, partnerRole, item.hhmm),
          dateKey: day.dateKey,
          role: partnerRole,
          hhmm: item.hhmm || null,
          isUnseen: roleData.isUnseen,
          listened,
        })
        if (!listened) count++
      }
    }
    logListenedDebug('badge-total', { pairId, partnerRole, count, days: days.length })
    return count
  } catch (e) {
    logListenedDebug('badge-error', { pairId, partnerRole, error: e?.message || String(e) })
    return 0
  }
}

/**
 * 今日 (NY 時刻) の partner role voice 全 item を取得。
 * voice-history endpoint を limit=1 で叩いて最新日を取得し、今日の dateKey と一致する場合のみ items を返す。
 * @returns {Promise<{ unlistened: number, total: number, dateKey: string, latestHhmm: string|null }>}
 */
export async function getTodayPartnerUnlistenedStats(pairId, partnerRole) {
  const todayKey = getDateKeyNY()
  const empty = { unlistened: 0, total: 0, dateKey: todayKey, latestHhmm: null }
  if (!pairId || !partnerRole) return empty
  try {
    const idToken = await getIdTokenForApi()
    if (!idToken) return empty
    const res = await fetch(
      `/api/pair-media?action=voice-history&pairId=${encodeURIComponent(pairId)}&limit=1&v=${Date.now()}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    )
    if (!res.ok) return empty
    const data = await res.json()
    const days = Array.isArray(data?.days) ? data.days : []
    const today = days.find(d => d.dateKey === todayKey)
    if (!today) return empty
    const items = Array.isArray(today[partnerRole]?.items) ? today[partnerRole].items : []
    if (items.length === 0) return empty
    const sorted = [...items].sort((a, b) => (a.hhmm || 'zzzz').localeCompare(b.hhmm || 'zzzz'))
    const latestHhmm = sorted[sorted.length - 1]?.hhmm || null
    let unlistened = 0
    for (const item of items) {
      if (!isVoiceListened(pairId, todayKey, partnerRole, item.hhmm)) unlistened++
    }
    return { unlistened, total: items.length, dateKey: todayKey, latestHhmm }
  } catch {
    return empty
  }
}
