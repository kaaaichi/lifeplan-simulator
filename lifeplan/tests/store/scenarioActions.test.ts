import { describe, it, expect, beforeEach } from 'vitest'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import {
  duplicateScenarioAction,
  deleteScenarioAction,
  renameScenarioAction,
  setActiveScenarioAction,
} from '../../src/store/scenarioActions'

describe('scenarioActions', () => {
  let repository: InMemoryHouseholdRepository

  beforeEach(async () => {
    repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository) // default doc(base 1本)を bootstrap
  })

  it('duplicate saves and the subscription reflects the new doc in the store', async () => {
    const result = await duplicateScenarioAction('base')
    expect(result).toEqual({ ok: true })

    const doc = useHouseholdStore.getState().doc!
    expect(doc.scenarios).toHaveLength(2)
    expect(doc.scenarios[1]!.name).toBe('ベースプランのコピー')
    expect(doc.updatedAt).toBeDefined()
    // repository にも書かれている
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.scenarios).toHaveLength(2)
  })

  it('rename and setActive update the store doc', async () => {
    await duplicateScenarioAction('base')
    const copyId = useHouseholdStore.getState().doc!.scenarios[1]!.id

    expect((await renameScenarioAction(copyId, '強気プラン')).ok).toBe(true)
    expect((await setActiveScenarioAction(copyId)).ok).toBe(true)

    const doc = useHouseholdStore.getState().doc!
    expect(doc.scenarios[1]!.name).toBe('強気プラン')
    expect(doc.activeScenarioId).toBe(copyId)
  })

  it('returns ok:false when status is not ready, without writing', async () => {
    useHouseholdStore.setState({ status: 'loading' })
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await duplicateScenarioAction('base')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
  })

  it('returns ok:false with the op error message, without writing (guard throw)', async () => {
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await deleteScenarioAction('base') // 最後の1本
    expect(result.ok).toBe(false)
    expect(result.error).toContain('最後のシナリオは削除できません')
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
    expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(1)
  })
})
