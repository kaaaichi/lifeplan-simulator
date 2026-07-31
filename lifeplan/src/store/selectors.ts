import type { HouseholdDoc, Scenario } from '../persistence/types'
import type { Inputs, YearRow, Actual } from '../types'
import type { VariancePoint } from '../engine/variance'
import { simulate, resolveStartingBalances } from '../engine/simulate'
import { requiredMonthlyInvestment } from '../engine/goalSeek'
import { ageAt, gradeIndexAt } from '../engine/ageGrade'
import { computeVariance } from '../engine/variance'
import { computeAssetBenchmark, type AssetBenchmarkResult } from '../engine/assetBenchmark'
import { lifeplanMaster } from '../masterData'

const SCHOOL_GRADE_AGES = [6, 12, 15, 18]

export interface KpiSummary {
  currentTotalAssets: number
  currentInvestmentBalance: number
  currentCashBalance: number
  endTotalAssets: number
  assetsDepletionYear: number | null
  requiredMonthlyInvestment: number | null
  coastFireRatio: number
  coastFireNumber: number
}

export interface EventMarker {
  year: number
  label: string
  kind: 'appliance' | 'home' | 'retirement' | 'pension' | 'school'
}

export type LifeStageEventKind =
  | 'nurseryEntry' // 保育園入園(1歳になる年の4月)
  | 'nurseryFree' // 保育園無償化(4歳になる年の4月)
  | 'elementary' // 小学校入学(学齢index 6)
  | 'junior' // 中学校入学(学齢index 12)
  | 'high' // 高校入学(学齢index 15)
  | 'university' // 大学入学(学齢index 18)
  | 'graduate' // 大学院入学 or 大学卒業(学齢index 22)
  | 'financialEvent' // FinancialEvent(旅行・車購入等のwhat-ifイベント)のstartYear

export interface LifeStageEvent {
  year: number
  childName: string | null
  label: string
  kind: LifeStageEventKind
}

export interface ChartPoint {
  year: number
  age: number
  central: number
  optimistic: number
  pessimistic: number
  band: number
  isActual: boolean
}

export interface DashboardData {
  scenario: Scenario
  central: YearRow[]
  optimistic: YearRow[]
  pessimistic: YearRow[]
  /** central を残高だけ「年始時点」に付け替えた表示用系列(§19)。フロー系(収入/支出/年齢)は central と同じ。 */
  centralYearStart: YearRow[]
  kpi: KpiSummary
  variance: VariancePoint[] | null
  eventMarkers: EventMarker[]
  lifeStageEvents: LifeStageEvent[]
  chartSeries: ChartPoint[]
  /**
   * baseYear より前の参考実績(§16.9)から合成した行(§20)。全グラフ・年次一覧表・内訳タブの先頭に足して
   * 過去の実績を表示するために使う。期間セレクターの影響を受けない(常に表示)。KPI計算には使わない
   * (computeKpiSummary は centralYearStart のみを見る。historicalRows は baseYear より前で必ず古いため)。
   */
  historicalRows: YearRow[]
}

export interface PreviewData {
  chartSeries: ChartPoint[]
  historicalRows: YearRow[]
  eventMarkers: EventMarker[]
  kpi: KpiSummary
}

export function selectActiveScenario(doc: HouseholdDoc): Scenario {
  const scenario = doc.scenarios.find(s => s.id === doc.activeScenarioId)
  if (!scenario) throw new Error(`active scenario not found: ${doc.activeScenarioId}`)
  return scenario
}

function simulateAll(inputs: Inputs, actuals: Actual[]) {
  const central = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.investmentReturnRate })
  const optimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRateOptimistic })
  const pessimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRatePessimistic })
  return { central, optimistic, pessimistic }
}

/**
 * central の残高系フィールド(totalAssets/cashBalance/investmentBalance/investmentRatio/isActual)を
 * 1つ前の行の値に付け替え、「その年の年始時点」の残高として見せる(§19)。収入/支出/年齢などフロー系は
 * central と同じ年のまま変更しない(＝残高は年始・フローはその年、という一般的な会計の見せ方)。
 * 先頭行(baseYear)の年始残高は resolveStartingBalances で解決する(§23: actuals に baseYear-1
 * の実績があればそれを、無ければ inputs.assets を使う)。
 */
