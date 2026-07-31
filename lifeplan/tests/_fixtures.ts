import type { Inputs } from '../src/types'

export const baseInputs: Inputs = {
  baseYear: 2026,
  members: {
    primary: { name:'世帯主', birthYear:1990, birthMonth:1, takeHomeIncome:6_000_000, workUntilAge:65, phonePlan:'格安simスマホ' },
    spouse:  { name:'配偶者',   birthYear:1990, birthMonth:1,  takeHomeIncome:3_000_000, workUntilAge:65, phonePlan:'格安simスマホ' },
    children: [{ id:'c1', name:'第一子', birthYear:2024, birthMonth:7,
      schooling:{ elementary:'公立', junior:'公立', high:'公立', university:'国立', remittanceMonthly:100_000 },
      allowanceMonthly:0, phoneFromGrade:6 }],
  },
  assets: { bankAccounts:[], investments:[] },
  housing: { type:'賃貸', rentMonthly:150_000, loanMonthly:0, loanRemainingYears:0, repairReserveMonthly:0, propertyTaxAnnual:0, fireInsuranceAnnual:0 },
  lifestyle: { electricType:'ガス併用', internetMonthly:4_000 },
  appliances: [{ name:'冷蔵庫', price:100_000, lastPurchaseYear:2020, lifespanYears:10 }],
  homeMaintenance: [],
  assumptions: { investmentReturnRate:5, returnRateOptimistic:7, returnRatePessimistic:2, inflationRate:0, endAge:95, annualInvestmentContribution:600_000, pensionStartAge:65, pensionAnnualPerPerson:780_000, emergencyFundCash:1_200_000, educationIncomeBand:'800万～999万', nurseryFeeMonthly:40_000 },
}
