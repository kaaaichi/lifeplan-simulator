import { describe, it, expect } from 'vitest'
import {
  ASSET_BENCHMARK_NATIONAL,
  ASSET_BENCHMARK_BY_AGE_BRACKET,
  BUCKET_LOWER_BOUNDS_MAN_YEN,
  ASSET_BENCHMARK_SOURCE,
  type AgeBracket,
} from './householdAssetBenchmark'

const AGE_BRACKETS: AgeBracket[] = ['20s', '30s', '40s', '50s', '60s', '70s']

describe('householdAssetBenchmark', () => {
  it('BUCKET_LOWER_BOUNDS_MAN_YENは12区分・昇順(先頭2つは0=非保有の特殊区分)', () => {
    expect(BUCKET_LOWER_BOUNDS_MAN_YEN).toHaveLength(12)
    expect(BUCKET_LOWER_BOUNDS_MAN_YEN[0]).toBe(0)
    expect(BUCKET_LOWER_BOUNDS_MAN_YEN[1]).toBe(0)
    for (let i = 1; i < BUCKET_LOWER_BOUNDS_MAN_YEN.length - 1; i++) {
      expect(BUCKET_LOWER_BOUNDS_MAN_YEN[i + 1]!).toBeGreaterThan(BUCKET_LOWER_BOUNDS_MAN_YEN[i]!)
    }
  })

  it('全国データの分布%合計+無回答%が100に近い(丸め誤差許容)', () => {
    const sum = ASSET_BENCHMARK_NATIONAL.distributionPercent.reduce((a, b) => a + b, 0) + ASSET_BENCHMARK_NATIONAL.noAnswerPercent
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })

  it('全国データの平均値は中央値より大きい(右に歪んだ分布)', () => {
    expect(ASSET_BENCHMARK_NATIONAL.meanManYen).toBeGreaterThan(ASSET_BENCHMARK_NATIONAL.medianManYen)
    expect(ASSET_BENCHMARK_NATIONAL.medianManYen).toBeGreaterThan(0)
  })

  it.each(AGE_BRACKETS)('年代別データ(%s)の分布%%合計+無回答%%が100に近い(丸め誤差許容)', (bracket) => {
    const group = ASSET_BENCHMARK_BY_AGE_BRACKET[bracket]
    const sum = group.distributionPercent.reduce((a, b) => a + b, 0) + group.noAnswerPercent
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })

  it.each(AGE_BRACKETS)('年代別データ(%s)の平均値・中央値が正の数', (bracket) => {
    const group = ASSET_BENCHMARK_BY_AGE_BRACKET[bracket]
    expect(group.meanManYen).toBeGreaterThan(0)
    expect(group.medianManYen).toBeGreaterThan(0)
    expect(group.sampleSize).toBeGreaterThan(0)
  })

  it('全年代区分(20s〜70s)が揃っている', () => {
    expect(Object.keys(ASSET_BENCHMARK_BY_AGE_BRACKET).sort()).toEqual([...AGE_BRACKETS].sort())
  })

  it('出典メタデータが定義されている', () => {
    expect(ASSET_BENCHMARK_SOURCE.title).toBeTruthy()
    expect(ASSET_BENCHMARK_SOURCE.url).toMatch(/^https:\/\//)
    expect(ASSET_BENCHMARK_SOURCE.surveyYear).toBe(2025)
  })
})
