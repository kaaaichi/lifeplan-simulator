import { describe, it, expect } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { sampleInputs } from './_sampleInputs'

describe('simulate without actuals (backward compat)', () => {
  it('全行が予測(isActual=false)で return 系は数値', () => {
    const rows = simulate(sampleInputs, lifeplanMaster)
    expect(rows.every(r => r.isActual === false)).toBe(true)
    expect(typeof rows[0]!.investmentReturn).toBe('number')
    expect(typeof rows[0]!.investmentContribution).toBe('number')
  })
})

describe('simulate with actuals (rebase)', () => {
  const R = sampleInputs.assumptions.investmentReturnRate / 100
  const byYear = (rows: ReturnType<typeof simulate>) => new Map(rows.map(r => [r.year, r]))

  it('actuals:[] は未指定と完全一致（後方互換）', () => {
    const a = simulate(sampleInputs, lifeplanMaster, { actuals: [] }).map(r => r.totalAssets)
    const b = simulate(sampleInputs, lifeplanMaster).map(r => r.totalAssets)
    expect(a).toEqual(b)
  })

  it('実績年は年末残高を上書きし return/contribution は null', () => {
    const rows = simulate(sampleInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const r = byYear(rows).get(2027)!
    expect(r.isActual).toBe(true)
    expect(r.cashBalance).toBe(5_000_000)
    expect(r.investmentBalance).toBe(12_000_000)
    expect(r.totalAssets).toBe(17_000_000)
    expect(r.investmentReturn).toBeNull()
    expect(r.investmentContribution).toBeNull()
  })

  it('baseYear の実績は seed と二重計上しない', () => {
    const rows = simulate(sampleInputs, lifeplanMaster, {
      actuals: [{ year: 2026, cashBalance: 1_000_000, investmentBalance: 2_000_000 }],
    })
    expect(rows[0]!.year).toBe(2026)
    expect(rows[0]!.totalAssets).toBe(3_000_000)
  })

  it('上書きは翌年へ繰り越す（翌年 return = 上書き残高 × r）', () => {
    const rows = simulate(sampleInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const next = byYear(rows).get(2028)!
    expect(next.isActual).toBe(false)
    expect(next.investmentReturn).toBeCloseTo(12_000_000 * R, 6)
  })

  it('当初予測とズレた実績で未来の軌道が変わる（リベース）', () => {
    const base = simulate(sampleInputs, lifeplanMaster).at(-1)!.investmentBalance
    const bumped = simulate(sampleInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 50_000_000 }],
    }).at(-1)!.investmentBalance
    expect(bumped).toBeGreaterThan(base)
  })

  it('実績の無い間の年は通常どおり予測（ギャップ年）', () => {
    const rows = simulate(sampleInputs, lifeplanMaster, {
      actuals: [
        { year: 2026, cashBalance: 1, investmentBalance: 1 },
        { year: 2028, cashBalance: 2, investmentBalance: 2 },
      ],
    })
    const m = byYear(rows)
    expect(m.get(2026)!.isActual).toBe(true)
    expect(m.get(2027)!.isActual).toBe(false)
    expect(m.get(2028)!.isActual).toBe(true)
  })

  it('範囲外の実績は無視（出力は未指定と一致）', () => {
    const oor = simulate(sampleInputs, lifeplanMaster, {
      actuals: [
        { year: 1999, cashBalance: 9, investmentBalance: 9 },
        { year: 3000, cashBalance: 9, investmentBalance: 9 },
      ],
    })
    expect(oor.every(r => r.isActual === false)).toBe(true)
    expect(oor.map(r => r.totalAssets)).toEqual(simulate(sampleInputs, lifeplanMaster).map(r => r.totalAssets))
  })
})
