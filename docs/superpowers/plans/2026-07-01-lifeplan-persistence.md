# ライフプラン 永続化レイヤー（純TS層）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firestore ドキュメント（`HouseholdDoc`）と純TSドメイン型（`Inputs`/`Actual`/`Baseline`）を結ぶ、Firebase 非依存の永続化レイヤーを実装する。ドメイン内容↔封筒付きdocの変換・検証・schemaVersion マイグレーション・`HouseholdRepository` ポート（＋InMemory実装）を純TSのみで完成させる。

**Architecture:** ports-and-adapters。本プランは pure layer（`src/persistence/`）のみを実装する。Firestore アダプタ・セキュリティルール・IaC は本プランに**含めない**（後日、Firebase プロジェクトと2人のUID・Firestoreエミュレータが揃ってから別プランで実装）。`fromDoc` は「schemaVersion 先読み → 未来版は fail-closed throw → migrate → validate(CURRENT形のみ) → 返却」の順で構成する。

**Tech Stack:** TypeScript, Vitest, Node 20+（既存エンジンと同一トーンチェーン）。新規依存なし。

**仕様の源泉:** `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` の **§12（永続化レイヤー設計）**。本プランは §12.2〜§12.5 を実装する。

## Global Constraints

- **背骨（最重要）**: 本プランは `src/persistence/` 配下の純追加。`src/engine/`（`simulate`/`baseline`/`variance` 等）には一切手を入れない。既存の全テスト（現行48）と golden 回帰（`tests/golden.test.ts`）は**一切変更せず green のまま**であること。
- 純TS。Firebase/DOM 依存を入れない。`new Date()`/乱数など非決定的要素を持たない（`updatedAt` は呼び出し側から注入。§12.3.1）。
- `Inputs.baseYear`（`src/types.ts`）は削除・改名しない（既存タスク: §12.6 の既知の負債として据え置き。エンジン波及と golden 破壊を避けるため）。整合性は validate のクロスフィールド不変条件で担保する（§12.4）。
- `fromDoc` は **migrate → validate の順**で処理する（validate は CURRENT 形のみを対象とする。§12.3.1）。
- `fromDoc` は **`schemaVersion > CURRENT_SCHEMA_VERSION` を `UnsupportedSchemaVersionError` で fail-closed throw**する（§12.3.1）。
- `validate` は**正規化しない**（ソート・重複排除をせず、不正な形は reject するのみ）。往復不変（`fromDoc(toDoc(x))` ≡ `toDoc(x)`）を壊さないため（§12.4）。
- `HouseholdRepository.save` は `Promise<HouseholdDoc>`（確定 doc を返す）。`subscribe` のコールバックは `(doc: HouseholdDoc | null) => void` で**購読直後に現在値を1回発火**し、`onError?: (e: unknown) => void` を持つ（§12.3.2）。
- 作業ディレクトリは `lifeplan/`（テストは `cd lifeplan && npx vitest run …`）。ソースは `lifeplan/src/persistence/`、テストは `lifeplan/tests/`。
- Firestore アダプタ（`firestoreRepository.ts`）・`firestore.rules`・IaC（`firebase.json` 等）は本プランのスコープ外。実装しない。

---

## File Structure

