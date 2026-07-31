import { describe, it, expect } from 'vitest'
import { invNormalCdf, computeAssetBenchmark, buildAnchors } from './assetBenchmark'
import { ASSET_BENCHMARK_NATIONAL, ASSET_BENCHMARK_BY_AGE_BRACKET, type AgeBracket } from '../masterData/householdAssetBenchmark'

const AGE_BRACKETS: AgeBracket[] = ['20s', '30s', '40s', '50s', '60s', '70s']
const ALL_GROUPS = [ASSET_BENCHMARK_NATIONAL, ...AGE_BRACKETS.map(b => ASSET_BENCHMARK_BY_AGE_BRACKET[b])]

describe('invNormalCdf', () => {
  it('p=0.5で0を返す(中央)', () => {
    expect(invNormalCdf(0.5)).toBeCloseTo(0, 6)
  })

  it('既知の分位点で標準正規分布の逆CDFに一致する(p=0.975→約1.96)', () => {
    expect(invNormalCdf(0.975)).toBeCloseTo(1.959963985, 6)
  })

  it('既知の分位点で標準正規分布の逆CDFに一致する(p=0.8413447→約1.0)', () => {
    expect(invNormalCdf(0.8413447460685429)).toBeCloseTo(1, 5)
  })

  it('既知の分位点で標準正規分布の逆CDFに一致する(p=0.025→約-1.96、負側も対称)', () => {
    expect(invNormalCdf(0.025)).toBeCloseTo(-1.959963985, 6)
  })
})

describe('computeAssetBenchmark', () => {
  it('シナリオ: 中央値ちょうどの世帯は偏差値50になる(全国)', () => {
    const assetsYen = ASSET_BENCHMARK_NATIONAL.medianManYen * 10_000
    const result = computeAssetBenchmark(assetsYen, 45) // 45歳→40代(全国比較には影響しない)

    expect(result.national.deviationScore).toBeCloseTo(50, 1)
    expect(result.national.median).toBe(ASSET_BENCHMARK_NATIONAL.medianManYen)
    expect(result.national.mean).toBe(ASSET_BENCHMARK_NATIONAL.meanManYen)
  })

  it.each(AGE_BRACKETS)('シナリオ: 中央値ちょうどの世帯は偏差値50になる(同年代・%s)', (bracket) => {
    const group = ASSET_BENCHMARK_BY_AGE_BRACKET[bracket]
    const decadeAge = { '20s': 25, '30s': 35, '40s': 45, '50s': 55, '60s': 65, '70s': 75 }[bracket]
    const assetsYen = group.medianManYen * 10_000

    const result = computeAssetBenchmark(assetsYen, decadeAge)

    expect(result.ageGroup.deviationScore).toBeCloseTo(50, 1)
  })

  it('シナリオ: 全世帯・同年代それぞれについて独立に算出される', () => {
    const assetsYen = 10_000_000 // 1000万円
    const result = computeAssetBenchmark(assetsYen, 34) // 30代

    expect(result.ageBracket).toBe('30s')
    expect(result.national.median).toBe(ASSET_BENCHMARK_NATIONAL.medianManYen)
    expect(result.ageGroup.median).toBe(ASSET_BENCHMARK_BY_AGE_BRACKET['30s'].medianManYen)
    // 全国と同年代で中央値が異なるため、同じ資産額でも偏差値は異なる
    expect(result.national.deviationScore).not.toBeCloseTo(result.ageGroup.deviationScore, 1)
  })

  it('シナリオ: 資産が非保有区分に該当する', () => {
    const result = computeAssetBenchmark(0, 45)

    expect(result.national.percentileRank).toBeLessThan(ASSET_BENCHMARK_NATIONAL.distributionPercent[0])
    expect(result.national.deviationScore).toBeLessThan(50)
    expect(result.national.isApproximate).toBe(false)
  })

  it('シナリオ: 年代範囲内の世帯主(34歳→30代、近似なし)', () => {
    const result = computeAssetBenchmark(10_000_000, 34)

    expect(result.ageBracket).toBe('30s')
    expect(result.ageGroup.isApproximate).toBe(false)
  })

  it('シナリオ: 年代範囲外(20歳未満)の世帯主は20代で代用され近似フラグが立つ', () => {
    const result = computeAssetBenchmark(1_000_000, 18)

    expect(result.ageBracket).toBe('20s')
    expect(result.ageGroup.isApproximate).toBe(true)
  })

  it('シナリオ: 年代範囲外(80歳以上)の世帯主は70代で代用され近似フラグが立つ', () => {
    const result = computeAssetBenchmark(20_000_000, 85)

    expect(result.ageBracket).toBe('70s')
    expect(result.ageGroup.isApproximate).toBe(true)
  })

  it('シナリオ: 最上位区分(3000万円以上)に該当すると近似フラグが立つ', () => {
    const result = computeAssetBenchmark(50_000_000, 45) // 5000万円

    expect(result.national.isApproximate).toBe(true)
    const cumulativeBelow3000 =
      ASSET_BENCHMARK_NATIONAL.distributionPercent.reduce((a, b) => a + b, 0) -
      ASSET_BENCHMARK_NATIONAL.distributionPercent[11]!
    expect(result.national.percentileRank).toBeGreaterThan(cumulativeBelow3000)
    expect(result.national.percentileRank).toBeLessThan(100)
  })

  it('3000万円ちょうどでは近似フラグが立たない(開区間の境界未満)', () => {
    const result = computeAssetBenchmark(30_000_000, 45)

    expect(result.national.isApproximate).toBe(false)
  })
})

describe('buildAnchors', () => {
  const NAMED_GROUPS: Array<[string, (typeof ASSET_BENCHMARK_NATIONAL)]> = [
    ['全国', ASSET_BENCHMARK_NATIONAL],
    ...AGE_BRACKETS.map((b): [string, typeof ASSET_BENCHMARK_NATIONAL] => [b, ASSET_BENCHMARK_BY_AGE_BRACKET[b]]),
  ]

  it.each(NAMED_GROUPS)('%sの中央値アンカー挿入後もアンカー列は資産額昇順でpercentileが非減少(単調性)', (_label, group) => {
    const { anchors } = buildAnchors(group)

    for (let i = 0; i < anchors.length - 1; i++) {
      expect(anchors[i + 1]!.value).toBeGreaterThanOrEqual(anchors[i]!.value)
      expect(anchors[i + 1]!.percentile).toBeGreaterThanOrEqual(anchors[i]!.percentile)
    }
  })

  it.each(ALL_GROUPS.map(g => [g] as const))('中央値のアンカー点は必ずpercentile=50を持つ', (group) => {
    const { anchors } = buildAnchors(group)
    const medianAnchor = anchors.find(a => a.value === group.medianManYen)

    expect(medianAnchor?.percentile).toBe(50)
  })
})
