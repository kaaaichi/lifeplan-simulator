// scripts/simulateCli.ts
//
// what-if シミュレーションCLI（本番Firestoreの households/{householdId} に対して実行する）。
//
// 引数解析・Admin SDK初期化・doc読み込みに加え、シナリオ複製・FinancialEventsのマージ・
// simulate()実行・年次テーブル出力・（--save指定時のみ）Firestore書き込みを行う
// （openspec/changes/financial-events-whatif-cli/specs/whatif-simulation-cli/spec.md 参照）。
//
// 【認証情報について: 絶対にコミットしないこと】
// このスクリプトは Firebase Admin SDK 経由で本番Firestoreに直接アクセスする。
// 認証情報は scripts/service-account.local.json に配置する（.gitignore で除外済み、
// git check-ignore で確認済み）。発行手順・配置手順は scripts/README.md を参照。
// このファイルは秘密鍵を含むため、絶対にリポジトリへコミットしないこと。
//
// 実行方法:
//   npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <path> [--save] [--activate]

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { FinancialEvent, YearRow } from '../src/types'
import type { HouseholdDoc } from '../src/persistence/types'
import { fromDoc, toDoc } from '../src/persistence/doc'
import { validateHouseholdDoc } from '../src/persistence/validate'
import { duplicateScenario } from '../src/persistence/scenarioOps'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { toYearStartRows } from '../src/store/selectors'

const PROJECT_ID = 'YOUR_FIREBASE_PROJECT_ID'

export interface CliArgs {
  household: string
  scenario: string
  events: string
  save: boolean
  activate: boolean
}

/**
 * CLI引数のパース。純関数（ファイルI/O・Firebase非依存）でTDD可能。
 * 必須: --household, --scenario, --events（値を伴う）
 * 任意: --save, --activate（フラグ）
 * 必須引数が欠けている場合、未知の引数がある場合、値を伴うべき引数に値が無い場合は Error を throw する。
 */
export function parseArgs(argv: string[]): CliArgs {
  let household: string | undefined
  let scenario: string | undefined
  let events: string | undefined
  let save = false
  let activate = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--household' || arg === '--scenario' || arg === '--events') {
      const value = argv[++i]
      if (value === undefined) {
        throw new Error(`${arg} requires a value`)
      }
      if (arg === '--household') household = value
      if (arg === '--scenario') scenario = value
      if (arg === '--events') events = value
      continue
    }
    if (arg === '--save') {
      save = true
      continue
    }
    if (arg === '--activate') {
      activate = true
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }

  const missing: string[] = []
  if (!household) missing.push('--household')
  if (!scenario) missing.push('--scenario')
  if (!events) missing.push('--events')
  if (missing.length > 0) {
    throw new Error(`missing required argument(s): ${missing.join(', ')}`)
  }

  return { household: household!, scenario: scenario!, events: events!, save, activate }
}

/**
 * `--scenario` の値を解決する。'active' なら doc.activeScenarioId、それ以外はそのまま。
 * 純関数（Firestore非依存）でTDD可能。
 */
export function resolveSourceScenarioId(doc: HouseholdDoc, scenarioArg: string): string {
  return scenarioArg === 'active' ? doc.activeScenarioId : scenarioArg
}

/**
 * `--events` から読み込んだ `FinancialEvent[]` の簡易バリデーション。
 * Firestoreに一切触れる前に呼ぶこと。明らかに不正なもの（配列でない・startYear > endYear）を検出しthrowする。
 * 純関数（Firestore非依存）でTDD可能。
 */
export function validateFinancialEvents(events: FinancialEvent[]): void {
  if (!Array.isArray(events)) {
    throw new Error('--events の中身は FinancialEvent の配列である必要があります')
  }
  for (const e of events) {
    if (e.kind !== '収入' && e.kind !== '支出') {
      throw new Error(`イベント "${e.id ?? '(id不明)'}" の kind は "収入" または "支出" である必要があります`)
    }
    if (e.endYear !== null && e.startYear > e.endYear) {
      throw new Error(
        `イベント "${e.id ?? '(id不明)'}" の startYear(${e.startYear}) が endYear(${e.endYear}) より後になっています`,
      )
    }
  }
}

