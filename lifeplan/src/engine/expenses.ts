// src/engine/expenses.ts
import type { Inputs, MasterData, ExpenseBreakdown } from '../types'
import { gradeIndexAt } from './ageGrade'
import { electricityAnnual, gasAnnual } from '../masterData/utilities'
import { educationCostForGrade, universityCost } from '../masterData/education'
import { nurseryDiscountRate } from '../masterData/nursery'
import { childFoodCostAnnual, childDefaultAllowanceAnnual, CLOTHING_PER_CHILD_ANNUAL } from '../masterData/childLivingCost'

// MVP固定プリセット(円/年)。スプレッドシートの代表値。
const FOOD_PER_PERSON_MONTH = 17173
const DAILY_GOODS_ANNUAL_BASE = 580_000
const CLOTHING_PER_ADULT_ANNUAL = 180_000
const POCKET_MONEY_PRIMARY = 400_000
const POCKET_MONEY_SPOUSE = 240_000
const LEISURE_ANNUAL = 300_000
const MISC_ANNUAL = 1_180_000
const MEDICAL_ANNUAL = 200_000

export function householdSizeForYear(inputs: Inputs, year: number): number {
  let n = 1 + (inputs.members.spouse ? 1 : 0)
  for (const c of inputs.members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi >= 0 && gi <= 21) n += 1 // 大学卒業まで同居とみなす
  }
  return n
}

function cyclic(year: number, lastYear: number, lifespan: number): boolean {
  const d = year - lastYear
  return d > 0 && lifespan > 0 && d % lifespan === 0
}

export function expensesForYear(inputs: Inputs, master: MasterData, year: number): ExpenseBreakdown {
  const size = householdSizeForYear(inputs, year)
  const { lifestyle, housing, members } = inputs
  const adultCount = 1 + (members.spouse ? 1 : 0)

  // 食費: 大人は従来どおりFOOD_PER_PERSON_MONTH。子どもは学齢帯別テーブル(0〜17)、
  // 大学生年代(18〜21・テーブル範囲外)は現行どおりFOOD_PER_PERSON_MONTH*12にフォールバック。
  let 食費 = FOOD_PER_PERSON_MONTH * adultCount * 12
  for (const c of members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi < 0 || gi > 21) continue
    食費 += childFoodCostAnnual(gi) ?? FOOD_PER_PERSON_MONTH * 12
  }
  const 日用品 = DAILY_GOODS_ANNUAL_BASE

  // ライフライン
  let phone = 0
  phone += master.utilities.phoneMonthly[members.primary.phonePlan] * 12
  if (members.spouse) phone += master.utilities.phoneMonthly[members.spouse.phonePlan] * 12
  for (const c of members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi >= c.phoneFromGrade && gi <= 21) phone += master.utilities.phoneMonthly['格安simスマホ'] * 12
  }
  const ライフライン =
    electricityAnnual(lifestyle.electricType, size) +
    gasAnnual(lifestyle.electricType, size) +
    lifestyle.internetMonthly * 12 + phone + master.utilities.nhkAnnual

  // 住宅
  let 住宅 = 0
  if (housing.type === '賃貸') 住宅 = housing.rentMonthly * 12
  else {
    const yearsFromBase = year - inputs.baseYear
    if (yearsFromBase < housing.loanRemainingYears) 住宅 += housing.loanMonthly * 12
    住宅 += housing.repairReserveMonthly * 12 + housing.propertyTaxAnnual + housing.fireInsuranceAnnual
  }

  // 教育費(参照する世帯年収帯は Assumptions.educationIncomeBand で指定する)
  const band = inputs.assumptions.educationIncomeBand
  let 教育費 = 0
  for (const c of members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi < 0) continue
    if (gi >= 6 && gi <= 11) 教育費 += educationCostForGrade(master.education, c.schooling.elementary, gi, band)
    else if (gi >= 12 && gi <= 14) 教育費 += educationCostForGrade(master.education, c.schooling.junior, gi, band)
    else if (gi >= 15 && gi <= 17) 教育費 += educationCostForGrade(master.education, c.schooling.high, gi, band)
    else if (gi >= 18 && gi <= 21 && c.schooling.university !== 'なし') {
      const uni = c.schooling.university
      const key = uni === '国立' ? '国立' : uni === '公立' ? '公立' : uni === '私立文' ? '私立文' : '私立理'
      教育費 += universityCost(master.education, key, gi, band) + c.schooling.remittanceMonthly * 12
    }
  }

  // 家電・住宅大型
  let 家電 = 0
  for (const a of inputs.appliances) if (cyclic(year, a.lastPurchaseYear, a.lifespanYears)) 家電 += a.price
  let 住宅大型 = 0
  for (const m of inputs.homeMaintenance) if (cyclic(year, m.lastYear, m.intervalYears)) 住宅大型 += m.price

  let こづかい = POCKET_MONEY_PRIMARY + (members.spouse ? POCKET_MONEY_SPOUSE : 0)
  for (const c of members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi < 0 || gi > 21) continue
    // 明示値(0を含む)は尊重。undefinedのときのみ学齢帯デフォルト(範囲外は0)を使う。
    if (c.allowanceMonthly !== undefined) こづかい += c.allowanceMonthly * 12
    else こづかい += childDefaultAllowanceAnnual(gi) ?? 0
  }
  let 衣服 = CLOTHING_PER_ADULT_ANNUAL * adultCount
  for (const c of members.children) {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi >= 0 && gi <= 17) 衣服 += CLOTHING_PER_CHILD_ANNUAL
  }
  const 医療 = MEDICAL_ANNUAL
  const 外食レジャー = LEISURE_ANNUAL
  const 雑費 = MISC_ANNUAL
  const 車 = 0

  // 保育料。月額は Assumptions.nurseryFeeMonthly(自治体の徴収基準表における世帯の所得階層で
  // 決まる値)を使う。3〜5歳児クラス(学齢index3〜5)は幼児教育・保育無償化により無償。
  // 未就学(学齢index0〜5)の兄弟姉妹を出生順に並べ、
  // 多子軽減(1番目=全額,2番目=半額,3番目以降=無料)を適用したうえで、
  // 実際に課金対象となる0〜2歳児クラス(学齢index0〜2)の子のみ加算する。
  const preschoolChildren = members.children
    .filter(c => { const gi = gradeIndexAt(c.birthYear, c.birthMonth, year); return gi >= 0 && gi <= 5 })
    .sort((a, b) => (a.birthYear - b.birthYear) || (a.birthMonth - b.birthMonth))
  let 保育料 = 0
  preschoolChildren.forEach((c, rank) => {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi >= 0 && gi <= 2) 保育料 += inputs.assumptions.nurseryFeeMonthly * 12 * nurseryDiscountRate(rank)
  })

  return { 食費, 日用品, ライフライン, 住宅, 教育費, 家電, 住宅大型, こづかい, 衣服, 医療, 外食レジャー, 雑費, 車, 保育料 }
}

export function totalExpenseOf(b: ExpenseBreakdown): number {
  return Object.values(b).reduce((a, x) => a + x, 0)
}
