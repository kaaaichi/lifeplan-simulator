import { describe, it, expect } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { baseInputs } from './_fixtures'

describe('oneTimeInvestments', () => {
  it('一時投資がある年の investmentBalance が無い場合より大きい', () => {
    const withLump = simulate(
      { ...baseInputs, assumptions: { ...baseInputs.assumptions, oneTimeInvestments: [{ year: baseInputs.baseYear + 1, amount: 1_000_000 }] } },
      lifeplanMaster,
    )
    const withoutLump = simulate(baseInputs, lifeplanMaster)
    const targetYear = baseInputs.baseYear + 1
    const balWith = withLump.find(r => r.year === targetYear)!.investmentBalance
    const balWithout = withoutLump.find(r => r.year === targetYear)!.investmentBalance
    expect(balWith).toBeGreaterThan(balWithout)
  })
})

describe('simulate', () => {
  it('baseYearから主生計者95歳まで生成', () => {
    const rows = simulate(baseInputs, lifeplanMaster)
    expect(rows[0]!.year).toBe(2026)
    // 主生計者が endAge(95歳) になる年まで生成される
    const { birthYear } = baseInputs.members.primary
    expect(rows.at(-1)!.year).toBe(birthYear + baseInputs.assumptions.endAge)
  })
  it('totalAssets = cash + investment', () => {
    const r = simulate(baseInputs, lifeplanMaster)[5]!
    expect(r.totalAssets).toBeCloseTo(r.cashBalance + r.investmentBalance, 0)
  })
  it('returnRate上書きで投資残高が変わる', () => {
    const lo = simulate(baseInputs, lifeplanMaster, { returnRate: 2 }).at(-1)!.investmentBalance
    const hi = simulate(baseInputs, lifeplanMaster, { returnRate: 7 }).at(-1)!.investmentBalance
    expect(hi).toBeGreaterThan(lo)
  })
})

describe('§23: baseYear-1(今年の年始)の実績を起点残高に使う', () => {
  it('actualsにbaseYear-1の記録があれば、それをinputs.assetsの代わりに起点残高にする', () => {
    const actuals = [{ year: baseInputs.baseYear - 1, cashBalance: 1_000_000, investmentBalance: 2_000_000 }]
    const viaActuals = simulate(baseInputs, lifeplanMaster, { actuals })

    const equivalentInputs = {
      ...baseInputs,
      assets: { bankAccounts: [{ label: '実績', balance: 1_000_000 }], investments: [{ label: '実績', balance: 2_000_000 }] },
    }
    const viaAssets = simulate(equivalentInputs, lifeplanMaster)

    expect(viaActuals[0]!.cashBalance).toBeCloseTo(viaAssets[0]!.cashBalance)
    expect(viaActuals[0]!.investmentBalance).toBeCloseTo(viaAssets[0]!.investmentBalance)
  })

  it('actualsにbaseYear-1の記録が無ければ、従来通りinputs.assetsを起点残高にする(回帰)', () => {
    const withEmptyActuals = simulate(baseInputs, lifeplanMaster, { actuals: [] })
    const withoutActuals = simulate(baseInputs, lifeplanMaster)

    expect(withEmptyActuals[0]!.cashBalance).toBeCloseTo(withoutActuals[0]!.cashBalance)
    expect(withEmptyActuals[0]!.investmentBalance).toBeCloseTo(withoutActuals[0]!.investmentBalance)
  })

  it('actualsにbaseYear自体(またはそれ以降)の記録があっても起点残高には影響しない(従来のリベース挙動を優先)', () => {
    const actuals = [{ year: baseInputs.baseYear, cashBalance: 9_999_999, investmentBalance: 9_999_999 }]
    const withActuals = simulate(baseInputs, lifeplanMaster, { actuals })
    const withoutActuals = simulate(baseInputs, lifeplanMaster)

    expect(withActuals[0]!.investmentContribution).toBeNull()
    expect(withoutActuals[0]!.investmentContribution).not.toBeNull()
  })
})

describe('emergencyFundCash 取り崩し', () => {
  it('投資残高が十分な場合、現金が生活防衛資金まで回復し総資産は変わらない', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', kind: '支出' as const, startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ label: '投資', balance: 50_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const withFloor = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    const withoutFloor = simulate({ ...inputs, assumptions: { ...inputs.assumptions, emergencyFundCash: -1_000_000_000 } }, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!

    expect(withFloor.cashBalance).toBe(1_200_000)
    expect(withFloor.totalAssets).toBeCloseTo(withoutFloor.totalAssets, 6)
    expect(withFloor.investmentBalance).toBeLessThan(withoutFloor.investmentBalance)
  })

  it('投資残高が不足する場合、投資残高は0になり現金は生活防衛資金を下回ったままになる', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', kind: '支出' as const, startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ label: '投資', balance: 500_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const row = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    expect(row.investmentBalance).toBe(0)
    expect(row.cashBalance).toBeLessThan(1_200_000)
  })

  it('現金残高が既に生活防衛資金以上の場合は取り崩しが発生しない', () => {
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [{ label: '普通', balance: 20_000_000 }], investments: [{ label: '投資', balance: 5_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
    }
    const withFloor = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    const withoutFloor = simulate({ ...inputs, assumptions: { ...inputs.assumptions, emergencyFundCash: 0 } }, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    expect(withFloor.cashBalance).toBe(withoutFloor.cashBalance)
    expect(withFloor.investmentBalance).toBe(withoutFloor.investmentBalance)
  })

  it('楽観シナリオ(returnRate上書き)でも同じ閾値ロジックが適用される', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', kind: '支出' as const, startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ label: '投資', balance: 50_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const row = simulate(inputs, lifeplanMaster, { returnRate: 7 }).find(r => r.year === baseInputs.baseYear)!
    expect(row.cashBalance).toBe(1_200_000)
  })
})
