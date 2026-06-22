import { doc, getDoc } from 'firebase/firestore'
import { auth, db, getAuthSelfHealRevision, getIdTokenForApi, logAuthSelfHealEvent } from './firebase'

async function claimPairMembership(slug, idToken, pairId, attempt) {
  if (!slug || !idToken) return false

  logAuthSelfHealEvent('membership_reclaim', {
    pairId,
    slug,
    attempt,
    uidPrefix: auth.currentUser?.uid?.slice(0, 6) || null,
  })

  const url = '/api/invite?action=claim-membership'
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ slug: String(slug), pairId }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || data?.success !== true || data?.memberCreated !== true) {
    logAuthSelfHealEvent('membership_reclaim_failed', {
      pairId,
      slug,
      attempt,
      status: response.status,
      errorCode: data?.errorCode || null,
      requestId: data?.requestId || null,
    })
    return false
  }

  return data?.pairId === pairId
}

async function hasCurrentUserMembership(pairId) {
  const uid = auth.currentUser?.uid
  if (!uid || !pairId) return false

  try {
    const memberSnap = await getDoc(doc(db, 'pair_users', pairId, 'members', uid))
    return memberSnap.exists()
  } catch {
    return false
  }
}

/**
 * Ensures the current browser session has both a valid Firebase ID token and
 * pair_users/{pairId}/members/{uid}. Does not touch pair media, journal, or Storage.
 */
export async function ensureAuthAndMembership(slug, pairId) {
  if (!slug || !pairId) {
    return { success: false, error: 'pair context is missing', errorCode: 'missing_pair_context' }
  }

  if (pairId === 'PAIR-DEMOTEST') {
    const authRevisionBefore = getAuthSelfHealRevision()
    const token = await getIdTokenForApi()
    return token
      ? { success: true, idToken: token, uid: auth.currentUser?.uid || null, healed: getAuthSelfHealRevision() > authRevisionBefore }
      : { success: false, error: '認証できません', errorCode: 'auth' }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const authRevisionBefore = getAuthSelfHealRevision()
    const idToken = await getIdTokenForApi()
    const healedByAuth = getAuthSelfHealRevision() > authRevisionBefore
    const uid = auth.currentUser?.uid || null
    if (!idToken || !uid) continue

    if (await hasCurrentUserMembership(pairId)) {
      return { success: true, idToken, uid, healed: healedByAuth }
    }

    try {
      const claimed = await claimPairMembership(slug, idToken, pairId, attempt)
      if (claimed && await hasCurrentUserMembership(pairId)) {
        return { success: true, idToken, uid, healed: true }
      }
    } catch {
      // Retry once after a fresh getIdTokenForApi() call.
    }
  }

  return { success: false, error: 'ペアの認証を準備できませんでした', errorCode: 'membership' }
}
