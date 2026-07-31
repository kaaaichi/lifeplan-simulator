// src/masterData/householdAssetBenchmark.ts
// 出典: 金融広報中央委員会(J-FLEC)「家計の金融行動に関する世論調査2025年」(二人以上世帯調査)
// 図表4「金融資産保有額(金融資産を保有していない世帯を含む)」。一次データは
// research/2026-07-24-household-asset-benchmark.md に記録済み(2025年公表データの静的スナップショット)。

export type AgeBracket = '20s' | '30s' | '40s' | '50s' | '60s' | '70s'

/**
 * 資産額レンジ別の世帯割合(%)。「無回答」を除く12区分(先頭2つは0=非保有の特殊区分)。
 * 区分順: [非保有, ~100, 100~200, 200~300, 300~400, 400~500, 500~700, 700~1000, 1000~1500, 1500~2000, 2000~3000, 3000~]
 */
export type AssetDistributionPercent = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export interface AssetBenchmarkGroup {
  /** サンプルサイズ(n)。参考情報として保持し計算には使わない */
  sampleSize: number
  meanManYen: number
  medianManYen: number
  distributionPercent: AssetDistributionPercent
  /** 「無回答」世帯の割合(%)。distributionPercentには含まれない(正規化のため保持) */
  noAnswerPercent: number
}

/**
 * 各区分の下限(万円)。12要素、distributionPercentと1:1対応。
 * 先頭2つ(index0,1)はともに0(index0=非保有の点、index1=(0,100)区間の下限)。
 * 最後(index11=3000)は上限非公開の開区間。
 */
export const BUCKET_LOWER_BOUNDS_MAN_YEN: AssetDistributionPercent = [
  0, 0, 100, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000,
]

export const ASSET_BENCHMARK_SOURCE = {
  title: '家計の金融行動に関する世論調査2025年(二人以上世帯調査)',
  organization: '金融広報中央委員会(J-FLEC)',
  surveyYear: 2025,
  url: 'https://www.j-flec.go.jp/data/kakekin_2025/',
} as const

export const ASSET_BENCHMARK_NATIONAL: AssetBenchmarkGroup = {
  sampleSize: 5000,
  meanManYen: 1940,
  medianManYen: 720,
  distributionPercent: [15.7, 7.6, 6.2, 4.4, 4.1, 2.7, 6.8, 6.7, 9.5, 6.2, 9.3, 18.8],
  noAnswerPercent: 2,
}

export const ASSET_BENCHMARK_BY_AGE_BRACKET: Record<AgeBracket, AssetBenchmarkGroup> = {
  '20s': {
    sampleSize: 171,
    meanManYen: 525,
    medianManYen: 125,
    distributionPercent: [21.6, 16.4, 14, 7, 8.2, 3.5, 5.3, 3.5, 4.7, 1.2, 4.1, 4.1],
    noAnswerPercent: 6.4,
  },
  '30s': {
    sampleSize: 648,
    meanManYen: 1096,
    medianManYen: 311,
    distributionPercent: [17.6, 12.7, 9.1, 6, 6, 4.5, 8.3, 7.4, 9.4, 3.9, 4.6, 7.9],
    noAnswerPercent: 2.6,
  },
  '40s': {
    sampleSize: 1052,
    meanManYen: 1486,
    medianManYen: 500,
    distributionPercent: [18.8, 10, 6.2, 5.1, 4.4, 2.6, 7.3, 6.1, 9.7, 6.5, 8.2, 13.1],
    noAnswerPercent: 2.1,
  },
  '50s': {
    sampleSize: 1024,
    meanManYen: 1908,
    medianManYen: 700,
    distributionPercent: [18.2, 6.5, 6.4, 4.1, 3.5, 2.2, 6.7, 7.7, 9.3, 6.1, 8.1, 18.8],
    noAnswerPercent: 2.2,
  },
  '60s': {
    sampleSize: 1022,
    meanManYen: 2683,
    medianManYen: 1400,
    distributionPercent: [12.8, 4.7, 3.9, 3, 2.8, 1.8, 6.2, 6.3, 8.9, 8, 12.4, 27.2],
    noAnswerPercent: 2,
  },
  '70s': {
    sampleSize: 1083,
    meanManYen: 2416,
    medianManYen: 1178,
    distributionPercent: [10.9, 4.5, 5.1, 3.7, 3.9, 2.9, 6.4, 6.7, 11.1, 6.7, 12.3, 25.2],
    noAnswerPercent: 0.6,
  },
}
