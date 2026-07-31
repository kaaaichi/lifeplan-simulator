import type { Inputs, MasterData } from '../types'
import { simulate } from './simulate'

export interface BaselinePoint {
  year: number
  totalAssets: number
  investmentBalance: number
  cashBalance: number
}

export interface Baseline {
  capturedAt?: string
  series: BaselinePoint[]
}

/**
 * 当初プランを凍結する。実績なしで simulate を1回走らせ、その系列を固定値として返す。
 * 純粋関数: capturedAt は呼び出し側から注入する（永続化層の責務、§11.2）。
 */
export function captureBaseline(
  inputs: Inputs, master: MasterData, opts?: { capturedAt?: string },
): Baseline {
  const rows = simulate(inputs, master)
  return {
    capturedAt: opts?.capturedAt,
    series: rows.map(r => ({
      year: r.year,
      totalAssets: r.totalAssets,
      investmentBalance: r.investmentBalance,
      cashBalance: r.cashBalance,
    })),
  }
}
