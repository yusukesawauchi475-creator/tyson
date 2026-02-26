/**
 * 日付表示: new Date() でユーザーのデバイス時刻をJST基準で表示
 * 環境変数（VITE_BUILD_TIME等）に依存せず、ハイドレーションエラーを起こさない
 */
import { BUILD_SHA } from '../buildInfo'
const JST = 'Asia/Tokyo'

/** モック日付（CEO試行用）: ?mockDate=2026-01-31 または localStorage.tyson_mock_date */
function getDisplayDate() {
  if (typeof window === 'undefined') return new Date()
  const params = new URLSearchParams(window.location.search)
  const mockStr = params.get('mockDate') || localStorage.getItem('tyson_mock_date')
  if (mockStr) {
    const d = new Date(mockStr)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export function formatTodayJST(options = {}) {
  const opt = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: JST,
    ...options,
  }
  return new Intl.DateTimeFormat('ja-JP', opt).format(getDisplayDate())
}

export function formatTodayJSTDateOnly() {
  const opt = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: JST,
  }
  return new Intl.DateTimeFormat('ja-JP', opt).format(getDisplayDate())
}

/** デプロイ時刻をローカル時刻で表示（UTC Z 禁止、誤解防止） */
export function formatDeployedAtLocal() {
  const t = import.meta.env?.VITE_BUILD_TIME
  if (!t || typeof t !== 'string') return '--'
  try {
    const d = new Date(t)
    if (Number.isNaN(d.getTime())) return '--'
    return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (_) {
    return '--'
  }
}

/** ビルドSHA（Vercel環境変数 VITE_BUILD_SHA から注入） */
export function getBuildHash() {
  if (BUILD_SHA && BUILD_SHA !== 'dev') return BUILD_SHA.slice(0, 7)
  return 'dev'
}

export function formatDateJST(timestamp, options = {}) {
  if (!timestamp) return '-'
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
  const opt = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: JST,
    ...options,
  }
  return new Intl.DateTimeFormat('ja-JP', opt).format(date)
}