- `lifeplan/src/persistence/types.ts` — `Scenario`・`HouseholdDoc`・`HouseholdContent`・`CURRENT_SCHEMA_VERSION` の定義（Create）
- `lifeplan/src/persistence/errors.ts` — `DocValidationError`（不正パス付き）・`UnsupportedSchemaVersionError` の例外型（Create）
- `lifeplan/src/persistence/validate.ts` — `validateHouseholdDoc(doc: HouseholdDoc): void`（CURRENT 形の型ガード・必須フィールド・範囲・クロスフィールド不変条件チェック。不正時は `DocValidationError` を throw）（Create）
- `lifeplan/src/persistence/defaultHousehold.ts` — `defaultInputs`（初期世帯データ、サンプル世帯）。`tests/_realInputs.ts` から移設し、本体コードが tests に依存しないようにする（Create）
- `lifeplan/src/persistence/doc.ts` — `toDoc`・`fromDoc`・`createDefaultDoc` （Create）
- `lifeplan/src/persistence/migrate.ts` — `migrateHouseholdDoc(raw: any, fromVersion: number): HouseholdDoc`（schemaVersion ごとの移行関数群とrunner。現時点は CURRENT=1 のみで runner は恒等関数）（Create）
- `lifeplan/src/persistence/repository.ts` — `HouseholdRepository` ポート interface ＋ `InMemoryHouseholdRepository` 実装（Create）
- `lifeplan/tests/_realInputs.ts` — 中身を `defaultHousehold.ts` へ移し、re-export に置き換え（既存テストの import は無改修）（Modify）
- `lifeplan/tests/persistence/types.test.ts` — コンテナ型・`CURRENT_SCHEMA_VERSION` の健全性テスト（Create）
- `lifeplan/tests/persistence/doc.test.ts` — `toDoc`/`fromDoc` 往復・検証・`createDefaultDoc` のテスト（Create）
- `lifeplan/tests/persistence/migrate.test.ts` — マイグレーション runner のテスト（Create）
- `lifeplan/tests/persistence/repository.test.ts` — `InMemoryHouseholdRepository` の契約テスト（Create）

各タスクは依存順。Task N は Task N-1 の成果物を使う。必ず上から順に実装する。

---

## Task 1: コンテナ型と例外型（`types.ts` / `errors.ts`）

**Files:**
- Create: `lifeplan/src/persistence/types.ts`
- Create: `lifeplan/src/persistence/errors.ts`
- Test: `lifeplan/tests/persistence/types.test.ts`

**Interfaces:**
- Consumes: 既存 `Inputs`・`Actual`（`../types`）、`Baseline`（`../engine/baseline`）
- Produces:
  - `CURRENT_SCHEMA_VERSION: number`（値は `1`）
  - `Scenario { id: string; name: string; inputs: Inputs }`
  - `HouseholdDoc { schemaVersion: number; baseYear: number; activeScenarioId: string; scenarios: Scenario[]; actuals: Actual[]; baseline?: Baseline; updatedAt?: string }`
  - `HouseholdContent = Omit<HouseholdDoc, 'schemaVersion' | 'updatedAt'>`
  - `DocValidationError extends Error`（コンストラクタ `(message: string, path: string)`。`.path` プロパティを持つ）
  - `UnsupportedSchemaVersionError extends Error`（コンストラクタ `(foundVersion: number)`。`.foundVersion` プロパティを持つ）

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/persistence/types.test.ts
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/types'
import { DocValidationError, UnsupportedSchemaVersionError } from '../../src/persistence/errors'

describe('persistence/types', () => {
  it('CURRENT_SCHEMA_VERSION は 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
  })
})

