# ライフプラン 実績/予実エンジン層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 予測専用エンジン（Plan 1 完成済み）に「過去の確定値（年末残高）」という時間軸を加える純TS加算レイヤーを実装する。`simulate` に実績を渡すと最新実績から自動リベースし、当初プラン（凍結ベースライン）との予実差分を出せるようにする。

**Architecture:** 既存の `simulate(inputs, master, opts)` に `opts.actuals?: Actual[]` を追加する純粋関数の拡張。各年は従来どおり計算し、その年に実績があれば年末残高だけを上書きして翌年へ繰り越す。ベースライン凍結（`captureBaseline`）と予実差分（`computeVariance`）は独立した純TSヘルパー。UI・Firebase 非依存。

**Tech Stack:** TypeScript, Vitest, Node 20+（Plan 1 と同一トーンチェーン）。新規依存なし。

**仕様の源泉:** `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` の **§11（実績値の投入とリベース・予実比較）**。本プランは §11.3〜§11.5 を実装する。

## Global Constraints

- **背骨（最重要・§11.5）**: `opts.actuals` 未指定なら `simulate` の出力は**現行と完全一致**。既存のゴールデン回帰（`tests/golden.test.ts`, Plan 1 Task 9）は**一切変更せず green のまま**であること。これがリベース層が純粋な加算であることの証明。
- 純TS。DOM/Firebase 依存を入れない。`new Date()`/乱数など非決定的要素をエンジンに入れない（`capturedAt` は呼び出し側から注入）。
- 金額は円。エンジンは丸めない。
- 実績の粒度は**年末の現金預金残高・投資残高のみ**（§11.1）。`[baseYear, endYear]` の範囲外の年は無視。
- 作業ディレクトリは `lifeplan/`（テストは `cd lifeplan && npx vitest run …`）。ソースは `lifeplan/src/`、テストは `lifeplan/tests/`。
- 実績年の `investmentReturn`/`investmentContribution` は `null`（年末残高だけからは復元不能 → 偽の数字を出さない・§11.3）。`income`/`expenses`/`annualCashFlow` はモデル推定値として残す。
- `coastFireNumber`/KPI の再導出（§11.4）は UI/表示の責務。**本プランではスコープ外**。エンジンは従来どおり `coastFireNumber` を出力し続ける。

---

## File Structure

- `lifeplan/src/types.ts` — `Actual` 型を追加。`YearRow` の `investmentReturn`/`investmentContribution` を `number | null` に、`isActual: boolean` を追加（Modify）
- `lifeplan/src/engine/simulate.ts` — `opts.actuals` 受け取りと年末残高の上書き伝播（Modify）
- `lifeplan/src/engine/baseline.ts` — `captureBaseline`（当初プランの凍結系列）＋ `Baseline`/`BaselinePoint` 型（Create）
- `lifeplan/src/engine/variance.ts` — `computeVariance`（予実差分）＋ `VariancePoint` 型（Create）
- `lifeplan/tests/actuals.test.ts` — 型変更の後方互換 ＋ 実績上書き/リベースのテスト（Create）
- `lifeplan/tests/baseline.test.ts` — `captureBaseline` のテスト（Create）
- `lifeplan/tests/variance.test.ts` — `computeVariance` のテスト（Create）

各タスクは依存順。Task N は Task N-1 の成果物を使う。必ず上から順に実装する。

---

## Task 1: 型の追加（Actual / YearRow 変更）と simulate の isActual 付与

**Files:**
- Modify: `lifeplan/src/types.ts`
- Modify: `lifeplan/src/engine/simulate.ts`
- Test: `lifeplan/tests/actuals.test.ts`

