import { describe, it, expect } from 'vitest'
import {
  selectDashboardData,
  selectPreviewData,
  computeKpiSummary,
  computeEventMarkers,
  computeLifeStageEvents,
  buildChartSeries,
  buildHistoricalRows,
  selectScenarioSummary,
  selectPeriodFilteredData,
  toYearStartRows,
} from '../../src/store/selectors'
import type { Inputs, Child } from '../../src/types'
import { createDefaultDoc, toDoc } from '../../src/persistence/doc'
import { simulate } from '../../src/engine/simulate'
import { lifeplanMaster } from '../../src/masterData'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'

describe('selectDashboardData', () => {
  it('中央/楽観/悲観の3系列と KPI・イベントマーカー・チャート系列を返す', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)

    expect(data.central.length).toBeGreaterThan(0)
    expect(data.optimistic.length).toBe(data.central.length)
    expect(data.pessimistic.length).toBe(data.central.length)
    expect(data.centralYearStart.length).toBe(data.central.length)
    expect(data.variance).toBeNull() // baseline 未キャプチャ
    expect(data.chartSeries.length).toBe(data.central.length)
    expect(data.kpi.endTotalAssets).toBe(data.central[data.central.length - 1]!.totalAssets)
  })
})

describe('toYearStartRows', () => {
  it('先頭行の残高は inputs.assets(baseYear年始の入力資産)から算出する', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const yearStart = toYearStartRows(central, placeholderInputs)

    const startCash = placeholderInputs.assets.bankAccounts.reduce((s, x) => s + x.balance, 0)
    const startInvest = placeholderInputs.assets.investments.reduce((s, x) => s + x.balance, 0)
    expect(yearStart[0]!.cashBalance).toBe(startCash)
    expect(yearStart[0]!.investmentBalance).toBe(startInvest)
    expect(yearStart[0]!.totalAssets).toBe(startCash + startInvest)
    expect(yearStart[0]!.isActual).toBe(false)
  })

  it('2行目以降の残高は1つ前の central 行の残高と一致する(年始=前年年末)', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const yearStart = toYearStartRows(central, placeholderInputs)

    expect(yearStart[1]!.totalAssets).toBe(central[0]!.totalAssets)
    expect(yearStart[1]!.cashBalance).toBe(central[0]!.cashBalance)
    expect(yearStart[1]!.investmentBalance).toBe(central[0]!.investmentBalance)
  })

  it('フロー系(収入/支出/年齢)は central と同じ年のまま変更しない', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const yearStart = toYearStartRows(central, placeholderInputs)

    for (let i = 0; i < central.length; i++) {
      expect(yearStart[i]!.year).toBe(central[i]!.year)
      expect(yearStart[i]!.income).toBe(central[i]!.income)
      expect(yearStart[i]!.totalExpense).toBe(central[i]!.totalExpense)
      expect(yearStart[i]!.annualCashFlow).toBe(central[i]!.annualCashFlow)
      expect(yearStart[i]!.agePrimary).toBe(central[i]!.agePrimary)
    }
  })

  it('actualsにbaseYear-1の記録があれば、先頭行の残高はその実績になり isActual=true になる(§23)', () => {
    const actuals = [{ year: placeholderInputs.baseYear - 1, cashBalance: 111, investmentBalance: 222 }]
    const central = simulate(placeholderInputs, lifeplanMaster, { actuals })
    const yearStart = toYearStartRows(central, placeholderInputs, actuals)

    expect(yearStart[0]!.cashBalance).toBe(111)
    expect(yearStart[0]!.investmentBalance).toBe(222)
    expect(yearStart[0]!.totalAssets).toBe(333)
    expect(yearStart[0]!.isActual).toBe(true)
  })
})