/**
 * 既存の financialEvents（未定義なら空扱い）に追加分をconcatする（既存が先、追加が後。既存は保持）。
 * 純関数（Firestore非依存）でTDD可能。
 */
export function mergeFinancialEvents(
  existing: FinancialEvent[] | undefined,
  additional: FinancialEvent[],
): FinancialEvent[] {
  return [...(existing ?? []), ...additional]
}

/**
 * `activeScenarioId` の切り替えロジック。`save` かつ `activate` の場合のみ新シナリオIDに切り替える。
 * それ以外（save のみ／activate のみ／どちらもなし）は現状の activeScenarioId を維持する。
 * 純関数（Firestore非依存）でTDD可能。
 */
export function resolveActiveScenarioId(
  currentActiveScenarioId: string,
  newScenarioId: string,
  save: boolean,
  activate: boolean,
): string {
  return save && activate ? newScenarioId : currentActiveScenarioId
}

const TABLE_COLUMNS = ['year', 'income', 'totalExpense', 'annualCashFlow', 'totalAssets'] as const

/**
 * 列見出しの日本語ラベル。「単年度収入/支出/収支」はその年中に発生したフロー、
 * 「年始総資産」はその年始時点（＝前年12月末と同じ値）のストック（累積残高）であることを
 * 列名自体で区別する。既存ダッシュボードの年次テーブル（AnnualTable.tsx、`toYearStartRows`
 * による年始シフト表示。design doc §19）と同じ「残高は年始・フローは当年」という見せ方に揃える
 * ため、呼び出し側（main関数）で `toYearStartRows` を適用した行を渡すことを前提とする。
 */
const COLUMN_LABELS: Record<(typeof TABLE_COLUMNS)[number], string> = {
  year: '西暦',
  income: '単年度収入',
  totalExpense: '単年度支出',
  annualCashFlow: '単年度収支',
  totalAssets: '年始総資産',
}

const TABLE_NOTE =
  '※ 単年度収入・単年度支出・単年度収支はその年中の実績、年始総資産はその年始時点（前年12月末と同じ値）の残高です。'

/** year 列はそのまま（4桁の年）、金額列のみ3桁区切りで整形する */
function formatCell(col: (typeof TABLE_COLUMNS)[number], value: number): string {
  return col === 'year' ? String(value) : value.toLocaleString('ja-JP')
}

/**
 * 年次テーブル（西暦/単年度収入/単年度支出/単年度収支/年末総資産）を整形した文字列を返す。
 * 純粋な文字列生成関数（Firestore非依存）でTDD可能。console.logで出力する側が呼ぶ。
 */
export function formatYearTable(rows: YearRow[]): string {
  const dataRows = rows.map((r) => TABLE_COLUMNS.map((col) => formatCell(col, r[col])))
  const headers = TABLE_COLUMNS.map((col) => COLUMN_LABELS[col])
  const widths = TABLE_COLUMNS.map((col, i) =>
    Math.max(headers[i]!.length, ...dataRows.map((row) => row[i]!.length)),
  )
  const formatLine = (cells: string[]): string =>
    cells.map((cell, i) => cell.padStart(widths[i]!)).join('  ')

  const lines = [
    formatLine(headers),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...dataRows.map((row) => formatLine(row)),
    '',
    TABLE_NOTE,
  ]
  return lines.join('\n')
}

/**
 * Admin SDKでFirestoreから読んだ生データを fromDoc() に渡せる形にする
 * （updatedAt: Admin SDKの Timestamp → ISO文字列。ブラウザ側 firestoreRepository.ts の
 * rawFromSnapshot と同じ変換をAdmin SDK向けに行う）。
 */
export function convertAdminRawDoc(raw: Record<string, unknown>): unknown {
  const { updatedAt, ...rest } = raw
  return updatedAt instanceof Timestamp ? { ...rest, updatedAt: updatedAt.toDate().toISOString() } : rest
}

