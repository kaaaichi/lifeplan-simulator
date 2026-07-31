import { describe, it, expect } from 'vitest'
import { computeVariance } from '../src/engine/variance'
import type { Baseline } from '../src/engine/baseline'
import type { Actual } from '../src/types'

const baseline: Baseline = {
  series: [
    { year: 2026, totalAssets: 10_000_000, investmentBalance: 6_000_000, cashBalance: 4_000_000 },
    { year: 2027, totalAssets: 12_000_000, investmentBalance: 7_000_000, cashBalance: 5_000_000 },
  ],
}

describe('computeVariance', () => {
  it('diff と diffPct を計算（actual - predicted）', () => {
    const actuals: Actual[] = [{ year: 2026, cashBalance: 5_000_000, investmentBalance: 6_500_000 }]
    // actual合計=11,500,000 / predicted=10,000,000 → diff +1,500,000 / pct 0.15
    const v = computeVariance(baseline, actuals)
    expect(v).toHaveLength(1)
    expect(v[0]).toEqual({
      year: 2026, predicted: 10_000_000, actual: 11_500_000, diff: 1_500_000, diffPct: 0.15,
    })
  })
  it('baseline に無い年の実績はスキップ', () => {
    const v = computeVariance(baseline, [{ year: 2099, cashBalance: 1, investmentBalance: 1 }])
    expect(v).toHaveLength(0)
  })
  it('predicted が 0 のとき diffPct は 0', () => {
    const b: Baseline = { series: [{ year: 2026, totalAssets: 0, investmentBalance: 0, cashBalance: 0 }] }
    const v = computeVariance(b, [{ year: 2026, cashBalance: 100, investmentBalance: 0 }])
    expect(v[0]!.diff).toBe(100)
    expect(v[0]!.diffPct).toBe(0)
  })
})
