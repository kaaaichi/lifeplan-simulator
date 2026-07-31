// scripts/simulateCli.ts のFirestoreエミュレータ検証（Task 6 / openspec financial-events-whatif-cli §6.1）。
// tests/persistence/firestoreRepository.emu.test.ts の慣習（describe.skipIf(!emulatorHost)）を踏襲するが、
// CLIはブラウザ向けmodular SDKではなく firebase-admin を使うため、セットアップはCLIの initFirestore() を
// そのまま使い、admin Firestore クライアントで直接シード/読み戻しを行う。
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteApp, getApps } from 'firebase-admin/app'
import type { Firestore } from 'firebase-admin/firestore'
import { main, initFirestore } from '../../scripts/simulateCli'
import { createDefaultDoc } from '../../src/persistence/doc'
import type { HouseholdDoc } from '../../src/persistence/types'
import type { FinancialEvent } from '../../src/types'

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

describe.skipIf(!emulatorHost)('scripts/simulateCli main()（Firestoreエミュレータ）', () => {
  let db: Firestore
  const tmpFiles: string[] = []

  beforeAll(() => {
    // FIRESTORE_EMULATOR_HOST が設定されている（emulators:exec配下）ので、
    // service-account.local.json が存在しなくても initFirestore() が初期化できることを検証する。
    db = initFirestore()
  })

  afterAll(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
    for (const f of tmpFiles.splice(0)) {
      try {
        unlinkSync(f)
      } catch {
        // 既に削除済みなら無視
      }
    }
  })

  function silenceConsole(): void {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  function writeEventsFile(events: FinancialEvent[]): string {
    const p = path.join(tmpdir(), `simulateCli-emu-${randomUUID()}.json`)
    writeFileSync(p, JSON.stringify(events))
    tmpFiles.push(p)
    return p
  }

  async function seed(householdId: string, doc: HouseholdDoc): Promise<void> {
    await db.collection('households').doc(householdId).set(doc as unknown as Record<string, unknown>)
  }

  async function readRaw(householdId: string): Promise<Record<string, unknown> | undefined> {
    const snap = await db.collection('households').doc(householdId).get()
    return snap.data()
  }

  function makeEvent(overrides: Partial<FinancialEvent> = {}): FinancialEvent {
    return {
      id: 'new-evt',
      label: 'テストイベント',
      kind: '収入',
      startYear: 2030,
      endYear: 2031,
      annualAmount: 100_000,
      ...overrides,
    }
  }

  it('試算のみ（--save なし）: 実行後もscenarios配列の内容は完全に一致する', async () => {
    silenceConsole()
    const householdId = `cli-dryrun-${randomUUID()}`
    const seedDoc = createDefaultDoc()
    await seed(householdId, seedDoc)
    const before = await readRaw(householdId)

    const eventsPath = writeEventsFile([makeEvent()])
    await main(['--household', householdId, '--scenario', 'active', '--events', eventsPath])

    const after = await readRaw(householdId)
    expect(after).toEqual(before)
    expect(process.exitCode).not.toBe(1)
  })

  it('--save のみ（--activate なし）: scenariosが1件増え、activeScenarioIdは変わらない', async () => {
    silenceConsole()
    const householdId = `cli-save-${randomUUID()}`
    const seedDoc = createDefaultDoc()
    await seed(householdId, seedDoc)

    const eventsPath = writeEventsFile([makeEvent()])
    await main(['--household', householdId, '--scenario', 'active', '--events', eventsPath, '--save'])

    const after = (await readRaw(householdId)) as unknown as HouseholdDoc
    expect(after.scenarios).toHaveLength(seedDoc.scenarios.length + 1)
    const originalIds = new Set(seedDoc.scenarios.map((s) => s.id))
    const newScenario = after.scenarios.find((s) => !originalIds.has(s.id))
    expect(newScenario).toBeDefined()
    expect(after.activeScenarioId).toBe(seedDoc.activeScenarioId)
    expect(process.exitCode).not.toBe(1)
  })

  it('--save --activate: activeScenarioIdが新しく保存されたシナリオのidになる', async () => {
    silenceConsole()
    const householdId = `cli-save-activate-${randomUUID()}`
    const seedDoc = createDefaultDoc()
    await seed(householdId, seedDoc)

    const eventsPath = writeEventsFile([makeEvent()])
    await main([
      '--household',
      householdId,
      '--scenario',
      'active',
      '--events',
      eventsPath,
      '--save',
      '--activate',
    ])

    const after = (await readRaw(householdId)) as unknown as HouseholdDoc
    const originalIds = new Set(seedDoc.scenarios.map((s) => s.id))
    const newScenario = after.scenarios.find((s) => !originalIds.has(s.id))
    expect(newScenario).toBeDefined()
    expect(after.activeScenarioId).toBe(newScenario!.id)
    expect(process.exitCode).not.toBe(1)
  })

  it('存在しないscenarioIdを指定: Firestoreは一切変更されず、非ゼロ終了コードで終わる', async () => {
    silenceConsole()
    const householdId = `cli-missing-${randomUUID()}`
    const seedDoc = createDefaultDoc()
    await seed(householdId, seedDoc)
    const before = await readRaw(householdId)

    const eventsPath = writeEventsFile([makeEvent()])
    await main([
      '--household',
      householdId,
      '--scenario',
      'no-such-scenario-id',
      '--events',
      eventsPath,
      '--save',
      '--activate',
    ])

    const after = await readRaw(householdId)
    expect(after).toEqual(before)
    expect(process.exitCode).toBe(1)
  })

  it('バリデーション違反（financialEvents.id重複）での保存拒否: Firestoreは一切変更されず、非ゼロ終了コードで終わる', async () => {
    silenceConsole()
    const householdId = `cli-invalid-${randomUUID()}`
    const dupEventId = 'dup-evt'
    const base = createDefaultDoc()
    const seedDoc: HouseholdDoc = {
      ...base,
      scenarios: [
        {
          ...base.scenarios[0]!,
          inputs: {
            ...base.scenarios[0]!.inputs,
            financialEvents: [
              makeEvent({ id: dupEventId, label: '既存イベント', startYear: 2028, endYear: 2029, annualAmount: -50_000 }),
            ],
          },
        },
      ],
    }
    await seed(householdId, seedDoc)
    const before = await readRaw(householdId)

    // 複製元シナリオに既に id=dup-evt のイベントがあるところへ、同じidのイベントを追加する
    // → 複製後のシナリオで financialEvents.id が重複し、保存前バリデーションに引っかかる
    const eventsPath = writeEventsFile([makeEvent({ id: dupEventId })])
    await main(['--household', householdId, '--scenario', 'active', '--events', eventsPath, '--save'])

    const after = await readRaw(householdId)
    expect(after).toEqual(before)
    expect(process.exitCode).toBe(1)
  })
})
