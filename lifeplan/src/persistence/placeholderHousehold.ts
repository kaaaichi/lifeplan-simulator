import type { Inputs } from '../types'
import { DEFAULT_INCOME_BAND } from '../masterData/education'

export const defaultInputs: Inputs = {
  baseYear: 2026,
  members: {
    primary: { name: '世帯主', birthYear: 1990, birthMonth: 1, takeHomeIncome: 6_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    spouse: { name: '配偶者', birthYear: 1990, birthMonth: 1, takeHomeIncome: 3_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    children: [{
      id: 'c1', name: '第一子', birthYear: 2024, birthMonth: 4,
      schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 100_000 },
      allowanceMonthly: 0, phoneFromGrade: 6,
    }],
  },
  assets: {
    bankAccounts: [{ label: '普通預金', balance: 4_000_000 }],
    investments: [{ label: '証券口座', balance: 3_000_000 }],
  },
  housing: { type: '賃貸', rentMonthly: 150_000, loanMonthly: 0, loanRemainingYears: 0, repairReserveMonthly: 0, propertyTaxAnnual: 0, fireInsuranceAnnual: 0 },
  lifestyle: { electricType: 'ガス併用', internetMonthly: 4_000 },
  appliances: [
    { name: '冷蔵庫', price: 100_000, lastPurchaseYear: 2022, lifespanYears: 10 },
    { name: '洗濯機', price: 200_000, lastPurchaseYear: 2022, lifespanYears: 8 },
  ],
  homeMaintenance: [],
  assumptions: {
    investmentReturnRate: 5,
    returnRateOptimistic: 7,
    returnRatePessimistic: 2,
    inflationRate: 0,
    endAge: 95,
    annualInvestmentContribution: 600_000,
    pensionStartAge: 65,
    pensionAnnualPerPerson: 780_000,
    emergencyFundCash: 1_200_000,
    educationIncomeBand: DEFAULT_INCOME_BAND,
    // 自治体の徴収基準表における世帯の所得階層で決まる値。利用者が自分の階層に合わせて設定する。
    nurseryFeeMonthly: 40_000,
    coastFireTargetAmount: 40_000_000,
  },
}
