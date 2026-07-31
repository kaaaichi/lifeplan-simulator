// src/engine/realAssetValue.ts

export interface RealAssetValueResult {
  scenarioId: string
  label: string
  description: string
  realValue: number
}

/**
 * 投資残高に対し、各シナリオの反転先の為替・CAPEレシオへ「巻き戻った場合」の実質資産評価額を計算する。
 * 計算式: investmentBalance × (scenario.targetFx / currentFx) × (scenario.targetCape / currentCape)
 * (design.md §4)。currentFx/currentCape は呼び出し側(ライブ取得 or フォールバック)から渡され、
 * ここではネットワークや時刻等の外部依存を一切持たない(ゴールデンマスター回帰の決定性を維持する)。
 */
export function computeRealAssetValueScenarios(
  investmentBalance: number,
  currentFx: number,
  currentCape: number,
  scenarios: readonly { id: string; label: string; description: string; targetFx: number; targetCape: number }[],
): RealAssetValueResult[] {
  return scenarios.map(scenario => ({
    scenarioId: scenario.id,
    label: scenario.label,
    description: scenario.description,
    realValue: investmentBalance * (scenario.targetFx / currentFx) * (scenario.targetCape / currentCape),
  }))
}
