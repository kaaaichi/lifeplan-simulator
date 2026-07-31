// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AssetBenchmarkCard } from './AssetBenchmarkCard'
import { ASSET_BENCHMARK_SOURCE } from '../../masterData/householdAssetBenchmark'
import { formatYen } from '../formatYen'
import type { AssetBenchmarkResult } from '../../engine/assetBenchmark'

function buildBenchmark(overrides?: {
  national?: Partial<AssetBenchmarkResult['national']>
  ageGroup?: Partial<AssetBenchmarkResult['ageGroup']>
}): AssetBenchmarkResult {
  return {
    national: {
      deviationScore: 53.9,
      percentileRank: 65,
      mean: 1940,
      median: 720,
      isApproximate: false,
      ...overrides?.national,
    },
    ageGroup: {
      deviationScore: 58.2,
      percentileRank: 72,
      mean: 1096,
      median: 311,
      isApproximate: false,
      ...overrides?.ageGroup,
    },
    ageBracket: '30s',
  }
}

describe('AssetBenchmarkCard', () => {
  it('全世帯・同年代それぞれの偏差値・上位%相当・平均値・中央値を表示する', () => {
    const benchmark = buildBenchmark()
    render(<AssetBenchmarkCard benchmark={benchmark} />)

    expect(screen.getByText('53.9')).toBeInTheDocument()
    expect(screen.getByText('58.2')).toBeInTheDocument()
    expect(screen.getByText(/上位35%/)).toBeInTheDocument() // 100-65
    expect(screen.getByText(/上位28%/)).toBeInTheDocument() // 100-72
    expect(screen.getByText(formatYen(1940 * 10_000))).toBeInTheDocument()
    expect(screen.getByText(formatYen(720 * 10_000))).toBeInTheDocument()
    expect(screen.getByText(formatYen(1096 * 10_000))).toBeInTheDocument()
    expect(screen.getByText(formatYen(311 * 10_000))).toBeInTheDocument()
    expect(screen.getByText(/同年代/)).toBeInTheDocument()
    expect(screen.getByText(/30代/)).toBeInTheDocument()
  })

  it('シナリオ: 出典が常時表示される（受け入れ試験）', () => {
    render(<AssetBenchmarkCard benchmark={buildBenchmark()} />)

    expect(screen.getByText(ASSET_BENCHMARK_SOURCE.title)).toBeInTheDocument()
    expect(screen.getByText(/独自の推定/)).toBeInTheDocument()
    expect(screen.getByText(/公式統計の値ではありません/)).toBeInTheDocument()
  })

  it('シナリオ: 出典名がクリックで情報源に遷移する（受け入れ試験）', () => {
    render(<AssetBenchmarkCard benchmark={buildBenchmark()} />)

    const link = screen.getByRole('link', { name: ASSET_BENCHMARK_SOURCE.title })
    expect(link).toHaveAttribute('href', ASSET_BENCHMARK_SOURCE.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('シナリオ: 近似発生時に注記が表示される（受け入れ試験・同年代のみ近似）', () => {
    const benchmark = buildBenchmark({ ageGroup: { isApproximate: true } })
    render(<AssetBenchmarkCard benchmark={benchmark} />)

    expect(screen.getAllByText(/近似/)).toHaveLength(1)
    const nationalCard = screen.getByText('全世帯').closest('div')!
    const ageGroupCard = screen.getByText(/同年代/).closest('div')!
    expect(within(nationalCard).queryByText(/近似/)).not.toBeInTheDocument()
    expect(within(ageGroupCard).getByText(/近似/)).toBeInTheDocument()
  })

  it('シナリオ: 近似発生時に注記が表示される（受け入れ試験・全世帯のみ近似）', () => {
    const benchmark = buildBenchmark({ national: { isApproximate: true } })
    render(<AssetBenchmarkCard benchmark={benchmark} />)

    expect(screen.getAllByText(/近似/)).toHaveLength(1)
    const nationalCard = screen.getByText('全世帯').closest('div')!
    const ageGroupCard = screen.getByText(/同年代/).closest('div')!
    expect(within(nationalCard).getByText(/近似/)).toBeInTheDocument()
    expect(within(ageGroupCard).queryByText(/近似/)).not.toBeInTheDocument()
  })

  it('近似が発生していない場合は近似注記が表示されない', () => {
    render(<AssetBenchmarkCard benchmark={buildBenchmark()} />)

    expect(screen.queryByText(/近似/)).not.toBeInTheDocument()
  })
})
