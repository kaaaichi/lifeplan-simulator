// lifeplan/tests/e2e/realAssetValue.spec.ts
import { test, expect } from '@playwright/test'

// src/market/marketDataPort.ts が呼び出す外部エンドポイント。実ネットワークに触れないよう
// page.route() でインターセプトする。
const USD_JPY_URL = 'https://open.er-api.com/v6/latest/USD'
const CAPE_URL = 'https://posix4e.github.io/shiller_wrapper_data/data/latest.json'

test('real asset value card: live表示とfallback表示(為替のみ取得失敗)の両方が確認できる', async ({ page }) => {
  let fxShouldFail = false

  await page.route(USD_JPY_URL, async (route) => {
    if (fxShouldFail) {
      await route.fulfill({ status: 500, body: 'internal error' })
      return
    }
    await route.fulfill({ json: { rates: { JPY: 162.2 } } })
  })
  await page.route(CAPE_URL, async (route) => {
    await route.fulfill({ json: { stock_market: { cape: 41.8 } } })
  })

  const card = page.getByRole('region', { name: '実質資産評価額' })

  // --- live表示: 為替・CAPEとも取得成功 ---
  await page.goto('/')
  await expect(card).toBeVisible()
  await expect(card.getByText('穏当な反転')).toBeVisible()
  await expect(card.getByText('為替→135円 / CAPE→30')).toBeVisible()
  await expect(card.getByText(/ライブ取得/)).toBeVisible()
  await expect(card.getByText(/取得失敗のため参考値/)).not.toBeVisible()

  // --- fallback表示: 為替のみ取得失敗、CAPEはliveのまま ---
  fxShouldFail = true
  await page.reload()
  await expect(card).toBeVisible()
  await expect(card.getByText(/取得失敗のため参考値/)).toBeVisible()
  await expect(card.getByText(/ライブ取得/)).toBeVisible()
})
