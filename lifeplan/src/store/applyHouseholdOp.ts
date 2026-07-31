// 保存パターンの共通化: toDoc(updatedAt打刻) → fromDoc 最終防壁(C1) → repository.save。
// scenarioActions.ts / actualsActions.ts の双方から使う薄いヘルパー。
import type { HouseholdDoc, HouseholdContent } from '../persistence/types'
import { toDoc, fromDoc } from '../persistence/doc'
import { useHouseholdStore, HOUSEHOLD_ID } from './householdStore'

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function applyHouseholdOp(
  op: (doc: HouseholdDoc) => HouseholdContent,
): Promise<ActionResult> {
  const { doc, status, repository } = useHouseholdStore.getState()
  if (!doc || status !== 'ready') return { ok: false, error: '操作できる状態ではありません' }
  try {
    const next = toDoc(op(doc), { updatedAt: new Date().toISOString() })
    fromDoc(next) // 最終防壁: DocValidationError は catch へ
    await repository.save(HOUSEHOLD_ID, next)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
