import type { DashboardPeriod } from '../../store/selectors'
import styles from './PeriodSelector.module.css'

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'y10', label: '10年' },
  { value: 'y20', label: '20年' },
  { value: 'to65', label: '65歳まで' },
  { value: 'full', label: '全期間' },
]

export function PeriodSelector({ period, onChange }: {
  period: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="表示期間">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={period === opt.value}
          className={styles.tab}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
