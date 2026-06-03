import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore'
import {
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage'

const PROJECT_ID = 'hum-rules-test'
const MEMBER_UID = 'member-uid'
const OTHER_UID = 'other-uid'
const PAIR_ID = 'PAIR-ALLOWED'
const OTHER_PAIR_ID = 'PAIR-BLOCKED'
const DEMO_PAIR_ID = 'PAIR-DEMOTEST'
const DATE_KEY = '2026-06-03'

let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: fs.readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'pair_numbers', 'slug-a'), { pairId: PAIR_ID })
    await setDoc(doc(db, 'pairs', PAIR_ID), { pairId: PAIR_ID, number: 'slug-a' })
    await setDoc(doc(db, 'pairs', OTHER_PAIR_ID), { pairId: OTHER_PAIR_ID, number: 'slug-b' })
    await setDoc(doc(db, 'pairs', DEMO_PAIR_ID), { pairId: DEMO_PAIR_ID, number: 'demo' })
    await setDoc(doc(db, 'pair_users', PAIR_ID, 'members', MEMBER_UID), {
      role: 'parent',
      claimedAt: 'seed',
    })
    await setDoc(doc(db, 'pair_media', PAIR_ID, 'days', DATE_KEY), {
      parent: { latestAudioPath: 'pair-media/PAIR-ALLOWED/2026-06-03/parent/recording_1200.webm' },
    })
    await setDoc(doc(db, 'pair_media', OTHER_PAIR_ID, 'days', DATE_KEY), {
      parent: { latestAudioPath: 'pair-media/PAIR-BLOCKED/2026-06-03/parent/recording_1200.webm' },
    })
    await setDoc(doc(db, 'pair_media', DEMO_PAIR_ID, 'days', DATE_KEY), {
      parent: { latestAudioPath: 'pair-media/PAIR-DEMOTEST/2026-06-03/parent/recording_1200.webm' },
    })
    await setDoc(doc(db, 'journal', PAIR_ID, 'months', '2026-06', 'days', DATE_KEY), {
      roleData: { parent: { generic_images: [] } },
    })
    await setDoc(doc(db, 'private_collection', 'sentinel'), { value: true })
  })
})

after(async () => {
  await testEnv.cleanup()
})

function authedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore()
}

function authedStorage(uid) {
  return testEnv.authenticatedContext(uid).storage()
}

describe('Firestore pair-member rules', () => {
  test('member can read their pair data', async () => {
    const db = authedDb(MEMBER_UID)
    await assertSucceeds(getDoc(doc(db, 'pairs', PAIR_ID)))
    await assertSucceeds(getDoc(doc(db, 'pair_media', PAIR_ID, 'days', DATE_KEY)))
    await assertSucceeds(getDoc(doc(db, 'journal', PAIR_ID, 'months', '2026-06', 'days', DATE_KEY)))
  })

  test('non-member cannot read another pair data', async () => {
    const db = authedDb(OTHER_UID)
    await assertFails(getDoc(doc(db, 'pairs', PAIR_ID)))
    await assertFails(getDoc(doc(db, 'pair_media', PAIR_ID, 'days', DATE_KEY)))
    await assertFails(getDoc(doc(db, 'journal', PAIR_ID, 'months', '2026-06', 'days', DATE_KEY)))
  })

  test('pair_numbers can be read before membership claim', async () => {
    const db = authedDb(OTHER_UID)
    const snap = await assertSucceeds(getDoc(doc(db, 'pair_numbers', 'slug-a')))
    assert.equal(snap.data().pairId, PAIR_ID)
  })

  test('default wildcard denies other collections', async () => {
    const db = authedDb(MEMBER_UID)
    await assertFails(getDoc(doc(db, 'private_collection', 'sentinel')))
  })

  test('member can write parentDevices, non-member cannot', async () => {
    const memberDb = authedDb(MEMBER_UID)
    const otherDb = authedDb(OTHER_UID)
    await assertSucceeds(setDoc(doc(memberDb, 'pair_users', PAIR_ID, 'parentDevices', 'device-a'), {
      token: 'token-a',
      platform: 'web',
      createdAt: 'now',
      updatedAt: 'now',
      lastSeenAt: 'now',
    }))
    await assertFails(setDoc(doc(otherDb, 'pair_users', PAIR_ID, 'parentDevices', 'device-b'), {
      token: 'token-b',
      platform: 'web',
      createdAt: 'now',
      updatedAt: 'now',
      lastSeenAt: 'now',
    }))
  })

  test('demo pair data remains readable without membership', async () => {
    const db = authedDb(OTHER_UID)
    await assertSucceeds(getDoc(doc(db, 'pairs', DEMO_PAIR_ID)))
    await assertSucceeds(getDoc(doc(db, 'pair_media', DEMO_PAIR_ID, 'days', DATE_KEY)))
  })
})

describe('Storage rules', () => {
  test('client Storage read and write are denied', async () => {
    const storage = authedStorage(MEMBER_UID)
    const fileRef = ref(storage, 'pair-media/PAIR-ALLOWED/2026-06-03/parent/recording_1200.webm')
    await assertFails(uploadBytes(fileRef, new Uint8Array([1, 2, 3])))
    await assertFails(getBytes(fileRef))
  })
})
