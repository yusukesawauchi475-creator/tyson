// Holiday banner: lang 別 holiday list + 14 日 countdown + 動的 date 計算 (nth weekday of month)
// 公理 1 (URL=SoT): banner state は派生値、persist しない (毎 mount 計算)
// 公理 3 (副作用明示): get* のみ (純粋関数、副作用なし)

const JP_HOLIDAYS = [
  { rule: 'mother-day-jp', name: 'mothersDay', emoji: '🌸' },
  { rule: 'father-day-jp', name: 'fathersDay', emoji: '👔' },
  { rule: 'respect-aged-jp', name: 'respectAgedDay', emoji: '🌾' },
  { date: '01-01', name: 'newYear', emoji: '🎍' },
  { date: '02-14', name: 'valentine', emoji: '💝' },
  { date: '12-25', name: 'christmas', emoji: '🎄' },
]

const US_HOLIDAYS = [
  { rule: 'mother-day-us', name: 'mothersDay', emoji: '🌷' },
  { rule: 'father-day-us', name: 'fathersDay', emoji: '👔' },
  { rule: 'grandparents-day-us', name: 'grandparentsDay', emoji: '🌻' },
  { rule: 'thanksgiving-us', name: 'thanksgiving', emoji: '🦃' },
  { date: '12-25', name: 'christmas', emoji: '🎄' },
  { date: '01-01', name: 'newYear', emoji: '🎉' },
  { date: '02-14', name: 'valentine', emoji: '💝' },
]

const ES_HOLIDAYS = [
  { rule: 'mother-day-es', name: 'mothersDay', emoji: '🌹' },
  { date: '03-19', name: 'fathersDay', emoji: '👔' },
  { date: '07-26', name: 'grandparentsDay', emoji: '🌻' },
  { date: '12-25', name: 'christmas', emoji: '🎄' },
  { date: '01-01', name: 'newYear', emoji: '🎉' },
  { date: '02-14', name: 'valentine', emoji: '💝' },
]

// targetDay: 0=Sun, 1=Mon, ..., 6=Sat
function nthDayOfMonth(year, month0, targetDay, n) {
  const first = new Date(year, month0, 1)
  const offset = (targetDay - first.getDay() + 7) % 7
  const date = 1 + offset + (n - 1) * 7
  return `${String(month0 + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

function resolveDateRule(rule, year) {
  switch (rule) {
    case 'mother-day-jp':
    case 'mother-day-us':
      return nthDayOfMonth(year, 4, 0, 2)   // May 2nd Sunday
    case 'mother-day-es':
      return nthDayOfMonth(year, 4, 0, 1)   // May 1st Sunday
    case 'father-day-jp':
    case 'father-day-us':
      return nthDayOfMonth(year, 5, 0, 3)   // June 3rd Sunday
    case 'respect-aged-jp':
      return nthDayOfMonth(year, 8, 1, 3)   // Sep 3rd Monday
    case 'grandparents-day-us':
      return nthDayOfMonth(year, 8, 0, 1)   // Sep 1st Sunday (Boss spec; actual US is post-Labor Day Sunday — 簡略化)
    case 'thanksgiving-us':
      return nthDayOfMonth(year, 10, 4, 4)  // Nov 4th Thursday
    default:
      return null
  }
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getDaysUntil(holidayDate, today) {
  const ms = startOfDay(holidayDate).getTime() - startOfDay(today).getTime()
  return Math.round(ms / 86400000)
}

function collectCandidates(list, year, today) {
  const out = []
  for (const h of list) {
    const dateStr = h.date || resolveDateRule(h.rule, year)
    if (!dateStr) continue
    const [mm, dd] = dateStr.split('-').map(Number)
    const holiday = new Date(year, mm - 1, dd)
    const daysLeft = getDaysUntil(holiday, today)
    if (daysLeft >= 0 && daysLeft <= 14) {
      out.push({ ...h, year, daysLeft })
    }
  }
  return out
}

/**
 * 14 日以内 (当日含む) の最近接 holiday を 1 件返す。なければ null。
 * @param {'ja'|'en'|'es'} lang
 * @param {Date} [today=new Date()]
 * @returns {{ name: string, emoji: string, daysLeft: number, year: number } | null}
 */
export function getUpcomingHoliday(lang, today = new Date()) {
  const list = lang === 'en' ? US_HOLIDAYS : lang === 'es' ? ES_HOLIDAYS : JP_HOLIDAYS
  const year = today.getFullYear()
  let candidates = collectCandidates(list, year, today)
  if (candidates.length === 0) {
    // 年跨ぎ (12 月末 → 1 月 holiday)
    candidates = collectCandidates(list, year + 1, today)
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.daysLeft - b.daysLeft)
  return candidates[0]
}

// demo 専用: cutoff なしで全 holiday 収集
function collectAllFuture(list, year, today) {
  const out = []
  for (const h of list) {
    const dateStr = h.date || resolveDateRule(h.rule, year)
    if (!dateStr) continue
    const [mm, dd] = dateStr.split('-').map(Number)
    const holiday = new Date(year, mm - 1, dd)
    const daysLeft = getDaysUntil(holiday, today)
    if (daysLeft >= 0) out.push({ ...h, year, daysLeft })
  }
  return out
}

/**
 * cutoff なし、最近接 holiday を 1 件常時返す (demo 専用)。
 * 当年内に future holiday がなければ翌年 1 月から fallback。
 * @param {'ja'|'en'|'es'} lang
 * @param {Date} [today=new Date()]
 * @returns {{ name: string, emoji: string, daysLeft: number, year: number } | null}
 */
export function getNearestHoliday(lang, today = new Date()) {
  const list = lang === 'en' ? US_HOLIDAYS : lang === 'es' ? ES_HOLIDAYS : JP_HOLIDAYS
  const year = today.getFullYear()
  let candidates = collectAllFuture(list, year, today)
  if (candidates.length === 0) {
    candidates = collectAllFuture(list, year + 1, today)
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.daysLeft - b.daysLeft)
  return candidates[0]
}
