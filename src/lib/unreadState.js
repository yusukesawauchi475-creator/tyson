import { getDateKeyNY } from './pairDaily'
import { getIdTokenForApi } from './firebase'
import { isVoiceListened } from './listenedTracking'
import { computePartnerUnreadStateFromDays } from './unreadStateCore'

const VOICE_HISTORY_LIMIT = 90
const EMPTY_UNREAD_STATE = {
  todayUnreadCount: 0,
  todayTotalCount: 0,
  anyPeriodUnreadExists: false,
  albumBadgeCount: 0,
}

export async function getPartnerUnreadState(pairId, partnerRole) {
  if (!pairId || !partnerRole) return EMPTY_UNREAD_STATE

  let idToken
  try {
    idToken = await getIdTokenForApi()
  } catch (err) {
    console.error('[unreadState] auth failed:', err)
    return EMPTY_UNREAD_STATE
  }
  if (!idToken) return EMPTY_UNREAD_STATE

  let response
  try {
    response = await fetch(
      `/api/pair-media?action=voice-history&pairId=${encodeURIComponent(pairId)}&limit=${VOICE_HISTORY_LIMIT}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    )
  } catch (err) {
    console.error('[unreadState] fetch failed:', err)
    return EMPTY_UNREAD_STATE
  }

  if (!response.ok) return EMPTY_UNREAD_STATE

  let json
  try {
    json = await response.json()
  } catch {
    return EMPTY_UNREAD_STATE
  }

  return computePartnerUnreadStateFromDays(json?.days || [], {
    pairId,
    partnerRole,
    todayKey: getDateKeyNY(),
    isVoiceListenedFn: isVoiceListened,
  })
}
