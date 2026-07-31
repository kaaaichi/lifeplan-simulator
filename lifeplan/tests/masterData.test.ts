// tests/masterData.test.ts
import { describe, it, expect } from 'vitest'
import { utilities, electricityAnnual } from '../src/masterData/utilities'
import { pension } from '../src/masterData/pension'
import { educationMaster, educationCostForGrade, universityCost, DEFAULT_INCOME_BAND, availableIncomeBands } from '../src/masterData/education'
import { nurseryDiscountRate } from '../src/masterData/nursery'
import {
  CLOTHING_PER_CHILD_ANNUAL,
  childFoodCostAnnual,
  childDefaultAllowanceAnnual,
} from '../src/masterData/childLivingCost'

describe('utilities', () => {
  it('ガス併用 世帯人数3の電気代年額', () => {
    expect(electricityAnnual('ガス併用', 3)).toBe(135552)
  })
  it('格安simの携帯月額', () => {
    expect(utilities.phoneMonthly['格安simスマホ']).toBe(2957)
  })
})
describe('pension', () => {
  it('満額78万', () => { expect(pension.annualFull).toBe(780000) })
})
describe('education', () => {
  it('公立小1(index6)の年額=学費+学校外費', () => {
    // 143500 + 194500 = 338000
    expect(educationCostForGrade(educationMaster, '公立', 6, DEFAULT_INCOME_BAND)).toBe(338000)
  })
  it('未就学(index<6)は0', () => {
    expect(educationCostForGrade(educationMaster, '公立', 3, DEFAULT_INCOME_BAND)).toBe(0)
  })
  it('大学1年目(index18)はtuition+facilityFee+entranceFeeの合計', () => {
    // 国立: 643000(tuition) + 0(facilityFee) + 338000(entranceFee) = 981000
    expect(universityCost(educationMaster, '国立', 18, DEFAULT_INCOME_BAND)).toBe(981000)
    // 私立理: 1395000(tuition) + 160000(facilityFee) + 282000(entranceFee) = 1837000
    expect(universityCost(educationMaster, '私立理', 18, DEFAULT_INCOME_BAND)).toBe(1837000)
  })
  it('大学2〜4年目(index19-21)はentranceFeeを含まない', () => {
    // 国立: 643000 + 0 = 643000（入学金338000は含まない）
    expect(universityCost(educationMaster, '国立', 19, DEFAULT_INCOME_BAND)).toBe(643000)
    expect(universityCost(educationMaster, '国立', 20, DEFAULT_INCOME_BAND)).toBe(643000)
    expect(universityCost(educationMaster, '国立', 21, DEFAULT_INCOME_BAND)).toBe(643000)
    // 私立理: 1395000 + 160000 = 1555000
    expect(universityCost(educationMaster, '私立理', 19, DEFAULT_INCOME_BAND)).toBe(1555000)
  })
  it('大学範囲外(index17, 22)は0', () => {
    expect(universityCost(educationMaster, '国立', 17, DEFAULT_INCOME_BAND)).toBe(0)
    expect(universityCost(educationMaster, '国立', 22, DEFAULT_INCOME_BAND)).toBe(0)
  })
  it('既定の年収帯はマスタに実在する', () => {
    expect(availableIncomeBands(educationMaster)).toContain(DEFAULT_INCOME_BAND)
  })
  it('マスタに無い年収帯を指定した場合は計上しない(0)', () => {
    expect(educationCostForGrade(educationMaster, '公立', 6, '存在しない帯')).toBe(0)
    expect(universityCost(educationMaster, '国立', 18, '存在しない帯')).toBe(0)
  })
})
describe('nursery', () => {
  it('出生順位0番目(一番上)は全額', () => {
    expect(nurseryDiscountRate(0)).toBe(1)
  })
  it('出生順位1番目(上から2番目)は半額', () => {
    expect(nurseryDiscountRate(1)).toBe(0.5)
  })
  it('出生順位2番目以降は無料', () => {
    expect(nurseryDiscountRate(2)).toBe(0)
    expect(nurseryDiscountRate(5)).toBe(0)
  })
})
describe('childLivingCost', () => {
  it('衣服費定数は146,958円', () => {
    expect(CLOTHING_PER_CHILD_ANNUAL).toBe(146_958)
  })
  describe('childFoodCostAnnual', () => {
    it('0-2歳(index0-2)は230,364円', () => {
      expect(childFoodCostAnnual(0)).toBe(230_364)
      expect(childFoodCostAnnual(1)).toBe(230_364)
      expect(childFoodCostAnnual(2)).toBe(230_364)
    })
    it('3-5歳(index3-5)は307,014円', () => {
      expect(childFoodCostAnnual(3)).toBe(307_014)
      expect(childFoodCostAnnual(4)).toBe(307_014)
      expect(childFoodCostAnnual(5)).toBe(307_014)
    })
    it('小学生(index6-11)は387,226円', () => {
      expect(childFoodCostAnnual(6)).toBe(387_226)
      expect(childFoodCostAnnual(9)).toBe(387_226)
      expect(childFoodCostAnnual(11)).toBe(387_226)
    })
    it('中学生(index12-14)は460,490円', () => {
      expect(childFoodCostAnnual(12)).toBe(460_490)
      expect(childFoodCostAnnual(13)).toBe(460_490)
      expect(childFoodCostAnnual(14)).toBe(460_490)
    })
    it('高校生(index15-17)は489,204円', () => {
      expect(childFoodCostAnnual(15)).toBe(489_204)
      expect(childFoodCostAnnual(16)).toBe(489_204)
      expect(childFoodCostAnnual(17)).toBe(489_204)
    })
    it('境界値2/3を正しく区分', () => {
      expect(childFoodCostAnnual(2)).toBe(230_364) // 0-2歳
      expect(childFoodCostAnnual(3)).toBe(307_014) // 3-5歳
    })
    it('境界値5/6を正しく区分', () => {
      expect(childFoodCostAnnual(5)).toBe(307_014) // 3-5歳
      expect(childFoodCostAnnual(6)).toBe(387_226) // 小学生
    })
    it('境界値11/12を正しく区分', () => {
      expect(childFoodCostAnnual(11)).toBe(387_226) // 小学生
      expect(childFoodCostAnnual(12)).toBe(460_490) // 中学生
    })
    it('境界値14/15を正しく区分', () => {
      expect(childFoodCostAnnual(14)).toBe(460_490) // 中学生
      expect(childFoodCostAnnual(15)).toBe(489_204) // 高校生
    })
    it('境界値17/18を正しく区分(18以上は対象外)', () => {
      expect(childFoodCostAnnual(17)).toBe(489_204) // 高校生
      expect(childFoodCostAnnual(18)).toBeUndefined() // 対象外
    })
    it('大学年代(index18-21)は対象外', () => {
      expect(childFoodCostAnnual(18)).toBeUndefined()
      expect(childFoodCostAnnual(19)).toBeUndefined()
      expect(childFoodCostAnnual(20)).toBeUndefined()
      expect(childFoodCostAnnual(21)).toBeUndefined()
    })
    it('範囲外の値は対象外', () => {
      expect(childFoodCostAnnual(-1)).toBeUndefined()
      expect(childFoodCostAnnual(22)).toBeUndefined()
    })
  })
  describe('childDefaultAllowanceAnnual', () => {
    it('0-5歳(index0-5)は0円', () => {
      expect(childDefaultAllowanceAnnual(0)).toBe(0)
      expect(childDefaultAllowanceAnnual(2)).toBe(0)
      expect(childDefaultAllowanceAnnual(5)).toBe(0)
    })
    it('小学生(index6-11)は8,462円', () => {
      expect(childDefaultAllowanceAnnual(6)).toBe(8_462)
      expect(childDefaultAllowanceAnnual(9)).toBe(8_462)
      expect(childDefaultAllowanceAnnual(11)).toBe(8_462)
    })
    it('中学生(index12-14)は33,870円', () => {
      expect(childDefaultAllowanceAnnual(12)).toBe(33_870)
      expect(childDefaultAllowanceAnnual(13)).toBe(33_870)
      expect(childDefaultAllowanceAnnual(14)).toBe(33_870)
    })
    it('高校生(index15-17)は75,490円', () => {
      expect(childDefaultAllowanceAnnual(15)).toBe(75_490)
      expect(childDefaultAllowanceAnnual(16)).toBe(75_490)
      expect(childDefaultAllowanceAnnual(17)).toBe(75_490)
    })
    it('境界値5/6を正しく区分', () => {
      expect(childDefaultAllowanceAnnual(5)).toBe(0) // 0-5歳
      expect(childDefaultAllowanceAnnual(6)).toBe(8_462) // 小学生
    })
    it('境界値11/12を正しく区分', () => {
      expect(childDefaultAllowanceAnnual(11)).toBe(8_462) // 小学生
      expect(childDefaultAllowanceAnnual(12)).toBe(33_870) // 中学生
    })
    it('境界値14/15を正しく区分', () => {
      expect(childDefaultAllowanceAnnual(14)).toBe(33_870) // 中学生
      expect(childDefaultAllowanceAnnual(15)).toBe(75_490) // 高校生
    })
    it('大学年代(index18-21)は対象外', () => {
      expect(childDefaultAllowanceAnnual(18)).toBeUndefined()
      expect(childDefaultAllowanceAnnual(19)).toBeUndefined()
      expect(childDefaultAllowanceAnnual(20)).toBeUndefined()
      expect(childDefaultAllowanceAnnual(21)).toBeUndefined()
    })
    it('範囲外の値は対象外', () => {
      expect(childDefaultAllowanceAnnual(-1)).toBeUndefined()
      expect(childDefaultAllowanceAnnual(22)).toBeUndefined()
    })
  })
})
