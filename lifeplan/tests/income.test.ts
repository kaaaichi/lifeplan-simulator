import { describe, it, expect } from 'vitest'
import { incomeForYear } from '../src/engine/income'
import type { Member, Assumptions } from '../src/types'

const primary: Member = { name:'A', birthYear:1990, birthMonth:1, takeHomeIncome:6_000_000, workUntilAge:65, phonePlan:'格安simスマホ' }
const spouse: Member = { name:'B', birthYear:1990, birthMonth:1, takeHomeIncome:3_000_000, workUntilAge:65, phonePlan:'格安simスマホ' }
const asmp = { pensionStartAge:65, pensionAnnualPerPerson:780_000 } as Assumptions

describe('incomeForYear', () => {
  it('現役中は給与合計', () => {
    expect(incomeForYear({primary, spouse, children:[]}, asmp, 2027))
      .toBe(primary.takeHomeIncome + spouse.takeHomeIncome)
  })
  it('両者退職後は年金合計', () => {
    // primary 65歳=2057, spouse 65歳=2056. 2058は両者年金
    expect(incomeForYear({primary, spouse, children:[]}, asmp, 2060)).toBe(1_560_000)
  })
})
