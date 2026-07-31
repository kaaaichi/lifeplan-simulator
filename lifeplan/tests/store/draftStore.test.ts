import { describe, it, expect, beforeEach } from 'vitest'
import { useDraftStore } from '../../src/store/draftStore'
import { useHouseholdStore, defaultRepository, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { defaultInputs } from '../../src/persistence/placeholderHousehold'
import { toDoc } from '../../src/persistence/doc'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import type { Inputs } from '../../src/types'

function makeInputs(): Inputs {
  return structuredClone(defaultInputs)
}

describe('useDraftStore', () => {
  beforeEach(() => {
    useDraftStore.setState({ scenarioId: null, draft: null, dirty: false, saveError: null })
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
  })

  it('beginEdit deep-copies the inputs and resets dirty', () => {
    const source = makeInputs()
    useDraftStore.getState().beginEdit('base', source)

    const { draft, scenarioId, dirty } = useDraftStore.getState()
    expect(scenarioId).toBe('base')
    expect(dirty).toBe(false)
    expect(draft).not.toBe(source)
    expect(draft).toEqual(source)

    // 元を破壊してもドラフトは影響を受けない(ディープコピー)
    source.members.children.pop()
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(1)
  })

  it('update applies the recipe immutably and marks dirty', () => {
    useDraftStore.getState().beginEdit('base', makeInputs())
    const before = useDraftStore.getState().draft!

    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 12_000_000 } },
    }))

    const after = useDraftStore.getState()
    expect(after.draft?.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(after.dirty).toBe(true)
    expect(before.members.primary.takeHomeIncome).toBe(6_000_000) // 不変更新
  })

  it('discard re-copies the scenario inputs from the current household doc', () => {
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: makeInputs() }],
      actuals: [],
    })
    useHouseholdStore.setState({ doc, status: 'ready' })
    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 1 } },
    }))

    useDraftStore.getState().discard()

    const state = useDraftStore.getState()
    expect(state.draft?.members.primary.takeHomeIncome).toBe(6_000_000)
    expect(state.dirty).toBe(false)
  })

  it('save replaces only the target scenario inputs and stamps updatedAt', async () => {
    const repository = new InMemoryHouseholdRepository()
    const otherInputs = makeInputs()
    const doc = toDoc(
      {
        baseYear: defaultInputs.baseYear,
        activeScenarioId: 'base',
        scenarios: [
          { id: 'base', name: 'ベースプラン', inputs: makeInputs() },
          { id: 'alt', name: '別プラン', inputs: otherInputs },
        ],
        actuals: [{ year: 2026, cashBalance: 1_000_000, investmentBalance: 2_000_000 }],
      },
    )
    await repository.save(HOUSEHOLD_ID, doc)
    await useHouseholdStore.getState().load(repository)

    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 12_000_000 } },
    }))

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(true)
    expect(useDraftStore.getState().dirty).toBe(false)
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.scenarios.find((s) => s.id === 'base')?.inputs.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(saved?.scenarios.find((s) => s.id === 'alt')?.inputs).toEqual(otherInputs) // 他シナリオ不変
    expect(saved?.actuals).toEqual(doc.actuals) // actuals 不変
    expect(saved?.updatedAt).toBeDefined() // updatedAt 打刻
    // subscribe 経由で householdStore にも反映される
    expect(useHouseholdStore.getState().doc?.updatedAt).toBe(saved?.updatedAt)
  })

  it('save rejects an invalid draft via the fromDoc gate and keeps the repository untouched', async () => {
    const repository = new InMemoryHouseholdRepository()
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: makeInputs() }],
      actuals: [],
    })
    await repository.save(HOUSEHOLD_ID, doc)
    await useHouseholdStore.getState().load(repository)

    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    // baseYear クロスフィールド不変条件(H2)を破る = 最終防壁が発火する不正ドラフト
    useDraftStore.getState().update((prev) => ({ ...prev, baseYear: prev.baseYear + 1 }))

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(false)
    expect(useDraftStore.getState().saveError).toBeTruthy()
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.updatedAt).toBeUndefined() // 保存されていない
  })

  it('save fails when the target scenario has vanished from the doc', async () => {
    const repository = new InMemoryHouseholdRepository()
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [
        { id: 'base', name: 'ベースプラン', inputs: makeInputs() },
        { id: 'alt', name: '別プラン', inputs: makeInputs() },
      ],
      actuals: [],
    })
    await repository.save(HOUSEHOLD_ID, doc)
    await useHouseholdStore.getState().load(repository)

    useDraftStore.getState().beginEdit('alt', doc.scenarios[1]!.inputs)
    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 12_000_000 } },
    }))

    // beginEdit と save の間に対象シナリオが doc から消えた状況を再現
    const withoutAlt = toDoc({
      baseYear: doc.baseYear,
      activeScenarioId: 'base',
      scenarios: [doc.scenarios[0]!],
      actuals: [],
    })
    await repository.save(HOUSEHOLD_ID, withoutAlt)
    const before = await repository.load(HOUSEHOLD_ID)

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(false)
    expect(useDraftStore.getState().saveError).toBeTruthy()
    expect(useDraftStore.getState().dirty).toBe(true) // 編集内容は失われていない
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before) // repository 未更新
  })

  it('save refuses when the household store is not ready (fail-closed C1)', async () => {
    useHouseholdStore.setState({ doc: null, status: 'error', error: new Error('boom') })
    useDraftStore.getState().beginEdit('base', makeInputs())

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(false)
    expect(useDraftStore.getState().saveError).toBeTruthy()
  })
})
