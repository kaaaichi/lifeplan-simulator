// lifeplan/tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

// src/market/marketDataPort.ts が呼び出す外部エンドポイント。実ネットワークに触れないよう
// page.route() でインターセプトする(このスペックの検証対象は市場データではないため成功レスポンスで固定)。
// (tests/e2e/realAssetValue.spec.ts と同じパターン)
const USD_JPY_URL = 'https://open.er-api.com/v6/latest/USD'
const CAPE_URL = 'https://posix4e.github.io/shiller_wrapper_data/data/latest.json'

test.beforeEach(async ({ page }) => {
  await page.route(USD_JPY_URL, async (route) => {
    await route.fulfill({ json: { rates: { JPY: 162.2 } } })
  })
  await page.route(CAPE_URL, async (route) => {
    await route.fulfill({ json: { stock_market: { cape: 41.8 } } })
  })
})

test('dashboard renders KPI cards, main chart, and breakdown tabs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '家計の羅針盤' })).toBeVisible()
  await expect(page.getByText('現在の総資産')).toBeVisible()
  await expect(page.getByText('推奨される毎月の積立額')).toBeVisible()
  await expect(page.locator('svg').first()).toBeVisible()

  await page.getByRole('tab', { name: '単年度収支' }).click()
  await expect(page.getByRole('tab', { name: '単年度収支' })).toHaveAttribute('aria-selected', 'true')
})

test('period selector defaults to 65歳まで, and 10年/20年/全期間 change the row count accordingly', async ({ page }) => {
  await page.goto('/')

  const rows = page.getByRole('region', { name: '年次シミュレーション一覧' }).locator('tbody tr')
  await expect(page.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')
  const filteredCount = await rows.count()

  await page.getByRole('tab', { name: '10年' }).click()
  await expect(page.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')
  await expect(rows).toHaveCount(10)

  await page.getByRole('tab', { name: '20年' }).click()
  await expect(page.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
  await expect(rows).toHaveCount(20)

  await page.getByRole('tab', { name: '全期間' }).click()
  await expect(page.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
  const fullCount = await rows.count()

  expect(fullCount).toBeGreaterThan(filteredCount)
})
