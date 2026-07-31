import { describe, it, expect } from 'vitest'
import { migrateHouseholdDoc } from '../../src/persistence/migrate'
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/types'

describe('migrateHouseholdDoc', () => {
  it('schemaVersion が CURRENT の doc はそのまま返す', () => {
    const doc = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      baseYear: 2026,
      activeScenarioId: 'base',
      scenarios: [],
      actuals: [],
    }
    expect(migrateHouseholdDoc(doc)).toEqual(doc)
  })

  it('runner は版ごとの移行関数配列を CURRENT まで順に適用する（旧版はCURRENTまで上がる）', () => {
    const doc = { schemaVersion: 1, baseYear: 2027, activeScenarioId: 'x', scenarios: [], actuals: [] }
    const migrated = migrateHouseholdDoc(doc)
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.baseYear).toBe(2027)
  })

  it('v1→v2: emergencyFundCash未設定のシナリオにデフォルト値1,200,000円を補完する', () => {
    const doc = {
      schemaVersion: 1,
      baseYear: 2027,
      activeScenarioId: 'x',
      scenarios: [{ id: 'x', name: 'ベース', inputs: { assumptions: { investmentReturnRate: 5 } } }],
      actuals: [],
    }
    const migrated = migrateHouseholdDoc(doc)
    expect((migrated.scenarios[0]!.inputs.assumptions as { emergencyFundCash: number }).emergencyFundCash).toBe(1_200_000)
  })

  it('v2→v3: educationIncomeBand と nurseryFeeMonthly を v2以前の挙動と等価な値で補完する', () => {
    const doc = {
      schemaVersion: 2,
      baseYear: 2027,
      activeScenarioId: 'x',
      scenarios: [{ id: 'x', name: 'ベース', inputs: { assumptions: { investmentReturnRate: 5 } } }],
      actuals: [],
    }
    const migrated = migrateHouseholdDoc(doc)
    expect(migrated.schemaVersion).toBe(3)
    const a = migrated.scenarios[0]!.inputs.assumptions
    expect(a.educationIncomeBand).toBe('800万～999万')
    expect(a.nurseryFeeMonthly).toBe(0)
  })

  it('v2→v3: 保存済みの値があればデフォルトで上書きしない', () => {
    const doc = {
      schemaVersion: 2,
      baseYear: 2027,
      activeScenarioId: 'x',
      scenarios: [{
        id: 'x', name: 'ベース',
        inputs: { assumptions: { investmentReturnRate: 5, nurseryFeeMonthly: 30_000 } },
      }],
      actuals: [],
    }
    const migrated = migrateHouseholdDoc(doc)
    expect(migrated.scenarios[0]!.inputs.assumptions.nurseryFeeMonthly).toBe(30_000)
  })
})
