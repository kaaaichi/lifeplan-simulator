/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readRules, allowlistedUids } from './rulesAllowlist'

// firebase emulators:exec が FIRESTORE_EMULATOR_HOST を設定する。無ければ skip。
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

describe.skipIf(!emulatorHost)('firestore.rules（エミュレータ）', () => {
  const rules = readRules()
  const uids = allowlistedUids(rules)
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-rules',
      firestore: { rules },
    })
  })
  afterAll(async () => {
    await testEnv.cleanup()
  })
  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('許可リストは2件（夫婦2人）', () => {
    expect(uids).toHaveLength(2)
  })

  it('許可 UID は households を read/write できる', async () => {
    const db = testEnv.authenticatedContext(uids[0]!).firestore()
    await assertSucceeds(db.doc('households/primary').set({ schemaVersion: 1 }))
    await assertSucceeds(db.doc('households/primary').get())
  })

  it('許可外 UID は read/write できない', async () => {
    const db = testEnv.authenticatedContext('intruder-uid').firestore()
    await assertFails(db.doc('households/primary').get())
    await assertFails(db.doc('households/primary').set({ schemaVersion: 1 }))
  })

  it('未認証は read/write できない', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(db.doc('households/primary').get())
    await assertFails(db.doc('households/primary').set({ schemaVersion: 1 }))
  })

  it('households 以外のコレクションは許可 UID でも拒否（デフォルト deny）', async () => {
    const db = testEnv.authenticatedContext(uids[0]!).firestore()
    await assertFails(db.doc('other/doc').get())
    await assertFails(db.doc('other/doc').set({ x: 1 }))
  })
})
