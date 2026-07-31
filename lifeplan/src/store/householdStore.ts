import { create } from 'zustand'
import type { HouseholdDoc } from '../persistence/types'
import type { HouseholdRepository } from '../persistence/repository'
import { InMemoryHouseholdRepository } from '../persistence/repository'
import { createDefaultDoc } from '../persistence/doc'

export const HOUSEHOLD_ID = 'primary'
export const defaultRepository: HouseholdRepository = new InMemoryHouseholdRepository()

export type HouseholdStatus = 'loading' | 'ready' | 'error'

interface HouseholdState {
  doc: HouseholdDoc | null
  status: HouseholdStatus
  error: unknown
  repository: HouseholdRepository
  load: (repository?: HouseholdRepository) => Promise<void>
}

// 購読の冪等化: load のたびに前回分を解除する(StrictMode の二重 effect・再 mount 対策)
let unsubscribe: (() => void) | null = null

export const useHouseholdStore = create<HouseholdState>((set) => ({
  doc: null,
  status: 'loading',
  error: null,
  repository: defaultRepository,
  load: async (repository = defaultRepository) => {
    set({ status: 'loading', error: null, repository })
    try {
      const existing = await repository.load(HOUSEHOLD_ID)
      const doc = existing ?? (await repository.save(HOUSEHOLD_ID, createDefaultDoc()))
      unsubscribe?.()
      unsubscribe = repository.subscribe(
        HOUSEHOLD_ID,
        (next) => {
          if (next) set({ doc: next, status: 'ready' })
        },
        (error) => set({ status: 'error', error }),
      )
      set({ doc, status: 'ready' })
    } catch (error) {
      set({ status: 'error', error })
    }
  },
}))
