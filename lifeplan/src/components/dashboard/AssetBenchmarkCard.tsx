// src/components/dashboard/AssetBenchmarkCard.tsx
import type { AssetBenchmarkResult, BenchmarkResult } from '../../engine/assetBenchmark'
import { ASSET_BENCHMARK_SOURCE } from '../../masterData/householdAssetBenchmark'
import { formatYen } from '../formatYen'
import styles from './AssetBenchmarkCard.module.css'

const AGE_BRACKET_LABELS: Record<AssetBenchmarkResult['ageBracket'], string> = {
  '20s': '20代',
  '30s': '30代',
  '40s': '40代',
  '50s': '50代',
  '60s': '60代',
  '70s': '70代',
}

function GroupCard({ label, result }: { label: string; result: BenchmarkResult }) {
  const upperPercent = Math.round(100 - result.percentileRank)
  return (
    <div className={styles.groupCard}>
      <p className={styles.groupLabel}>{label}</p>
      <p className={styles.deviationScore}>{result.deviationScore.toFixed(1)}</p>
      <p className={styles.percentileNote}>上位{upperPercent}%相当</p>
      <p className={styles.statRow}>
        <span>平均</span>
        <span>{formatYen(result.mean * 10_000)}</span>
      </p>
      <p className={styles.statRow}>
        <span>中央値</span>
        <span>{formatYen(result.median * 10_000)}</span>
      </p>
      {result.isApproximate && <p className={styles.approximateNote}>※近似値（分布の詳細が非公開の区分に該当、または年代区分の代用が発生）</p>}
    </div>
  )
}

export function AssetBenchmarkCard({ benchmark }: { benchmark: AssetBenchmarkResult }) {
  return (
    <section className={styles.container} aria-label="資産の全国比較">
      <h2 className={styles.title}>資産の全国比較（推定偏差値）</h2>
      <div className={styles.grid}>
        <GroupCard label="全世帯" result={benchmark.national} />
        <GroupCard label={`同年代（${AGE_BRACKET_LABELS[benchmark.ageBracket]}）`} result={benchmark.ageGroup} />
      </div>
      <p className={styles.footer}>
        出典:{' '}
        <a className={styles.sourceLink} href={ASSET_BENCHMARK_SOURCE.url} target="_blank" rel="noopener noreferrer">
          {ASSET_BENCHMARK_SOURCE.title}
        </a>
        ／偏差値は公表されている資産分布から算出した本アプリ独自の推定値であり、公式統計の値ではありません
      </p>
    </section>
  )
}
