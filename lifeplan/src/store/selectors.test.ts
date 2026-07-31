import { describe, it, expect } from 'vitest'
import { selectDashboardData, selectAssetBenchmark } from './selectors'
import { createDefaultDoc } from '../persistence/doc'
import { computeAssetBenchmark } from '../engine/assetBenchmark'

describe('computeKpiSummary', () => {
  it('exposes currentInvestmentBalance matching the current row investment balance', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)

    const latestActual = [...data.centralYearStart].reverse().find(r => r.isActual)
    const currentRow = latestActual ?? data.centralYearStart[0]!

    expect(data.kpi.currentInvestmentBalance).toBe(currentRow.investmentBalance)
  })

  it('exposes currentCashBalance matching the current row cash balance', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)

    const latestActual = [...data.centralYearStart].reverse().find(r => r.isActual)
    const currentRow = latestActual ?? data.centralYearStart[0]!

    expect(data.kpi.currentCashBalance).toBe(currentRow.cashBalance)
  })
})

describe('selectAssetBenchmark', () => {
  it('現在の総資産とbaseYear時点のagePrimaryをcomputeAssetBenchmarkにそのまま渡す', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)

    const result = selectAssetBenchmark(data)

    const expected = computeAssetBenchmark(data.kpi.currentTotalAssets, data.central[0]!.agePrimary)
    expect(result).toEqual(expected)
  })
})