describe('buildHistoricalRows', () => {
  it('baseYear-1 より前の実績を年始換算(+1年)した YearRow 列にする', () => {
    const rows = buildHistoricalRows(
      [
        { year: placeholderInputs.baseYear - 3, cashBalance: 100, investmentBalance: 200 },
        { year: placeholderInputs.baseYear - 2, cashBalance: 300, investmentBalance: 400 },
      ],
      placeholderInputs,
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]!.year).toBe(placeholderInputs.baseYear - 2)
    expect(rows[0]!.cashBalance).toBe(100)
    expect(rows[0]!.investmentBalance).toBe(200)
    expect(rows[0]!.totalAssets).toBe(300)
    expect(rows[0]!.isActual).toBe(true)
    expect(rows[0]!.isHistoricalReference).toBe(true)
    expect(rows[1]!.year).toBe(placeholderInputs.baseYear - 1)
    expect(rows[1]!.totalAssets).toBe(700)
  })

  it('フロー系(収入/支出/収支)は不明なので 0/null で埋める', () => {
    const rows = buildHistoricalRows(
      [{ year: placeholderInputs.baseYear - 3, cashBalance: 100, investmentBalance: 200 }],
      placeholderInputs,
    )
    expect(rows[0]!.income).toBe(0)
    expect(rows[0]!.totalExpense).toBe(0)
    expect(rows[0]!.annualCashFlow).toBe(0)
    expect(rows[0]!.investmentContribution).toBeNull()
    expect(rows[0]!.investmentReturn).toBeNull()
  })

  it('baseYear-1 の実績は centralYearStart[0](inputs.assets)と同じ時点のため除外する', () => {
    const rows = buildHistoricalRows(
      [{ year: placeholderInputs.baseYear - 1, cashBalance: 100, investmentBalance: 200 }],
      placeholderInputs,
    )
    expect(rows).toHaveLength(0)
  })

  it('baseYear 以降の実績(simulateに反映済み)は含めない', () => {
    const rows = buildHistoricalRows(
      [{ year: placeholderInputs.baseYear, cashBalance: 100, investmentBalance: 200 }],
      placeholderInputs,
    )
    expect(rows).toHaveLength(0)
  })

  it('年の昇順でソートして返す', () => {
    const rows = buildHistoricalRows(
      [
        { year: placeholderInputs.baseYear - 2, cashBalance: 300, investmentBalance: 400 },
        { year: placeholderInputs.baseYear - 4, cashBalance: 100, investmentBalance: 200 },
      ],
      placeholderInputs,
    )
    expect(rows.map(r => r.year)).toEqual([placeholderInputs.baseYear - 3, placeholderInputs.baseYear - 1])
  })
})

describe('selectDashboardData: historicalRows', () => {
  it('baseYear より前の参考実績が過去データとして返る', () => {
    const doc = toDoc({
      baseYear: placeholderInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: placeholderInputs }],
      actuals: [{ year: placeholderInputs.baseYear - 3, cashBalance: 100, investmentBalance: 200 }],
    })
    const data = selectDashboardData(doc)

    expect(data.historicalRows).toHaveLength(1)
    expect(data.historicalRows[0]!.year).toBe(placeholderInputs.baseYear - 2)
    expect(data.historicalRows[0]!.totalAssets).toBe(300)
    // chartSeries/centralYearStart自体は historicalRows を含まず central と同じ長さのまま(KPI計算に影響しない)
    expect(data.chartSeries.length).toBe(data.central.length)
    expect(data.centralYearStart.length).toBe(data.central.length)
  })

  it('baseYear-2年以前の参考実績だけではbaseYear行はisActual=trueにならない(§23: baseYear-1自体の実績が無いため、より正直な表示になる)', () => {
    const doc = toDoc({
      baseYear: placeholderInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: placeholderInputs }],
      actuals: [{ year: placeholderInputs.baseYear - 3, cashBalance: 100, investmentBalance: 200 }],
    })
    const data = selectDashboardData(doc)
    expect(data.centralYearStart[0]!.isActual).toBe(false)
    expect(data.chartSeries[0]!.isActual).toBe(false)
  })

  it('baseYear-1(今年の年始)の実績があればbaseYear行はisActual=trueになる(§23)', () => {
    const doc = toDoc({
      baseYear: placeholderInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: placeholderInputs }],
      actuals: [{ year: placeholderInputs.baseYear - 1, cashBalance: 100, investmentBalance: 200 }],
    })
    const data = selectDashboardData(doc)
    expect(data.centralYearStart[0]!.isActual).toBe(true)
    expect(data.chartSeries[0]!.isActual).toBe(true)
    expect(data.centralYearStart[0]!.totalAssets).toBe(300)
  })

  it('過去の参考実績が無ければ baseYear行は isActual=false のまま', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    expect(data.historicalRows).toHaveLength(0)
    expect(data.centralYearStart[0]!.isActual).toBe(false)
  })
})

