// src/store/marketDataStore.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMarketDataStore } from './marketDataStore'
import { createFakeMarketDataPort } from '../market/marketDataPort'
import { computeRealAssetValueScenarios } from '../engine/realAssetValue'

const FIXED_NOW = '2026-07-17T00:00:00.000Z'
const fixedNow = () => FIXED_NOW

describe('marketDataStore', () => {
  beforeEach(() => {
    // 各テスト間でストアの状態を初期化(zustandのモジュール単一インスタンスをリセット)
    useMarketDataStore.setState({ usdJpy: { status: 'loading' }, cape: { status: 'loading' } })
  })

  it('init直後(fetch解決前)はloading', () => {
    const port = createFakeMarketDataPort({ usdJpy: 150, cape: 30 })
    useMarketDataStore.getState().init(port, { usdJpy: 999, cape: 999 }, fixedNow)
    expect(useMarketDataStore.getState().usdJpy.status).toBe('loading')
    expect(useMarketDataStore.getState().cape.status).toBe('loading')
  })

  it('シナリオ: 両指標とも取得成功（受け入れ試験）: 両方ともliveになり値・fetchedAtが一致する', async () => {
    const port = createFakeMarketDataPort({ usdJpy: 150, cape: 30 })
    useMarketDataStore.getState().init(port, { usdJpy: 999, cape: 999 }, fixedNow)

    await vi.waitFor(() => {
      expect(useMarketDataStore.getState().usdJpy.status).toBe('live')
      expect(useMarketDataStore.getState().cape.status).toBe('live')
    })

    const { usdJpy, cape } = useMarketDataStore.getState()
    expect(usdJpy).toEqual({ status: 'live', value: 150, fetchedAt: FIXED_NOW })
    expect(cape).toEqual({ status: 'live', value: 30, fetchedAt: FIXED_NOW })
  })

  it('シナリオ: 片方のみ取得失敗（受け入れ試験）: 為替のみ取得失敗、為替はfallback(定数値)、CAPEはliveのまま影響を受けない', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => Promise.reject(new Error('fx down')),
      cape: 30,
    })
    useMarketDataStore.getState().init(port, { usdJpy: 145, cape: 999 }, fixedNow)

    await vi.waitFor(() => {
      expect(useMarketDataStore.getState().usdJpy.status).toBe('fallback')
      expect(useMarketDataStore.getState().cape.status).toBe('live')
    })

    const { usdJpy, cape } = useMarketDataStore.getState()
    expect(usdJpy).toEqual({ status: 'fallback', value: 145 })
    expect(cape).toEqual({ status: 'live', value: 30, fetchedAt: FIXED_NOW })
  })

  it('CAPEのみ取得失敗: CAPEはfallback、為替はliveのまま影響を受けない', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: 150,
      cape: () => Promise.reject(new Error('cape down')),
    })
    useMarketDataStore.getState().init(port, { usdJpy: 999, cape: 28 }, fixedNow)

    await vi.waitFor(() => {
      expect(useMarketDataStore.getState().usdJpy.status).toBe('live')
      expect(useMarketDataStore.getState().cape.status).toBe('fallback')
    })

    const { usdJpy, cape } = useMarketDataStore.getState()
    expect(usdJpy).toEqual({ status: 'live', value: 150, fetchedAt: FIXED_NOW })
    expect(cape).toEqual({ status: 'fallback', value: 28 })
  })

  it('シナリオ: フォールバック時も実質評価額の計算は継続する（受け入れ試験）: 両方とも取得失敗、両方fallbackになりクラッシュせず完了し、フォールバック値で実質資産評価額の計算が継続できる', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => Promise.reject(new Error('fx down')),
      cape: () => Promise.reject(new Error('cape down')),
    })

    expect(() => {
      useMarketDataStore.getState().init(port, { usdJpy: 145, cape: 28 }, fixedNow)
    }).not.toThrow()

    await vi.waitFor(() => {
      expect(useMarketDataStore.getState().usdJpy.status).toBe('fallback')
      expect(useMarketDataStore.getState().cape.status).toBe('fallback')
    })

    const { usdJpy, cape } = useMarketDataStore.getState()
    expect(usdJpy).toEqual({ status: 'fallback', value: 145 })
    expect(cape).toEqual({ status: 'fallback', value: 28 })
    if (usdJpy.status !== 'fallback' || cape.status !== 'fallback') {
      throw new Error('unreachable: 直前のexpectでfallbackであることを確認済み')
    }

    // フォールバック値でも計算が正常に完了することを確認
    const results = computeRealAssetValueScenarios(1_000_000, usdJpy.value, cape.value, [
      { id: 's1', label: '円安・高PER反転', description: '', targetFx: 100, targetCape: 20 },
    ])
    expect(results).toHaveLength(1)
    expect(Number.isFinite(results[0]!.realValue)).toBe(true)
  })

  it('再initは冪等: 旧ポートの解決が後から届いても最新initの結果を上書きしない', async () => {
    let resolveOldUsdJpy: (value: number) => void = () => {}
    const oldPort = createFakeMarketDataPort({
      usdJpy: () => new Promise<number>((resolve) => { resolveOldUsdJpy = resolve }),
      cape: 30,
    })
    const newPort = createFakeMarketDataPort({ usdJpy: 160, cape: 32 })

    useMarketDataStore.getState().init(oldPort, { usdJpy: 999, cape: 999 }, fixedNow)
    useMarketDataStore.getState().init(newPort, { usdJpy: 999, cape: 999 }, fixedNow)

    await vi.waitFor(() => {
      expect(useMarketDataStore.getState().usdJpy.status).toBe('live')
    })
    expect(useMarketDataStore.getState().usdJpy).toEqual({ status: 'live', value: 160, fetchedAt: FIXED_NOW })

    // 旧ポートの解決が今さら届いても状態は上書きされない
    resolveOldUsdJpy(120)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useMarketDataStore.getState().usdJpy).toEqual({ status: 'live', value: 160, fetchedAt: FIXED_NOW })
  })
})
