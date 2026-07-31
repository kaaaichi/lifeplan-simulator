import { describe, it, expect } from 'vitest'
import { computeRealAssetValueScenarios } from './realAssetValue'
import { REAL_VALUE_SCENARIOS } from '../masterData/realValueScenarios'

describe('computeRealAssetValueScenarios', () => {
  it('シナリオ: 3シナリオそれぞれの実質評価額が算出される（受け入れ試験）', () => {
    const investmentBalance = 14_603_913
    const currentFx = 162
    const currentCape = 41

    const result = computeRealAssetValueScenarios(investmentBalance, currentFx, currentCape, REAL_VALUE_SCENARIOS)

    expect(result).toHaveLength(3)
    for (const scenario of REAL_VALUE_SCENARIOS) {
      const found = result.find(r => r.scenarioId === scenario.id)
      expect(found).toBeDefined()
      const expected = investmentBalance * (scenario.targetFx / currentFx) * (scenario.targetCape / currentCape)
      expect(found!.realValue).toBeCloseTo(expected)
      expect(found!.label).toBe(scenario.label)
      expect(found!.description).toBe(scenario.description)
    }
  })

  it('シナリオ: 現在値がシナリオの目標値と一致する場合はヘアカットなし（受け入れ試験）', () => {
    const investmentBalance = 10_000_000
    const dummyScenario = { id: 'dummy', label: 'ダミー', description: 'テスト用', targetFx: 150, targetCape: 35 }

    const result = computeRealAssetValueScenarios(investmentBalance, dummyScenario.targetFx, dummyScenario.targetCape, [dummyScenario])

    expect(result).toHaveLength(1)
    expect(result[0]!.realValue).toBe(investmentBalance)
  })

  it('シナリオ配列が空の場合は空配列を返す', () => {
    const result = computeRealAssetValueScenarios(10_000_000, 162, 41, [])
    expect(result).toEqual([])
  })
})