describe('computeKpiSummary', () => {
  it('資産が尽きない場合 assetsDepletionYear は null', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const kpi = computeKpiSummary(placeholderInputs, central, toYearStartRows(central, placeholderInputs))
    const neverNegative = central.every(r => r.totalAssets >= 0)
    expect(kpi.assetsDepletionYear === null).toBe(neverNegative)
  })

  it('endTotalAssets は centralYearStart ではなく central(真の最終年末)から取る', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const centralYearStart = toYearStartRows(central, placeholderInputs)
    const kpi = computeKpiSummary(placeholderInputs, central, centralYearStart)

    expect(kpi.endTotalAssets).toBe(central[central.length - 1]!.totalAssets)
    expect(kpi.endTotalAssets).not.toBe(centralYearStart[centralYearStart.length - 1]!.totalAssets)
  })

  it('currentTotalAssets は centralYearStart の先頭(=baseYear年始の入力資産)を使う(実績未記録時)', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const centralYearStart = toYearStartRows(central, placeholderInputs)
    const kpi = computeKpiSummary(placeholderInputs, central, centralYearStart)

    expect(kpi.currentTotalAssets).toBe(centralYearStart[0]!.totalAssets)
  })

  it('coastFireNumber は coastFireRatio の算出に使った currentRow.coastFireNumber をそのまま返す', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const centralYearStart = toYearStartRows(central, placeholderInputs)
    const kpi = computeKpiSummary(placeholderInputs, central, centralYearStart)

    expect(kpi.coastFireNumber).toBe(centralYearStart[0]!.coastFireNumber)
    expect(kpi.coastFireRatio).toBeCloseTo(centralYearStart[0]!.investmentBalance / kpi.coastFireNumber)
  })

  it('actuals(baseYear-1)を渡すと、currentTotalAssets・coastFireRatio・requiredMonthlyInvestment全てがそれを起点にする(§23)', () => {
    const actuals = [{ year: placeholderInputs.baseYear - 1, cashBalance: 50_000_000, investmentBalance: 50_000_000 }]
    const central = simulate(placeholderInputs, lifeplanMaster, { actuals })
    const centralYearStart = toYearStartRows(central, placeholderInputs, actuals)
    const kpiWithActuals = computeKpiSummary(placeholderInputs, central, centralYearStart, actuals)

    const centralWithout = simulate(placeholderInputs, lifeplanMaster)
    const centralYearStartWithout = toYearStartRows(centralWithout, placeholderInputs)
    const kpiWithout = computeKpiSummary(placeholderInputs, centralWithout, centralYearStartWithout)

    expect(kpiWithActuals.currentTotalAssets).toBe(100_000_000)
    expect(kpiWithActuals.currentTotalAssets).not.toBe(kpiWithout.currentTotalAssets)
    expect(kpiWithActuals.coastFireRatio).toBeGreaterThan(kpiWithout.coastFireRatio)
    expect(kpiWithActuals.requiredMonthlyInvestment).not.toBe(kpiWithout.requiredMonthlyInvestment)
  })
})

describe('computeEventMarkers', () => {
  it('退職年に退職マーカーを含む', () => {
    const rows = simulate(placeholderInputs, lifeplanMaster)
    const markers = computeEventMarkers(rows, placeholderInputs)
    const retirementYear = placeholderInputs.members.primary.birthYear + placeholderInputs.members.primary.workUntilAge
    expect(markers.some(m => m.kind === 'retirement' && m.year === retirementYear)).toBe(true)
  })
})