**Interfaces:**
- Consumes: 既存 `YearRow`, `simulate(inputs, master, opts?)`
- Produces:
  - `Actual { year: number; cashBalance: number; investmentBalance: number; note?: string }`
  - `YearRow.investmentReturn: number | null`、`YearRow.investmentContribution: number | null`、`YearRow.isActual: boolean`（予測行は常に `false`）
  - この時点では `simulate` の挙動は不変（実績未対応）。全行 `isActual: false`、return/contribution は数値のまま。

このタスクは**純粋に加算的**（型を緩めて新フィールドを足すだけ）。`null` 緩和の影響範囲は事前確認済み: `investmentReturn`/`investmentContribution` の YearRow フィールドを**算術に使う消費者は存在しない**（`simulate.ts` 内の代入のみ。`goalSeek` は `totalAssets` だけを読む。golden/simulate テストは `investmentBalance`/`cashBalance`/`totalAssets` を読む）。よって golden は green のまま、コンパイルも通る。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/actuals.test.ts
import { describe, it, expect } from 'vitest'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { realInputs } from './_realInputs'

describe('simulate without actuals (backward compat)', () => {
  it('全行が予測(isActual=false)で return 系は数値', () => {
    const rows = simulate(realInputs, lifeplanMaster)
    expect(rows.every(r => r.isActual === false)).toBe(true)
    expect(typeof rows[0]!.investmentReturn).toBe('number')
    expect(typeof rows[0]!.investmentContribution).toBe('number')
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/actuals.test.ts`
Expected: FAIL（`isActual` 未定義のため `r.isActual === false` が `undefined === false` で false → `every` が false）。型エラーになる場合も FAIL 扱い。

- [x] **Step 3: types.ts に Actual を追加し YearRow を変更**

`src/types.ts` に `Actual` インターフェースを追加（`NamedBalance` の近く、`YearRow` の前あたりでよい）:

```ts
export interface Actual {
  year: number
  cashBalance: number
  investmentBalance: number
  note?: string
}
```

`YearRow` の3フィールドを変更（`investmentContribution`/`investmentReturn` を `number | null` に、`isActual` を追加）:

```ts
export interface YearRow {
  year: number
  agePrimary: number
  ageSpouse: number | null
  agesChildren: number[]
  income: number
  expenses: ExpenseBreakdown
  totalExpense: number
  annualCashFlow: number
  investmentContribution: number | null
  investmentReturn: number | null
  investmentBalance: number
  cashBalance: number
  totalAssets: number
  investmentRatio: number
  coastFireNumber: number
  isActual: boolean
}
```

- [x] **Step 4: simulate.ts の rows.push に isActual を追加**

`src/engine/simulate.ts` の `rows.push({ ... })` に `isActual: false,` を1行追加する（他は変更しない）。`investmentRatio` の行のあとに足す:

```ts
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual: false,
    })
```

- [x] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/actuals.test.ts`
Expected: PASS（1 test）

- [x] **Step 6: 全テスト・型チェック（golden 不変の確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS（ゴールデン回帰を含め既存テストが変更なしで green）

- [x] **Step 7: Commit**

```bash
git add lifeplan/src/types.ts lifeplan/src/engine/simulate.ts lifeplan/tests/actuals.test.ts
git commit -m "feat: add Actual type and YearRow.isActual (additive, golden unchanged)"
```

---

## Task 2: simulate に実績上書き（リベース）を実装

**Files:**
- Modify: `lifeplan/src/engine/simulate.ts`
- Test: `lifeplan/tests/actuals.test.ts`

**Interfaces:**
- Consumes: `Actual`（Task 1）、`simulate`
- Produces: `simulate(inputs, master, opts?: { returnRate?: number; actuals?: Actual[] }): YearRow[]`
  - `opts.actuals` の各年（`[baseYear, endYear]` 内）で年末残高 `cash`/`invest` を実績値に上書き。`isActual=true`、`investmentReturn`/`investmentContribution` は `null`。
  - 上書きは翌年へ繰り越され、最新実績から自動リベース。範囲外の年の実績は無視。`opts.actuals` 未指定/空は現行挙動と完全一致。

- [x] **Step 1: 失敗するテストを書く**

`tests/actuals.test.ts` に以下の describe を追記する（Task 1 の describe はそのまま残す）:

```ts
describe('simulate with actuals (rebase)', () => {
  const R = realInputs.assumptions.investmentReturnRate / 100
  const byYear = (rows: ReturnType<typeof simulate>) => new Map(rows.map(r => [r.year, r]))

  it('actuals:[] は未指定と完全一致（後方互換）', () => {
    const a = simulate(realInputs, lifeplanMaster, { actuals: [] }).map(r => r.totalAssets)
    const b = simulate(realInputs, lifeplanMaster).map(r => r.totalAssets)
    expect(a).toEqual(b)
  })

  it('実績年は年末残高を上書きし return/contribution は null', () => {
    const rows = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const r = byYear(rows).get(2027)!
    expect(r.isActual).toBe(true)
    expect(r.cashBalance).toBe(5_000_000)
    expect(r.investmentBalance).toBe(12_000_000)
    expect(r.totalAssets).toBe(16_000_000)
    expect(r.investmentReturn).toBeNull()
    expect(r.investmentContribution).toBeNull()
  })

  it('baseYear の実績は seed と二重計上しない', () => {
    const rows = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2026, cashBalance: 1_000_000, investmentBalance: 2_000_000 }],
    })
    expect(rows[0]!.year).toBe(2026)
    expect(rows[0]!.totalAssets).toBe(3_000_000)
  })

  it('上書きは翌年へ繰り越す（翌年 return = 上書き残高 × r）', () => {
    const rows = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const next = byYear(rows).get(2028)!
    expect(next.isActual).toBe(false)
    expect(next.investmentReturn).toBeCloseTo(12_000_000 * R, 6)
  })

  it('当初予測とズレた実績で未来の軌道が変わる（リベース）', () => {
    const base = simulate(realInputs, lifeplanMaster).at(-1)!.investmentBalance
    const bumped = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 50_000_000 }],
    }).at(-1)!.investmentBalance
    expect(bumped).toBeGreaterThan(base)
  })

  it('実績の無い間の年は通常どおり予測（ギャップ年）', () => {
    const rows = simulate(realInputs, lifeplanMaster, {
      actuals: [
        { year: 2026, cashBalance: 1, investmentBalance: 1 },
        { year: 2028, cashBalance: 2, investmentBalance: 2 },
      ],
    })
    const m = byYear(rows)
    expect(m.get(2026)!.isActual).toBe(true)
    expect(m.get(2027)!.isActual).toBe(false)
    expect(m.get(2028)!.isActual).toBe(true)
  })

  it('範囲外の実績は無視（出力は未指定と一致）', () => {
    const oor = simulate(realInputs, lifeplanMaster, {
      actuals: [
        { year: 1999, cashBalance: 9, investmentBalance: 9 },
        { year: 3000, cashBalance: 9, investmentBalance: 9 },
      ],
    })
    expect(oor.every(r => r.isActual === false)).toBe(true)
    expect(oor.map(r => r.totalAssets)).toEqual(simulate(realInputs, lifeplanMaster).map(r => r.totalAssets))
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/actuals.test.ts`
Expected: FAIL（`actuals` 未対応のため上書き系が全滅。`actuals:[]` 一致のみ偶然通る可能性あり）

- [x] **Step 3: simulate.ts に上書きロジックを実装**

`src/engine/simulate.ts` を以下のように変更する。

(a) シグネチャと先頭に実績マップを追加:

```ts
import type { Inputs, MasterData, YearRow, Actual } from '../types'
import { ageAt } from './ageGrade'
import { incomeForYear } from './income'
import { expensesForYear, totalExpenseOf } from './expenses'

export function simulate(
  inputs: Inputs, master: MasterData, opts?: { returnRate?: number; actuals?: Actual[] },
): YearRow[] {
  const a = inputs.assumptions
  const r = (opts?.returnRate ?? a.investmentReturnRate) / 100
  const actualByYear = new Map((opts?.actuals ?? []).map(x => [x.year, x]))
  const startCash = inputs.assets.bankAccounts.reduce((s, x) => s + x.balance, 0)
  const startInvest = inputs.assets.investments.reduce((s, x) => s + x.balance, 0)
```

(b) ループ内、`cash`/`invest` を更新した直後・`totalAssets` を計算する前に上書きを挿入する。現行の

```ts
    const investmentReturn = invest * r
    invest = invest + contribution + investmentReturn
    cash = cash + annualCashFlow - contribution
    const totalAssets = cash + invest
```

を次に置き換える:

```ts
    const investmentReturn = invest * r
    invest = invest + contribution + investmentReturn
    cash = cash + annualCashFlow - contribution

    // 実績があれば年末残高を上書き（最新実績から翌年へ繰り越し＝自動リベース）
    const actual = actualByYear.get(year)
    let isActual = false
    let rowContribution: number | null = contribution
    let rowReturn: number | null = investmentReturn
    if (actual) {
      invest = actual.investmentBalance
      cash = actual.cashBalance
      isActual = true
      rowContribution = null
      rowReturn = null
    }
    const totalAssets = cash + invest
```

(c) `rows.push` の該当フィールドを上書き対応値に差し替える。現行の

```ts
      investmentContribution: contribution, investmentReturn,
      investmentBalance: invest, cashBalance: cash, totalAssets,
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual: false,
```

を次に置き換える:

```ts
      investmentContribution: rowContribution, investmentReturn: rowReturn,
      investmentBalance: invest, cashBalance: cash, totalAssets,
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual,
```

> 注: 範囲外の年は `actualByYear.get(year)` が `undefined` を返すため自然に無視される（ループは `[baseYear, endYear]` のみ走る）。

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/actuals.test.ts`
Expected: PASS（Task 1 の 1 件 ＋ 本タスクの 7 件 = 8 tests）

- [x] **Step 5: 全テスト・型チェック（golden 不変の確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS（ゴールデン回帰が変更なしで green ＝ リベース層は純粋加算）

- [x] **Step 6: Commit**

```bash
git add lifeplan/src/engine/simulate.ts lifeplan/tests/actuals.test.ts
git commit -m "feat: apply year-end actuals to simulate (auto-rebase from latest)"
```

---

## Task 3: ベースライン凍結ヘルパー（captureBaseline）

**Files:**
- Create: `lifeplan/src/engine/baseline.ts`
- Test: `lifeplan/tests/baseline.test.ts`

**Interfaces:**
- Consumes: `simulate`（実績なしで実行）、`Inputs`, `MasterData`
- Produces:
  - `BaselinePoint { year: number; totalAssets: number; investmentBalance: number; cashBalance: number }`
  - `Baseline { capturedAt?: string; series: BaselinePoint[] }`
  - `captureBaseline(inputs, master, opts?: { capturedAt?: string }): Baseline` — 実績なしの `simulate` 結果を凍結。純粋関数（内部に時計を持たない。`capturedAt` は呼び出し側注入）。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/baseline.test.ts
import { describe, it, expect } from 'vitest'
import { captureBaseline } from '../src/engine/baseline'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { realInputs } from './_realInputs'

describe('captureBaseline', () => {
  it('実績なし simulate の系列を凍結する', () => {
    const b = captureBaseline(realInputs, lifeplanMaster)
    const rows = simulate(realInputs, lifeplanMaster)
    expect(b.series.map(p => p.year)).toEqual(rows.map(r => r.year))
    expect(b.series.map(p => p.totalAssets)).toEqual(rows.map(r => r.totalAssets))
    expect(b.series.map(p => p.investmentBalance)).toEqual(rows.map(r => r.investmentBalance))
    expect(b.series.map(p => p.cashBalance)).toEqual(rows.map(r => r.cashBalance))
  })
  it('呼び出し間で不変（決定的）', () => {
    const a = captureBaseline(realInputs, lifeplanMaster)
    const b = captureBaseline(realInputs, lifeplanMaster)
    expect(a.series).toEqual(b.series)
  })
  it('capturedAt は呼び出し側注入（内部時計を持たない）', () => {
    const b = captureBaseline(realInputs, lifeplanMaster, { capturedAt: '2026-12-31' })
    expect(b.capturedAt).toBe('2026-12-31')
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/baseline.test.ts`
Expected: FAIL（`baseline` モジュール未定義）

- [x] **Step 3: baseline.ts を実装**

```ts
// src/engine/baseline.ts
import type { Inputs, MasterData } from '../types'
import { simulate } from './simulate'

export interface BaselinePoint {
  year: number
  totalAssets: number
  investmentBalance: number
  cashBalance: number
}

export interface Baseline {
  capturedAt?: string
  series: BaselinePoint[]
}

/**
 * 当初プランを凍結する。実績なしで simulate を1回走らせ、その系列を固定値として返す。
 * 純粋関数: capturedAt は呼び出し側から注入する（永続化層の責務、§11.2）。
 */
export function captureBaseline(
  inputs: Inputs, master: MasterData, opts?: { capturedAt?: string },
): Baseline {
  const rows = simulate(inputs, master)
  return {
    capturedAt: opts?.capturedAt,
    series: rows.map(r => ({
      year: r.year,
      totalAssets: r.totalAssets,
      investmentBalance: r.investmentBalance,
      cashBalance: r.cashBalance,
    })),
  }
}
```

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/baseline.test.ts`
Expected: PASS（3 tests）

- [x] **Step 5: Commit**

```bash
git add lifeplan/src/engine/baseline.ts lifeplan/tests/baseline.test.ts
git commit -m "feat: add captureBaseline (frozen original-plan series)"
```

---

## Task 4: 予実差分ヘルパー（computeVariance）

**Files:**
- Create: `lifeplan/src/engine/variance.ts`
- Test: `lifeplan/tests/variance.test.ts`

**Interfaces:**
- Consumes: `Baseline`（Task 3）、`Actual`（Task 1）
- Produces:
  - `VariancePoint { year: number; predicted: number; actual: number; diff: number; diffPct: number }`
  - `computeVariance(baseline: Baseline, actuals: Actual[]): VariancePoint[]` — 実績年ごとに当初プラン `totalAssets`（predicted）と実績合計（cash+invest）を比較。`diff = actual - predicted`、`diffPct = diff/predicted`（predicted=0 のときは 0）。baseline に無い年の実績はスキップ。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/variance.test.ts
import { describe, it, expect } from 'vitest'
import { computeVariance } from '../src/engine/variance'
import type { Baseline } from '../src/engine/baseline'
import type { Actual } from '../src/types'

const baseline: Baseline = {
  series: [
    { year: 2026, totalAssets: 10_000_000, investmentBalance: 6_000_000, cashBalance: 4_000_000 },
    { year: 2027, totalAssets: 12_000_000, investmentBalance: 6_000_000, cashBalance: 5_000_000 },
  ],
}

describe('computeVariance', () => {
  it('diff と diffPct を計算（actual - predicted）', () => {
    const actuals: Actual[] = [{ year: 2026, cashBalance: 5_000_000, investmentBalance: 6_500_000 }]
    // actual合計=11,500,000 / predicted=10,000,000 → diff +1,500,000 / pct 0.15
    const v = computeVariance(baseline, actuals)
    expect(v).toHaveLength(1)
    expect(v[0]).toEqual({
      year: 2026, predicted: 10_000_000, actual: 11_500_000, diff: 1_500_000, diffPct: 0.15,
    })
  })
  it('baseline に無い年の実績はスキップ', () => {
    const v = computeVariance(baseline, [{ year: 2099, cashBalance: 1, investmentBalance: 1 }])
    expect(v).toHaveLength(0)
  })
  it('predicted が 0 のとき diffPct は 0', () => {
    const b: Baseline = { series: [{ year: 2026, totalAssets: 0, investmentBalance: 0, cashBalance: 0 }] }
    const v = computeVariance(b, [{ year: 2026, cashBalance: 100, investmentBalance: 0 }])
    expect(v[0]!.diff).toBe(100)
    expect(v[0]!.diffPct).toBe(0)
  })
})
```

- [x] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/variance.test.ts`
Expected: FAIL（`variance` モジュール未定義）

- [x] **Step 3: variance.ts を実装**

```ts
// src/engine/variance.ts
import type { Actual } from '../types'
import type { Baseline } from './baseline'

export interface VariancePoint {
  year: number
  predicted: number   // 当初プランの totalAssets
  actual: number      // 実績合計 (cash + invest)
  diff: number        // actual - predicted
  diffPct: number     // diff / predicted（predicted=0 のときは 0）
}

export function computeVariance(baseline: Baseline, actuals: Actual[]): VariancePoint[] {
  const predictedByYear = new Map(baseline.series.map(p => [p.year, p.totalAssets]))
  const out: VariancePoint[] = []
  for (const a of actuals) {
    const predicted = predictedByYear.get(a.year)
    if (predicted === undefined) continue // baseline に無い年はスキップ
    const actual = a.cashBalance + a.investmentBalance
    const diff = actual - predicted
    const diffPct = predicted !== 0 ? diff / predicted : 0
    out.push({ year: a.year, predicted, actual, diff, diffPct })
  }
  return out
}
```

- [x] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/variance.test.ts`
Expected: PASS（3 tests）

- [x] **Step 5: 全テスト・型チェック（プラン全体の最終確認）**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト PASS。**ゴールデン回帰（`tests/golden.test.ts`）が変更なしで green** であることを目視確認（背骨の達成証明）。

- [x] **Step 6: Commit**

```bash
git add lifeplan/src/engine/variance.ts lifeplan/tests/variance.test.ts
git commit -m "feat: add computeVariance (predicted vs actual diff)"
```

---

## Self-Review チェック結果

- **Spec coverage（§11）**:
  - §11.3 エンジン変更（`opts.actuals`・年末上書き・実績年 null）→ Task 1（型）＋ Task 2（上書き）
  - §11.2 ベースライン凍結（真に不変・世帯共通）→ Task 3 `captureBaseline`
  - §11.4 `computeVariance` → Task 4
  - §11.5 テスト戦略: 後方互換（Task 1 Step 6 / Task 2 Step 5 で golden 不変）・上書き伝播（Task 2）・リベース（Task 2）・ベースライン不変（Task 3）・variance（Task 4）・実績年 null（Task 2）→ 全項目カバー
  - §11.4 の goalSeek/KPI/利回りバンドへの**波及は UI・永続化の責務**（`simulate` に `actuals` を渡すだけで成立）。本プランは `simulate` 拡張で土台を提供済み。再導出 UI は Plan 4。
- **Placeholder scan**: 全ステップに実コード・実コマンド・期待値あり。TBD/TODO なし。
- **Type consistency**: `Actual`（types.ts）→ simulate / variance で一致使用。`Baseline`/`BaselinePoint`（baseline.ts）→ variance / テストで一致。`simulate` の opts は `{ returnRate?; actuals? }` の単一加算オブジェクトで既存呼び出し（`simulate(i,m)` / `{returnRate}`）に非破壊。
- **背骨の検証点**: `number | null` 緩和の消費者影響は事前 grep 済み（算術消費者ゼロ）。golden は全タスクで変更せず green を維持。
