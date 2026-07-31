// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BreakdownTabs } from './BreakdownTabs'
import type { YearRow } from '../../types'

function makeRow(year: number, annualCashFlow: number, investmentBalance: number, cashBalance: number): YearRow {
  return {
    year, agePrimary: 34, ageSpouse: 33, agesChildren: [2],
    income: 5_000_000,
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
    totalExpense: 0,
    annualCashFlow,
    investmentContribution: 0,
    investmentReturn: 0,
    investmentBalance,
    cashBalance,
    totalAssets: investmentBalance + cashBalance,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual: false,
  }
}

const rows: YearRow[] = [
  makeRow(2026, 500_000, 1_000_000, 100_000),
  makeRow(2027, -200_000, 1_200_000, -50_000),
]

describe('BreakdownTabs', () => {
  it('labels the stacked areas 現金/投資 in the legend and uses dedicated color variables', () => {
    const { container } = render(<BreakdownTabs rows={rows} />)
    // HTML凡例（色のみに頼らない系列識別）
    expect(screen.getByText('現金')).toBeInTheDocument()
    expect(screen.getByText('投資')).toBeInTheDocument()

    // 積み上げ面が専用CSS変数（バンド色/アクセント色と分離）で塗られていること
    const fills = Array.from(container.querySelectorAll('.recharts-area-area')).map(el => el.getAttribute('fill'))
    expect(fills).toContain('var(--color-cash)')
    expect(fills).toContain('var(--color-investment)')
    // 縁取り線の強調（stroke = 塗りと同色・太さあり）
    const strokes = Array.from(container.querySelectorAll('.recharts-area-curve')).map(el => el.getAttribute('stroke'))
    expect(strokes).toContain('var(--color-cash)')
    expect(strokes).toContain('var(--color-investment)')
  })

  it('defaults to the balance tab and switches to cashflow on click', () => {
    render(<BreakdownTabs rows={rows} />)
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: '単年度収支' }))

    expect(screen.getByRole('tab', { name: '単年度収支' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toHaveAttribute('aria-selected', 'false')
  })

  it('excludes isHistoricalReference rows (フロー不明の過去実績) from the cashflow bar chart', () => {
    const historicalRow: YearRow = { ...makeRow(2024, 0, 100_000, 300_000), isHistoricalReference: true }
    const { container } = render(<BreakdownTabs rows={[historicalRow, ...rows]} />)
    fireEvent.click(screen.getByRole('tab', { name: '単年度収支' }))

    const bars = container.querySelectorAll('.recharts-bar-rectangle')
    expect(bars).toHaveLength(rows.length) // 2024(historicalRow)を除く2本のみ
  })

  it('includes isHistoricalReference rows in the balance area chart (実績として濃く塗る)', () => {
    const historicalRow: YearRow = { ...makeRow(2024, 0, 100_000, 300_000), isActual: true, isHistoricalReference: true }
    const { container } = render(<BreakdownTabs rows={[historicalRow, ...rows]} />)

    const areas = container.querySelectorAll('.recharts-area-area')
    // actualCash/actualInvestment/projectedCash/projectedInvestment の4系列
    expect(areas.length).toBeGreaterThanOrEqual(4)
  })
})
