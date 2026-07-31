// シナリオ構造操作の保存アクション(§15.4)。構造操作に「編集途中」は無いため即時保存・ドラフト無し。
// 保存パターンは applyHouseholdOp に共通化済み(§16.1)。エラー表示はページの local state に委ねる。
import {
  duplicateScenario,
  deleteScenario,
  renameScenario,
  setActiveScenario,
} from '../persistence/scenarioOps'
import { applyHouseholdOp, type ActionResult } from './applyHouseholdOp'

export type { ActionResult }

export const duplicateScenarioAction = (sourceId: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => duplicateScenario(doc, sourceId, crypto.randomUUID()))

export const deleteScenarioAction = (id: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => deleteScenario(doc, id))

export const renameScenarioAction = (id: string, name: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => renameScenario(doc, id, name))

export const setActiveScenarioAction = (id: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => setActiveScenario(doc, id))
