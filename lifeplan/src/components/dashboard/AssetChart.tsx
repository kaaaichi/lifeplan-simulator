import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { ChartPoint, EventMarker } from '../../store/selectors'
import { formatYenCompact, yAxisWidth, groupEventMarkersByYear } from './format'
import styles from './AssetChart.module.css'

export function AssetChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload as ChartPoint | undefined
  if (!point) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipYear}>{label}</p>
      <p className={styles.tooltipRow}>
        <span>楽観</span>
        <strong>{formatYenCompact(point.optimistic)}</strong>
      </p>
      <p className={styles.tooltipRow}>
        <span>中央</span>
        <strong>{formatYenCompact(point.central)}</strong>
      </p>
      <p className={styles.tooltipRow}>
        <span>悲観</span>
        <strong>{formatYenCompact(point.pessimistic)}</strong>
      </p>
    </div>
  )
}

export function AssetChart({ series, eventMarkers }: { series: ChartPoint[]; eventMarkers: EventMarker[] }) {
  const ageByYear = new Map(series.map(p => [p.year, p.age]))
  const axisWidth = yAxisWidth(series.flatMap(p => [p.pessimistic, p.central, p.optimistic]))

  // 実績(isActual)の最後の点までを「実績」線、そこから先を「予測」線として色分けする(§20)。
  // 境界の点は両方に値を持たせて線をシームレスに繋げる。
  const lastActualIndex = series.reduce((acc, p, i) => (p.isActual ? i : acc), -1)
  const data = series.map((p, i) => ({
    ...p,
    actualValue: i <= lastActualIndex ? p.central : undefined,
    projectedValue: i >= lastActualIndex ? p.central : undefined,
  }))

  const groupedMarkers = groupEventMarkersByYear(eventMarkers)
  // ラベルを斜め45度で表示するため、最長ラベルの見た目の高さぶん上マージンを確保する(重なり防止)
  const maxLabelLength = Math.max(0, ...groupedMarkers.map(m => m.label.length))
  const topMargin = Math.min(160, Math.max(40, maxLabelLength * 7 + 24))

  return (
    <div className={styles.container}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: 'var(--color-actual)' }} />
          実績
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: 'var(--color-accent)' }} />
          予測
        </span>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: topMargin, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
          <XAxis dataKey="year" tickFormatter={(year: number) => `${year}/${ageByYear.get(year) ?? ''}歳`} />
          <YAxis tickFormatter={formatYenCompact} width={axisWidth} />
          <Tooltip content={AssetChartTooltip} />
          <Area dataKey="pessimistic" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" name="悲観" />
          <Area dataKey="band" stackId="band" stroke="none" fill="var(--color-band)" fillOpacity={0.2} isAnimationActive={false} legendType="none" name="楽観-悲観の幅" />
          <Line dataKey="actualValue" name="実績" stroke="var(--color-actual)" strokeWidth={3} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="projectedValue" name="予測" stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          {groupedMarkers.map(marker => (
            <ReferenceLine
              key={marker.year}
              x={marker.year}
              stroke="var(--color-accent)"
              strokeDasharray="4 4"
              label={{
                value: marker.label,
                position: 'top',
                angle: -45,
                textAnchor: 'end',
                fontSize: 10,
                fill: 'var(--color-muted)',
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