describe('computeLifeStageEvents', () => {
  function makeChild(overrides: Partial<Child>): Child {
    return {
      id: 'c1', name: '第一子', birthYear: 2024, birthMonth: 4,
      schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 0 },
      allowanceMonthly: 0, phoneFromGrade: 6,
      ...overrides,
    }
  }

  function makeInputs(children: Child[]): Inputs {
    const inputs = structuredClone(placeholderInputs)
    inputs.members.children = children
    return inputs
  }

  function eventsFor(children: Child[]) {
    const inputs = makeInputs(children)
    const rows = simulate(inputs, lifeplanMaster)
    return computeLifeStageEvents(rows, inputs)
  }

  it('遅生まれ(4月生まれ)の子: 各入学・無償化イベントを正しい年に返す', () => {
    // 2024/4生まれ: 学齢index = year - 2024 - 1
    const events = eventsFor([makeChild({ birthYear: 2024, birthMonth: 4 })])
    const byKind = (kind: string) => events.filter(e => e.kind === kind).map(e => e.year)

    expect(byKind('nurseryFree')).toEqual([2028]) // 4歳になる年
    expect(byKind('elementary')).toEqual([2031]) // 6歳になった後の4月
    expect(byKind('junior')).toEqual([2037])
    expect(byKind('high')).toEqual([2040])
    expect(byKind('university')).toEqual([2043])
    expect(byKind('graduate')).toEqual([2047]) // 大学院入学 or 卒業(22歳の年度)
  })

  it('早生まれ(2月生まれ)の子: 学齢が1年前倒しになる', () => {
    // 2031/2生まれ: 学齢index = year - 2031
    const events = eventsFor([makeChild({ birthYear: 2031, birthMonth: 2 })])
    const byKind = (kind: string) => events.filter(e => e.kind === kind).map(e => e.year)

    expect(byKind('nurseryEntry')).toEqual([2032]) // 1歳になる年
    expect(byKind('nurseryFree')).toEqual([2035])
    expect(byKind('elementary')).toEqual([2037])
    expect(byKind('junior')).toEqual([2043])
    expect(byKind('high')).toEqual([2046])
    expect(byKind('university')).toEqual([2049])
    expect(byKind('graduate')).toEqual([2053])
  })

  it('大学「なし」の子: 大学入学・大学院イベントを返さない(高校入学までは返す)', () => {
    const events = eventsFor([
      makeChild({ schooling: { elementary: '公立', junior: '公立', high: '公立', university: 'なし', remittanceMonthly: 0 } }),
    ])
    expect(events.some(e => e.kind === 'high')).toBe(true)
    expect(events.some(e => e.kind === 'university')).toBe(false)
    expect(events.some(e => e.kind === 'graduate')).toBe(false)
  })

  it('シミュレーション範囲外(baseYear より前)のイベントは含めない', () => {
    // 2024/4生まれ: 保育園入園=2025 は baseYear=2026 より前なので落ちる
    const events = eventsFor([makeChild({ birthYear: 2024, birthMonth: 4 })])
    expect(events.some(e => e.kind === 'nurseryEntry')).toBe(false)
    expect(events.every(e => e.year >= 2026)).toBe(true)
  })

  it('複数の子を子ごとに判定し、childName とラベルを付ける', () => {
    const events = eventsFor([
      makeChild({ id: 'c1', name: '第一子', birthYear: 2024, birthMonth: 4 }),
      makeChild({ id: 'c2', name: '第二子', birthYear: 2027, birthMonth: 6 }),
    ])
    const c2Elementary = events.find(e => e.childName === '第二子' && e.kind === 'elementary')
    expect(c2Elementary?.year).toBe(2034)
    expect(c2Elementary?.label).toBe('小学校入学')
    const c2Nursery = events.find(e => e.childName === '第二子' && e.kind === 'nurseryEntry')
    expect(c2Nursery?.year).toBe(2028)
    expect(c2Nursery?.label).toBe('保育園入園')
    const c1Grad = events.find(e => e.childName === '第一子' && e.kind === 'graduate')
    expect(c1Grad?.label).toBe('大学院入学 or 卒業')
  })

  it('selectDashboardData が lifeStageEvents を含む', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    expect(Array.isArray(data.lifeStageEvents)).toBe(true)
  })

  it('financialEventsのstartYearに、childNameなしのfinancialEventイベントを追加する', () => {
    const inputs = makeInputs([])
    inputs.financialEvents = [
      { id: 'trip', label: 'ディズニークルーズ＋アメリカ旅行(WDW)', kind: '支出', startYear: 2029, endYear: 2029, annualAmount: -3_000_000 },
    ]
    const rows = simulate(inputs, lifeplanMaster)
    const events = computeLifeStageEvents(rows, inputs)

    const tripEvent = events.find(e => e.kind === 'financialEvent')
    expect(tripEvent).toBeDefined()
    expect(tripEvent?.year).toBe(2029)
    expect(tripEvent?.label).toBe('ディズニークルーズ＋アメリカ旅行(WDW)')
    expect(tripEvent?.childName).toBeNull()
  })

  it('financialEventsが期間イベント(startYear!==endYear)の場合、startYearの年にだけ表示する', () => {
    const inputs = makeInputs([])
    inputs.financialEvents = [
      { id: 'car-loan', label: '車ローン返済', kind: '支出', startYear: 2027, endYear: 2032, annualAmount: -600_000 },
    ]
    const rows = simulate(inputs, lifeplanMaster)
    const events = computeLifeStageEvents(rows, inputs)

    const tripEvents = events.filter(e => e.kind === 'financialEvent')
    expect(tripEvents.map(e => e.year)).toEqual([2027])
  })

  it('financialEventsが未指定でもエラーにならない', () => {
    const events = eventsFor([])
    expect(events.filter(e => e.kind === 'financialEvent')).toEqual([])
  })
})

