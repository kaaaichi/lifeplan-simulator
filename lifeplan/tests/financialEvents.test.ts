import { describe, it, expect } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { baseInputs } from './_fixtures'
import type { FinancialEvent } from '../src/types'

describe('financialEvents: 未指定時は既存挙動と完全一致', () => {
  it('financialEvents未指定は空配列指定と同じannualCashFlow系列になる(回帰不変)', () => {
    const withoutField = simulate(baseInputs, lifeplanMaster).map(r => r.annualCashFlow)
    const withEmptyArray = simulate({ ...baseInputs, financialEvents: [] }, lifeplanMaster).map(r => r.annualCashFlow)
    expect(withEmptyArray).toEqual(withoutField)
  })
})

describe('financialEvents: kindによるincome/totalExpenseへの反映', () => {
  it('kind:"収入"のイベントはincomeに加算され、annualCashFlowにも反映される。totalExpenseは変わらない', () => {
    const event: FinancialEvent = { id: 'leave', label: '育休による収入減', kind: '収入', startYear: 2027, endYear: 2027, annualAmount: -1_000_000 }
    const withEvent = simulate({ ...baseInputs, financialEvents: [event] }, lifeplanMaster).find(r => r.year === 2027)!
    const without = simulate(baseInputs, lifeplanMaster).find(r => r.year === 2027)!

    expect(withEvent.income).toBeCloseTo(without.income - 1_000_000)
    expect(withEvent.totalExpense).toBeCloseTo(without.totalExpense)
    expect(withEvent.annualCashFlow).toBeCloseTo(without.annualCashFlow - 1_000_000)
  })

  it('kind:"支出"のイベントはtotalExpenseに加算(マイナスのannualAmountは支出減として減算)され、annualCashFlowにも反映される。incomeは変わらない', () => {
    const event: FinancialEvent = { id: 'car-loan', label: '車ローン返済', kind: '支出', startYear: 2027, endYear: 2027, annualAmount: -600_000 }
    const withEvent = simulate({ ...baseInputs, financialEvents: [event] }, lifeplanMaster).find(r => r.year === 2027)!
    const without = simulate(baseInputs, lifeplanMaster).find(r => r.year === 2027)!

    expect(withEvent.totalExpense).toBeCloseTo(without.totalExpense + 600_000)
    expect(withEvent.income).toBeCloseTo(without.income)
    expect(withEvent.annualCashFlow).toBeCloseTo(without.annualCashFlow - 600_000)
  })

  it('kindが異なる複数イベントが同じ年にあっても、annualCashFlowの合計は既存どおり(income変化+totalExpense変化の合算)になる', () => {
    const events: FinancialEvent[] = [
      { id: 'leave', label: '育休による収入減', kind: '収入', startYear: 2027, endYear: 2027, annualAmount: -1_000_000 },
      { id: 'car-loan', label: '車ローン返済', kind: '支出', startYear: 2027, endYear: 2027, annualAmount: -600_000 },
    ]
    const withEvents = simulate({ ...baseInputs, financialEvents: events }, lifeplanMaster).find(r => r.year === 2027)!
    const without = simulate(baseInputs, lifeplanMaster).find(r => r.year === 2027)!

    expect(withEvents.income).toBeCloseTo(without.income - 1_000_000)
    expect(withEvents.totalExpense).toBeCloseTo(without.totalExpense + 600_000)
    expect(withEvents.annualCashFlow).toBeCloseTo(without.annualCashFlow - 1_600_000)
  })
})

describe('financialEvents: 期間限定イベント（例: 育休による収入減）', () => {
  it('startYear〜endYearの年だけannualCashFlowに反映され、他の年には影響しない', () => {
    const event: FinancialEvent = { id: 'leave', label: '育休による収入減', kind: '収入', startYear: 2028, endYear: 2029, annualAmount: -2_000_000 }
    const withEvent = new Map(simulate({ ...baseInputs, financialEvents: [event] }, lifeplanMaster).map(r => [r.year, r]))
    const without = new Map(simulate(baseInputs, lifeplanMaster).map(r => [r.year, r]))

    for (const year of [2026, 2027]) {
      expect(withEvent.get(year)!.annualCashFlow).toBeCloseTo(without.get(year)!.annualCashFlow)
    }
    for (const year of [2028, 2029]) {
      expect(withEvent.get(year)!.annualCashFlow).toBeCloseTo(without.get(year)!.annualCashFlow - 2_000_000)
    }
    for (const year of [2030, 2031]) {
      expect(withEvent.get(year)!.annualCashFlow).toBeCloseTo(without.get(year)!.annualCashFlow)
    }
  })
})

describe('financialEvents: endYearがnullのイベントは以降ずっと継続する', () => {
  it('startYear以降シミュレーション終了年までannualAmountが加算され続ける', () => {
    const event: FinancialEvent = { id: 'car-maintenance', label: '車の維持費', kind: '支出', startYear: 2027, endYear: null, annualAmount: -100_000 }
    const withEvent = simulate({ ...baseInputs, financialEvents: [event] }, lifeplanMaster)
    const without = simulate(baseInputs, lifeplanMaster)
    const withByYear = new Map(withEvent.map(r => [r.year, r]))
    const withoutByYear = new Map(without.map(r => [r.year, r]))
    const lastYear = without.at(-1)!.year

    expect(withByYear.get(2026)!.annualCashFlow).toBeCloseTo(withoutByYear.get(2026)!.annualCashFlow)
    for (let year = 2027; year <= lastYear; year++) {
      expect(withByYear.get(year)!.annualCashFlow).toBeCloseTo(withoutByYear.get(year)!.annualCashFlow - 100_000)
    }
  })
})

describe('financialEvents: 同一年に複数イベントが重なる場合は合算される', () => {
  it('車購入の頭金と育休の収入減が同じ年に重なるとannualAmountの合計が加算される', () => {
    const events: FinancialEvent[] = [
      { id: 'car-downpayment', label: '車購入の頭金', kind: '支出', startYear: 2026, endYear: 2026, annualAmount: -500_000 },
      { id: 'leave', label: '育休による収入減', kind: '収入', startYear: 2026, endYear: 2027, annualAmount: -2_000_000 },
    ]
    const withEvents = simulate({ ...baseInputs, financialEvents: events }, lifeplanMaster)
    const without = simulate(baseInputs, lifeplanMaster)
    const w = withEvents.find(r => r.year === 2026)!.annualCashFlow
    const wo = without.find(r => r.year === 2026)!.annualCashFlow
    expect(w).toBeCloseTo(wo - 2_500_000)
  })
})

describe('financialEvents: startYearがendYearより後の不正な期間はどの年にも寄与しない', () => {
  it('annualAmountがどの年のannualCashFlowにも加算されない', () => {
    const event: FinancialEvent = { id: 'invalid', label: '不正な期間', kind: '収入', startYear: 2030, endYear: 2025, annualAmount: 999_999 }
    const withEvent = simulate({ ...baseInputs, financialEvents: [event] }, lifeplanMaster).map(r => r.annualCashFlow)
    const without = simulate(baseInputs, lifeplanMaster).map(r => r.annualCashFlow)
    expect(withEvent).toEqual(without)
  })
})
