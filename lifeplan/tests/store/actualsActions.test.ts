import { describe, it, expect, beforeEach } from 'vitest'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import {
  setActualAction,
  deleteActualAction,
  captureBaselineAction,
  recaptureBaselineAction,
} from '../../src/store/actualsActions'

describe('actualsActions', () => {
  let repository: InMemoryHouseholdRepository

  beforeEach(async () => {
    repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository) // default doc(base 1本)を bootstrap
  })

  it('setActual saves and the store doc reflects the new year', async () => {
    const result = await setActualAction({ year: 2026, cashBalance: 100, investmentBalance: 200 })
    expect(result).toEqual({ ok: true })

    const doc = useHouseholdStore.getState().doc!
    expect(doc.actuals).toEqual([{ year: 2026, cashBalance: 100, investmentBalance: 200 }])
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(doc)
  })

  it('deleteActual removes the year from the store doc', async () => {
    await setActualAction({ year: 2026, cashBalance: 100, investmentBalance: 200 })
    expect((await deleteActualAction(2026)).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.actuals).toEqual([])
  })

  it('captureBaseline then recaptureBaseline both succeed', async () => {
    expect((await captureBaselineAction()).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.baseline).toBeDefined()

    expect((await recaptureBaselineAction()).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.baseline).toBeDefined()
  })

  it('captureBaseline twice fails with the guard error, without a second write', async () => {
    await captureBaselineAction()
    const before = useHouseholdStore.getState().doc

    const result = await captureBaselineAction()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('既に記録')
    expect(useHouseholdStore.getState().doc).toEqual(before)
  })

  it('recaptureBaseline fails before any baseline exists', async () => {
    const result = await recaptureBaselineAction()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('まだ記録されていません')
  })

  it('returns ok:false when status is not ready, without writing', async () => {
    useHouseholdStore.setState({ status: 'loading' })
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await setActualAction({ year: 2026, cashBalance: 1, investmentBalance: 1 })
    expect(result.ok).toBe(false)
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
  })
})
