/**
 * 日付表示: Intl.DateTimeFormat でデバイス最新時刻をJST基準で正確に表示
 * ビルド情報（VITE_BUILD_TIME）と今日の日付を混同しない
 */
const JST = 'Asia/Tokyo'

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
  return new Intl.DateTimeFormat('ja-JP', opt).format(new Date())
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
