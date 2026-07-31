// src/masterData/education.ts
//
// 【大学費用の設計意図】education.json の `大学` は、一次資料の実額に**一律 +20% のバッファ**を
// 乗せた値である(コミット e6dccd3「大学費用を一次資料+20%バッファの実額に見直し (#20)」)。
// 意図的な悲観ケース設定であり、一次資料と一致しないのは誤りではない。
//   国立 授業料 643,000 = 535,800 × 1.2  (国立大学等の授業料その他の費用に関する省令・標準額)
//   国立 入学料 338,000 = 282,000 × 1.2  (同上)
//   私立文 授業料 993,000 = 827,135 × 1.2 (文科省 令和5年度 私立大学入学者調査・文科系平均)
//   私立理 授業料 1,395,000 = 1,162,738 × 1.2 (同・理科系平均)
//   公立は元にした一次資料が未特定(=未確認)。値は +20% 換算と整合する。
// 詳細と出典URL: research/2026-07-15-education-cost-benchmark.md
//
// ⚠️ scripts/extract-master.mjs は education.json の**旧構造**({tuition, outside})のまま更新されて
// おらず、大学費用も見直し前の旧値(国立 818,000 等)を持つ。再実行すると現行データを壊す。
import eduJson from './education.json'
import type { SchoolType } from '../types'

export type EducationMaster = typeof eduJson
export const educationMaster: EducationMaster = eduJson

const GRADE_BY_INDEX: Record<number, string> = {
  6:'小1',7:'小2',8:'小3',9:'小4',10:'小5',11:'小6',
  12:'中1',13:'中2',14:'中3',15:'高1',16:'高2',17:'高3',
}
/**
 * 同梱マスタが収録している唯一の世帯年収帯。Assumptions.educationIncomeBand の既定値として使う。
 * この帯名は元スプレッドシート「基礎データ」のラベル(例: 「800万～999万公立小1」)に由来する
 * (scripts/extract-master.mjs 参照)。
 */
export const DEFAULT_INCOME_BAND = '800万～999万'

/** マスタに収録されている世帯年収帯のキー一覧。UIの選択肢に使う。 */
export function availableIncomeBands(edu: EducationMaster): string[] {
  return Object.keys(edu)
}

export function educationCostForGrade(
  edu: EducationMaster, school: SchoolType, gradeIndex: number, incomeBand: string,
): number {
  const key = GRADE_BY_INDEX[gradeIndex]
  if (!key) return 0 // 未就学(0-5) or 大学(18-21)は別関数
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bandData = (edu as any)[incomeBand]
  if (!bandData) return 0 // マスタに無い帯が指定された場合は計上しない
  const band = bandData[school]
  const cell = band[key]
  if (!cell) return 0
  return cell.tuition + cell.outside
}

export function universityCost(
  edu: EducationMaster, uni: '国立'|'公立'|'私立文'|'私立理', gradeIndex: number, incomeBand: string,
): number {
  if (gradeIndex < 18 || gradeIndex > 21) return 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bandRoot = (edu as any)[incomeBand]
  if (!bandRoot) return 0 // マスタに無い帯が指定された場合は計上しない
  const band = bandRoot['大学'][uni]
  let cost = band.tuition + band.facilityFee
  if (gradeIndex === 18) cost += band.entranceFee // 大学1年時のみ入学料を一括計上
  return cost
}
