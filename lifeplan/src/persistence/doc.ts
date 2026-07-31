import type { HouseholdContent, HouseholdDoc } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'
import { validateHouseholdDoc } from './validate'
import { UnsupportedSchemaVersionError } from './errors'
import { defaultInputs } from './seedOverride'
import { migrateHouseholdDoc } from './migrate'

export function toDoc(content: HouseholdContent, opts?: { updatedAt?: string }): HouseholdDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    baseYear: content.baseYear,
    activeScenarioId: content.activeScenarioId,
    scenarios: content.scenarios,
    actuals: content.actuals,
    ...(content.baseline !== undefined ? { baseline: content.baseline } : {}),
    ...(opts?.updatedAt !== undefined ? { updatedAt: opts.updatedAt } : {}),
  }
}

/**
 * 永続層から読んだ未知の値を安全な HouseholdDoc にする。
 * 順序: envelope の schemaVersion 先読み → 未来版は fail-closed throw → migrate(旧版→CURRENT) → validate(CURRENT形)。
 */
export function fromDoc(raw: unknown): HouseholdDoc {
  const envelope = raw as { schemaVersion: number }
  if (envelope.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(envelope.schemaVersion)
  }
  const migrated = migrateHouseholdDoc(raw)
  validateHouseholdDoc(migrated)
  return migrated
}

/** 初回ブートストラップ用 seed doc。load→null のとき呼び出し側が使う土台。 */
export function createDefaultDoc(): HouseholdDoc {
  return toDoc({
    baseYear: defaultInputs.baseYear,
    activeScenarioId: 'base',
    scenarios: [{ id: 'base', name: 'ベースプラン', inputs: defaultInputs }],
    actuals: [],
  })
}
