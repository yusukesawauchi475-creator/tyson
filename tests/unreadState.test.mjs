import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { computePartnerUnreadStateFromDays } from '../src/lib/unreadStateCore.js'
import { makeVoiceId } from '../src/lib/listenedTracking.js'

const TEST_PAIR = 'TEST-PAIR'
const PARTNER_ROLE = 'parent'
const TODAY_KEY = '2026-05-26'
const YESTERDAY_KEY = '2026-05-25'
const PAST_7DAY_KEY = '2026-05-19'
const DATE_KEY_MAP = {
  today: TODAY_KEY,
  past_yesterday: YESTERDAY_KEY,
  past_7day: PAST_7DAY_KEY,
}

function buildFixture({ dayScope, voiceCount, serverSeenState, localListenedState }) {
  const dateKey = DATE_KEY_MAP[dayScope]
  const items = []
  for (let i = 0; i < voiceCount; i += 1) {
    items.push({
      hhmm: `${String(i).padStart(2, '0')}30`,
      url: `https://test/${dateKey}/${i}.m4a`,
      version: 1,
      mimeType: 'audio/m4a',
    })
  }

  const days = [{
    dateKey,
    [PARTNER_ROLE]: {
      hasAudio: voiceCount > 0,
      isUnseen: serverSeenState === 'unseen',
      updatedAt: 1716700000000,
      seenAt: serverSeenState === 'seen' ? 1716700001000 : null,
      items,
    },
  }]

  const listenedMap = {}
  for (let i = 0; i < voiceCount; i += 1) {
    const hhmm = `${String(i).padStart(2, '0')}30`
    const voiceId = makeVoiceId(TEST_PAIR, dateKey, PARTNER_ROLE, hhmm)
    if (localListenedState === 'all_listened') listenedMap[voiceId] = Date.now()
  }

  const isVoiceListenedFn = (pairId, dKey, role, hhmm) => (
    makeVoiceId(pairId, dKey, role, hhmm) in listenedMap
  )

  return { days, todayKey: TODAY_KEY, isVoiceListenedFn }
}

const MATRIX = []
for (const dayScope of ['today', 'past_yesterday', 'past_7day']) {
  for (const voiceCount of [0, 1, 2]) {
    for (const serverSeenState of ['unseen', 'seen']) {
      for (const localListenedState of ['all_unlistened', 'all_listened']) {
        MATRIX.push({ dayScope, voiceCount, serverSeenState, localListenedState })
      }
    }
  }
}

function expectedState(cell) {
  if (cell.voiceCount === 0) {
    return {
      todayUnreadCount: 0,
      todayTotalCount: 0,
      anyPeriodUnreadExists: false,
      albumBadgeCount: 0,
    }
  }

  const isUnread = cell.serverSeenState === 'unseen' && cell.localListenedState !== 'all_listened'
  const unreadCount = isUnread ? cell.voiceCount : 0
  const isToday = cell.dayScope === 'today'

  return {
    todayUnreadCount: isToday ? unreadCount : 0,
    todayTotalCount: isToday ? cell.voiceCount : 0,
    anyPeriodUnreadExists: unreadCount > 0,
    albumBadgeCount: unreadCount,
  }
}

describe('36 cell matrix', () => {
  for (const cell of MATRIX) {
    test(`${cell.dayScope}/v${cell.voiceCount}/s${cell.serverSeenState}/l${cell.localListenedState}`, () => {
      const { days, todayKey, isVoiceListenedFn } = buildFixture(cell)
      const result = computePartnerUnreadStateFromDays(days, {
        pairId: TEST_PAIR,
        partnerRole: PARTNER_ROLE,
        todayKey,
        isVoiceListenedFn,
      })
      const expected = expectedState(cell)

      assert.equal(result.todayUnreadCount, expected.todayUnreadCount)
      assert.equal(result.todayTotalCount, expected.todayTotalCount)
      assert.equal(result.anyPeriodUnreadExists, expected.anyPeriodUnreadExists)
      assert.equal(result.albumBadgeCount, expected.albumBadgeCount)
    })
  }
})

describe('architectural invariant', () => {
  test('anyPeriodUnreadExists === (albumBadgeCount > 0) across all 36 cells', () => {
    for (const cell of MATRIX) {
      const { days, todayKey, isVoiceListenedFn } = buildFixture(cell)
      const result = computePartnerUnreadStateFromDays(days, {
        pairId: TEST_PAIR,
        partnerRole: PARTNER_ROLE,
        todayKey,
        isVoiceListenedFn,
      })
      assert.equal(result.anyPeriodUnreadExists, result.albumBadgeCount > 0, `invariant violated: ${JSON.stringify(cell)}`)
    }
  })
})

describe('regression scenarios', () => {
  test('c262295: server seen day is excluded from unread', () => {
    const { days, todayKey, isVoiceListenedFn } = buildFixture({
      dayScope: 'past_yesterday',
      voiceCount: 2,
      serverSeenState: 'seen',
      localListenedState: 'all_unlistened',
    })
    const result = computePartnerUnreadStateFromDays(days, {
      pairId: TEST_PAIR,
      partnerRole: PARTNER_ROLE,
      todayKey,
      isVoiceListenedFn,
    })

    assert.equal(result.albumBadgeCount, 0)
    assert.equal(result.anyPeriodUnreadExists, false)
  })

  test('6a5cba3: past partner unread drives dot and Album badge', () => {
    const { days, todayKey, isVoiceListenedFn } = buildFixture({
      dayScope: 'past_yesterday',
      voiceCount: 2,
      serverSeenState: 'unseen',
      localListenedState: 'all_unlistened',
    })
    const result = computePartnerUnreadStateFromDays(days, {
      pairId: TEST_PAIR,
      partnerRole: PARTNER_ROLE,
      todayKey,
      isVoiceListenedFn,
    })

    assert.equal(result.anyPeriodUnreadExists, true)
    assert.equal(result.albumBadgeCount, 2)
    assert.equal(result.todayUnreadCount, 0)
    assert.equal(result.todayTotalCount, 0)
  })
})
