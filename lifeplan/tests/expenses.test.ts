// tests/expenses.test.ts
import { describe, it, expect } from 'vitest'
import { expensesForYear, householdSizeForYear, totalExpenseOf } from '../src/engine/expenses'
import { lifeplanMaster } from '../src/masterData'
import { baseInputs } from './_fixtures'

// 保育料の月額はフィクスチャの前提値を参照する(直書きしない)。
const NURSERY = baseInputs.assumptions.nurseryFeeMonthly

describe('householdSizeForYear', () => {
  it('2026は3人(夫婦+子)', () => {
    expect(householdSizeForYear(baseInputs, 2026)).toBe(3)
  })
})
describe('expensesForYear', () => {
  it('住宅は家賃×12', () => {
    const e = expensesForYear(baseInputs, lifeplanMaster, 2026)
    expect(e.住宅).toBe(baseInputs.housing.rentMonthly * 12)
  })
  it('家電は買い替え年(2030,10年周期)に計上', () => {
    expect(expensesForYear(baseInputs, lifeplanMaster, 2030).家電).toBe(100_000)
    expect(expensesForYear(baseInputs, lifeplanMaster, 2031).家電).toBe(0)
  })
  it('小1の年(2031)は教育費>0', () => {
    expect(expensesForYear(baseInputs, lifeplanMaster, 2031).教育費).toBeGreaterThan(0)
  })
  it('学齢index 1(1〜2歳児クラス)の子1人 → 保育料は月額×12', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [{
          id: 'c1', name: '子1', birthYear: 2025, birthMonth: 4,
          schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
          allowanceMonthly: 0, phoneFromGrade: 6,
        }],
      },
    }
    // 2026年: gradeIndexAt(2025, 4, 2026) = 2026-2025-1 = 0 → 学齢index0(0才児クラス)
    // 2027年: gradeIndexAt(2025, 4, 2027) = 1 → 学齢index1(1才児クラス)
    expect(expensesForYear(inputs, lifeplanMaster, 2027).保育料).toBe(NURSERY * 12)
  })
  it('学齢index 4(年中, 3〜5歳児クラス)の子1人 → 保育料は0(無償化)', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [{
          id: 'c1', name: '子1', birthYear: 2021, birthMonth: 4,
          schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
          allowanceMonthly: 0, phoneFromGrade: 6,
        }],
      },
    }
    // gradeIndexAt(2021, 4, 2026) = 2026-2021-1 = 4 → 年中(学齢index4, 3〜5歳児クラス)
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(0)
  })
  it('0〜2歳の子2人が同時在籍 → 第1子フル額+第2子半額', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [
          { id: 'c1', name: '第1子', birthYear: 2024, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
          { id: 'c2', name: '第2子', birthYear: 2025, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
        ],
      },
    }
    // 2026年: 第1子 gradeIndexAt(2024,4,2026)=1(1才児), 第2子 gradeIndexAt(2025,4,2026)=0(0才児)
    // 出生順位: 第1子(2024年生)が0番目=全額、第2子(2025年生)が1番目=半額
    const expected = NURSERY * 12 * 1 + NURSERY * 12 * 0.5
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(expected)
  })
  it('3〜5歳の兄+0〜2歳の弟 → 兄は0円のまま、弟は出生順位1番目として半額', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [
          { id: 'c1', name: '兄', birthYear: 2021, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
          { id: 'c2', name: '弟', birthYear: 2025, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
        ],
      },
    }
    // 2026年: 兄 gradeIndexAt(2021,4,2026)=4(年中, 3〜5歳児クラス→無償), 弟 gradeIndexAt(2025,4,2026)=0(0才児)
    // 出生順位: 兄(2021年生)が0番目、弟(2025年生)が1番目=半額 だが兄自体の料金は無償化で0円
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(NURSERY * 12 * 0.5)
  })
  it('totalExpenseOfは各カテゴリの和', () => {
    const e = expensesForYear(baseInputs, lifeplanMaster, 2026)
    const expected = e.食費 + e.日用品 + e.ライフライン + e.住宅 + e.教育費 + e.家電 + e.住宅大型 + e.こづかい + e.衣服 + e.医療 + e.外食レジャー + e.雑費 + e.車 + e.保育料
    expect(totalExpenseOf(e)).toBe(expected)
  })
})

