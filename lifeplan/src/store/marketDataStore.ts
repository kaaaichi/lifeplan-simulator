// src/store/marketDataStore.ts

import { create } from 'zustand'
import type { MarketDataPort } from '../market/marketDataPort'

/**
 * 為替・CAPEレシオ「現在値」1件の取得ライフサイクル状態。
 * loading: 取得中。live: ライブ取得成功(fetchedAtに取得時刻)。fallback: 取得失敗、フォールバック定数を使用。
 */
export type MarketIndicatorState<T> =
  | { status: 'loading' }
  | { status: 'live'; value: T; fetchedAt: string }
  | { status: 'fallback'; value: T }

interface MarketDataState {
  usdJpy: MarketIndicatorState<number>
  cape: MarketIndicatorState<number>
  /**
   * 為替・CAPEを独立に取得する。片方が失敗してももう片方の結果には影響しない
   * (Promise.all ではなく、個別の .then(onFulfilled, onRejected) を使う)。
   * `now`は取得成功時刻のISO文字列を返す関数。省略時は `new Date().toISOString()`。
   * テストでは固定文字列を返す関数を渡すことで fetchedAt を決定的にできる。
   */
  init: (port: MarketDataPort, fallbacks: { usdJpy: number; cape: number }, now?: () => string) => void
}

const defaultNow = () => new Date().toISOString()

// 再init時の取り違え防止(StrictMode の二重effect等で旧呼び出しの結果が後から届くケース)。
// authStore.ts の unsubscribe/activePort パターンに準じたモジュールトップレベル状態。
let initToken = 0

export const useMarketDataStore = create<MarketDataState>((set) => ({
  usdJpy: { status: 'loading' },
  cape: { status: 'loading' },
  init: (port, fallbacks, now = defaultNow) => {
    const token = ++initToken
    set({ usdJpy: { status: 'loading' }, cape: { status: 'loading' } })

    port.fetchUsdJpyRate().then(
      (value) => {
        if (token !== initToken) return
        set({ usdJpy: { status: 'live', value, fetchedAt: now() } })
      },
      () => {
        if (token !== initToken) return
        set({ usdJpy: { status: 'fallback', value: fallbacks.usdJpy } })
      },
    )

    port.fetchCapeRatio().then(
      (value) => {
        if (token !== initToken) return
        set({ cape: { status: 'live', value, fetchedAt: now() } })
      },
      () => {
        if (token !== initToken) return
        set({ cape: { status: 'fallback', value: fallbacks.cape } })
      },
    )
  },
}))
