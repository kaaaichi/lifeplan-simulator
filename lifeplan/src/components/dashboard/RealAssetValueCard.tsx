// src/components/dashboard/RealAssetValueCard.tsx
import { useEffect } from 'react'
import { useMarketDataStore, type MarketIndicatorState } from '../../store/marketDataStore'
import { createLiveMarketDataPort, type MarketDataPort } from '../../market/marketDataPort'
import { computeRealAssetValueScenarios } from '../../engine/realAssetValue'
import { REAL_VALUE_SCENARIOS, FALLBACK_USD_JPY_RATE, FALLBACK_CAPE_RATIO } from '../../masterData/realValueScenarios'
import { formatYen } from '../formatYen'
import styles from './RealAssetValueCard.module.css'

interface Props {
  investmentBalance: number
  /** テスト用: 本番では省略し `createLiveMarketDataPort()` を使う */
  port?: MarketDataPort
}

/** loading を除いた状態('live' | 'fallback')。呼び出し側で isLoading チェック後に絞り込んで渡す。 */
type ResolvedIndicatorState = Exclude<MarketIndicatorState<number>, { status: 'loading' }>

/** 小数第1位までにまるめ、末尾の".0"は落とす(162→"162", 162.2→"162.2") */
function formatIndicatorNumber(value: number): string {
  return Number(value.toFixed(1)).toString()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatFetchedAt(iso: string, { includeDate }: { includeDate: boolean }): string {
  const d = new Date(iso)
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (!includeDate) return time
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`
}

function indicatorAnnotation(state: ResolvedIndicatorState, { includeDate }: { includeDate: boolean }): string {
  if (state.status === 'live') {
    return `(ライブ取得 ${formatFetchedAt(state.fetchedAt, { includeDate })})`
  }
  return '(取得失敗のため参考値)'
}

/**
 * 為替・CAPEの現在値と取得状態のヘッダー文言を組み立てる。
 * 両方liveの場合は末尾に注記をひとつにまとめる(例: 為替162.2円・CAPE41.8 (ライブ取得 2026-07-16 10:32))。
 * 片方でもfallbackの場合は指標ごとに注記を付ける(例: 為替162円 (取得失敗のため参考値) ・CAPE41.8 (ライブ取得 10:32))。
 */
function buildHeaderText(usdJpy: ResolvedIndicatorState, cape: ResolvedIndicatorState): string {
  const bothLive = usdJpy.status === 'live' && cape.status === 'live'
  if (bothLive) {
    return `為替${formatIndicatorNumber(usdJpy.value)}円・CAPE${formatIndicatorNumber(cape.value)} ${indicatorAnnotation(usdJpy, { includeDate: true })}`
  }
  const fxPart = `為替${formatIndicatorNumber(usdJpy.value)}円 ${indicatorAnnotation(usdJpy, { includeDate: false })}`
  const capePart = `CAPE${formatIndicatorNumber(cape.value)} ${indicatorAnnotation(cape, { includeDate: false })}`
  return `${fxPart} ・${capePart}`
}

export function RealAssetValueCard({ investmentBalance, port }: Props) {
  const usdJpy = useMarketDataStore((s) => s.usdJpy)
  const cape = useMarketDataStore((s) => s.cape)
  const init = useMarketDataStore((s) => s.init)

  // マウント時に一度だけ取得する。StrictMode の二重effect発火は marketDataStore.init 側の
  // トークンベースの冪等化(authStoreと同じパターン)で吸収されるため、ここでの追加ガードは不要と判断した。
  useEffect(() => {
    init(port ?? createLiveMarketDataPort(), { usdJpy: FALLBACK_USD_JPY_RATE, cape: FALLBACK_CAPE_RATIO })
  }, [])

  if (usdJpy.status === 'loading' || cape.status === 'loading') {
    return (
      <section className={styles.container} aria-label="実質資産評価額">
        <h2 className={styles.title}>実質資産評価額（歴史的巻き戻りシナリオ）</h2>
        <p className={styles.loading}>市場データ取得中...</p>
      </section>
    )
  }

  // ここまでで usdJpy/cape ともに 'loading' ではないと確定している('live' | 'fallback')。
  return (
    <section className={styles.container} aria-label="実質資産評価額">
      <h2 className={styles.title}>実質資産評価額（歴史的巻き戻りシナリオ）</h2>
      <p className={styles.header}>{buildHeaderText(usdJpy, cape)}</p>
      <div className={styles.grid}>
        {computeRealAssetValueScenarios(investmentBalance, usdJpy.value, cape.value, REAL_VALUE_SCENARIOS).map(
          (result) => (
            <div key={result.scenarioId} className={styles.scenarioCard}>
              <p className={styles.scenarioLabel}>{result.label}</p>
              <p className={styles.scenarioValue}>{formatYen(result.realValue)}</p>
              <p className={styles.scenarioDescription}>{result.description}</p>
            </div>
          ),
        )}
      </div>
    </section>
  )
}
