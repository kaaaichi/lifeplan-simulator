import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Baseline } from '../../engine/baseline'
import type { VariancePoint } from '../../engine/variance'
import type { Actual, YearRow } from '../../types'
import { formatYenCompact, yAxisWidth } from './format'
import styles from './VarianceSection.module.css'

interface Props {
  baseline: Baseline
  actuals: Actual[]
  central: YearRow[]
  variance: VariancePoint[]
}

interface Point {
  year: number
  baseline?: number
  actual?: number
  current?: number
}

export function VarianceSection({ baseline, actuals, central, variance }: Props) {
  const actualsByYear = new Map(actuals.map((a) => [a.year, a.cashBalance + a.investmentBalance]))
  const centralByYear = new Map(central.map((r) => [r.year, r.totalAssets]))
  const lastActualYear = actuals.length > 0 ? Math.max(...actuals.map((a) => a.year)) : null

  // baseline/actuals/central は内部的に「年末」年で保存されているため、表示だけ+1年して「年始」ラベルに揃える(§19)
  const points: Point[] = baseline.series.map((b) => ({
    year: b.year + 1,
    baseline: b.totalAssets,
    actual: actualsByYear.get(b.year),
    current: lastActualYear === null || b.year > lastActualYear ? centralByYear.get(b.year) : undefined,
  }))

  const axisValues = points.flatMap((p) => [p.baseline, p.actual, p.current]).filter((v): v is number => v !== undefined)
  const axisWidth = yAxisWidth(axisValues)

  const formatDiffPct = (diffPct: number): string => {
    const rounded = Math.round(diffPct * 1000) / 10
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
  }

  return (
    <section className={styles.container} aria-label="予実比較">
      <h2 className={styles.title}>予実比較</h2>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={formatYenCompact} width={axisWidth} />
          <Tooltip formatter={(value) => (typeof value === 'number' ? formatYenCompact(value) : String(value))} />
          <Line
            dataKey="baseline" name="当初プラン" stroke="var(--color-muted)" strokeDasharray="4 4"
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
          <Line
            dataKey="actual" name="実績" stroke="var(--color-actual)" strokeWidth={2}
            connectNulls dot isAnimationActive={false}
          />
          <Line
            dataKey="current" name="現行予測" stroke="var(--color-accent)" strokeWidth={2}
            dot={false} isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>西暦</th>
              <th className={styles.num}>当初プラン</th>
              <th className={styles.num}>実績</th>
              <th className={styles.num}>差分</th>
              <th className={styles.num}>差分%</th>
            </tr>
          </thead>
          <tbody>
            {variance.map((v) => (
              <tr key={v.year}>
                <td>{v.year + 1}</td>
                <td className={styles.num}>{formatYenCompact(v.predicted)}</td>
                <td className={styles.num}>{formatYenCompact(v.actual)}</td>
                <td className={`${styles.num} ${v.diff < 0 ? styles.negative : ''}`}>
                  {formatYenCompact(v.diff)}
                </td>
                <td className={styles.num}>{formatDiffPct(v.diffPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