export function toYearStartRows(central: YearRow[], inputs: Inputs, actuals?: Actual[]): YearRow[] {
  const start = resolveStartingBalances(inputs, actuals)
  const startTotal = start.cashBalance + start.investmentBalance
  const initialBalance = {
    cashBalance: start.cashBalance,
    investmentBalance: start.investmentBalance,
    totalAssets: startTotal,
    investmentRatio: startTotal !== 0 ? start.investmentBalance / startTotal : 0,
    isActual: start.isActual,
  }

  return central.map((row, i) => {
    const balance = i === 0 ? initialBalance : central[i - 1]!
    return {
      ...row,
      cashBalance: balance.cashBalance,
      investmentBalance: balance.investmentBalance,
      totalAssets: balance.totalAssets,
      investmentRatio: balance.investmentRatio,
      isActual: balance.isActual,
    }
  })
}

export function selectDashboardData(doc: HouseholdDoc): DashboardData {
  const scenario = selectActiveScenario(doc)
  const inputs = scenario.inputs
  const actuals = doc.actuals

  const { central, optimistic, pessimistic } = simulateAll(inputs, actuals)
  const historicalRows = buildHistoricalRows(actuals, inputs)
  const centralYearStart = toYearStartRows(central, inputs, actuals)
  const optimisticYearStart = toYearStartRows(optimistic, inputs, actuals)
  const pessimisticYearStart = toYearStartRows(pessimistic, inputs, actuals)

  return {
    scenario,
    central,
    optimistic,
    pessimistic,
    centralYearStart,
    kpi: computeKpiSummary(inputs, central, centralYearStart, actuals),
    variance: doc.baseline ? computeVariance(doc.baseline, actuals) : null,
    eventMarkers: computeEventMarkers(central, inputs),
    lifeStageEvents: computeLifeStageEvents(central, inputs),
    chartSeries: buildChartSeries(centralYearStart, optimisticYearStart, pessimisticYearStart),
    historicalRows,
  }
}

/** 入力フォームの即時プレビュー用: ドラフト Inputs から直接派生値を計算する(§14.3 step 3) */
export function selectPreviewData(inputs: Inputs, actuals: Actual[]): PreviewData {
  const { central, optimistic, pessimistic } = simulateAll(inputs, actuals)
  const historicalRows = buildHistoricalRows(actuals, inputs)
  const centralYearStart = toYearStartRows(central, inputs, actuals)
  const optimisticYearStart = toYearStartRows(optimistic, inputs, actuals)
  const pessimisticYearStart = toYearStartRows(pessimistic, inputs, actuals)
  return {
    chartSeries: buildChartSeries(centralYearStart, optimisticYearStart, pessimisticYearStart),
    historicalRows,
    eventMarkers: computeEventMarkers(central, inputs),
    kpi: computeKpiSummary(inputs, central, centralYearStart, actuals),
  }
}

/**
 * central(生, 年末基準) と centralYearStart(年始表示用) の両方を受け取る。
 * endTotalAssets だけは centralYearStart だと最終年の1年分が反映されないため central(真の年末値)を使う。
 */
export function computeKpiSummary(
  inputs: Inputs, central: YearRow[], centralYearStart: YearRow[], actuals?: Actual[],
): KpiSummary {
  const firstRow = centralYearStart[0]
  if (!firstRow) throw new Error('simulate returned an empty series')
  const lastRow = central[central.length - 1]!
  const latestActual = [...centralYearStart].reverse().find(r => r.isActual)
  const currentRow = latestActual ?? firstRow
  const depletion = centralYearStart.find(r => r.totalAssets < 0)

  return {
    currentTotalAssets: currentRow.totalAssets,
    currentInvestmentBalance: currentRow.investmentBalance,
    currentCashBalance: currentRow.cashBalance,
    endTotalAssets: lastRow.totalAssets,
    assetsDepletionYear: depletion?.year ?? null,
    requiredMonthlyInvestment: requiredMonthlyInvestment(inputs, lifeplanMaster, { actuals }),
    coastFireRatio: currentRow.coastFireNumber !== 0 ? currentRow.investmentBalance / currentRow.coastFireNumber : 0,
    coastFireNumber: currentRow.coastFireNumber,
  }
}

