import type { Inputs, MasterData, YearRow, Actual } from '../types'
import { ageAt } from './ageGrade'
import { incomeForYear } from './income'
import { expensesForYear, totalExpenseOf } from './expenses'

/**
 * シミュレーションの起点残高(baseYear年始)を解決する(§23)。
 * actuals に baseYear-1(今年の年始)の実績があればそれを使い、無ければ inputs.assets にフォールバックする。
 */
export function resolveStartingBalances(
  inputs: Inputs, actuals: Actual[] | undefined,
): { cashBalance: number; investmentBalance: number; isActual: boolean } {
  const priorYearActual = actuals?.find(x => x.year === inputs.baseYear - 1)
  if (priorYearActual) {
    return { cashBalance: priorYearActual.cashBalance, investmentBalance: priorYearActual.investmentBalance, isActual: true }
  }
  return {
    cashBalance: inputs.assets.bankAccounts.reduce((s, x) => s + x.balance, 0),
    investmentBalance: inputs.assets.investments.reduce((s, x) => s + x.balance, 0),
    isActual: false,
  }
}

export function simulate(
  inputs: Inputs, master: MasterData, opts?: { returnRate?: number; actuals?: Actual[] },
): YearRow[] {
  const a = inputs.assumptions
  const r = (opts?.returnRate ?? a.investmentReturnRate) / 100
  const actualByYear = new Map((opts?.actuals ?? []).map(x => [x.year, x]))
  const { cashBalance: startCash, investmentBalance: startInvest } = resolveStartingBalances(inputs, opts?.actuals)

  const endYear = inputs.members.primary.birthYear + a.endAge
  const rows: YearRow[] = []
  let cash = startCash
  let invest = startInvest

  for (let year = inputs.baseYear; year <= endYear; year++) {
    const activeEvents = (inputs.financialEvents ?? [])
      .filter(e => e.startYear <= year && (e.endYear === null || year <= e.endYear))
    const incomeEventsTotal = activeEvents.filter(e => e.kind === '収入').reduce((s, e) => s + e.annualAmount, 0)
    const expenseEventsTotal = activeEvents.filter(e => e.kind === '支出').reduce((s, e) => s + e.annualAmount, 0)

    const income = incomeForYear(inputs.members, a, year) + incomeEventsTotal
    const expenses = expensesForYear(inputs, master, year)
    // 支出kindのannualAmountは「支出の増減」を表す(マイナス=支出減)ため、totalExpenseからは減算する
    const totalExpense = totalExpenseOf(expenses) - expenseEventsTotal
    const annualCashFlow = income - totalExpense

    const oneTime = (a.oneTimeInvestments ?? []).filter(o => o.year === year).reduce((s, o) => s + o.amount, 0)
    const contribution = a.annualInvestmentContribution + oneTime
    const investmentReturn = invest * r
    invest = invest + contribution + investmentReturn
    cash = cash + annualCashFlow - contribution

    // 生活防衛資金(§emergency-fund-drawdown): 現金残高が閾値を下回ったら投資残高を取り崩して補填する。
    // 総資産(cash+invest)は変わらない。投資残高で賄いきれない場合は0円まで取り崩し、現金は閾値未満のまま残す。
    if (cash < a.emergencyFundCash) {
      const shortfall = a.emergencyFundCash - cash
      const drawdown = Math.min(shortfall, Math.max(invest, 0))
      invest -= drawdown
      cash += drawdown
    }

    // 実績があれば年末残高を上書き（最新実績から翌年へ繰り越し＝自動リベース）
    const actual = actualByYear.get(year)
    let isActual = false
    let rowContribution: number | null = contribution
    let rowReturn: number | null = investmentReturn
    if (actual) {
      invest = actual.investmentBalance
      cash = actual.cashBalance
      isActual = true
      rowContribution = null
      rowReturn = null
    }
    const totalAssets = cash + invest

    // コーストFIRE: 固定目標額(§22)を、シナリオ利回りとは独立の固定利回りで現在価値割引する
    const coastFireTarget = a.coastFireTargetAmount ?? 40_000_000
    const coastFireTargetYear = inputs.members.primary.birthYear + (a.coastFireTargetAge ?? 65)
    const coastFireR = (a.coastFireReturnRate ?? 4) / 100
    const yearsToCoastFireTarget = Math.max(0, coastFireTargetYear - year)
    const coastFireNumber = coastFireTarget / Math.pow(1 + coastFireR, yearsToCoastFireTarget)

    rows.push({
      year,
      agePrimary: ageAt(inputs.members.primary.birthYear, inputs.members.primary.birthMonth, year),
      ageSpouse: inputs.members.spouse ? ageAt(inputs.members.spouse.birthYear, inputs.members.spouse.birthMonth, year) : null,
      agesChildren: inputs.members.children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
      income, expenses, totalExpense, annualCashFlow,
      investmentContribution: rowContribution, investmentReturn: rowReturn,
      investmentBalance: invest, cashBalance: cash, totalAssets,
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual,
    })
  }
  return rows
}
