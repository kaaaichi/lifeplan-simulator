import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLiveMarketDataPort, createFakeMarketDataPort } from './marketDataPort'

describe('createLiveMarketDataPort', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchUsdJpyRate', () => {
    it('正常レスポンス時にrates.JPYを返す', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ rates: { JPY: 162.15, USD: 1 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).resolves.toBe(162.15)
      expect(fetch).toHaveBeenCalledWith(
        'https://open.er-api.com/v6/latest/USD',
        expect.objectContaining({ signal: expect.anything() }),
      )
    })

    it('fetchがrejectした場合は例外を投げる', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('HTTPエラー(非2xx)の場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('レスポンスJSONにrates.JPYが無い場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ rates: {} }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('rates.JPYが数値でない場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ rates: { JPY: 'not-a-number' } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('rates.JPYが0の場合は例外を投げる(0除算で無限大になる不正値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ rates: { JPY: 0 } }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('rates.JPYが負の場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ rates: { JPY: -1 } }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('rates.JPYが妥当な範囲より低すぎる場合は例外を投げる(単位ズレ等の異常値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ rates: { JPY: 0.01 } }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })

    it('rates.JPYが妥当な範囲より高すぎる場合は例外を投げる(桁ズレ等の異常値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ rates: { JPY: 16215 } }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow()
    })
  })

  describe('レスポンスJSONのparseエラー', () => {
    it('response.json()がSyntaxErrorでrejectした場合、marketDataPort:プレフィックス付きの例外にラップされる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchUsdJpyRate()).rejects.toThrow(/^marketDataPort: /)
    })
  })

  describe('fetchCapeRatio', () => {
    it('正常レスポンス時にstock_market.capeを返す', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: 39.41935320301406, sp500: 6812.63 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).resolves.toBe(39.41935320301406)
      expect(fetch).toHaveBeenCalledWith(
        'https://posix4e.github.io/shiller_wrapper_data/data/latest.json',
        expect.objectContaining({ signal: expect.anything() }),
      )
    })

    it('fetchがrejectした場合は例外を投げる', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('HTTPエラー(非2xx)の場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('レスポンスJSONにstock_market.capeが無い場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ stock_market: {} }) }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('stock_market.capeが数値でない場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: null } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('stock_market.capeが0の場合は例外を投げる(0除算で無限大になる不正値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: 0 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('stock_market.capeが負の場合は例外を投げる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: -5 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('stock_market.capeが妥当な範囲より低すぎる場合は例外を投げる(異常値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: 1.5 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })

    it('stock_market.capeが妥当な範囲より高すぎる場合は例外を投げる(比率ではなくパーセント値等の異常値を弾く)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ stock_market: { cape: 3941 } }),
        }),
      )

      const port = createLiveMarketDataPort()
      await expect(port.fetchCapeRatio()).rejects.toThrow()
    })
  })
})

describe('createFakeMarketDataPort', () => {
  it('overrides無しでもデフォルト値を返す', async () => {
    const port = createFakeMarketDataPort()
    await expect(port.fetchUsdJpyRate()).resolves.toEqual(expect.any(Number))
    await expect(port.fetchCapeRatio()).resolves.toEqual(expect.any(Number))
  })

  it('固定値のoverrideをそのまま返す', async () => {
    const port = createFakeMarketDataPort({ usdJpy: 135, cape: 30 })
    await expect(port.fetchUsdJpyRate()).resolves.toBe(135)
    await expect(port.fetchCapeRatio()).resolves.toBe(30)
  })

  it('関数のoverrideを呼び出して値を返す', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => Promise.resolve(150),
      cape: () => Promise.resolve(25),
    })
    await expect(port.fetchUsdJpyRate()).resolves.toBe(150)
    await expect(port.fetchCapeRatio()).resolves.toBe(25)
  })

  it('関数のoverrideが例外を投げる場合はそのまま伝播する', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => Promise.reject(new Error('fake usdJpy failure')),
      cape: () => Promise.reject(new Error('fake cape failure')),
    })
    await expect(port.fetchUsdJpyRate()).rejects.toThrow('fake usdJpy failure')
    await expect(port.fetchCapeRatio()).rejects.toThrow('fake cape failure')
  })
})
