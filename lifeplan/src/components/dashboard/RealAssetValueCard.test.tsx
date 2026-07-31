// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { RealAssetValueCard } from './RealAssetValueCard'
import { useMarketDataStore } from '../../store/marketDataStore'
import { createFakeMarketDataPort } from '../../market/marketDataPort'
import { computeRealAssetValueScenarios } from '../../engine/realAssetValue'
import { REAL_VALUE_SCENARIOS } from '../../masterData/realValueScenarios'
import { formatYen } from '../formatYen'

describe('RealAssetValueCard', () => {
  beforeEach(() => {
    // モジュール単一インスタンスのストアをテスト間でリセットする(marketDataStore.test.tsと同じ流儀)
    useMarketDataStore.setState({ usdJpy: { status: 'loading' }, cape: { status: 'loading' } })
  })

  it('シナリオ: 各シナリオカードに金額と条件が表示される（受け入れ試験）', async () => {
    const port = createFakeMarketDataPort({ usdJpy: 150, cape: 30 })
    render(<RealAssetValueCard investmentBalance={10_000_000} port={port} />)

    const expected = computeRealAssetValueScenarios(10_000_000, 150, 30, REAL_VALUE_SCENARIOS)
    expect(expected).toHaveLength(3)

    for (const scenario of expected) {
      expect(await screen.findByText(scenario.label)).toBeInTheDocument()
      expect(screen.getByText(scenario.description)).toBeInTheDocument()
      expect(screen.getByText(formatYen(scenario.realValue))).toBeInTheDocument()
    }
  })

  it('シナリオ: フォールバック値使用時の注記表示（受け入れ試験）', async () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => Promise.reject(new Error('fx down')),
      cape: 30,
    })
    render(<RealAssetValueCard investmentBalance={10_000_000} port={port} />)

    expect(await screen.findByText(/取得失敗のため参考値/)).toBeInTheDocument()
    // CAPEはliveのまま影響を受けない
    expect(screen.getByText(/ライブ取得/)).toBeInTheDocument()
  })

  it('shows a loading placeholder before the market data resolves (no crash mid-flight)', () => {
    const port = createFakeMarketDataPort({
      usdJpy: () => new Promise(() => {}),
      cape: () => new Promise(() => {}),
    })
    render(<RealAssetValueCard investmentBalance={10_000_000} port={port} />)

    expect(screen.getByText('市場データ取得中...')).toBeInTheDocument()
  })
})
