import { useMemo, useState } from 'react'
import { KpiCards } from './KpiCards'
import { RealAssetValueCard } from './RealAssetValueCard'
import { AssetBenchmarkCard } from './AssetBenchmarkCard'
import { AssetChart } from './AssetChart'
import { BreakdownTabs } from './BreakdownTabs'
import { AnnualTable } from './AnnualTable'
import { VarianceSection } from './VarianceSection'
import { PeriodSelector } from './PeriodSelector'
import { buildChartSeries, selectPeriodFilteredData, selectAssetBenchmark } from '../../store/selectors'
import type { DashboardData, DashboardPeriod } from '../../store/selectors'
import type { Baseline } from '../../engine/baseline'
import type { Actual } from '../../types'
import styles from './Dashboard.module.css'

interface Props {
  data: DashboardData
  baseline: Baseline | null
  actuals: Actual[]
}

export function Dashboard({ data, baseline, actuals }: Props) {
  const [period, setPeriod] = useState<DashboardPeriod>('to65')
  const filtered = useMemo(() => selectPeriodFilteredData(data, period), [data, period])
  const historicalSeries = useMemo(
    () => buildChartSeries(data.historicalRows, data.historicalRows, data.historicalRows),
    [data.historicalRows],
  )

  return (
    <main className={styles.main}>
      <p className={styles.note}>
        ※ 各年の残高は「その年の年始時点」の値です（例:「2027」の残高＝2027年始＝2026年末と同じ値）。
        「終了年齢時点の総資産」のみ最終年の年末時点の値です。実績(色つき)は baseYear より前の参考記録を含みます。
      </p>
      <KpiCards kpi={data.kpi} />
      <RealAssetValueCard investmentBalance={data.kpi.currentInvestmentBalance} />
      <AssetBenchmarkCard benchmark={selectAssetBenchmark(data)} />
      <PeriodSelector period={period} onChange={setPeriod} />
      <AssetChart series={[...historicalSeries, ...filtered.chartSeries]} eventMarkers={filtered.eventMarkers} />
      {baseline && data.variance && (
        <VarianceSection baseline={baseline} actuals={actuals} central={data.central} variance={data.variance} />
      )}
      <BreakdownTabs rows={[...data.historicalRows, ...filtered.centralYearStart]} />
      <AnnualTable
        series={[...historicalSeries, ...filtered.chartSeries]}
        central={[...data.historicalRows, ...filtered.centralYearStart]}
        events={filtered.lifeStageEvents}
      />
    </main>
  )
}
