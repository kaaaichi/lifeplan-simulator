// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnnualTable } from './AnnualTable'
import type { YearRow } from '../../types'
import type { ChartPoint, LifeStageEvent } from '../../store/selectors'

function makeRow(
  year: number,
  agePrimary: number,
  cashBalance: number,
  investmentBalance: number,
  annualCashFlow: number,
  income = 5_000_000,
  totalExpense = 0,
  isActual = false,
): YearRow {
  return {
    year, agePrimary, ageSpouse: agePrimary - 1, agesChildren: [2],
    income,
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
    totalExpense,
    annualCashFlow,
    investmentContribution: isActual ? null : 0,
    investmentReturn: isActual ? null : 0,
    investmentBalance,
    cashBalance,
    totalAssets: investmentBalance + cashBalance,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual,
  }
}

function makePoint(
  year: number, age: number, central: number, optimistic: number, pessimistic: number, isActual = false,
): ChartPoint {
  return { year, age, central, optimistic, pessimistic, band: optimistic - pessimistic, isActual }
}

const central: YearRow[] = [
  makeRow(2026, 36, 1_000_000, 3_000_000, 500_000, 5_000_000, 4_500_000, true),
  makeRow(2027, 37, 900_000, 3_500_000, -200_000, 5_000_000, 5_200_000),
]
const series: ChartPoint[] = [
  makePoint(2026, 36, 4_000_000, 4_200_000, 3_800_000),
  makePoint(2027, 37, 4_400_000, 4_900_000, 4_000_000),
]
const events: LifeStageEvent[] = [
  { year: 2027, childName: '第一子', label: '保育園入園', kind: 'nurseryEntry' },
  { year: 2027, childName: '第二子', label: '小学校入学', kind: 'elementary' },
]

describe('AnnualTable', () => {
  it('年ごとに1行のテーブルを描画し、西暦・年齢・万円丸めの金額を表示する', () => {
    render(<AnnualTable series={series} central={central} events={events} />)

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    // ヘッダー1行 + データ2行
    expect(screen.getAllByRole('row')).toHaveLength(3)

    const firstRow = screen.getAllByRole('row')[1]!
    expect(firstRow).toHaveTextContent('2026')
    expect(firstRow).toHaveTextContent('36歳')
    expect(firstRow).toHaveTextContent('400万') // 総資産(中央) 4,000,000
    expect(firstRow).toHaveTextContent('420万') // 楽観
    expect(firstRow).toHaveTextContent('380万') // 悲観
    expect(firstRow).toHaveTextContent('100万') // 現金残高
    expect(firstRow).toHaveTextContent('300万') // 投資残高
    expect(firstRow).toHaveTextContent('500万') // 単年度収入
    expect(firstRow).toHaveTextContent('450万') // 単年度支出
    expect(firstRow).toHaveTextContent('50万') // 単年度収支
  })

  it('マイナスの単年度収支を万円丸めで表示する', () => {
    render(<AnnualTable series={series} central={central} events={events} />)
    const secondRow = screen.getAllByRole('row')[2]!
    expect(secondRow).toHaveTextContent('520万') // 単年度支出
    expect(secondRow).toHaveTextContent('-20万') // 単年度収支
  })

  it('その年のライフイベントを「子名: イベント」形式で該当行にだけ表示する', () => {
    render(<AnnualTable series={series} central={central} events={events} />)
    const rows = screen.getAllByRole('row')
    expect(rows[1]).not.toHaveTextContent('保育園入園')
    expect(rows[2]).toHaveTextContent('第一子: 保育園入園')
    expect(rows[2]).toHaveTextContent('第二子: 小学校入学')
  })

  it('childNameがnullのイベント(financialEvent)はラベルのみ表示する', () => {
    const eventsWithFinancialEvent: LifeStageEvent[] = [
      ...events,
      { year: 2027, childName: null, label: 'ディズニークルーズ＋アメリカ旅行(WDW)', kind: 'financialEvent' },
    ]
    render(<AnnualTable series={series} central={central} events={eventsWithFinancialEvent} />)
    const rows = screen.getAllByRole('row')
    expect(rows[2]).toHaveTextContent('ディズニークルーズ＋アメリカ旅行(WDW)')
    expect(rows[2]).not.toHaveTextContent('null: ディズニークルーズ')
  })

  it('同じ年に複数のライフイベントがある場合、1件ずつ箇条書き(リスト項目)で表示する', () => {
    const multiEvents: LifeStageEvent[] = [
      { year: 2027, childName: '第一子', label: '保育園入園', kind: 'nurseryEntry' },
      { year: 2027, childName: null, label: '車ローン返済', kind: 'financialEvent' },
    ]
    render(<AnnualTable series={series} central={central} events={multiEvents} />)
    const rows = screen.getAllByRole('row')
    const items = within(rows[2]!).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('第一子: 保育園入園')
    expect(items[1]).toHaveTextContent('車ローン返済')
  })

  it('marks isActual rows with a badge', () => {
    render(<AnnualTable series={series} central={central} events={events} />)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]!).getByText('実績')).toBeInTheDocument()
    expect(within(rows[2]!).queryByText('実績')).not.toBeInTheDocument()
  })

  it('adds a 実績総資産 column showing actual totalAssets on isActual rows and "-" otherwise', () => {
    render(<AnnualTable series={series} central={central} events={events} />)
    const headers = screen.getAllByRole('columnheader')
    const colIndex = headers.findIndex(h => h.textContent === '実績総資産')
    expect(colIndex).toBeGreaterThan(-1)

    const rows = screen.getAllByRole('row')
    const firstRowCells = within(rows[1]!).getAllByRole('cell')
    const secondRowCells = within(rows[2]!).getAllByRole('cell')
    // central[0].totalAssets = cashBalance(1,000,000) + investmentBalance(3,000,000) = 4,000,000, isActual
    expect(firstRowCells[colIndex]).toHaveTextContent('400万')
    // central[1] は isActual=false
    expect(secondRowCells[colIndex]).toHaveTextContent('-')
  })

  it('shows "-" for flow columns on isHistoricalReference rows (§20 のフロー不明な過去実績)', () => {
    const historicalRow: YearRow = { ...makeRow(2024, 34, 300_000, 100_000, 0, 0, 0, true), isHistoricalReference: true }
    const historicalPoint = makePoint(2024, 34, 400_000, 400_000, 400_000, true)
    render(
      <AnnualTable
        series={[historicalPoint, ...series]}
        central={[historicalRow, ...central]}
        events={events}
      />,
    )
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('2024')
    expect(within(rows[1]!).getByText('実績')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('30万') // 現金残高
    expect(rows[1]).toHaveTextContent('10万') // 投資残高
    // 単年度収入/支出/収支は不明なため "-" 表示(0万ではない)
    const cells = within(rows[1]!).getAllByRole('cell')
    expect(cells[8]).toHaveTextContent('-')
    expect(cells[9]).toHaveTextContent('-')
    expect(cells[10]).toHaveTextContent('-')
  })
})
