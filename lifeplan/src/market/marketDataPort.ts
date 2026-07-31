// src/market/marketDataPort.ts

const USD_JPY_ENDPOINT = 'https://open.er-api.com/v6/latest/USD'
// posix4e/shiller_wrapper_data (GitHub Pages): Yale Shillerデータの週次ラップ。
// data/latest.json は { stock_market: { date, sp500, cape, ... }, home_prices: {...}, last_updated } を返す。
const CAPE_ENDPOINT = 'https://posix4e.github.io/shiller_wrapper_data/data/latest.json'

const FETCH_TIMEOUT_MS = 5000

// 妥当性レンジ(外れ値を弾く)。
// USD/JPY: 変動相場制移行後の実績レンジ(概ね75〜360円)に十分な余裕を持たせた50〜500円。
// CAPE: 過去の実績レンジ(概ね4.78〜44.2)に十分な余裕を持たせた3〜100。
const USD_JPY_MIN = 50
const USD_JPY_MAX = 500
const CAPE_MIN = 3
const CAPE_MAX = 100

/**
 * 為替・CAPEレシオの「現在値」取得ポート。実装は`src/engine/`から一切参照されない
 * (ネットワーク非依存性・ゴールデンマスター回帰の決定性を守るため)。
 */
export interface MarketDataPort {
  fetchUsdJpyRate(): Promise<number>
  fetchCapeRatio(): Promise<number>
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    throw new Error(`marketDataPort: ${url} への通信に失敗しました`, { cause: err })
  }
  if (!response.ok) {
    throw new Error(`marketDataPort: ${url} が異常なステータスを返しました (status ${response.status})`)
  }
  try {
    return await response.json()
  } catch (err) {
    throw new Error(`marketDataPort: ${url} のレスポンスJSONの解析に失敗しました`, { cause: err })
  }
}

export function createLiveMarketDataPort(): MarketDataPort {
  return {
    fetchUsdJpyRate: async () => {
      const data = await fetchJson(USD_JPY_ENDPOINT)
      const rate = (data as { rates?: Record<string, unknown> } | null)?.rates?.JPY
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error('marketDataPort: 為替レートのレスポンス形式が不正です (rates.JPY)')
      }
      if (rate < USD_JPY_MIN || rate > USD_JPY_MAX) {
        throw new Error(
          `marketDataPort: 為替レートが妥当な範囲外です (rates.JPY=${rate}, 期待範囲=${USD_JPY_MIN}〜${USD_JPY_MAX})`,
        )
      }
      return rate
    },
    fetchCapeRatio: async () => {
      const data = await fetchJson(CAPE_ENDPOINT)
      const cape = (data as { stock_market?: { cape?: unknown } } | null)?.stock_market?.cape
      if (typeof cape !== 'number' || !Number.isFinite(cape) || cape <= 0) {
        throw new Error('marketDataPort: CAPEレシオのレスポンス形式が不正です (stock_market.cape)')
      }
      if (cape < CAPE_MIN || cape > CAPE_MAX) {
        throw new Error(
          `marketDataPort: CAPEレシオが妥当な範囲外です (stock_market.cape=${cape}, 期待範囲=${CAPE_MIN}〜${CAPE_MAX})`,
        )
      }
      return cape
    },
  }
}

/** デフォルトのフェイク値。overrides未指定時に使う(値自体に意味は無い)。 */
const FAKE_DEFAULT_USD_JPY = 150
const FAKE_DEFAULT_CAPE = 30

/** テスト用フェイクポート。固定値または例外を投げる関数を渡せる。 */
export function createFakeMarketDataPort(overrides?: {
  usdJpy?: number | (() => Promise<number>)
  cape?: number | (() => Promise<number>)
}): MarketDataPort {
  const usdJpy = overrides?.usdJpy ?? FAKE_DEFAULT_USD_JPY
  const cape = overrides?.cape ?? FAKE_DEFAULT_CAPE
  return {
    fetchUsdJpyRate: () => (typeof usdJpy === 'function' ? usdJpy() : Promise.resolve(usdJpy)),
    fetchCapeRatio: () => (typeof cape === 'function' ? cape() : Promise.resolve(cape)),
  }
}
