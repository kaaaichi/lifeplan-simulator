import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { initializeFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { FirestoreHouseholdRepository } from '../../src/persistence/firestoreRepository'
import { createDefaultDoc } from '../../src/persistence/doc'
import { UnsupportedSchemaVersionError } from '../../src/persistence/errors'
import type { HouseholdDoc } from '../../src/persistence/types'

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

// アダプタ契約テスト。ルール検証は tests/rules/ に分離済みなので、ここでは全許可ルールを使う。
const OPEN_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}`

describe.skipIf(!emulatorHost)('FirestoreHouseholdRepository（エミュレータ）', () => {
  let testEnv: RulesTestEnvironment
  let app: FirebaseApp
  let db: Firestore
  let repo: FirestoreHouseholdRepository

  beforeAll(async () => {
    // demo-adapter プロジェクトに全許可ルールを登録してから、通常の modular SDK で接続する
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-adapter',
      firestore: { rules: OPEN_RULES },
    })
    app = initializeApp({ projectId: 'demo-adapter', apiKey: 'fake-api-key' }, 'adapter-test')
    // src/firebase/app.ts の getFirestoreDb() と同じ設定（ignoreUndefinedProperties）を
    // ミラーする。Child.allowanceMonthly: undefined（自動計算モード）を setDoc できることを
    // このテストスイートでも検証するため。
    db = initializeFirestore(app, { ignoreUndefinedProperties: true })
    const [host, port] = emulatorHost!.split(':')
    connectFirestoreEmulator(db, host!, Number(port))
    repo = new FirestoreHouseholdRepository(db)
  })
  afterAll(async () => {
    await deleteApp(app)
    await testEnv.cleanup()
  })
  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('未保存の load は null', async () => {
    expect(await repo.load('nobody')).toBeNull()
  })

  it('save は server 確定 updatedAt（ISO文字列）付き doc を返し、load と往復する（H3）', async () => {
    const saved = await repo.save('t-roundtrip', createDefaultDoc())
    expect(typeof saved.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(saved.updatedAt!))).toBe(false)
    const loaded = await repo.load('t-roundtrip')
    expect(loaded).toEqual(saved)
  })

  it('こづかい自動計算モード(allowanceMonthly: undefined)の子どもを含む doc を save/load できる', async () => {
    const base = createDefaultDoc()
    const withAutoChild: HouseholdDoc = {
      ...base,
      scenarios: base.scenarios.map((s) => ({
        ...s,
        inputs: {
          ...s.inputs,
          members: {
            ...s.inputs.members,
            children: s.inputs.members.children.map((c, i) =>
              i === 0 ? { ...c, allowanceMonthly: undefined } : c,
            ),
          },
        },
      })),
    }
    const saved = await repo.save('t-auto-allowance', withAutoChild)
    const loaded = await repo.load('t-auto-allowance')
    expect(loaded).toEqual(saved)
    expect(loaded?.scenarios[0]?.inputs.members.children[0]?.allowanceMonthly).toBeUndefined()
  })

  it('save は呼び出し側の updatedAt を server 値で置き換える', async () => {
    const stale = { ...createDefaultDoc(), updatedAt: '2000-01-01T00:00:00.000Z' }
    const saved = await repo.save('t-stamp', stale)
    expect(saved.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('subscribe は購読直後に現在値で1回発火する（H4）', async () => {
    const saved = await repo.save('t-initial', createDefaultDoc())
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-initial', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    expect(seen[0]).toEqual(saved)
    unsub()
  })

  it('未作成の subscribe は null で初期発火し、自分の save が購読に発火する（InMemory と同契約）', async () => {
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-echo', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    expect(seen[0]).toBeNull()
    await repo.save('t-echo', createDefaultDoc())
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(2))
    const last = seen[seen.length - 1]
    expect(last?.scenarios[0]?.id).toBe('base')
    expect(typeof last?.updatedAt).toBe('string')
    unsub()
  })

  it('unsubscribe 後は発火しない', async () => {
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-unsub', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    unsub()
    const countAfterUnsub = seen.length
    await repo.save('t-unsub', createDefaultDoc())
    await new Promise((r) => setTimeout(r, 300))
    expect(seen.length).toBe(countAfterUnsub)
  })

  it('未来 schemaVersion は load が throw・subscribe は onError（fail-closed C1）', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('households/t-broken').set({ schemaVersion: 999 })
    })
    await expect(repo.load('t-broken')).rejects.toBeInstanceOf(UnsupportedSchemaVersionError)

    const errors: unknown[] = []
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-broken', (d) => seen.push(d), (e) => errors.push(e))
    await vi.waitFor(() => expect(errors.length).toBeGreaterThanOrEqual(1))
    expect(errors[0]).toBeInstanceOf(UnsupportedSchemaVersionError)
    expect(seen).toHaveLength(0)
    unsub()
  })
})
