import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { YearRow } from '../../types'
import { formatYenCompact, yAxisWidth } from './format'
import styles from './BreakdownTabs.module.css'

type Tab = 'balance' | 'cashflow'

export function BreakdownTabs({ rows }: { rows: YearRow[] }) {
  const [tab, setTab] = useState<Tab>('balance')

  // 実績(isActual)の最後の行までを「実績」、そこから先を「予測」として塗りの濃さで色分けする(§20)。
  // 境界の行は両方に値を持たせて面をシームレスに繋げる。
  const lastActualIndex = rows.reduce((acc, r, i) => (r.isActual ? i : acc), -1)
  const balanceData = rows.map((r, i) => ({
    year: r.year,
    actualCash: i <= lastActualIndex ? r.cashBalance : undefined,
    actualInvestment: i <= lastActualIndex ? r.investmentBalance : undefined,
    projectedCash: i >= lastActualIndex ? r.cashBalance : undefined,
    projectedInvestment: i >= lastActualIndex ? r.investmentBalance : undefined,
  }))
  // 単年度収支は過去の参考実績(§16.9, フロー不明)を除外する
  const cashflowData = rows
    .filter(r => !r.isHistoricalReference)
    .map(r => ({ year: r.year, cashFlow: r.annualCashFlow }))

  const tooltipFormatter = (value: unknown) => (typeof value === 'number' ? formatYenCompact(value) : String(value))
  const balanceAxisWidth = yAxisWidth(rows.map(r => r.cashBalance + r.investmentBalance))
  const cashFlowAxisWidth = yAxisWidth(cashflowData.map(d => d.cashFlow))

  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'balance'} className={styles.tab} onClick={() => setTab('balance')}>
          現金 vs 投資
        </button>
        <button type="button" role="tab" aria-selected={tab === 'cashflow'} className={styles.tab} onClick={() => setTab('cashflow')}>
          単年度収支
        </button>
      </div>
      {tab === 'balance' && (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--color-cash)' }} />
            現金
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--color-investment)' }} />
            投資
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--color-actual)' }} />
            実績(縁取り・濃い塗り)
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--color-muted)', opacity: 0.3 }} />
            予測(薄い塗り)
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={240}>
        {tab === 'balance' ? (
          <AreaChart data={balanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={formatYenCompact} width={balanceAxisWidth} />
            <Tooltip formatter={tooltipFormatter} />
            <Area dataKey="actualCash" name="現金(実績)" stackId="actual" stroke="var(--color-actual)" strokeWidth={3} fill="var(--color-cash)" fillOpacity={0.75} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="actualInvestment" name="投資(実績)" stackId="actual" stroke="var(--color-actual)" strokeWidth={3} fill="var(--color-investment)" fillOpacity={0.75} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="projectedCash" name="現金(予測)" stackId="projected" stroke="var(--color-cash)" strokeWidth={1} fill="var(--color-cash)" fillOpacity={0.2} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="projectedInvestment" name="投資(予測)" stackId="projected" stroke="var(--color-investment)" strokeWidth={1} fill="var(--color-investment)" fillOpacity={0.2} isAnimationActive={false} connectNulls={false} />
          </AreaChart>
        ) : (
          <BarChart data={cashflowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={formatYenCompact} width={cashFlowAxisWidth} />
            <Tooltip formatter={tooltipFormatter} />
            <Bar dataKey="cashFlow" name="単年度収支" isAnimationActive={false}>
              {cashflowData.map(d => (
                <Cell key={d.year} fill={d.cashFlow >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
