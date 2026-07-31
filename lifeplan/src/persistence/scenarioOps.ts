// シナリオの構造操作(複製/削除/rename/アクティブ切替)の純関数群(§15.3)。
// HouseholdDoc を受け取り封筒(schemaVersion/updatedAt)を除いた HouseholdContent を返す。
// ガード違反は throw(UI はボタン無効化で先に防ぎ、これは最終防壁)。
import type { HouseholdDoc, HouseholdContent, Scenario } from './types'

function contentOf(doc: HouseholdDoc): HouseholdContent {
  return {
    baseYear: doc.baseYear,
    activeScenarioId: doc.activeScenarioId,
    scenarios: doc.scenarios,
    actuals: doc.actuals,
    ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
  }
}

function findScenario(doc: HouseholdDoc, id: string): Scenario {
  const scenario = doc.scenarios.find((s) => s.id === id)
  if (!scenario) throw new Error(`シナリオが見つかりません: ${id}`)
  return scenario
}

/** 「◯◯のコピー」。同名が既にあれば「◯◯のコピー2」「◯◯のコピー3」…と採番 */
function copyName(base: string, existing: string[]): string {
  const first = `${base}のコピー`
  if (!existing.includes(first)) return first
  let n = 2
  while (existing.includes(`${base}のコピー${n}`)) n += 1
  return `${base}のコピー${n}`
}

export function duplicateScenario(doc: HouseholdDoc, sourceId: string, newId: string): HouseholdContent {
  const source = findScenario(doc, sourceId)
  if (doc.scenarios.some((s) => s.id === newId)) throw new Error(`シナリオIDが重複しています: ${newId}`)
  const copy: Scenario = {
    id: newId,
    name: copyName(source.name, doc.scenarios.map((s) => s.name)),
    inputs: structuredClone(source.inputs),
  }
  return { ...contentOf(doc), scenarios: [...doc.scenarios, copy] }
}

export function deleteScenario(doc: HouseholdDoc, id: string): HouseholdContent {
  findScenario(doc, id)
  if (doc.scenarios.length === 1) throw new Error('最後のシナリオは削除できません')
  const scenarios = doc.scenarios.filter((s) => s.id !== id)
  const activeScenarioId = doc.activeScenarioId === id ? scenarios[0]!.id : doc.activeScenarioId
  return { ...contentOf(doc), scenarios, activeScenarioId }
}

export function renameScenario(doc: HouseholdDoc, id: string, name: string): HouseholdContent {
  findScenario(doc, id)
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('シナリオ名を入力してください')
  return {
    ...contentOf(doc),
    scenarios: doc.scenarios.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
  }
}

export function setActiveScenario(doc: HouseholdDoc, id: string): HouseholdContent {
  findScenario(doc, id)
  return { ...contentOf(doc), activeScenarioId: id }
}
