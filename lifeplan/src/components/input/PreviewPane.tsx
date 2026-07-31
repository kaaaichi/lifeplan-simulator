import { useMemo } from 'react'
import type { Actual, Inputs } from '../../types'
import { buildChartSeries, selectPreviewData } from '../../store/selectors'
import { useDraftStore } from '../../store/draftStore'
import { useHouseholdStore } from '../../store/householdStore'
import { AssetChart } from '../dashboard/AssetChart'
import { formatYen } from '../formatYen'
import { PreviewErrorBoundary } from './PreviewErrorBoundary'
import { useDebouncedValue } from './useDebouncedValue'
import styles from './PreviewPane.module.css'

function PreviewContent({ inputs, actuals }: { inputs: Inputs; actuals: Actual[] }) {
  const data = useMemo(() => selectPreviewData(inputs, actuals), [inputs, actuals])
  return (
    <>
      <dl className={styles.kpis}>
        <div>
          <dt>終了年齢時点の総資産</dt>
          <dd>{formatYen(data.kpi.endTotalAssets)}</dd>
        </div>
        <div>
          <dt>推奨毎月積立額</dt>
          <dd>{data.kpi.requiredMonthlyInvestment != null ? `${formatYen(data.kpi.requiredMonthlyInvestment)}/月` : '計算不可'}</dd>
        </div>
      </dl>
      <AssetChart
        series={[...buildChartSeries(data.historicalRows, data.historicalRows, data.historicalRows), ...data.chartSeries]}
        eventMarkers={data.eventMarkers}
      />
    </>
  )
}

export function PreviewPane() {
  const draft = useDraftStore((s) => s.draft)
  const actuals = useHouseholdStore((s) => s.doc?.actuals)
  const debounced = useDebouncedValue(draft, 200)
  if (!debounced) return null

  return (
    <aside aria-label="プレビュー" className={styles.pane}>
      <PreviewErrorBoundary resetKey={debounced}>
        <PreviewContent inputs={debounced} actuals={actuals ?? []} />
      </PreviewErrorBoundary>
    </aside>
  )
}
