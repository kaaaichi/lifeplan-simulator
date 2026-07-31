// lifeplan/src/components/dashboard/format.ts
// チャートの軸/ツールチップ共通の金額フォーマッタ（issue #4）。
// 円単位の生値を「1,234万」「1.2億」のような短い表記に丸める。

import type { EventMarker } from '../../store/selectors'

const OKU = 100_000_000
const MAN = 10_000

/**
 * 円単位の金額をコンパクトな日本語表記にする。
 * - 1億未満: 万円単位に丸めて桁区切り（例: 48,923,000 → "4,892万"）
 * - 1億以上10億未満: 小数1桁の億（例: 123,000,000 → "1.2億"、末尾の .0 は省略）
 * - 10億以上: 整数の億（例: 1,234,000,000 → "12億"）
 * - 0（万円に丸めて0になる値を含む）: "0"
 */
export function formatYenCompact(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  const man = Math.round(abs / MAN)
  if (man === 0) return '0'

  if (man < MAN) {
    return `${sign}${man.toLocaleString('ja-JP')}万`
  }

  const oku = abs / OKU
  if (oku < 10) {
    // 小数1桁。丸めで 10 に達したら整数表記に落ちるよう再判定する
    const rounded = Math.round(oku * 10) / 10
    const text = rounded >= 10 ? `${Math.round(rounded)}` : `${rounded}`
    return `${sign}${text}億`
  }
  return `${sign}${Math.round(oku).toLocaleString('ja-JP')}億`
}

/**
 * データ系列の値からY軸に必要な幅(px)を見積もる。
 * recharts のデフォルト目盛りフォント(12px)を前提に、
 * ASCII(数字・カンマ・マイナス)≈7px、全角(万/億/小数点等)≈12px で概算する。
 */
export function yAxisWidth(values: number[]): number {
  const MIN = 40
  const MAX = 96
  if (values.length === 0) return 64

  let longest = 0
  for (const value of values) {
    const label = formatYenCompact(value)
    let width = 0
    for (const ch of label) {
      width += /[0-9,.-]/.test(ch) ? 7 : 12
    }
    longest = Math.max(longest, width)
  }
  // 軸目盛り分のパディング（tickLine + tickMargin）を加算
  return Math.min(MAX, Math.max(MIN, longest + 16))
}

/**
 * 同一年に複数のイベントマーカーが重なる場合、1本の縦線・1つのラベルにまとめる。
 * ラベルは登場順・重複除去で "/" 結合し、結果は年の昇順で返す。
 */
export function groupEventMarkersByYear(eventMarkers: EventMarker[]): { year: number; label: string }[] {
  const labelsByYear = new Map<number, string[]>()
  for (const marker of eventMarkers) {
    const labels = labelsByYear.get(marker.year) ?? []
    if (!labels.includes(marker.label)) labels.push(marker.label)
    labelsByYear.set(marker.year, labels)
  }
  return [...labelsByYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, labels]) => ({ year, label: labels.join('/') }))
}
