import { describe, it, expect } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { defaultInputs as placeholderInputs } from '../src/persistence/placeholderHousehold'

describe('coastFireNumber (§22: 標準定義=固定目標年齢・固定目標額・固定利回り)', () => {
  it('デフォルトでは目標額4000万円・目標年齢65歳・利回り4%で現在価値割引する', () => {
    const inputs = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions, coastFireTargetAmount: undefined } }
    const rows = simulate(inputs, lifeplanMaster)
    const targetYear = inputs.members.primary.birthYear + 65
    const targetRow = rows.find(r => r.year === targetYear)!
    const firstRow = rows[0]!

    // 目標年齢そのものは割引年数0なので目標額と一致する
    expect(targetRow.coastFireNumber).toBeCloseTo(40_000_000)

    // 基準年は目標年齢まで年4%で複利割引された額になる
    const yearsToTarget = targetYear - firstRow.year
    const expected = 40_000_000 / Math.pow(1.04, yearsToTarget)
    expect(firstRow.coastFireNumber).toBeCloseTo(expected)
  })

  it('coastFireTargetAmount を上書きすると目標額が変わる', () => {
    const inputs = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions, coastFireTargetAmount: 20_000_000 } }
    const rows = simulate(inputs, lifeplanMaster)
    const targetYear = inputs.members.primary.birthYear + 65
    const targetRow = rows.find(r => r.year === targetYear)!

    expect(targetRow.coastFireNumber).toBeCloseTo(20_000_000)
  })

  it('coastFireTargetAge を上書きすると pensionStartAge とは独立に目標年齢が変わる', () => {
    const inputs = {
      ...placeholderInputs,
      assumptions: { ...placeholderInputs.assumptions, coastFireTargetAge: 70, pensionStartAge: 65 },
    }
    const rows = simulate(inputs, lifeplanMaster)
    const targetYear = inputs.members.primary.birthYear + 70
    const targetRow = rows.find(r => r.year === targetYear)!
    const pensionYear = inputs.members.primary.birthYear + 65
    const pensionRow = rows.find(r => r.year === pensionYear)!

    expect(targetRow.coastFireNumber).toBeCloseTo(40_000_000)
    // pensionStartAge の年はまだ目標年齢に達していないので目標額より小さい
    expect(pensionRow.coastFireNumber).toBeLessThan(40_000_000)
  })

  it('coastFireReturnRate を上書きすると割引に使う利回りが変わる', () => {
    const inputs = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions, coastFireReturnRate: 2 } }
    const rows = simulate(inputs, lifeplanMaster)
    const targetYear = inputs.members.primary.birthYear + 65
    const firstRow = rows[0]!
    const yearsToTarget = targetYear - firstRow.year
    const expected = 40_000_000 / Math.pow(1.02, yearsToTarget)

    expect(firstRow.coastFireNumber).toBeCloseTo(expected)
  })

  it('シナリオの利回り(investmentReturnRate/楽観/悲観)を変えても coastFireNumber は変化しない', () => {
    const base = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions } }
    const optimistic = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions, investmentReturnRate: 20 } }

    const baseRows = simulate(base, lifeplanMaster)
    const optimisticRows = simulate(optimistic, lifeplanMaster)

    expect(optimisticRows[0]!.coastFireNumber).toBeCloseTo(baseRows[0]!.coastFireNumber)
  })

  it('目標年齢到達後は割引年数が0でクランプされ目標額のまま', () => {
    const inputs = { ...placeholderInputs, assumptions: { ...placeholderInputs.assumptions, coastFireTargetAmount: 40_000_000 } }
    const rows = simulate(inputs, lifeplanMaster)
    const lastRow = rows[rows.length - 1]!
    const targetYear = inputs.members.primary.birthYear + 65

    expect(lastRow.year).toBeGreaterThan(targetYear)
    expect(lastRow.coastFireNumber).toBeCloseTo(40_000_000)
  })
})
