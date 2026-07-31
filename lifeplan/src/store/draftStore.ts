import { create } from 'zustand'
import type { Inputs } from '../types'
import type { HouseholdContent } from '../persistence/types'
import { toDoc, fromDoc } from '../persistence/doc'
import { useHouseholdStore, HOUSEHOLD_ID } from './householdStore'

interface DraftState {
  /** beginEdit で固定した編集対象シナリオ(§14.3: activeScenarioId の切替に追随しない) */
  scenarioId: string | null
  draft: Inputs | null
  dirty: boolean
  saveError: string | null
  beginEdit: (scenarioId: string, inputs: Inputs) => void
  update: (fn: (prev: Inputs) => Inputs) => void
  discard: () => void
  save: () => Promise<boolean>
}

export const useDraftStore = create<DraftState>((set, get) => ({
  scenarioId: null,
  draft: null,
  dirty: false,
  saveError: null,

  beginEdit: (scenarioId, inputs) => {
    set({ scenarioId, draft: structuredClone(inputs), dirty: false, saveError: null })
  },

  update: (fn) => {
    const { draft } = get()
    if (!draft) return
    set({ draft: fn(draft), dirty: true })
  },

  discard: () => {
    const { scenarioId } = get()
    const { doc } = useHouseholdStore.getState()
    const scenario = doc?.scenarios.find((s) => s.id === scenarioId)
    if (!scenarioId || !scenario) {
      set({ scenarioId: null, draft: null, dirty: false, saveError: null })
      return
    }
    get().beginEdit(scenarioId, scenario.inputs)
  },

  save: async () => {
    const { scenarioId, draft } = get()
    const { doc, status, repository } = useHouseholdStore.getState()
    if (!scenarioId || !draft || !doc || status !== 'ready') {
      set({ saveError: '保存できる状態ではありません' })
      return false
    }
    // beginEdit 後に対象シナリオが doc から消えていたら、編集内容を暗黙に捨てず失敗させる
    if (!doc.scenarios.some((s) => s.id === scenarioId)) {
      set({ saveError: '編集対象のシナリオが見つかりません' })
      return false
    }
    // 土台は save 時点の doc。対象シナリオの inputs のみ差し替える(§14.3 step 4)
    const scenarios = doc.scenarios.map((s) => (s.id === scenarioId ? { ...s, inputs: draft } : s))
    const content: HouseholdContent = {
      baseYear: doc.baseYear,
      activeScenarioId: doc.activeScenarioId,
      scenarios,
      actuals: doc.actuals,
      ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
    }
    try {
      const next = toDoc(content, { updatedAt: new Date().toISOString() })
      fromDoc(next) // 最終防壁: DocValidationError は catch へ
      await repository.save(HOUSEHOLD_ID, next)
      set({ dirty: false, saveError: null })
      return true
    } catch (e) {
      set({ saveError: e instanceof Error ? e.message : String(e) })
      return false
    }
  },
}))
