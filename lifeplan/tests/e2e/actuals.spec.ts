// lifeplan/tests/e2e/actuals.spec.ts
import { test, expect } from '@playwright/test'

test('actuals: record two years → capture baseline → record a drifted year → dashboard shows variance', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: '実績' }).click()
  await expect(page.getByRole('heading', { name: '実績値' })).toBeVisible()

  // baseYear を1年目として記録
  const yearSelect = page.getByLabel('追加する年')
  const firstYear = await yearSelect.locator('option').nth(1).getAttribute('value')
  await yearSelect.selectOption(firstYear!)
  await page.getByRole('button', { name: '年を追加' }).click()

  const firstRow = page.getByRole('listitem', { name: `${Number(firstYear) + 1}年始` })
  await expect(firstRow).toBeVisible()
  await firstRow.getByLabel('現金残高').fill('1000000')
  await firstRow.getByLabel('投資残高').fill('2000000')

  // 当初プランを記録
  await page.getByRole('button', { name: '当初プランとして記録する' }).click()
  await expect(page.getByRole('button', { name: '再ベースライン' })).toBeVisible()

  // 2年目をズレた値で記録
  const secondYear = await yearSelect.locator('option').nth(1).getAttribute('value')
  await yearSelect.selectOption(secondYear!)
  await page.getByRole('button', { name: '年を追加' }).click()
  const secondRow = page.getByRole('listitem', { name: `${Number(secondYear) + 1}年始` })
  await secondRow.getByLabel('現金残高').fill('500000')
  await secondRow.getByLabel('投資残高').fill('900000')

  // ダッシュボードで予実比較セクションが表示される
  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByRole('region', { name: '予実比較' })).toBeVisible()
})
