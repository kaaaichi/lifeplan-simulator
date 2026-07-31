// src/engine/goalSeek.ts
import type { Inputs, MasterData, YearRow, Actual } from '../types'
import { simulate } from './simulate'

export function assetsNeverNegative(rows: YearRow[]): boolean {
  return rows.every(r => r.totalAssets >= 0)
}

export function requiredMonthlyInvestment(
  inputs: Inputs, master: MasterData, opts?: { maxMonthly?: number; actuals?: Actual[] },
): number | null {
  const maxMonthly = opts?.maxMonthly ?? 1_000_000
  const feasible = (monthly: number) => {
    const tuned: Inputs = { ...inputs, assumptions: { ...inputs.assumptions, annualInvestmentContribution: monthly * 12 } }
    return assetsNeverNegative(simulate(tuned, master, { actuals: opts?.actuals }))
  }
  if (!feasible(maxMonthly)) return null // 上限でも不可
  let lo = 0, hi = maxMonthly
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2 / 1000) * 1000
    if (feasible(mid)) hi = mid; else lo = mid
  }
  return hi
}
