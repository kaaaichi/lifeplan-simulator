// lifeplan/tests/e2e/input.spec.ts
import { test, expect } from '@playwright/test'

test('input page: edit updates the preview and save reflects on the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '入力' }).click()

  await expect(page.getByText('基準年: 2026年（変更不可）')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'プレビュー' })).toBeVisible()

  const income = page.getByRole('group', { name: '世帯主' }).getByLabel('手取り年収')
  await income.fill('12000000')

  await expect(page.getByText('未保存の変更があります')).toBeVisible()
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()

  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByText('現在の総資産')).toBeVisible()
})