// 大人(夫婦2人)分の食費・衣服費・こづかいは既存挙動のまま固定して、子どもの増分を切り分ける
const ADULT_FOOD_ANNUAL = 17_173 * 2 * 12 // FOOD_PER_PERSON_MONTH * adultCount(2) * 12
const ADULT_CLOTHING_ANNUAL = 180_000 * 2 // CLOTHING_PER_ADULT_ANNUAL * adultCount(2)
const ADULT_POCKET_ANNUAL = 400_000 + 240_000 // POCKET_MONEY_PRIMARY + POCKET_MONEY_SPOUSE

function childWithGrade(id: string, gradeIndex: number, allowanceMonthly: number | undefined) {
  return {
    id, name: id, birthYear: 2025 - gradeIndex, birthMonth: 4,
    schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
    allowanceMonthly, phoneFromGrade: 6,
  }
}

function inputsWithChild(gradeIndex: number, allowanceMonthly: number | undefined) {
  return {
    ...baseInputs,
    members: {
      ...baseInputs.members,
      children: [childWithGrade('c1', gradeIndex, allowanceMonthly)],
    },
  }
}

describe('学齢連動の食費・衣服・こづかい', () => {
  it('学齢index 8(小学3年生)の子どもがいる世帯で食費が387,226円加算される', () => {
    const e = expensesForYear(inputsWithChild(8, 0), lifeplanMaster, 2026)
    expect(e.食費 - ADULT_FOOD_ANNUAL).toBe(387_226)
  })
  it('学齢index 19(大学2年目)の子どもの食費は現行どおりFOOD_PER_PERSON_MONTH*12(回帰)', () => {
    const e = expensesForYear(inputsWithChild(19, 0), lifeplanMaster, 2026)
    expect(e.食費 - ADULT_FOOD_ANNUAL).toBe(17_173 * 12)
  })
  it('学齢index 3の子どもの衣服費として146,958円が加算される', () => {
    const e = expensesForYear(inputsWithChild(3, 0), lifeplanMaster, 2026)
    expect(e.衣服 - ADULT_CLOTHING_ANNUAL).toBe(146_958)
  })
  it('学齢index 20の子どもには衣服費が加算されない(0円, 回帰)', () => {
    const e = expensesForYear(inputsWithChild(20, 0), lifeplanMaster, 2026)
    expect(e.衣服 - ADULT_CLOTHING_ANNUAL).toBe(0)
  })
  it('allowanceMonthly:0(明示)の学齢index16の子どものお小遣いは0円のまま(年齢帯デフォルト75,490円は適用されない)', () => {
    const e = expensesForYear(inputsWithChild(16, 0), lifeplanMaster, 2026)
    expect(e.こづかい - ADULT_POCKET_ANNUAL).toBe(0)
  })
  it('allowanceMonthly:undefinedの学齢index16の子どものお小遣いは75,490円になる', () => {
    const e = expensesForYear(inputsWithChild(16, undefined), lifeplanMaster, 2026)
    expect(e.こづかい - ADULT_POCKET_ANNUAL).toBe(75_490)
  })
  it('allowanceMonthly:3000(明示)の学齢index13の子どものお小遣いは36,000円になる(年齢帯デフォルト33,870円は使われない)', () => {
    const e = expensesForYear(inputsWithChild(13, 3000), lifeplanMaster, 2026)
    expect(e.こづかい - ADULT_POCKET_ANNUAL).toBe(36_000)
  })
})
