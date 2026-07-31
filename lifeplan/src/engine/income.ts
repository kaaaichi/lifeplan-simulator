import type { Member, Assumptions } from '../types'
import { ageAt } from './ageGrade'

function memberIncome(m: Member, a: Assumptions, year: number): number {
  const age = ageAt(m.birthYear, m.birthMonth, year)
  if (age <= m.workUntilAge) return m.takeHomeIncome
  if (age >= a.pensionStartAge) return a.pensionAnnualPerPerson
  return 0
}

export function incomeForYear(
  members: { primary: Member; spouse: Member | null; children: unknown[] },
  a: Assumptions, year: number,
): number {
  let total = memberIncome(members.primary, a, year)
  if (members.spouse) total += memberIncome(members.spouse, a, year)
  return total
}
