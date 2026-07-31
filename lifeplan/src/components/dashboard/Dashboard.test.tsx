// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Dashboard } from './Dashboard'
import { selectDashboardData, selectPeriodFilteredData } from '../../store/selectors'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { captureBaseline } from '../../persistence/actualsOps'
import { useMarketDataStore } from '../../store/marketDataStore'
import { computeRealAssetValueScenarios } from '../../engine/realAssetValue'
import { REAL_VALUE_SCENARIOS, FALLBACK_USD_JPY_RATE, FALLBACK_CAPE_RATIO } from '../../masterData/realValueScenarios'
import { formatYen } from '../formatYen'

describe('Dashboard', () => {
  // Dashboard は RealAssetValueCard 経由でマウント時に本物の fetch(市場データ取得)を呼び出す。
  // ユニットテストでは実ネットワークに触れないよう fetch を失敗するダミーに差し替える
  // (RealAssetValueCard自体のライブ/フォールバック挙動は RealAssetValueCard.test.tsx で port 注入により検証済み)。
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in Dashboard.test.tsx')))
    // モジュール単一インスタンスのストアをテスト間でリセットする(RealAssetValueCard.test.tsx と同じ流儀)
    useMarketDataStore.setState({ usdJpy: { status: 'loading' }, cape: { status: 'loading' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders KPI cards and the chart for the default household', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    expect(screen.getByText('現在の総資産')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toBeInTheDocument()
  })

  it('renders the annual simulation table filtered to 65歳まで by default', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    expect(screen.getByText('年次シミュレーション一覧')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')

    const table = screen.getByRole('table')
    const expectedRows = selectPeriodFilteredData(data, 'to65').central.length
    expect(expectedRows).toBeLessThan(data.central.length)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(expectedRows)
  })

  it('switches to 全期間 and shows every simulated year', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '全期間' }))

    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(data.central.length)
  })

  it('switches to 10年 and shows exactly 10 rows starting at baseYear', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '10年' }))

    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('switches to 20年 and shows exactly 20 rows starting at baseYear', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '20年' }))

    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20)
  })

  it('keeps KPI values unchanged when the period toggles between 65歳まで and 全期間', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    const kpiValue = () => screen.getByText('現在の総資産').closest('div')?.querySelector('dd')?.textContent
    const before = kpiValue()

    fireEvent.click(screen.getByRole('tab', { name: '全期間' }))

    expect(kpiValue()).toBe(before)
  })

  it('does not render the variance section when no baseline is set', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)
    expect(screen.queryByRole('region', { name: '予実比較' })).not.toBeInTheDocument()
  })

  it('renders the variance section when a baseline is set', () => {
    const doc = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={doc.baseline ?? null} actuals={doc.actuals} />)
    expect(screen.getByRole('region', { name: '予実比較' })).toBeInTheDocument()
  })

  it('シナリオ: 既存のダッシュボード表示・計算への影響がない（受け入れ試験）', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    // 既存のKPI/チャート表示は RealAssetValueCard 追加後も引き続き表示される(回帰なし)
    expect(screen.getByText('現在の総資産')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toBeInTheDocument()

    // 新規カードがKpiCardsの直後に追加されている
    expect(screen.getByRole('region', { name: '実質資産評価額' })).toBeInTheDocument()
  })

  it('シナリオ: 既存のダッシュボード表示・計算への影響がない（受け入れ試験・資産偏差値カード追加後）', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    // 既存のKPI/実質資産評価額カードは資産偏差値カード追加後も引き続き表示される(回帰なし)
    expect(screen.getByText('現在の総資産')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '実質資産評価額' })).toBeInTheDocument()

    // 資産偏差値カードが追加されている
    expect(screen.getByRole('region', { name: '資産の全国比較' })).toBeInTheDocument()
  })

  it('passes currentInvestmentBalance (not currentTotalAssets) to RealAssetValueCard', async () => {
    const doc = createDefaultDoc()
    const baseData = selectDashboardData(doc)
    // 現金残高が大きく、総資産(currentTotalAssets)が投資残高(currentInvestmentBalance)と
    // 大きく乖離するフィクスチャを作る。RealAssetValueCard には investmentBalance のみが渡るべき。
    const investmentBalance = 10_000_000
    const totalAssets = 999_000_000
    const data = {
      ...baseData,
      kpi: { ...baseData.kpi, currentInvestmentBalance: investmentBalance, currentTotalAssets: totalAssets },
    }
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    // fetch は失敗する(beforeEachでスタブ)ため、フォールバック値で計算された結果を待つ
    const expectedFromInvestment = computeRealAssetValueScenarios(
      investmentBalance,
      FALLBACK_USD_JPY_RATE,
      FALLBACK_CAPE_RATIO,
      REAL_VALUE_SCENARIOS,
    )
    const wrongFromTotalAssets = computeRealAssetValueScenarios(
      totalAssets,
      FALLBACK_USD_JPY_RATE,
      FALLBACK_CAPE_RATIO,
      REAL_VALUE_SCENARIOS,
    )

    expect(await screen.findByText(formatYen(expectedFromInvestment[0]!.realValue))).toBeInTheDocument()
    expect(screen.queryByText(formatYen(wrongFromTotalAssets[0]!.realValue))).not.toBeInTheDocument()
  })
})
