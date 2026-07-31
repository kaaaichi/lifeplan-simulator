import type { HouseholdDoc } from './types'
import { DocValidationError } from './errors'

export function validateHouseholdDoc(doc: HouseholdDoc): void {
  if (doc.scenarios.length === 0) {
    throw new DocValidationError('scenarios must not be empty', 'scenarios')
  }

  const ids = doc.scenarios.map(s => s.id)
  if (new Set(ids).size !== ids.length) {
    throw new DocValidationError('scenario.id must be unique', 'scenarios[].id')
  }

  if (!ids.includes(doc.activeScenarioId)) {
    throw new DocValidationError(
      `activeScenarioId "${doc.activeScenarioId}" not found in scenarios`, 'activeScenarioId',
    )
  }

  if (doc.baseYear <= 0) {
    throw new DocValidationError('baseYear must be positive', 'baseYear')
  }

  for (const s of doc.scenarios) {
    if (s.inputs.baseYear !== doc.baseYear) {
      throw new DocValidationError(
        `scenario "${s.id}" inputs.baseYear (${s.inputs.baseYear}) must match doc.baseYear (${doc.baseYear})`,
        `scenarios[${s.id}].inputs.baseYear`,
      )
    }

    const financialEventIds = (s.inputs.financialEvents ?? []).map(fe => fe.id)
    if (new Set(financialEventIds).size !== financialEventIds.length) {
      throw new DocValidationError(
        `scenario "${s.id}" financialEvents.id must be unique`,
        `scenarios[${s.id}].financialEvents[].id`,
      )
    }
  }

  // actuals 範囲の安全側近似（endAge の正確な逆算はエンジンの責務。100年は十分な安全マージン）
  const maxYear = Math.max(...doc.scenarios.map(s => s.inputs.baseYear)) + 100

  // baseYear より前の年も許容する（§16.9: simulate() は baseYear からしかループしないため、
  // リベース計算には一切影響しない純粋な参考記録として保持できる）。上限のみ安全側で制限する。
  let prevYear = -Infinity
  doc.actuals.forEach((a, i) => {
    if (a.year <= prevYear) {
      throw new DocValidationError(
        `actuals must be strictly ascending by year (index ${i})`, `actuals[${i}].year`,
      )
    }
    prevYear = a.year

    if (a.year > maxYear) {
      throw new DocValidationError(
        `actuals[${i}].year (${a.year}) exceeds max year ${maxYear}`, `actuals[${i}].year`,
      )
    }

    if (typeof a.cashBalance !== 'number' || !Number.isFinite(a.cashBalance)) {
      throw new DocValidationError(`actuals[${i}].cashBalance is not a valid number`, `actuals[${i}].cashBalance`)
    }
    if (typeof a.investmentBalance !== 'number' || !Number.isFinite(a.investmentBalance)) {
      throw new DocValidationError(
        `actuals[${i}].investmentBalance is not a valid number`, `actuals[${i}].investmentBalance`,
      )
    }
  })

  if (doc.baseline && doc.baseline.series.length > 0) {
    let prevBaselineYear = -Infinity
    doc.baseline.series.forEach((p, i) => {
      if (p.year <= prevBaselineYear) {
        throw new DocValidationError(
          `baseline.series must be strictly ascending by year (index ${i})`, `baseline.series[${i}].year`,
        )
      }
      prevBaselineYear = p.year
    })
    if (doc.baseline.series[0]!.year !== doc.baseYear) {
      throw new DocValidationError(
        `baseline.series[0].year (${doc.baseline.series[0]!.year}) must equal doc.baseYear (${doc.baseYear})`,
        'baseline.series[0].year',
      )
    }
  }
}
