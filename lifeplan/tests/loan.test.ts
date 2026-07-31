import { describe, it, expect } from 'vitest'
import { monthlyLoanPayment } from '../src/engine/loan'

describe('monthlyLoanPayment', () => {
  it('正の金利で正しい月次返済額を計算する', () => {
    // 借入元本300万円、年利1.5%、返済年数5年
    // 月利 r = 1.5 / 100 / 12 = 0.00125
    // 返済回数 n = 5 * 12 = 60
    // PMT = P * r * (1+r)^n / ((1+r)^n - 1)
    //     = 3000000 * 0.00125 * 1.0778336683... / 0.0778336683...
    //     ≈ 51929.66
    const result = monthlyLoanPayment(3_000_000, 1.5, 5)
    expect(result).toBeCloseTo(51929.66, 1)
  })

  it('金利が0%の場合は単純な均等割りになる', () => {
    // 借入元本120万円、年利0%、返済年数5年
    // 単純均等割り = 1200000 / (5 * 12) = 1200000 / 60 = 20000
    const result = monthlyLoanPayment(1_200_000, 0, 5)
    expect(result).toBe(20_000)
  })

  it('ゼロ除算を避けて計算できる（金利0%時）', () => {
    // 金利0%時、素朴なPMT公式では (1+r)^n - 1 = 0 となり除算エラーが発生する
    // 実装は単純均等割りで対応するので、エラーは発生しない
    const result = monthlyLoanPayment(1_000_000, 0, 10)
    expect(result).toBe(1_000_000 / (10 * 12))
  })
})
