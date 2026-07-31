// src/masterData/childLivingCost.ts
// 三澤奈菜・竹原健二, 2025, 日本公衆衛生雑誌, doi:10.11236/jph.25-023, 表3
// 子どもの食費・衣服費・お小遣いデフォルト額の年齢帯別テーブル

export const CLOTHING_PER_CHILD_ANNUAL = 146_958

// 学齢index(0-17)から子どもの食費年額を返す。
// index 18-21(大学)および範囲外の値はundefinedを返す。
export function childFoodCostAnnual(gradeIndex: number): number | undefined {
  if (gradeIndex >= 0 && gradeIndex <= 2) return 230_364 // 0-2歳
  if (gradeIndex >= 3 && gradeIndex <= 5) return 307_014 // 3-5歳
  if (gradeIndex >= 6 && gradeIndex <= 11) return 387_226 // 小学生
  if (gradeIndex >= 12 && gradeIndex <= 14) return 460_490 // 中学生
  if (gradeIndex >= 15 && gradeIndex <= 17) return 489_204 // 高校生
  return undefined
}

// 学齢index(0-17)から子どものお小遣いデフォルト年額を返す。
// index 18-21(大学)および範囲外の値はundefinedを返す。
export function childDefaultAllowanceAnnual(gradeIndex: number): number | undefined {
  if (gradeIndex >= 0 && gradeIndex <= 5) return 0 // 0-5歳
  if (gradeIndex >= 6 && gradeIndex <= 11) return 8_462 // 小学生
  if (gradeIndex >= 12 && gradeIndex <= 14) return 33_870 // 中学生
  if (gradeIndex >= 15 && gradeIndex <= 17) return 75_490 // 高校生
  return undefined
}
