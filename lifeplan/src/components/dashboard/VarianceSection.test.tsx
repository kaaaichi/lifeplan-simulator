// lifeplan/src/components/dashboard/VarianceSection.test.tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VarianceSection } from './VarianceSection'
import type { Baseline } from '../../engine/baseline'
import type { YearRow } from '../../types'

function row(year: number, totalAssets: number, isActual = false): YearRow {
  return {
    year,
    agePrimary: 36,
    ageSpouse: 35,
    agesChildren: [],
    income: 0,
    expenses: {
      食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0,
      こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0,
    },
    totalExpense: 0,
    annualCashFlow: 0,
    investmentContribution: isActual ? null : 0,
    investmentReturn: isActual ? null : 0,
    investmentBalance: totalAssets / 2,
    cashBalance: totalAssets / 2,
    totalAssets,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual,
  }
}

const baseline: Baseline = {
  capturedAt: '2026-01-01T00:00:00.000Z',
  series: [
    { year: 2026, totalAssets: 1_000_000, investmentBalance: 500_000, cashBalance: 500_000 },
    { year: 2027, totalAssets: 1_200_000, investmentBalance: 600_000, cashBalance: 600_000 },
  ],
}

describe('VarianceSection', () => {
  it('renders one table row per variance year with predicted/actual/diff/diffPct', () => {
    render(
      <VarianceSection
        baseline={baseline}
        actuals={[{ year: 2026, cashBalance: 400_000, investmentBalance: 700_000 }]}
        central={[row(2026, 1_100_000, true), row(2027, 1_300_000)]}
        variance={[{ year: 2026, predicted: 1_000_000, actual: 1_100_000, diff: 100_000, diffPct: 0.1 }]}
      />,
    )

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(2) // ヘッダー1行 + 実績年1行
    expect(rows[1]).toHaveTextContent('2027')
    expect(rows[1]).toHaveTextContent('10%')
  })

  it('renders a chart', () => {
    render(
      <VarianceSection
        baseline={baseline}
        actuals={[{ year: 2026, cashBalance: 400_000, investmentBalance: 700_000 }]}
        central={[row(2026, 1_100_000, true), row(2027, 1_300_000)]}
        variance={[{ year: 2026, predicted: 1_000_000, actual: 1_100_000, diff: 100_000, diffPct: 0.1 }]}
      />,
    )
    expect(document.querySelector('svg')).toBeInTheDocument()
  })
})
