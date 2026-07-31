import type { HouseholdDoc } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'
import { DEFAULT_INCOME_BAND } from '../masterData/education'

/**
 * v2以前は保育料月額が expenses.ts にハードコードされていた。公開版には移行対象の既存
 * データが存在しないため 0(未設定)を補完する。利用者は入力フォームで自分の自治体の
 * 徴収基準表にある該当階層の額を設定する。
 */
const LEGACY_NURSERY_FEE_MONTHLY = 0

/** 移行途中のdocの最小形。schemaVersion 以外のフィールドは版ごとに異なるため unknown。 */
interface VersionedDoc {
  schemaVersion: number
  [key: string]: unknown
}

function migrateV1ToV2(doc: VersionedDoc): VersionedDoc {
  const scenarios = (doc.scenarios as Array<{ inputs: { assumptions: Record<string, unknown> } }>).map((s) => ({
    ...s,
    inputs: {
      ...s.inputs,
      assumptions: { emergencyFundCash: 1_200_000, ...s.inputs.assumptions },
    },
  }))
  return { ...doc, schemaVersion: 2, scenarios }
}

/**
 * v3: 教育費マスタの参照年収帯(educationIncomeBand)と保育料月額(nurseryFeeMonthly)を
 * Assumptions に追加。いずれも v2 以前はコード内にハードコードされていた値なので、
 * 既存ドキュメントには当時の挙動と等価な値を補完する(保存済みの値があればそちらを優先)。
 */
function migrateV2ToV3(doc: VersionedDoc): VersionedDoc {
  const scenarios = (doc.scenarios as Array<{ inputs: { assumptions: Record<string, unknown> } }>).map((s) => ({
    ...s,
    inputs: {
      ...s.inputs,
      assumptions: {
        educationIncomeBand: DEFAULT_INCOME_BAND,
        nurseryFeeMonthly: LEGACY_NURSERY_FEE_MONTHLY,
        ...s.inputs.assumptions,
      },
    },
  }))
  return { ...doc, schemaVersion: 3, scenarios }
}

/**
 * 版ごとの移行関数。キー=移行元バージョン、値=そのバージョンから次バージョンへの変換。
 * v4 を追加する際は { 1: …, 2: …, 3: migrateV3ToV4 } のように追記するだけでよい。
 */
const migrations: Record<number, (doc: VersionedDoc) => VersionedDoc> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
}

/**
 * raw.schemaVersion から CURRENT_SCHEMA_VERSION まで移行関数を順に適用する runner。
 * 検証は行わない（validate.ts の責務）。fromDoc から「先読み→fail-closed」の後に呼ばれる前提。
 */
export function migrateHouseholdDoc(raw: unknown): HouseholdDoc {
  let doc = raw as VersionedDoc
  let version = doc.schemaVersion
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version]
    if (!migrate) {
      throw new Error(`No migration registered for schemaVersion ${version}`)
    }
    doc = migrate(doc)
    version = doc.schemaVersion
  }
  return doc as unknown as HouseholdDoc
}
