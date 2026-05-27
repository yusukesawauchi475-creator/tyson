const EMPTY_UNREAD_STATE = {
  todayUnreadCount: 0,
  todayTotalCount: 0,
  anyPeriodUnreadExists: false,
  albumBadgeCount: 0,
}

export function computePartnerUnreadStateFromDays(days, { pairId, partnerRole, todayKey, isVoiceListenedFn } = {}) {
  if (!Array.isArray(days) || !pairId || !partnerRole || !todayKey || typeof isVoiceListenedFn !== 'function') {
    return EMPTY_UNREAD_STATE
  }

  let todayUnreadCount = 0
  let todayTotalCount = 0
  let albumBadgeCount = 0

  for (const day of days) {
    const dateKey = day?.dateKey
    const roleData = day?.[partnerRole]
    if (!dateKey || !roleData) continue

    const items = Array.isArray(roleData.items) ? roleData.items : []
    if (items.length === 0) continue

    const serverDayRoleIsUnseen = roleData.isUnseen === true
    const isToday = dateKey === todayKey

    for (const item of items) {
      const localListened = isVoiceListenedFn(pairId, dateKey, partnerRole, item?.hhmm)
      const isUnread = serverDayRoleIsUnseen && !localListened

      if (isToday) {
        todayTotalCount += 1
        if (isUnread) todayUnreadCount += 1
      }

      if (isUnread) albumBadgeCount += 1
    }
  }

  return {
    todayUnreadCount,
    todayTotalCount,
    anyPeriodUnreadExists: albumBadgeCount > 0,
    albumBadgeCount,
  }
}
