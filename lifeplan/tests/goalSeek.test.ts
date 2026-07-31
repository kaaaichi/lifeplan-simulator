// tests/goalSeek.test.ts
import { describe, it, expect } from 'vitest'
import { requiredMonthlyInvestment } from '../src/engine/goalSeek'
import { lifeplanMaster } from '../src/masterData'
import { sampleInputs } from './_sampleInputs'
import { baseInputs } from './_fixtures'

describe('requiredMonthlyInvestment', () => {
  it('解が見つかり非負の月額を返す', () => {
    const m = requiredMonthlyInvestment(sampleInputs, lifeplanMaster)
    expect(m).not.toBeNull()
    expect(m!).toBeGreaterThanOrEqual(0)
  })
  it('月額は1000円単位', () => {
    const m = requiredMonthlyInvestment(sampleInputs, lifeplanMaster)!
    expect(m % 1000).toBe(0)
  })

  it('actuals に baseYear-1 の実績があれば、それを起点にゴールシークする(§23)', () => {
    // baseInputs は assets が空(0円)のため、実績を渡さなければ意味のある積立額が必要になる
    const richActuals = [{ year: baseInputs.baseYear - 1, cashBalance: 100_000_000, investmentBalance: 100_000_000 }]
    const withoutActuals = requiredMonthlyInvestment(baseInputs, lifeplanMaster)!
    const withRichActuals = requiredMonthlyInvestment(baseInputs, lifeplanMaster, { actuals: richActuals })!

    expect(withoutActuals).toBeGreaterThan(0)
    expect(withRichActuals).toBeLessThan(withoutActuals)
  })
})
