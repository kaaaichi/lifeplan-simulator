// 実績(actuals)・baseline の操作の純関数群(§16.3)。
// HouseholdDoc を受け取り封筒(schemaVersion/updatedAt)を除いた HouseholdContent を返す。
// ガード違反は throw(UI はボタン無効化で先に防ぎ、これは最終防壁)。
import type { HouseholdDoc, HouseholdContent } from './types'
import type { Actual } from '../types'
import { captureBaseline as engineCaptureBaseline } from '../engine/baseline'
import { lifeplanMaster } from '../masterData'

function contentOf(doc: HouseholdDoc): HouseholdContent {
  return {
    baseYear: doc.baseYear,
    activeScenarioId: doc.activeScenarioId,
    scenarios: doc.scenarios,
    actuals: doc.actuals,
    ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
  }
}

function activeScenarioInputs(doc: HouseholdDoc) {
  const scenario = doc.scenarios.find((s) => s.id === doc.activeScenarioId)
  if (!scenario) throw new Error(`アクティブなシナリオが見つかりません: ${doc.activeScenarioId}`)
  return scenario.inputs
}

/** 同じ year が既にあれば上書き、無ければ追加。常に year 昇順で返す(validate の年昇順制約に自前で適合)。 */
export function setActual(doc: HouseholdDoc, actual: Actual): HouseholdContent {
  const others = doc.actuals.filter((a) => a.year !== actual.year)
  const actuals = [...others, actual].sort((a, b) => a.year - b.year)
  return { ...contentOf(doc), actuals }
}

export function deleteActual(doc: HouseholdDoc, year: number): HouseholdContent {
  if (!doc.actuals.some((a) => a.year === year)) {
    throw new Error(`実績が見つかりません: ${year}年`)
  }
  return { ...contentOf(doc), actuals: doc.actuals.filter((a) => a.year !== year) }
}

/** アクティブシナリオの現在の inputs で当初プランを凍結する。baseline 既存時は throw(再ベースラインを使う)。 */
export function captureBaseline(doc: HouseholdDoc, opts: { capturedAt: string }): HouseholdContent {
  if (doc.baseline) {
    throw new Error('当初プランは既に記録されています。再ベースラインを使ってください')
  }
  const baseline = engineCaptureBaseline(activeScenarioInputs(doc), lifeplanMaster, {
    capturedAt: opts.capturedAt,
  })
  return { ...contentOf(doc), baseline }
}

/** 既存の baseline をアクティブシナリオの現在の inputs で上書きする。baseline 未設定時は throw。 */
export function recaptureBaseline(doc: HouseholdDoc, opts: { capturedAt: string }): HouseholdContent {
  if (!doc.baseline) {
    throw new Error('当初プランはまだ記録されていません')
  }
  const baseline = engineCaptureBaseline(activeScenarioInputs(doc), lifeplanMaster, {
    capturedAt: opts.capturedAt,
  })
  return { ...contentOf(doc), baseline }
}
