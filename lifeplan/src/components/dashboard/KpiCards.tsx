import type { KpiSummary } from '../../store/selectors'
import { formatYen } from '../formatYen'
import styles from './KpiCards.module.css'

export function KpiCards({ kpi }: { kpi: KpiSummary }) {
  const isSurplus = kpi.endTotalAssets >= 0

  return (
    <dl className={styles.grid}>
      <div className={styles.card}>
        <dt>現在の総資産</dt>
        <dd>
          {formatYen(kpi.currentTotalAssets)}
          <span className={styles.subtext}>現金: {formatYen(kpi.currentCashBalance)}</span>
          <span className={styles.subtext}>投資: {formatYen(kpi.currentInvestmentBalance)}</span>
        </dd>
      </div>
      <div className={styles.card}>
        <dt>終了年齢時点の総資産</dt>
        <dd className={isSurplus ? styles.positive : styles.negative}>{formatYen(kpi.endTotalAssets)}</dd>
      </div>
      <div className={styles.card}>
        <dt>資産が尽きる年</dt>
        <dd>
          {kpi.assetsDepletionYear ? `${kpi.assetsDepletionYear}年` : <span className={styles.badge}>生涯黒字</span>}
        </dd>
      </div>
      <div className={styles.card}>
        <dt>推奨される毎月の積立額</dt>
        <dd>{kpi.requiredMonthlyInvestment != null ? `${formatYen(kpi.requiredMonthlyInvestment)}/月` : '計算不可'}</dd>
      </div>
      <div className={styles.card}>
        <dt>コーストFIRE達成率</dt>
        <dd>
          {(kpi.coastFireRatio * 100).toFixed(0)}%
          <progress className={styles.progress} value={Math.min(kpi.coastFireRatio, 1)} max={1} />
          <span className={styles.subtext}>目安: {formatYen(kpi.coastFireNumber)}</span>
        </dd>
      </div>
    </dl>
  )
}