/** 現在の総資産を全国・同年代の公的統計と比較した推定偏差値を算出する(household-asset-benchmark) */
export function selectAssetBenchmark(data: DashboardData): AssetBenchmarkResult {
  return computeAssetBenchmark(data.kpi.currentTotalAssets, data.central[0]!.agePrimary)
}

export function computeEventMarkers(rows: YearRow[], inputs: Inputs): EventMarker[] {
  const markers: EventMarker[] = []
  for (const row of rows) {
    if (row.expenses.家電 > 0) markers.push({ year: row.year, label: '家電買い替え', kind: 'appliance' })
    if (row.expenses.住宅大型 > 0) markers.push({ year: row.year, label: '住宅大型支出', kind: 'home' })
    if (row.agePrimary === inputs.members.primary.workUntilAge) markers.push({ year: row.year, label: '退職', kind: 'retirement' })
    if (row.agePrimary === inputs.assumptions.pensionStartAge) markers.push({ year: row.year, label: '年金開始', kind: 'pension' })
    if (row.agesChildren.some(age => SCHOOL_GRADE_AGES.includes(age))) {
      markers.push({ year: row.year, label: '子の進学/卒業', kind: 'school' })
    }
  }
  return markers
}

// 大学院入学 or 大学卒業の学齢index(大4=21 の翌年度)。gradeIndexAt は 21 で頭打ちのため raw index で判定する。
const GRADUATE_GRADE_INDEX = 22

/**
 * 年次一覧表向けの教育・育児ライフステージイベントを子ごとに判定する。
 * AssetChart の縦マーカー(computeEventMarkers)とは独立したロジック。
 * - 保育園入園: 1歳になる年 / 保育園無償化: 4歳になる年
 * - 小/中/高/大入学: 学齢index(gradeIndexAt, 4/1基準・早生まれ補正込み) = 6/12/15/18
 * - 大学院入学 or 卒業: 学齢index 22(大学卒業の3月と大学院入学の4月は同一年)
 */
export function computeLifeStageEvents(rows: YearRow[], inputs: Inputs): LifeStageEvent[] {
  const events: LifeStageEvent[] = []
  for (const row of rows) {
    for (const c of inputs.members.children) {
      const push = (kind: LifeStageEventKind, label: string) =>
        events.push({ year: row.year, childName: c.name, label, kind })

      if (row.year === c.birthYear + 1) push('nurseryEntry', '保育園入園')
      if (row.year === c.birthYear + 4) push('nurseryFree', '保育園無償化')

      const gi = gradeIndexAt(c.birthYear, c.birthMonth, row.year)
      if (gi === 6) push('elementary', '小学校入学')
      if (gi === 12) push('junior', '中学校入学')
      if (gi === 15) push('high', '高校入学')
      if (c.schooling.university !== 'なし') {
        if (gi === 18) push('university', '大学入学')
        // gradeIndexAt は範囲外(>21)で -1 を返すため、同じ式(4/1時点の学齢)で raw index を計算する
        const rawIndex = row.year - c.birthYear - (c.birthMonth >= 4 ? 1 : 0)
        if (rawIndex === GRADUATE_GRADE_INDEX) push('graduate', '大学院入学 or 卒業')
      }
    }
    for (const e of inputs.financialEvents ?? []) {
      if (row.year === e.startYear) {
        events.push({ year: row.year, childName: null, label: e.label, kind: 'financialEvent' })
      }
    }
  }
  return events
}

const ZERO_EXPENSES = {
  食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0,
  こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0,
}

/**
 * baseYear より前の参考実績(§16.9)を、全グラフ・年次一覧表・内訳タブの先頭に足す「過去の実績」行にする(§20)。
 * 収入/支出/年齢などのフロー値は不明なため 0/null で埋める(UI側は isHistoricalReference を見て「-」表示にする)。
 * 実測値は不確実性がないため optimistic=pessimistic=central になる(buildChartSeries に渡すと band=0 になる)。
 * baseYear の直前年(baseYear-1)の実績は centralYearStart[0](inputs.assets 由来)と同じ時点を指すため、
 * 二重に点が乗らないよう除外する(inputs.assets 側を正とする)。
 */
