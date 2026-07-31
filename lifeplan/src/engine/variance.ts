import type { Actual } from '../types'
import type { Baseline } from './baseline'

export interface VariancePoint {
  year: number
  predicted: number   // 当初プランの totalAssets
  actual: number      // 実績合計 (cash + invest)
  diff: number        // actual - predicted
  diffPct: number     // diff / predicted（predicted=0 のときは 0）
}

export function computeVariance(baseline: Baseline, actuals: Actual[]): VariancePoint[] {
  const predictedByYear = new Map(baseline.series.map(p => [p.year, p.totalAssets]))
  const out: VariancePoint[] = []
  for (const a of actuals) {
    const predicted = predictedByYear.get(a.year)
    if (predicted === undefined) continue // baseline に無い年はスキップ
    const actual = a.cashBalance + a.investmentBalance
    const diff = actual - predicted
    const diffPct = predicted !== 0 ? diff / predicted : 0
    out.push({ year: a.year, predicted, actual, diff, diffPct })
  }
  return out
}
