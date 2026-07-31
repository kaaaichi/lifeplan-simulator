import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'
import type { HouseholdDoc } from '../../src/persistence/types'
import type { HouseholdRepository } from '../../src/persistence/repository'

describe('useHouseholdStore', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null })
  })

  it('bootstraps a default doc when the repository has none', async () => {
    const repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository)
    const state = useHouseholdStore.getState()
    expect(state.status).toBe('ready')
    expect(state.doc?.activeScenarioId).toBe('base')
    expect(await repository.load(HOUSEHOLD_ID)).not.toBeNull()
  })

  it('loads an existing doc without overwriting it', async () => {
    const repository = new InMemoryHouseholdRepository()
    const seeded: HouseholdDoc = {
      schemaVersion: 1,
      baseYear: 2030,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'X', inputs: { ...placeholderInputs, baseYear: 2030 } }],
      actuals: [],
    }
    await repository.save(HOUSEHOLD_ID, seeded)

    await useHouseholdStore.getState().load(repository)

    expect(useHouseholdStore.getState().doc?.baseYear).toBe(2030)
  })

  it('keeps the repository used by load in state', async () => {
    const repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository)
    expect(useHouseholdStore.getState().repository).toBe(repository)
  })

  it('unsubscribes the previous subscription when load runs again', async () => {
    const inner = new InMemoryHouseholdRepository()
    let active = 0
    const counting: HouseholdRepository = {
      load: (id) => inner.load(id),
      save: (id, doc) => inner.save(id, doc),
      subscribe: (id, cb, onError) => {
        active += 1
        const off = inner.subscribe(id, cb, onError)
        return () => {
          active -= 1
          off()
        }
      },
    }
    await useHouseholdStore.getState().load(counting)
    await useHouseholdStore.getState().load(counting)
    expect(active).toBe(1)
  })

  // シナリオ: 購読エラー発火時にstatusがerrorになる（受け入れ試験）
  it('propagates repository errors after the initial load', async () => {
    const inner = new InMemoryHouseholdRepository()
    const captured: { onError: ((e: unknown) => void) | null } = { onError: null }
    const erroring: HouseholdRepository = {
      load: (id) => inner.load(id),
      save: (id, doc) => inner.save(id, doc),
      subscribe: (id, cb, onError) => {
        captured.onError = onError ?? null
        return inner.subscribe(id, cb, onError)
      },
    }

    await useHouseholdStore.getState().load(erroring)
    expect(useHouseholdStore.getState().status).toBe('ready')

    const boom = new Error('permission-denied')
    captured.onError?.(boom)

    expect(useHouseholdStore.getState().status).toBe('error')
    expect(useHouseholdStore.getState().error).toBe(boom)
  })
})