describe('persistence/errors', () => {
  it('DocValidationError は message と path を持つ', () => {
    const e = new DocValidationError('baseYear must be positive', 'baseYear')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('baseYear must be positive')
    expect(e.path).toBe('baseYear')
  })
  it('UnsupportedSchemaVersionError は foundVersion を持つ', () => {
    const e = new UnsupportedSchemaVersionError(99)
    expect(e).toBeInstanceOf(Error)
    expect(e.foundVersion).toBe(99)
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/types.test.ts`
Expected: FAIL（`src/persistence/types.ts` と `src/persistence/errors.ts` が存在しないためモジュール解決エラー）

- [x] **Step 3: types.ts を実装**

```ts
// src/persistence/types.ts
import type { Inputs, Actual } from '../types'
import type { Baseline } from '../engine/baseline'

export const CURRENT_SCHEMA_VERSION = 1

export interface Scenario {
  id: string
  name: string
  inputs: Inputs
}

export interface HouseholdDoc {
  schemaVersion: number
  baseYear: number
  activeScenarioId: string
  scenarios: Scenario[]
  actuals: Actual[]
  baseline?: Baseline
  updatedAt?: string
}

export type HouseholdContent = Omit<HouseholdDoc, 'schemaVersion' | 'updatedAt'>
```

- [x] **Step 4: errors.ts を実装**

```ts
// src/persistence/errors.ts
export class DocValidationError extends Error {
  path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'DocValidationError'
    this.path = path
  }
}

export class UnsupportedSchemaVersionError extends Error {
  foundVersion: number
  constructor(foundVersion: number) {
    super(`Unsupported schemaVersion: ${foundVersion} (max supported is current)`)
    this.name = 'UnsupportedSchemaVersionError'
    this.foundVersion = foundVersion
  }
}
```

- [x] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/types.test.ts`
Expected: PASS（3 tests）

- [x] **Step 6: 型チェック**

Run: `cd lifeplan && npm run typecheck`
Expected: エラーなし

- [x] **Step 7: Commit**

```bash
git add lifeplan/src/persistence/types.ts lifeplan/src/persistence/errors.ts lifeplan/tests/persistence/types.test.ts
git commit -m "feat: add persistence container types and error types"
```

---

## Task 2: 検証（`validate.ts`）

**Files:**
- Create: `lifeplan/src/persistence/validate.ts`
- Test: `lifeplan/tests/persistence/doc.test.ts`（本タスクでは `validateHouseholdDoc` を直接テストする describe を追加。Task 3 で `fromDoc`/`toDoc`/`createDefaultDoc` の describe を同ファイルに追記する）

**Interfaces:**
- Consumes: `HouseholdDoc`（Task 1）、`DocValidationError`（Task 1）
- Produces: `validateHouseholdDoc(doc: HouseholdDoc): void` — 不正なら `DocValidationError` を throw。正当なら何も返さず正常終了。**CURRENT 形（`schemaVersion === CURRENT_SCHEMA_VERSION`）のみを対象とする**（migrate 後の doc を渡す前提。呼び出し側の責務は Task 3）。正規化はしない（入力を変更しない）。

検証項目（§12.4 の reject 一覧）:
1. `scenarios` が空配列 → reject
2. `scenario.id` の重複あり → reject
3. `activeScenarioId` が `scenarios` のどの `id` にも一致しない → reject
4. `baseYear <= 0` → reject
5. `scenarios.some(s => s.inputs.baseYear !== doc.baseYear)`（クロスフィールド不変条件）→ reject
6. `actuals` が year 昇順でない（隣接する year が非減少でない、厳密昇順を要求）→ reject
7. `actuals` に year の重複あり → reject
8. `actuals` の各要素で `year` が `[doc.baseYear, 全シナリオ中の inputs.assumptions.endAge から算出される最大 endYear]` の範囲外 → reject（`endYear` は `scenario.inputs.baseYear + (scenario.inputs.assumptions.endAge - primaryAgeAtBaseYear)` のような複雑な逆算はせず、**簡易化**: `scenario.inputs.baseYear + 100` を上限の安全側近似として使う。理由: 正確な endYear 算出はエンジンの年齢計算ロジックの複製になり本プランのスコープ外。100年は `endAge` の現実的な最大値に対して十分な安全マージン）
9. `actuals` の `cashBalance`/`investmentBalance` が `NaN`（`typeof !== 'number' || Number.isNaN(...)`）→ reject
10. `baseline` が存在する場合、`baseline.series` の year が昇順でない → reject
11. `baseline` が存在する場合、`baseline.series[0].year !== doc.baseYear`（baseYear 起点でない）→ reject（`baseline.series` が空配列の場合はこのチェックをスキップ）

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/persistence/doc.test.ts
import { describe, it, expect } from 'vitest'
import { validateHouseholdDoc } from '../../src/persistence/validate'
import { DocValidationError } from '../../src/persistence/errors'
import type { HouseholdDoc } from '../../src/persistence/types'
import { realInputs } from '../_realInputs'

function validDoc(): HouseholdDoc {
  return {
    schemaVersion: 1,
    baseYear: 2026,
    activeScenarioId: 'base',
    scenarios: [{ id: 'base', name: 'ベースプラン', inputs: realInputs }],
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
      { id: 'base', name: 'A', inputs: realInputs },
      { id: 'base', name: 'B', inputs: realInputs },
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
    d.scenarios = [{ id: 'base', name: 'A', inputs: { ...realInputs, baseYear: 1999 } }]
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

  it('actuals の year が範囲外なら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 1900, cashBalance: 1, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の残高が NaN なら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: NaN, investmentBalance: 1 }]
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
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts`
Expected: FAIL（`src/persistence/validate.ts` が存在しない）

- [x] **Step 3: validate.ts を実装**

```ts
// src/persistence/validate.ts
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
  }

  // actuals 範囲の安全側近似（endAge の正確な逆算はエンジンの責務。100年は十分な安全マージン）
  const maxYear = Math.max(...doc.scenarios.map(s => s.inputs.baseYear)) + 100

  let prevYear = -Infinity
  doc.actuals.forEach((a, i) => {
    if (a.year <= prevYear) {
      throw new DocValidationError(
        `actuals must be strictly ascending by year (index ${i})`, `actuals[${i}].year`,
      )
    }
    prevYear = a.year

    if (a.year < doc.baseYear || a.year > maxYear) {
      throw new DocValidationError(
        `actuals[${i}].year (${a.year}) out of range [${doc.baseYear}, ${maxYear}]`, `actuals[${i}].year`,
      )
    }

    if (typeof a.cashBalance !== 'number' || Number.isNaN(a.cashBalance)) {
      throw new DocValidationError(`actuals[${i}].cashBalance is not a valid number`, `actuals[${i}].cashBalance`)
    }
    if (typeof a.investmentBalance !== 'number' || Number.isNaN(a.investmentBalance)) {
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
```

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts`
Expected: PASS（11 tests）

- [x] **Step 5: 型チェック**

Run: `cd lifeplan && npm run typecheck`
Expected: エラーなし

- [x] **Step 6: Commit**

```bash
git add lifeplan/src/persistence/validate.ts lifeplan/tests/persistence/doc.test.ts
git commit -m "feat: add HouseholdDoc validation (reject-only, no normalization)"
```

---

## Task 3: `doc.ts`（`toDoc` / `fromDoc` / `createDefaultDoc`）

**Files:**
- Create: `lifeplan/src/persistence/defaultHousehold.ts`
- Modify: `lifeplan/tests/_realInputs.ts`
- Create: `lifeplan/src/persistence/doc.ts`
- Modify: `lifeplan/tests/persistence/doc.test.ts`（Task 2 の describe に追記）

> **依存方向の注意**: `createDefaultDoc()` の seed データは `src/persistence/defaultHousehold.ts`（本タスクで新規作成）に置く。**`tests/_realInputs.ts` からは import しない**（src が tests に依存するのは依存方向が逆転する設計違反）。既存の `tests/_realInputs.ts` は中身をそのまま `defaultHousehold.ts` へ移し、re-export に置き換えることで、既存テスト（`tests/_realInputs` を import している全テストファイル）の呼び出し側は無改修で動く。

**Interfaces:**
- Consumes: `HouseholdDoc`・`HouseholdContent`・`CURRENT_SCHEMA_VERSION`（Task 1）、`validateHouseholdDoc`（Task 2）、`DocValidationError`・`UnsupportedSchemaVersionError`（Task 1）、`migrateHouseholdDoc`（Task 4 — 本タスク時点では未実装のため `fromDoc` は「schemaVersion が CURRENT と異なる場合は移行なしでそのまま validate に渡す」の**仮実装**とし、Task 4 で `migrateHouseholdDoc` 呼び出しに差し替える）
- Produces:
  - `toDoc(content: HouseholdContent, opts?: { updatedAt?: string }): HouseholdDoc`
  - `fromDoc(raw: unknown): HouseholdDoc` — 不正時は `DocValidationError`、未来 schemaVersion 時は `UnsupportedSchemaVersionError` を throw
  - `createDefaultDoc(): HouseholdDoc`

> 注: `fromDoc` は本タスクでは「envelope 検査 → 未来版 fail-closed → (暫定: schemaVersion 差異があっても migrate せず素通し) → validate」という順で実装し、**Task 4 で migrate 呼び出しを正式に組み込む**。これは Task 3 単体では旧版マイグレーションのテストケースをまだ持たないため（`migrate.ts` が Task 4 で初めて存在する）。Task 3 の時点で `fromDoc` が CURRENT 版の doc を正しく検証・返却できることまでを保証する。

- [x] **Step 1: 失敗するテストを書く**

`tests/persistence/doc.test.ts` に以下の describe を追記する（Task 2 の describe はそのまま残す）:

```ts
// 追記: doc.test.ts の末尾に追加
import { toDoc, fromDoc, createDefaultDoc } from '../../src/persistence/doc'
import { UnsupportedSchemaVersionError } from '../../src/persistence/errors'
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/types'
import type { HouseholdContent } from '../../src/persistence/types'

describe('toDoc / fromDoc', () => {
  const content: HouseholdContent = {
    baseYear: 2026,
    activeScenarioId: 'base',
    scenarios: [{ id: 'base', name: 'ベースプラン', inputs: realInputs }],
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
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts`
Expected: FAIL（`src/persistence/doc.ts` が存在しない）

- [x] **Step 3: seed データを src へ移し、tests/_realInputs.ts を re-export に置き換える**

`lifeplan/tests/_realInputs.ts` の中身（`import type { Inputs } ...` 以下すべて）を `lifeplan/src/persistence/defaultHousehold.ts` へそのまま移動する。移動先ファイル:

```ts
// src/persistence/defaultHousehold.ts
import type { Inputs } from '../types'

export const defaultInputs: Inputs = {
  baseYear: 2026,
  members: {
    primary: { name: '世帯主', birthYear: 1990, birthMonth: 1, takeHomeIncome: 6_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    spouse:  { name: '配偶者',   birthYear: 1990, birthMonth: 1,  takeHomeIncome: 3_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    children: [{ id: 'c1', name: '第一子', birthYear: 2024, birthMonth: 7,
      schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 100_000 },
      allowanceMonthly: 0, phoneFromGrade: 6 }],
  },
  assets: {
    bankAccounts: [{ label: '計', balance: 4_000_000 }],
    investments:  [{ label: '計', balance: 3_000_000 }], // 2025年末投資残高(表の種 — 入力G19の別口座スナップショットは除外)
  },
  housing: { type: '賃貸', rentMonthly: 150_000, loanMonthly: 0, loanRemainingYears: 0, repairReserveMonthly: 0, propertyTaxAnnual: 0, fireInsuranceAnnual: 0 },
  lifestyle: { electricType: 'ガス併用', internetMonthly: 4_000 },
  appliances: [
    { name: '冷蔵庫',   price: 100_000, lastPurchaseYear: 2020, lifespanYears: 10 },
    { name: '洗濯機',   price: 220_000, lastPurchaseYear: 2024, lifespanYears: 8  },
    { name: 'ソファ',   price:  70_000, lastPurchaseYear: 2025, lifespanYears: 8  },
    { name: 'テレビ',   price: 140_000, lastPurchaseYear: 2020, lifespanYears: 10 },
    { name: 'エアコン', price: 141_580, lastPurchaseYear: 2024, lifespanYears: 10 },
  ],
  homeMaintenance: [],
  assumptions: {
    investmentReturnRate: 5,
    returnRateOptimistic: 7,
    returnRatePessimistic: 2,
    inflationRate: 0,
    endAge: 95,
    annualInvestmentContribution: 600_000,
    oneTimeInvestments: [{ year: 2026, amount: 2_940_000 }], // 2026年の追加一時投資(毎年716kに加算)
    pensionStartAge: 65,
    pensionAnnualPerPerson: 780_000,
  },
}
```

`lifeplan/tests/_realInputs.ts` を re-export に置き換える（既存テストファイルは `realInputs` という名前で import しているため、名前を保つ）:

```ts
// tests/_realInputs.ts
export { defaultInputs as realInputs } from '../src/persistence/defaultHousehold'
```

- [x] **Step 4: doc.ts を実装**

```ts
// src/persistence/doc.ts
import type { HouseholdContent, HouseholdDoc } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'
import { validateHouseholdDoc } from './validate'
import { UnsupportedSchemaVersionError } from './errors'
import { defaultInputs } from './defaultHousehold'

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
 * 順序: envelope の schemaVersion 先読み → 未来版は fail-closed throw → validate(CURRENT形)。
 * 旧版からのマイグレーションは Task 4 で組み込む。
 */
export function fromDoc(raw: unknown): HouseholdDoc {
  const doc = raw as HouseholdDoc
  if (doc.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(doc.schemaVersion)
  }
  validateHouseholdDoc(doc)
  return doc
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
```

`defaultInputs` はプロジェクトの初期世帯データ（サンプル世帯、§1）の唯一の定義。Step 3 で `src/persistence/defaultHousehold.ts` に移したので、`doc.ts`（本体コード）は `tests/` に依存しない。golden fixture（`tests/fixtures/golden.json`）とは独立（`defaultHousehold.ts` は入力データのみで、golden はエンジン出力の正解データ）。

- [x] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts`
Expected: PASS（Task 2 の 11 件 ＋ 本タスクの 7 件 = 18 tests）

- [x] **Step 6: 全テスト・型チェック（golden 不変の確認、`_realInputs.ts` の re-export 化で既存全テストが無改修で動くことも確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS（既存48テスト・golden回帰が変更なしで green）

- [x] **Step 7: Commit**

```bash
git add lifeplan/src/persistence/defaultHousehold.ts lifeplan/tests/_realInputs.ts lifeplan/src/persistence/doc.ts lifeplan/tests/persistence/doc.test.ts
git commit -m "feat: add toDoc/fromDoc/createDefaultDoc (fail-closed on future schemaVersion)"
```

---

## Task 4: マイグレーション枠組み（`migrate.ts`）と `fromDoc` への組み込み

**Files:**
- Create: `lifeplan/src/persistence/migrate.ts`
- Modify: `lifeplan/src/persistence/doc.ts`
- Test: `lifeplan/tests/persistence/migrate.test.ts`

**Interfaces:**
- Consumes: `HouseholdDoc`・`CURRENT_SCHEMA_VERSION`（Task 1）
- Produces: `migrateHouseholdDoc(raw: any): HouseholdDoc` — `raw.schemaVersion` を見て、現行より古ければ版ごとの移行関数を順に適用し、CURRENT 形の doc（型のみ。検証はしない）を返す。`raw.schemaVersion === CURRENT_SCHEMA_VERSION` ならそのまま返す。

現時点で `CURRENT_SCHEMA_VERSION = 1` のみが存在するため、移行関数群は空（runner は恒等関数として動作）。ただし runner の**枠組み**（版ごとの移行関数を配列で持ち、`fromVersion` から `CURRENT` まで順に適用する構造）をここで確立し、将来 v2 を追加する際は移行関数を1つ足すだけで済むようにする。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/persistence/migrate.test.ts
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

  it('runner は版ごとの移行関数配列を CURRENT まで順に適用する構造を持つ（v1のみの現状は恒等）', () => {
    // CURRENT=1 の現状、v1入力はv1出力と一致することで runner の非破壊性を確認
    const doc = { schemaVersion: 1, baseYear: 2027, activeScenarioId: 'x', scenarios: [], actuals: [] }
    const migrated = migrateHouseholdDoc(doc)
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.baseYear).toBe(2027)
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/migrate.test.ts`
Expected: FAIL（`src/persistence/migrate.ts` が存在しない）

- [x] **Step 3: migrate.ts を実装**

```ts
// src/persistence/migrate.ts
import type { HouseholdDoc } from './types'
import { CURRENT_SCHEMA_VERSION } from './types'

/**
 * 版ごとの移行関数。キー=移行元バージョン、値=そのバージョンから次バージョンへの変換。
 * v2 を追加する際は { 1: migrateV1ToV2, 2: migrateV2ToV3 } のように追記するだけでよい。
 * 現状 CURRENT=1 のため移行関数は存在しない（空オブジェクト）。
 */
const migrations: Record<number, (doc: any) => any> = {}

/**
 * raw.schemaVersion から CURRENT_SCHEMA_VERSION まで移行関数を順に適用する runner。
 * 検証は行わない（validate.ts の責務）。fromDoc から「先読み→fail-closed」の後に呼ばれる前提。
 */
export function migrateHouseholdDoc(raw: any): HouseholdDoc {
  let doc = raw
  let version = doc.schemaVersion
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version]
    if (!migrate) {
      throw new Error(`No migration registered for schemaVersion ${version}`)
    }
    doc = migrate(doc)
    version = doc.schemaVersion
  }
  return doc as HouseholdDoc
}
```

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/migrate.test.ts`
Expected: PASS（2 tests）

- [x] **Step 5: fromDoc に migrate を組み込む**

`src/persistence/doc.ts` の `fromDoc` を以下に置き換える（migrate 呼び出しを追加。他は変更しない）:

```ts
import { migrateHouseholdDoc } from './migrate'

// ...

export function fromDoc(raw: unknown): HouseholdDoc {
  const envelope = raw as { schemaVersion: number }
  if (envelope.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(envelope.schemaVersion)
  }
  const migrated = migrateHouseholdDoc(raw)
  validateHouseholdDoc(migrated)
  return migrated
}
```

- [x] **Step 6: doc.test.ts のテストが引き続き通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts tests/persistence/migrate.test.ts`
Expected: PASS（doc.test.ts 18件 ＋ migrate.test.ts 2件 = 20 tests）

- [x] **Step 7: 全テスト・型チェック（golden 不変の確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS（既存48テスト・golden回帰が変更なしで green）

- [x] **Step 8: Commit**

```bash
git add lifeplan/src/persistence/migrate.ts lifeplan/src/persistence/doc.ts lifeplan/tests/persistence/migrate.test.ts
git commit -m "feat: add schema migration runner and wire into fromDoc (migrate-then-validate order)"
```

---

## Task 5: `HouseholdRepository` ポート ＋ `InMemoryHouseholdRepository`

**Files:**
- Create: `lifeplan/src/persistence/repository.ts`
- Test: `lifeplan/tests/persistence/repository.test.ts`

**Interfaces:**
- Consumes: `HouseholdDoc`（Task 1）、`toDoc`/`fromDoc`（Task 3）
- Produces:
  - `HouseholdRepository` interface:
    ```ts
    interface HouseholdRepository {
      load(householdId: string): Promise<HouseholdDoc | null>
      save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc>
      subscribe(
        householdId: string,
        cb: (doc: HouseholdDoc | null) => void,
        onError?: (e: unknown) => void,
      ): () => void
    }
    ```
  - `InMemoryHouseholdRepository implements HouseholdRepository` — メモリ上の `Map<string, HouseholdDoc>` をストアとする。`save` は `updatedAt` を呼び出し側の値のまま確定値として設定し保存後の doc を返す（サーバ確定値のシミュレーションとして、テストでは呼び出し側が明示的に `updatedAt` を渡す）。`subscribe` は購読直後に現在値（未保存なら `null`）で1回同期発火し、以後 `save` のたびに登録済みリスナー全員へ発火する。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/persistence/repository.test.ts
import { describe, it, expect, vi } from 'vitest'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import { createDefaultDoc } from '../../src/persistence/doc'

describe('InMemoryHouseholdRepository', () => {
  it('未保存時の load は null', async () => {
    const repo = new InMemoryHouseholdRepository()
    expect(await repo.load('h1')).toBeNull()
  })

  it('save→load で往復する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    const loaded = await repo.load('h1')
    expect(loaded).toEqual(doc)
  })

  it('save は確定 doc（渡した doc と同一内容）を返す', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    const saved = await repo.save('h1', doc)
    expect(saved).toEqual(doc)
  })

  it('subscribe は購読直後に現在値(未保存はnull)で1回発火する', () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('subscribe は既存データがあればそれで初回発火する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(doc)
  })

  it('subscribe は save のたびに再発火する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith(doc)
  })

  it('unsubscribe すると以後発火しない', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    const unsubscribe = repo.subscribe('h1', cb)
    unsubscribe()
    await repo.save('h1', createDefaultDoc())
    expect(cb).toHaveBeenCalledTimes(1) // 初回発火のみ
  })

  it('別の householdId の save は影響しない', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    await repo.save('h2', createDefaultDoc())
    expect(cb).toHaveBeenCalledTimes(1) // 初回発火のみ、h2への保存では発火しない
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/repository.test.ts`
Expected: FAIL（`src/persistence/repository.ts` が存在しない）

- [x] **Step 3: repository.ts を実装**

```ts
// src/persistence/repository.ts
import type { HouseholdDoc } from './types'

export interface HouseholdRepository {
  load(householdId: string): Promise<HouseholdDoc | null>
  save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc>
  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    onError?: (e: unknown) => void,
  ): () => void
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  private store = new Map<string, HouseholdDoc>()
  private listeners = new Map<string, Set<(doc: HouseholdDoc | null) => void>>()

  async load(householdId: string): Promise<HouseholdDoc | null> {
    return this.store.get(householdId) ?? null
  }

  async save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc> {
    this.store.set(householdId, doc)
    const listeners = this.listeners.get(householdId)
    if (listeners) {
      for (const cb of listeners) cb(doc)
    }
    return doc
  }

  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    _onError?: (e: unknown) => void,
  ): () => void {
    if (!this.listeners.has(householdId)) {
      this.listeners.set(householdId, new Set())
    }
    const set = this.listeners.get(householdId)!
    set.add(cb)
    cb(this.store.get(householdId) ?? null) // 購読直後に現在値で初期発火
    return () => set.delete(cb)
  }
}
```

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/persistence/repository.test.ts`
Expected: PASS（8 tests）

- [x] **Step 5: 全テスト・型チェック（プラン全体の最終確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS。**ゴールデン回帰（`tests/golden.test.ts`）が変更なしで green** であることを目視確認（背骨の達成証明）。

- [x] **Step 6: Commit**

```bash
git add lifeplan/src/persistence/repository.ts lifeplan/tests/persistence/repository.test.ts
git commit -m "feat: add HouseholdRepository port and InMemory implementation"
```

---

## Self-Review チェック結果

- **Spec coverage（§12）**:
  - §12.2 データモデル（`Scenario`/`HouseholdDoc`/封筒）→ Task 1
  - §12.3 レイヤー構成（`types`/`errors`/`validate`/`doc`/`migrate`/`repository`）→ Task 1〜5
  - §12.3.1 `fromDoc` の順序（先読み→fail-closed→migrate→validate）→ Task 3（暫定）＋ Task 4（正式組み込み）
  - §12.3.2 `HouseholdRepository` ポート（save確定doc返却・subscribe nullable+初期発火+onError）→ Task 5
  - §12.4 テスト戦略（往復・検証reject一覧・未来版fail-closed・マイグレーション順序・Repository契約・ブートストラップ・背骨）→ 全項目が対応タスクでカバー
  - §12.5 実装順序（types→validate+doc→migrate→repository）→ Task 1〜5 がそのまま踏襲
  - §12.6 既知の負債（baseYear正規化・masterDataVersion・並行性本実装）→ 本プランでは着手しない旨を Global Constraints に明記（scope外として維持）
  - Firestoreアダプタ・セキュリティルール・IaC → 本プランのスコープ外として明記（Global Constraints）。実装しない。
- **Placeholder scan**: 全ステップに実コード・実コマンド・期待値あり。TBD/TODO なし。
- **Type consistency**: `HouseholdDoc`/`Scenario`/`HouseholdContent`（Task 1）→ validate/doc/migrate/repository で一貫使用。`DocValidationError`/`UnsupportedSchemaVersionError`（Task 1）→ validate/doc で一貫使用。`toDoc`/`fromDoc`/`createDefaultDoc`（Task 3）→ repository のテストで一貫使用。`migrateHouseholdDoc`（Task 4）のシグネチャが Task 3 の `fromDoc` 内呼び出しと一致。
- **背骨の検証点**: 全タスクが `src/persistence/` 配下の新規ファイルのみを作成し、`src/engine/` を一切変更しない。Task 3/4/5 の Step で毎回 `npm test` を通し golden 不変を確認する。
- **依存方向の修正（セルフレビューで発見）**: 当初案は `src/persistence/doc.ts` が `tests/_realInputs.ts` を import する設計だった（本体コードがテストフィクスチャに依存する設計違反）。Task 3 で `defaultInputs` を `src/persistence/defaultHousehold.ts` に移設し、`tests/_realInputs.ts` はそこからの re-export に変更。既存テストの import 文（`realInputs`という名前）は無改修で動作する。

---

## 本プランのスコープ外（後日・別プラン）

- `src/persistence/firestoreRepository.ts`（`HouseholdRepository` の Firestore 実装、`getDoc`/`setDoc`/`onSnapshot`）
- Firebase 初期化（`firebase/app`・`firestore`・`auth`）と Auth ガード
- `firestore.rules`（2人のUIDホワイトリスト）とエミュレータ検証
- IaC（`firebase.json`／`.firebaserc`／`firestore.indexes.json` のリポジトリ管理、将来の Terraform 化）
- compare-and-set（楽観ロック）の実装、`hasPendingWrites` によるエコーループ抑止
- React/Vite/Zustand ストアとの配線（Plan 4）
