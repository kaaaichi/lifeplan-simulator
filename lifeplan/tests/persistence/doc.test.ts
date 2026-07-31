import { describe, it, expect } from 'vitest'
import { validateHouseholdDoc } from '../../src/persistence/validate'
import { DocValidationError } from '../../src/persistence/errors'
import type { HouseholdDoc } from '../../src/persistence/types'
import { sampleInputs } from '../_sampleInputs'

function validDoc(): HouseholdDoc {
  return {
    schemaVersion: 1,
    baseYear: 2026,
    activeScenarioId: 'base',
    scenarios: [{ id: 'base', name: 'ベースプラン', inputs: sampleInputs }],
    actuals: [],
  }
}

describe('validateHouseholdDoc', () => {
  it('正当な doc は throw しない', () => {
    expect(() => validateHouseholdDoc(validDoc())).not.toThrow()
  })

  it('scenarios が空なら reject', () => {
    const d = validDoc()
    d.scenarios = []
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('scenario.id の重複は reject', () => {
    const d = validDoc()
    d.scenarios = [
      { id: 'base', name: 'A', inputs: sampleInputs },
      { id: 'base', name: 'B', inputs: sampleInputs },
    ]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('activeScenarioId が scenarios に無いなら reject', () => {
    const d = validDoc()
    d.activeScenarioId = 'nope'
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('baseYear が 0 以下なら reject', () => {
    const d = validDoc()
    d.baseYear = 0
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('scenario.inputs.baseYear が doc.baseYear と不一致なら reject（クロスフィールド不変条件）', () => {
    const d = validDoc()
    d.scenarios = [{ id: 'base', name: 'A', inputs: { ...sampleInputs, baseYear: 1999 } }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals が year 昇順でないなら reject', () => {
    const d = validDoc()
    d.actuals = [
      { year: 2028, cashBalance: 1, investmentBalance: 1 },
      { year: 2027, cashBalance: 1, investmentBalance: 1 },
    ]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の year 重複は reject', () => {
    const d = validDoc()
    d.actuals = [
      { year: 2027, cashBalance: 1, investmentBalance: 1 },
      { year: 2027, cashBalance: 2, investmentBalance: 2 },
    ]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の year が上限(baseYear+100)を超えるなら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 3000, cashBalance: 1, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の year が baseYear より前でも許容する（参考記録・シミュレーションには無関係）', () => {
    const d = validDoc()
    d.actuals = [{ year: d.baseYear - 2, cashBalance: 1, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })

  it('actuals の残高が NaN なら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: NaN, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の残高が Infinity なら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: Infinity, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('baseline.series が昇順でないなら reject', () => {
    const d = validDoc()
    d.baseline = {
      series: [
        { year: 2027, totalAssets: 1, investmentBalance: 1, cashBalance: 0 },
        { year: 2026, totalAssets: 1, investmentBalance: 1, cashBalance: 0 },
      ],
    }
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('baseline.series[0].year が baseYear と不一致なら reject', () => {
    const d = validDoc()
    d.baseline = { series: [{ year: 2030, totalAssets: 1, investmentBalance: 1, cashBalance: 0 }] }
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('同一シナリオ内の financialEvents.id が重複していたら reject', () => {
    const d = validDoc()
    d.scenarios[0]!.inputs.financialEvents = [
      { id: 'ev1', label: 'Event 1', kind: '収入', startYear: 2026, endYear: null, annualAmount: 100_000 },
      { id: 'ev1', label: 'Event 2', kind: '収入', startYear: 2027, endYear: null, annualAmount: 200_000 },
    ]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('異なるシナリオで同じ financialEvents.id を使っていても許容する', () => {
    const d = validDoc()
    const financialEvent: import('../../src/types').FinancialEvent = { id: 'ev1', label: 'Event', kind: '収入', startYear: 2026, endYear: null, annualAmount: 100_000 }
    d.scenarios = [
      { id: 'base', name: 'ベースプラン', inputs: { ...sampleInputs, financialEvents: [financialEvent] } },
      { id: 'alt', name: '代替プラン', inputs: { ...sampleInputs, financialEvents: [financialEvent] } },
    ]
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })

  it('financialEvents が undefined のシナリオは許容する', () => {
    const d = validDoc()
    d.scenarios[0]!.inputs.financialEvents = undefined
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })

  it('financialEvents が空配列のシナリオは許容する', () => {
    const d = validDoc()
    d.scenarios[0]!.inputs.financialEvents = []
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })

  it('子どもの allowanceMonthly が undefined（自動計算モード）でも許容する', () => {
    const d = validDoc()
    const child = d.scenarios[0]!.inputs.members.children[0]!
    d.scenarios[0]!.inputs.members.children = [{ ...child, allowanceMonthly: undefined }]
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })
})

// 追記: doc.test.ts の末尾に追加
import { toDoc, fromDoc, createDefaultDoc } from '../../src/persistence/doc'
import { UnsupportedSchemaVersionError } from '../../src/persistence/errors'
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/types'
import type { HouseholdContent } from '../../src/persistence/types'

describe('toDoc / fromDoc', () => {
  const content: HouseholdContent = {
    baseYear: 2026,
    activeScenarioId: 'base',
    scenarios: [{ id: 'base', name: 'ベースプラン', inputs: sampleInputs }],
    actuals: [{ year: 2026, cashBalance: 1_000_000, investmentBalance: 2_000_000 }],
  }

  it('toDoc は schemaVersion=CURRENT を付与する', () => {
    const doc = toDoc(content)
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.baseYear).toBe(2026)
  })

  it('toDoc は opts.updatedAt を注入できる', () => {
    const doc = toDoc(content, { updatedAt: '2026-12-31T00:00:00.000Z' })
    expect(doc.updatedAt).toBe('2026-12-31T00:00:00.000Z')
  })

  it('往復: fromDoc(toDoc(content)) は toDoc(content) と deep-equal', () => {
    const doc = toDoc(content, { updatedAt: '2026-12-31T00:00:00.000Z' })
    expect(fromDoc(doc)).toEqual(doc)
  })

  it('fromDoc は不正な doc を DocValidationError で reject する', () => {
    const doc = toDoc(content)
    const broken = { ...doc, scenarios: [] }
    expect(() => fromDoc(broken)).toThrow(DocValidationError)
  })

  it('fromDoc は未来の schemaVersion を UnsupportedSchemaVersionError で fail-closed する', () => {
    const doc = toDoc(content)
    const future = { ...doc, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(() => fromDoc(future)).toThrow(UnsupportedSchemaVersionError)
  })
})

describe('createDefaultDoc', () => {
  it('fromDoc を通る妥当な doc を返す', () => {
    const doc = createDefaultDoc()
    expect(() => fromDoc(doc)).not.toThrow()
  })

  it('schemaVersion=CURRENT・actuals空・baseline未設定・scenario1本', () => {
    const doc = createDefaultDoc()
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(doc.actuals).toEqual([])
    expect(doc.baseline).toBeUndefined()
    expect(doc.scenarios).toHaveLength(1)
    expect(doc.activeScenarioId).toBe(doc.scenarios[0]!.id)
  })

  it('プレースホルダの世帯データを使う（実データではない）', () => {
    const doc = createDefaultDoc()
    expect(doc.scenarios[0]!.inputs.members.primary.name).toBe('世帯主')
  })
})
