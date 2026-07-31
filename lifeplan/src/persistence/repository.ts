import type { HouseholdDoc } from './types'

export interface HouseholdRepository {
  load(householdId: string): Promise<HouseholdDoc | null>
  save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc>
  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    onError?: (e: unknown) => void,
  ): () => void
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  private store = new Map<string, HouseholdDoc>()
  private listeners = new Map<string, Set<(doc: HouseholdDoc | null) => void>>()

  async load(householdId: string): Promise<HouseholdDoc | null> {
    return this.store.get(householdId) ?? null
  }

  async save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc> {
    this.store.set(householdId, doc)
    const listeners = this.listeners.get(householdId)
    if (listeners) {
      for (const cb of listeners) cb(doc)
    }
    return doc
  }

  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    _onError?: (e: unknown) => void,
  ): () => void {
    if (!this.listeners.has(householdId)) {
      this.listeners.set(householdId, new Set())
    }
    const set = this.listeners.get(householdId)!
    set.add(cb)
    cb(this.store.get(householdId) ?? null) // 購読直後に現在値で初期発火
    return () => set.delete(cb)
  }
}
