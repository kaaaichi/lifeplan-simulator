// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KpiCards } from './KpiCards'
import type { KpiSummary } from '../../store/selectors'

const kpi: KpiSummary = {
  currentTotalAssets: 10_000_000,
  currentInvestmentBalance: 8_500_000,
  currentCashBalance: 1_500_000,
  endTotalAssets: -500_000,
  assetsDepletionYear: 2058,
  requiredMonthlyInvestment: 80_000,
  coastFireRatio: 0.42,
  coastFireNumber: 23_800_000,
}

describe('KpiCards', () => {
  it('renders formatted KPI values', () => {
    render(<KpiCards kpi={kpi} />)
    expect(screen.getByText('¥10,000,000')).toBeInTheDocument()
    expect(screen.getByText('¥-500,000')).toBeInTheDocument()
    expect(screen.getByText('2058年')).toBeInTheDocument()
    expect(screen.getByText('¥80,000/月')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('shows the cash and investment breakdown as separate line elements below the current total assets', () => {
    render(<KpiCards kpi={kpi} />)
    const cash = screen.getByText('現金: ¥1,500,000')
    const investment = screen.getByText('投資: ¥8,500,000')
    expect(cash).toBeInTheDocument()
    expect(investment).toBeInTheDocument()
    expect(cash).not.toBe(investment)
  })

  it('shows the current coast-FIRE target amount below the ratio', () => {
    render(<KpiCards kpi={kpi} />)
    expect(screen.getByText('目安: ¥23,800,000')).toBeInTheDocument()
  })

  it('shows a lifelong-surplus badge when assets never deplete', () => {
    render(<KpiCards kpi={{ ...kpi, assetsDepletionYear: null }} />)
    expect(screen.getByText('生涯黒字')).toBeInTheDocument()
  })

  it('shows a fallback when the required monthly investment is infeasible', () => {
    render(<KpiCards kpi={{ ...kpi, requiredMonthlyInvestment: null }} />)
    expect(screen.getByText('計算不可')).toBeInTheDocument()
  })
})