export function buildHistoricalRows(actuals: Actual[], inputs: Inputs): YearRow[] {
  const { primary, spouse, children } = inputs.members
  return actuals
    .filter(a => a.year < inputs.baseYear - 1)
    .slice()
    .sort((a, b) => a.year - b.year)
    .map(a => {
      const year = a.year + 1
      const totalAssets = a.cashBalance + a.investmentBalance
      return {
        year,
        agePrimary: ageAt(primary.birthYear, primary.birthMonth, year),
        ageSpouse: spouse ? ageAt(spouse.birthYear, spouse.birthMonth, year) : null,
        agesChildren: children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
        income: 0,
        expenses: ZERO_EXPENSES,
        totalExpense: 0,
        annualCashFlow: 0,
        investmentContribution: null,
        investmentReturn: null,
        investmentBalance: a.investmentBalance,
        cashBalance: a.cashBalance,
        totalAssets,
        investmentRatio: totalAssets !== 0 ? a.investmentBalance / totalAssets : 0,
        coastFireNumber: 0,
        isActual: true,
        isHistoricalReference: true,
      }
    })
}

export function buildChartSeries(central: YearRow[], optimistic: YearRow[], pessimistic: YearRow[]): ChartPoint[] {
  return central.map((row, i) => {
    const opt = optimistic[i]!.totalAssets
    const pess = pessimistic[i]!.totalAssets
    return {
      year: row.year,
      age: row.agePrimary,
      central: row.totalAssets,
      optimistic: opt,
      pessimistic: pess,
      band: opt - pess,
      isActual: row.isActual,
    }
  })
}

export type DashboardPeriod = 'to65' | 'full' | 'y10' | 'y20'

const PERIOD_TO65_MAX_AGE = 65
const PERIOD_YEAR_COUNTS: Record<'y10' | 'y20', number> = { y10: 10, y20: 20 }

export interface PeriodFilteredData {
  chartSeries: ChartPoint[]
  central: YearRow[]
  centralYearStart: YearRow[]
  eventMarkers: EventMarker[]
  lifeStageEvents: LifeStageEvent[]
}

function passthroughPeriodData(data: DashboardData): PeriodFilteredData {
  return {
    chartSeries: data.chartSeries,
    central: data.central,
    centralYearStart: data.centralYearStart,
    eventMarkers: data.eventMarkers,
    lifeStageEvents: data.lifeStageEvents,
  }
}

function filterPeriodDataByCutoffYear(data: DashboardData, cutoffYear: number): PeriodFilteredData {
  return {
    chartSeries: data.chartSeries.filter(p => p.year <= cutoffYear),
    central: data.central.filter(r => r.year <= cutoffYear),
    centralYearStart: data.centralYearStart.filter(r => r.year <= cutoffYear),
    eventMarkers: data.eventMarkers.filter(m => m.year <= cutoffYear),
    lifeStageEvents: data.lifeStageEvents.filter(e => e.year <= cutoffYear),
  }
}

/**
 * ダッシュボード表示期間セレクター用(§18.4/§21.3)。
 * 'to65' は agePrimary<=65 の年、'y10'/'y20' は baseYear からの経過年数で打ち切る。
 */
export function selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): PeriodFilteredData {
  if (period === 'full') {
    return passthroughPeriodData(data)
  }

  if (period === 'y10' || period === 'y20') {
    const baseYear = data.central[0]!.year
    const cutoffYear = baseYear + PERIOD_YEAR_COUNTS[period] - 1
    return filterPeriodDataByCutoffYear(data, cutoffYear)
  }

  const cutoffRow = [...data.central].reverse().find(r => r.agePrimary <= PERIOD_TO65_MAX_AGE)
  if (!cutoffRow) {
    // baseYear時点で既に65歳を超えている場合は全期間にフォールバックする(空グラフを避ける)
    return passthroughPeriodData(data)
  }

  return filterPeriodDataByCutoffYear(data, cutoffRow.year)
}

export interface ScenarioSummary {
  endTotalAssets: number
  requiredMonthlyInvestment: number | null
}

/** シナリオ管理画面のカード要約用(§15.5)。中央系列のみ計算する(楽観/悲観は不要) */
export function selectScenarioSummary(inputs: Inputs, actuals: Actual[]): ScenarioSummary {
  const central = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.investmentReturnRate })
  const kpi = computeKpiSummary(inputs, central, toYearStartRows(central, inputs, actuals), actuals)
  return { endTotalAssets: kpi.endTotalAssets, requiredMonthlyInvestment: kpi.requiredMonthlyInvestment }
}
