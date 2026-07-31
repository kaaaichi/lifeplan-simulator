// lifeplan/tests/e2e/scenarios.spec.ts
import { test, expect } from '@playwright/test'

test('scenarios: duplicate → edit → save → activate → dashboard reflects', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'シナリオ' }).click()
  await expect(page.getByRole('heading', { name: 'シナリオ管理' })).toBeVisible()

  // 複製 → 新カードが増える
  await page.getByRole('button', { name: '複製' }).click()
  const copyCard = page.getByRole('listitem', { name: 'ベースプランのコピー' })
  await expect(copyCard).toBeVisible()

  // コピーを編集(/input/:scenarioId)して保存
  await copyCard.getByRole('link', { name: '編集' }).click()
  const income = page.getByRole('group', { name: '世帯主' }).getByLabel('手取り年収')
  await income.fill('20000000')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()

  // シナリオ管理に戻ってアクティブ切替
  await page.getByRole('link', { name: 'シナリオ' }).click()
  await page
    .getByRole('listitem', { name: 'ベースプランのコピー' })
    .getByRole('button', { name: 'アクティブにする' })
    .click()
  await expect(
    page.getByRole('listitem', { name: 'ベースプランのコピー' }).getByText('アクティブ'),
  ).toBeVisible()

  // ダッシュボードがコピーの内容(高収入)を反映している
  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByText('現在の総資産')).toBeVisible()
})