describe('buildChartSeries', () => {
  it('中央/楽観/悲観から year ごとの band(=optimistic-pessimistic) を計算する', () => {
    const central = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.investmentReturnRate })
    const optimistic = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.returnRateOptimistic })
    const pessimistic = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.returnRatePessimistic })
    const series = buildChartSeries(central, optimistic, pessimistic)
    expect(series[0]!.band).toBeCloseTo(optimistic[0]!.totalAssets - pessimistic[0]!.totalAssets)
  })
})

describe('selectPreviewData', () => {
  it('matches the dashboard derivation for the same inputs and actuals', () => {
    const doc = toDoc({
      baseYear: placeholderInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: placeholderInputs }],
      actuals: [],
    })
    const dashboard = selectDashboardData(doc)
    const preview = selectPreviewData(placeholderInputs, [])

    expect(preview.chartSeries).toEqual(dashboard.chartSeries)
    expect(preview.eventMarkers).toEqual(dashboard.eventMarkers)
    expect(preview.kpi).toEqual(dashboard.kpi)
  })
})

describe('selectScenarioSummary', () => {
  it('matches the KPI values selectDashboardData computes for the same scenario', () => {
    const doc = createDefaultDoc()
    const dashboard = selectDashboardData(doc)
    const summary = selectScenarioSummary(doc.scenarios[0]!.inputs, doc.actuals)

    expect(summary.endTotalAssets).toBe(dashboard.kpi.endTotalAssets)
    expect(summary.requiredMonthlyInvestment).toBe(dashboard.kpi.requiredMonthlyInvestment)
  })
})

describe('selectPeriodFilteredData', () => {
  it("'to65': central/chartSeries/eventMarkers/lifeStageEvents を agePrimary<=65 の年でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'to65')

    expect(filtered.central.length).toBeLessThan(data.central.length)
    expect(filtered.central.every(r => r.agePrimary <= 65)).toBe(true)
    expect(filtered.chartSeries.length).toBe(filtered.central.length)

    const cutoffYear = filtered.central[filtered.central.length - 1]!.year
    expect(filtered.eventMarkers.every(m => m.year <= cutoffYear)).toBe(true)
    expect(filtered.lifeStageEvents.every(e => e.year <= cutoffYear)).toBe(true)
  })

  it("'full': フィルタなしで central/chartSeries/eventMarkers/lifeStageEvents をそのまま返す", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'full')

    expect(filtered.central).toEqual(data.central)
    expect(filtered.chartSeries).toEqual(data.chartSeries)
    expect(filtered.eventMarkers).toEqual(data.eventMarkers)
    expect(filtered.lifeStageEvents).toEqual(data.lifeStageEvents)
  })

  it("'to65': baseYear時点で世帯主が既に65歳を超えている場合は全期間にフォールバックする", () => {
    const inputs = structuredClone(placeholderInputs)
    inputs.members.primary.birthYear = 1950 // baseYear=2026時点で75歳超、以降も常に65歳超
    const doc = toDoc({
      baseYear: inputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs }],
      actuals: [],
    })
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'to65')

    expect(data.central.every(r => r.agePrimary > 65)).toBe(true)
    expect(filtered.central).toEqual(data.central)
  })

  it("'y10': central/centralYearStart/chartSeries/eventMarkers/lifeStageEvents を baseYearから10年分(baseYear+9まで)でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'y10')

    const baseYear = data.central[0]!.year
    expect(filtered.central).toHaveLength(10)
    expect(filtered.central[0]!.year).toBe(baseYear)
    expect(filtered.central[9]!.year).toBe(baseYear + 9)
    expect(filtered.centralYearStart).toHaveLength(10)
    expect(filtered.chartSeries.length).toBe(10)
    expect(filtered.eventMarkers.every(m => m.year <= baseYear + 9)).toBe(true)
    expect(filtered.lifeStageEvents.every(e => e.year <= baseYear + 9)).toBe(true)
  })

  it("'y20': baseYearから20年分(baseYear+19まで)でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'y20')

    const baseYear = data.central[0]!.year
    expect(filtered.central).toHaveLength(20)
    expect(filtered.central[0]!.year).toBe(baseYear)
    expect(filtered.central[19]!.year).toBe(baseYear + 19)
    expect(filtered.chartSeries.length).toBe(20)
  })
})