function printUsage(): void {
  console.error(
    'usage: npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <path> [--save] [--activate]',
  )
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(scriptDir, 'service-account.local.json')

/**
 * Firebase Admin SDKを初期化しFirestoreクライアントを返す。
 * `FIRESTORE_EMULATOR_HOST` が設定されている場合（Firestoreエミュレータ接続時）は、
 * `service-account.local.json` を読まず `credential` なしで初期化する（Admin SDKは
 * この環境変数を見てエミュレータへ自動接続するため、エミュレータ相手には認証情報が不要）。
 * それ以外（本番Firestore）は従来どおりサービスアカウントキーによる初期化を必須とする。
 */
export function initFirestore() {
  if (getApps().length === 0) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? PROJECT_ID })
    } else {
      const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
      initializeApp({
        credential: cert(serviceAccount),
        projectId: PROJECT_ID,
      })
    }
  }
  return getFirestore()
}

/**
 * CLI本体。`argv` を引数化することで、テストから任意の引数配列を渡して直接呼び出せる
 * （デフォルトは `process.argv.slice(2)` で、通常のCLI実行時の挙動は変わらない）。
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`)
    printUsage()
    process.exitCode = 1
    return
  }

  if (args.activate && !args.save) {
    console.log(
      '警告: --activate は --save と併用した場合のみ有効です。--save が指定されていないため無視します。',
    )
  }

  const db = initFirestore()
  const snap = await db.collection('households').doc(args.household).get()
  if (!snap.exists) {
    console.error(`error: households/${args.household} does not exist`)
    process.exitCode = 1
    return
  }

  let doc: HouseholdDoc
  try {
    doc = fromDoc(convertAdminRawDoc(snap.data() ?? {}))
  } catch (err) {
    console.error(`error: households/${args.household} の読み込みに失敗しました: ${errMsg(err)}`)
    process.exitCode = 1
    return
  }
  console.log(`households/${args.household} を読み込みました（scenarios: ${doc.scenarios.map((s) => s.id).join(', ')}）`)

  const sourceScenarioId = resolveSourceScenarioId(doc, args.scenario)

  let events: FinancialEvent[]
  try {
    const raw = readFileSync(args.events, 'utf-8')
    events = JSON.parse(raw) as FinancialEvent[]
    validateFinancialEvents(events)
  } catch (err) {
    console.error(`error: --events の読み込み・検証に失敗しました: ${errMsg(err)}`)
    process.exitCode = 1
    return
  }

  const newScenarioId = randomUUID()
  let content
  try {
    content = duplicateScenario(doc, sourceScenarioId, newScenarioId)
  } catch (err) {
    console.error(`error: シナリオの複製に失敗しました: ${errMsg(err)}`)
    process.exitCode = 1
    return
  }

  content = {
    ...content,
    scenarios: content.scenarios.map((s) =>
      s.id === newScenarioId
        ? { ...s, inputs: { ...s.inputs, financialEvents: mergeFinancialEvents(s.inputs.financialEvents, events) } }
        : s,
    ),
  }
  const newScenario = content.scenarios.find((s) => s.id === newScenarioId)!
  console.log(`シナリオ "${newScenario.name}"（id: ${newScenarioId}）を複製し、${events.length}件のイベントを追加しました`)

  const rows = simulate(newScenario.inputs, lifeplanMaster)
  // ダッシュボードの年次テーブル(AnnualTable.tsx)と同じ「残高は年始・フローは当年」の見せ方に揃える(design doc §19)
  const displayRows = toYearStartRows(rows, newScenario.inputs, doc.actuals)
  console.log(formatYearTable(displayRows))

  if (!args.save) {
    console.log('--save が指定されていないため、Firestoreへの書き込みは行いません（試算のみ）。')
    return
  }

  const newActiveScenarioId = resolveActiveScenarioId(content.activeScenarioId, newScenarioId, args.save, args.activate)
  const toSave = toDoc({ ...content, activeScenarioId: newActiveScenarioId })
  try {
    validateHouseholdDoc(toSave)
  } catch (err) {
    console.error(`error: 保存前のバリデーションに失敗しました。Firestoreへの書き込みは行いません: ${errMsg(err)}`)
    process.exitCode = 1
    return
  }

  await db
    .collection('households')
    .doc(args.household)
    .set({ ...toSave, updatedAt: FieldValue.serverTimestamp() })
  console.log(`households/${args.household} に保存しました（新シナリオID: ${newScenarioId}）`)
  if (newActiveScenarioId !== content.activeScenarioId) {
    console.log(`activeScenarioId を "${newScenarioId}" に切り替えました`)
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const isMainModule = path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err))
    process.exitCode = 1
  })
}
