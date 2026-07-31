// src/engine/assetBenchmark.ts
// 現在の総資産を、公的統計(全国・同年代)と比較した推定偏差値・パーセンタイル順位を算出する。
// 算出方式はdesign.md参照: 平均・標準偏差ベースの古典的偏差値ではなく、公表分布から
// 補間したパーセンタイル順位を標準正規分布の逆CDFで換算する(右に歪んだ実際の分布に対応するため)。

import {
  ASSET_BENCHMARK_NATIONAL,
  ASSET_BENCHMARK_BY_AGE_BRACKET,
  BUCKET_LOWER_BOUNDS_MAN_YEN,
  type AgeBracket,
  type AssetBenchmarkGroup,
} from '../masterData/householdAssetBenchmark'

export interface BenchmarkResult {
  deviationScore: number
  /** 0-100。上位区分の近似時は99.9に漸近、下限は非保有%の半分程度 */
  percentileRank: number
  mean: number
  median: number
  /** 最上位区分(3000万円以上)の近似、または年代範囲外の代用が発生した場合true */
  isApproximate: boolean
}

export interface AssetBenchmarkResult {
  national: BenchmarkResult
  ageGroup: BenchmarkResult
  ageBracket: AgeBracket
}

/**
 * 標準正規分布の逆CDF(分位関数)の有理近似(Acklamのアルゴリズム)。
 * p は開区間(0, 1)を想定。既知の精度: 絶対誤差 1.15e-9 以下。
 */
export function invNormalCdf(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0]
  const pLow = 0.02425

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5
    const r = q * q
    return (
      (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) *
      q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    )
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
}

interface Anchor {
  value: number
  percentile: number
}

/** 分布%(12区分)を無回答除外・合計100に正規化する */
function normalizedDistribution(group: AssetBenchmarkGroup): number[] {
  const sum = group.distributionPercent.reduce((a, b) => a + b, 0)
  return group.distributionPercent.map(p => (p * 100) / sum)
}

/**
 * 区分下限を基準にしたCDFアンカー点(11点)に、中央値のアンカー点(medianManYen, 50)を挿入して返す。
 * テストで単調性(資産額昇順でpercentileが非減少)を検証できるようexportしている。
 */
export function buildAnchors(group: AssetBenchmarkGroup): { anchors: Anchor[]; topPercentile: number } {
  const normalized = normalizedDistribution(group)
  const cumUpTo: number[] = []
  let running = 0
  for (const p of normalized) {
    running += p
    cumUpTo.push(running)
  }

  const anchors: Anchor[] = []
  for (let i = 0; i <= 10; i++) {
    anchors.push({ value: BUCKET_LOWER_BOUNDS_MAN_YEN[i + 1]!, percentile: cumUpTo[i]! })
  }
  // 中央値が既存の区分境界と同じ値の場合、重複したx値による退化区間(幅0)を作らないよう
  // その境界アンカーを上書きする(例: 40代の中央値500万円は「500〜700万円未満」区分の下限と一致)
  const existingBoundaryIndex = anchors.findIndex(a => a.value === group.medianManYen)
  if (existingBoundaryIndex >= 0) {
    anchors[existingBoundaryIndex] = { value: group.medianManYen, percentile: 50 }
  } else {
    anchors.push({ value: group.medianManYen, percentile: 50 })
  }
  anchors.sort((a, b) => a.value - b.value)

  return { anchors, topPercentile: cumUpTo[10]! }
}

function interpolate(anchors: Anchor[], value: number): number {
  for (let i = 0; i < anchors.length - 1; i++) {
    const lo = anchors[i]!
    const hi = anchors[i + 1]!
    if (value >= lo.value && value <= hi.value) {
      if (hi.value === lo.value) return lo.percentile
      const t = (value - lo.value) / (hi.value - lo.value)
      return lo.percentile + t * (hi.percentile - lo.percentile)
    }
  }
  return anchors[anchors.length - 1]!.percentile
}

const OPEN_BUCKET_ASYMPTOTE_PERCENTILE = 99.9

function percentileForAssets(group: AssetBenchmarkGroup, assetManYen: number): { percentileRank: number; isApproximate: boolean } {
  const normalized = normalizedDistribution(group)
  if (assetManYen <= 0) {
    return { percentileRank: normalized[0]! / 2, isApproximate: false }
  }

  const { anchors, topPercentile } = buildAnchors(group)
  const topBucketLowerBound = BUCKET_LOWER_BOUNDS_MAN_YEN[11]! // 3000

  if (assetManYen > topBucketLowerBound) {
    const fraction = 1 - 1 / (1 + (assetManYen - topBucketLowerBound) / topBucketLowerBound)
    const percentileRank = topPercentile + fraction * (OPEN_BUCKET_ASYMPTOTE_PERCENTILE - topPercentile)
    return { percentileRank, isApproximate: true }
  }

  return { percentileRank: interpolate(anchors, assetManYen), isApproximate: false }
}

function deviationScoreFromPercentile(percentileRank: number): number {
  const clamped = Math.min(99.5, Math.max(0.5, percentileRank))
  return 50 + 10 * invNormalCdf(clamped / 100)
}

function computeBenchmarkResult(group: AssetBenchmarkGroup, assetManYen: number, extraApproximate: boolean): BenchmarkResult {
  const { percentileRank, isApproximate } = percentileForAssets(group, assetManYen)
  return {
    deviationScore: deviationScoreFromPercentile(percentileRank),
    percentileRank,
    mean: group.meanManYen,
    median: group.medianManYen,
    isApproximate: isApproximate || extraApproximate,
  }
}

function ageBracketFromAge(age: number): { bracket: AgeBracket; approximated: boolean } {
  const decade = Math.floor(age / 10) * 10
  if (decade < 20) return { bracket: '20s', approximated: true }
  if (decade > 70) return { bracket: '70s', approximated: true }
  return { bracket: `${decade}s` as AgeBracket, approximated: false }
}

export function computeAssetBenchmark(currentTotalAssetsYen: number, agePrimary: number): AssetBenchmarkResult {
  const assetManYen = currentTotalAssetsYen / 10_000
  const { bracket, approximated } = ageBracketFromAge(agePrimary)

  return {
    national: computeBenchmarkResult(ASSET_BENCHMARK_NATIONAL, assetManYen, false),
    ageGroup: computeBenchmarkResult(ASSET_BENCHMARK_BY_AGE_BRACKET[bracket], assetManYen, approximated),
    ageBracket: bracket,
  }
}
