import type { YearRow } from '../../types'
import type { ChartPoint, LifeStageEvent } from '../../store/selectors'
import styles from './AnnualTable.module.css'

function yen(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万`
}

export function AnnualTable({ series, central, events }: {
  series: ChartPoint[]
  central: YearRow[]
  events: LifeStageEvent[]
}) {
  const eventsByYear = new Map<number, LifeStageEvent[]>()
  for (const e of events) {
    const list = eventsByYear.get(e.year)
    if (list) list.push(e)
    else eventsByYear.set(e.year, [e])
  }

  return (
    <section className={styles.container} aria-label="年次シミュレーション一覧">
      <h2 className={styles.title}>年次シミュレーション一覧</h2>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>西暦</th>
              <th>年齢</th>
              <th className={styles.num}>総資産(中央)</th>
              <th className={styles.num}>総資産(楽観)</th>
              <th className={styles.num}>総資産(悲観)</th>
              <th className={styles.num}>実績総資産</th>
              <th className={styles.num}>現金残高</th>
              <th className={styles.num}>投資残高</th>
              <th className={styles.num}>単年度収入</th>
              <th className={styles.num}>単年度支出</th>
              <th className={styles.num}>単年度収支</th>
              <th>ライフイベント</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p, i) => {
              const row = central[i]
              if (!row) return null
              const yearEvents = eventsByYear.get(p.year) ?? []
              return (
                <tr key={p.year} className={row.isActual ? styles.actualRow : undefined}>
                  <td>
                    {p.year}
                    {row.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
                  <td>{p.age}歳</td>
                  <td className={styles.num}>{yen(p.central)}</td>
                  <td className={styles.num}>{yen(p.optimistic)}</td>
                  <td className={styles.num}>{yen(p.pessimistic)}</td>
                  <td className={styles.num}>{row.isActual ? yen(row.totalAssets) : '-'}</td>
                  <td className={styles.num}>{yen(row.cashBalance)}</td>
                  <td className={styles.num}>{yen(row.investmentBalance)}</td>
                  <td className={styles.num}>{row.isHistoricalReference ? '-' : yen(row.income)}</td>
                  <td className={styles.num}>{row.isHistoricalReference ? '-' : yen(row.totalExpense)}</td>
                  <td className={`${styles.num} ${!row.isHistoricalReference && row.annualCashFlow < 0 ? styles.negative : ''}`}>
                    {row.isHistoricalReference ? '-' : yen(row.annualCashFlow)}
                  </td>
                  <td className={styles.events}>
                    {yearEvents.length > 0 && (
                      <ul className={styles.eventsList}>
                        {yearEvents.map((e, i) => (
                          <li key={i}>{e.childName ? `${e.childName}: ${e.label}` : e.label}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
