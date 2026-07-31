# 実績値としての収支入力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実績値入力（`/actuals`）で単年度の実績収入・実績支出を任意項目として記録できるようにし、ダッシュボードの年次一覧表で収入・支出・収支のそれぞれが実績値由来かシミュレーション値由来かを区別して表示する。

**Architecture:** `Actual`型（`src/types.ts`）に任意フィールド`actualIncome?`/`actualExpense?`を追加し、`Actual`レコードと同じ年に紐付ける。エンジン（`simulate()`/`buildHistoricalRows()`）はこれらの値を`YearRow`へそのまま受け渡すだけで、現金・投資残高のシミュレーション計算（`cash`/`invest`の積み上げ）には一切使わない（表示専用）。ダッシュボードの`AnnualTable`が`YearRow.actualIncome`/`actualExpense`の有無を見て、実績値優先＋実績バッジ表示、無ければシミュレーション値にフォールバックする。

**Tech Stack:** TypeScript, React, Vitest, Testing Library, 既存の`src/persistence/`（Firestore経由の永続化・`ignoreUndefinedProperties: true`設定済み）。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-07-27-actual-income-expense-design.md`（このプランの唯一の仕様源泉。矛盾があれば設計書を優先）。
- 実績収入・実績支出は**表示専用**。資産残高のシミュレーション計算（`simulate()`の`cash`/`invest`積み上げ・生活防衛資金取り崩し・自動リベース）を変更してはならない。ゴールデンマスター回帰（`tests/golden.integration.test.ts`、誤差0.00%）を崩さないこと。
- カテゴリ別支出内訳（`ExpenseBreakdown`）の実績記録・表示はスコープ外。今回は収入・支出の合計2項目のみ。
- 資産残高（`cashBalance`/`investmentBalance`）は引き続き必須。実績収支は同一`Actual`レコードへの任意項目として追加する（資産残高と切り離した独立記録は行わない）。
- 空欄に戻したフィールドはFirestoreに`undefined`を書き込まず、キー自体を落とす（既存の`note`フィールドの`withNote`パターンに倣う）。
- 各タスックの最後に該当テストを実行してパスを確認してからコミットする。

---

### Task 1: `Actual`型に実績収支フィールドを追加し、`validate.ts`で検証する

**Files:**
- Modify: `lifeplan/src/types.ts`（`Actual`インターフェース、L36-41）
- Modify: `lifeplan/src/persistence/validate.ts`
- Test: `lifeplan/tests/persistence/doc.test.ts`

**Interfaces:**
- Produces: `Actual.actualIncome?: number`、`Actual.actualExpense?: number` — Task 3（UI）・Task 4（エンジン）が利用する。

- [ ] **Step 1: `Actual`型に任意フィールドを追加**

`lifeplan/src/types.ts`の`Actual`インターフェースを以下に置き換える。

```ts
export interface Actual {
  year: number
  cashBalance: number
  investmentBalance: number
  note?: string
  actualIncome?: number   // 実績収入(年間・任意)。表示専用でシミュレーション計算には使わない
  actualExpense?: number  // 実績支出(年間・任意)。表示専用でシミュレーション計算には使わない
}
```

- [ ] **Step 2: 失敗するテストを書く**

`lifeplan/tests/persistence/doc.test.ts`の`it('actuals の残高が Infinity なら reject', ...)`ブロックの直後（L95の後、`it('baseline.series が昇順でないなら reject', ...)`の直前）に以下を追加する。

```ts
  it('actuals の実績収入が数値でないなら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: 1, investmentBalance: 1, actualIncome: NaN }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の実績支出が Infinity なら reject', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: 1, investmentBalance: 1, actualExpense: Infinity }]
    expect(() => validateHouseholdDoc(d)).toThrow(DocValidationError)
  })

  it('actuals の実績収入・実績支出は未指定でも許容する', () => {
    const d = validDoc()
    d.actuals = [{ year: 2027, cashBalance: 1, investmentBalance: 1 }]
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })

  it('actuals の実績収入・実績支出が有効な数値なら許容する', () => {
    const d = validDoc()
    d.actuals = [
      { year: 2027, cashBalance: 1, investmentBalance: 1, actualIncome: 5_000_000, actualExpense: 4_000_000 },
    ]
    expect(() => validateHouseholdDoc(d)).not.toThrow()
  })
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run tests/persistence/doc.test.ts`
Expected: 新規4件のうち、NaN/Infinity を reject する2件が FAIL（現状の`validate.ts`は`actualIncome`/`actualExpense`を検証していないため）。未指定/有効数値の2件は既に PASS するはず（検証ロジックが無いだけなので throw しない）。

- [ ] **Step 4: `validate.ts`に検証ロジックを実装**

`lifeplan/src/persistence/validate.ts`の`investmentBalance`チェック（既存の以下のブロック）の直後に追記する。

```ts
    if (typeof a.investmentBalance !== 'number' || !Number.isFinite(a.investmentBalance)) {
      throw new DocValidationError(
        `actuals[${i}].investmentBalance is not a valid number`, `actuals[${i}].investmentBalance`,
      )
    }
```

の直後に:

```ts
    if (a.actualIncome !== undefined && !Number.isFinite(a.actualIncome)) {
      throw new DocValidationError(`actuals[${i}].actualIncome is not a valid number`, `actuals[${i}].actualIncome`)
    }
    if (a.actualExpense !== undefined && !Number.isFinite(a.actualExpense)) {
      throw new DocValidationError(
        `actuals[${i}].actualExpense is not a valid number`, `actuals[${i}].actualExpense`,
      )
    }
```

- [ ] **Step 5: テストを実行してパスを確認**

Run: `npx vitest run tests/persistence/doc.test.ts`
Expected: PASS（全件）

- [ ] **Step 6: コミット**

```bash
git add lifeplan/src/types.ts lifeplan/src/persistence/validate.ts lifeplan/tests/persistence/doc.test.ts
git commit -m "feat(actuals): Actualに実績収入・実績支出の任意フィールドを追加し検証する"
```

---

### Task 2: `OptionalMoneyField`入力コンポーネントを作る

**Files:**
- Create: `lifeplan/src/components/input/fields/OptionalMoneyField.tsx`
- Test: `lifeplan/src/components/input/fields/OptionalMoneyField.test.tsx`

**Interfaces:**
- Consumes: `styles from './fields.module.css'`（`.field`/`.label`/`.control`/`.suffix`/`.error`。既存の`NumberField`/`MoneyField`と共通）
- Produces: `OptionalMoneyField({ label: string, value: number | undefined, onCommit: (v: number | undefined) => void, min?: number }): JSX.Element` — Task 3（`ActualRow`）が利用する。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/fields/OptionalMoneyField.test.tsx`を新規作成する。

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OptionalMoneyField } from './OptionalMoneyField'

describe('OptionalMoneyField', () => {
  it('commits a valid parsed number', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<OptionalMoneyField label="実績収入" value={undefined} onCommit={onCommit} />)

    await user.type(screen.getByLabelText('実績収入'), '5000000')

    expect(onCommit).toHaveBeenLastCalledWith(5_000_000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('commits undefined when cleared to empty', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<OptionalMoneyField label="実績収入" value={5_000_000} onCommit={onCommit} />)

    await user.clear(screen.getByLabelText('実績収入'))

    expect(onCommit).toHaveBeenLastCalledWith(undefined)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts empty when value is undefined', () => {
    render(<OptionalMoneyField label="実績支出" value={undefined} onCommit={() => {}} />)
    expect(screen.getByLabelText('実績支出')).toHaveValue(null)
  })

  it('shows an error and does not commit below min(0)', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<OptionalMoneyField label="実績収入" value={undefined} onCommit={onCommit} />)

    await user.type(screen.getByLabelText('実績収入'), '-100')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('0以上')
  })

  it('follows an external value change (discard/save)', () => {
    const { rerender } = render(<OptionalMoneyField label="実績収入" value={5_000_000} onCommit={() => {}} />)
    rerender(<OptionalMoneyField label="実績収入" value={undefined} onCommit={() => {}} />)
    expect(screen.getByLabelText('実績収入')).toHaveValue(null)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/input/fields/OptionalMoneyField.test.tsx`
Expected: FAIL（`OptionalMoneyField`モジュールが存在しない）

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/components/input/fields/OptionalMoneyField.tsx`を新規作成する。

```tsx
import { useEffect, useRef, useState } from 'react'
import styles from './fields.module.css'

export interface OptionalMoneyFieldProps {
  label: string
  value: number | undefined
  onCommit: (v: number | undefined) => void
  min?: number
}

export function OptionalMoneyField({ label, value, onCommit, min = 0 }: OptionalMoneyFieldProps) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [error, setError] = useState<string | null>(null)
  const lastCommitted = useRef(value)

  // 外部要因(破棄/保存/他フィールド起因)の value 変化にだけ表示を追随させる(NumberFieldと同じパターン)。
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value
      setText(value === undefined ? '' : String(value))
      setError(null)
    }
  }, [value])

  const handleChange = (raw: string) => {
    setText(raw)
    if (raw.trim() === '') {
      setError(null)
      lastCommitted.current = undefined
      onCommit(undefined)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      setError('数値を入力してください')
      return
    }
    if (parsed < min) {
      setError(`${min}以上を入力してください`)
      return
    }
    setError(null)
    lastCommitted.current = parsed
    onCommit(parsed)
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <input
          type="number"
          value={text}
          aria-invalid={error !== null}
          aria-label={label}
          onChange={(e) => handleChange(e.target.value)}
        />
        <span className={styles.suffix}>円</span>
      </span>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </label>
  )
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run src/components/input/fields/OptionalMoneyField.test.tsx`
Expected: PASS（全5件）

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/fields/OptionalMoneyField.tsx lifeplan/src/components/input/fields/OptionalMoneyField.test.tsx
git commit -m "feat(input): 空欄=未入力を許容するOptionalMoneyFieldを追加"
```

---

### Task 3: `ActualRow`に実績収支入力欄を追加する

**Files:**
- Modify: `lifeplan/src/components/actuals/ActualRow.tsx`
- Modify: `lifeplan/src/components/actuals/ActualsPage.tsx`
- Modify: `lifeplan/src/components/actuals/ActualsPage.test.tsx`

**Interfaces:**
- Consumes: `OptionalMoneyField`（Task 2で作成）、`Actual.actualIncome?`/`actualExpense?`（Task 1で追加）
- Produces: なし（末端のUIコンポーネント）

- [ ] **Step 1: `ActualRow.tsx`を更新**

`lifeplan/src/components/actuals/ActualRow.tsx`の全文を以下に置き換える。

```tsx
import { MoneyField } from '../input/fields/MoneyField'
import { OptionalMoneyField } from '../input/fields/OptionalMoneyField'
import { TextField } from '../input/fields/TextField'
import type { Actual } from '../../types'
import { setActualAction, deleteActualAction, type ActionResult } from '../../store/actualsActions'
import styles from './ActualRow.module.css'

interface Props {
  actual: Actual
  onError: (message: string | null) => void
}

/**
 * note を空文字にしたら、Firestore が undefined フィールドを書けないためキー自体を落とす
 * (firestoreRepository.ts の `delete content.updatedAt` と同じ delete パターン。
 * 分割代入での drop は @typescript-eslint/no-unused-vars に引っかかるため使わない)。
 */
function withNote(actual: Actual, note: string): Actual {
  const next: Actual = { ...actual, note }
  if (note === '') delete next.note
  return next
}

/** actualIncome/actualExpense を空欄(undefined)に戻したら、withNote と同じ理由でキー自体を落とす。 */
function withOptionalAmount(actual: Actual, key: 'actualIncome' | 'actualExpense', v: number | undefined): Actual {
  const next: Actual = { ...actual, [key]: v }
  if (v === undefined) delete next[key]
  return next
}

export function ActualRow({ actual, onError }: Props) {
  const run = async (action: Promise<ActionResult>) => {
    const result = await action
    onError(result.ok ? null : (result.error ?? '操作に失敗しました'))
  }

  return (
    <li className={styles.row} aria-label={`${actual.year + 1}年始`}>
      <span className={styles.year}>{actual.year + 1}年始</span>
      <MoneyField
        label="現金残高"
        value={actual.cashBalance}
        onCommit={(cashBalance) => void run(setActualAction({ ...actual, cashBalance }))}
      />
      <MoneyField
        label="投資残高"
        value={actual.investmentBalance}
        onCommit={(investmentBalance) => void run(setActualAction({ ...actual, investmentBalance }))}
      />
      <OptionalMoneyField
        label="実績収入"
        value={actual.actualIncome}
        onCommit={(v) => void run(setActualAction(withOptionalAmount(actual, 'actualIncome', v)))}
      />
      <OptionalMoneyField
        label="実績支出"
        value={actual.actualExpense}
        onCommit={(v) => void run(setActualAction(withOptionalAmount(actual, 'actualExpense', v)))}
      />
      <TextField
        label="メモ"
        value={actual.note ?? ''}
        onCommit={(note) => void run(setActualAction(withNote(actual, note)))}
      />
      <button type="button" onClick={() => void run(deleteActualAction(actual.year))}>
        削除
      </button>
    </li>
  )
}
```

- [ ] **Step 2: `ActualsPage.tsx`に注記を追加**

`lifeplan/src/components/actuals/ActualsPage.tsx`の以下のブロック:

```tsx
      <p className={styles.note}>
        ※ ここでの「年」は年始時点を表します（例:「2025年始」＝2024年12月末と同じ時点）。
      </p>
```

の直後に追加する。

```tsx
      <p className={styles.note}>
        ※「実績収入」「実績支出」はダッシュボードでの比較表示のみに使われ、シミュレーション計算には反映されません。
      </p>
```

- [ ] **Step 3: `ActualsPage.test.tsx`にテストを追加**

`lifeplan/src/components/actuals/ActualsPage.test.tsx`の`describe('ActualsPage', ...)`ブロック内、最後の`it('allows recording a year before baseYear as a reference-only actual (§16.9)', ...)`の後に追加する。

```tsx
  it('records an optional actual income for a recorded year', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear + 1}年始` })
    await user.type(within(row).getByLabelText('実績収入'), '5000000')

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals[0]?.actualIncome).toBe(5_000_000))
  })

  it('clears an optional actual expense back to unset (key dropped, not just undefined)', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear + 1}年始` })
    await user.type(within(row).getByLabelText('実績支出'), '4000000')
    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals[0]?.actualExpense).toBe(4_000_000))

    await user.clear(within(row).getByLabelText('実績支出'))
    await waitFor(() =>
      expect(useHouseholdStore.getState().doc?.actuals[0]).not.toHaveProperty('actualExpense'),
    )
  })
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run src/components/actuals/ActualsPage.test.tsx`
Expected: PASS（既存9件＋新規2件の11件）

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/actuals/ActualRow.tsx lifeplan/src/components/actuals/ActualsPage.tsx lifeplan/src/components/actuals/ActualsPage.test.tsx
git commit -m "feat(actuals): 実績値入力画面に実績収入・実績支出の入力欄を追加"
```

---

### Task 4: エンジンで実績収支を`YearRow`へ受け渡す(計算には使わない)

**Files:**
- Modify: `lifeplan/src/types.ts`（`YearRow`インターフェース、L105-124）
- Modify: `lifeplan/src/engine/simulate.ts`
- Modify: `lifeplan/src/store/selectors.ts`（`buildHistoricalRows`）
- Test: `lifeplan/tests/simulate.integration.test.ts`
- Test: `lifeplan/tests/store/selectors.test.ts`

**Interfaces:**
- Consumes: `Actual.actualIncome?`/`actualExpense?`（Task 1）
- Produces: `YearRow.actualIncome?: number`、`YearRow.actualExpense?: number` — Task 5（`AnnualTable`）が利用する。

- [ ] **Step 1: `YearRow`型に任意フィールドを追加**

`lifeplan/src/types.ts`の`YearRow`インターフェースを以下に置き換える。

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
  /** baseYear より前の参考実績(§16.9)から合成した行かどうか(§20)。true の場合フロー系の値は不明(0)。 */
  isHistoricalReference?: boolean
  /** その年の実績収入(年間・任意)。表示専用でシミュレーション計算には使わない。未記録なら undefined。 */
  actualIncome?: number
  /** その年の実績支出(年間・任意)。表示専用でシミュレーション計算には使わない。未記録なら undefined。 */
  actualExpense?: number
}
```

- [ ] **Step 2: 失敗するテストを書く（`simulate.ts`側）**

`lifeplan/tests/simulate.integration.test.ts`の`describe('simulate with actuals (rebase)', ...)`ブロック内、最後の`it('範囲外の実績は無視（出力は未指定と一致）', ...)`の後に追加する。

```ts
  it('実績収支があればYearRowにactualIncome/actualExpenseとして渡り、資産推移には影響しない', () => {
    const withFlow = simulate(realInputs, lifeplanMaster, {
      actuals: [
        { year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000, actualIncome: 6_000_000, actualExpense: 5_500_000 },
      ],
    })
    const withoutFlow = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const withFlowRow = byYear(withFlow).get(2027)!
    const withoutFlowRow = byYear(withoutFlow).get(2027)!

    expect(withFlowRow.actualIncome).toBe(6_000_000)
    expect(withFlowRow.actualExpense).toBe(5_500_000)
    expect(withFlowRow.totalAssets).toBe(withoutFlowRow.totalAssets)
    expect(withFlowRow.cashBalance).toBe(withoutFlowRow.cashBalance)
    expect(withFlowRow.investmentBalance).toBe(withoutFlowRow.investmentBalance)
  })

  it('実績が無い年のactualIncome/actualExpenseはundefined', () => {
    const rows = simulate(realInputs, lifeplanMaster, { actuals: [] })
    expect(rows[0]!.actualIncome).toBeUndefined()
    expect(rows[0]!.actualExpense).toBeUndefined()
  })

  it('実績があってもactualIncome/actualExpense未指定ならundefined', () => {
    const rows = simulate(realInputs, lifeplanMaster, {
      actuals: [{ year: 2027, cashBalance: 5_000_000, investmentBalance: 12_000_000 }],
    })
    const r = byYear(rows).get(2027)!
    expect(r.actualIncome).toBeUndefined()
    expect(r.actualExpense).toBeUndefined()
  })
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run tests/simulate.integration.test.ts`
Expected: FAIL（1件目: `actualIncome`/`actualExpense`が`undefined`のまま渡されていない）

- [ ] **Step 4: `simulate.ts`を実装**

`lifeplan/src/engine/simulate.ts`の`rows.push({...})`ブロック（既存の以下のコード）:

```ts
    rows.push({
      year,
      agePrimary: ageAt(inputs.members.primary.birthYear, inputs.members.primary.birthMonth, year),
      ageSpouse: inputs.members.spouse ? ageAt(inputs.members.spouse.birthYear, inputs.members.spouse.birthMonth, year) : null,
      agesChildren: inputs.members.children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
      income, expenses, totalExpense, annualCashFlow,
      investmentContribution: rowContribution, investmentReturn: rowReturn,
      investmentBalance: invest, cashBalance: cash, totalAssets,
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual,
    })
```

を以下に置き換える。

```ts
    rows.push({
      year,
      agePrimary: ageAt(inputs.members.primary.birthYear, inputs.members.primary.birthMonth, year),
      ageSpouse: inputs.members.spouse ? ageAt(inputs.members.spouse.birthYear, inputs.members.spouse.birthMonth, year) : null,
      agesChildren: inputs.members.children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
      income, expenses, totalExpense, annualCashFlow,
      investmentContribution: rowContribution, investmentReturn: rowReturn,
      investmentBalance: invest, cashBalance: cash, totalAssets,
      investmentRatio: totalAssets !== 0 ? invest / totalAssets : 0,
      coastFireNumber,
      isActual,
      actualIncome: actual?.actualIncome,
      actualExpense: actual?.actualExpense,
    })
```

- [ ] **Step 5: テストを実行してパスを確認**

Run: `npx vitest run tests/simulate.integration.test.ts`
Expected: PASS（全件）

- [ ] **Step 6: 失敗するテストを書く（`buildHistoricalRows`側）**

`lifeplan/tests/store/selectors.test.ts`の`describe('buildHistoricalRows', ...)`ブロック内、既存の`it('フロー系(収入/支出/収支)は不明なので 0/null で埋める', ...)`の後に追加する。

```ts
  it('実績収入・実績支出があればYearRowにそのまま渡す', () => {
    const rows = buildHistoricalRows(
      [
        {
          year: placeholderInputs.baseYear - 3,
          cashBalance: 100,
          investmentBalance: 200,
          actualIncome: 5_000_000,
          actualExpense: 4_000_000,
        },
      ],
      placeholderInputs,
    )
    expect(rows[0]!.actualIncome).toBe(5_000_000)
    expect(rows[0]!.actualExpense).toBe(4_000_000)
  })

  it('実績収入・実績支出が無ければundefinedのまま', () => {
    const rows = buildHistoricalRows(
      [{ year: placeholderInputs.baseYear - 3, cashBalance: 100, investmentBalance: 200 }],
      placeholderInputs,
    )
    expect(rows[0]!.actualIncome).toBeUndefined()
    expect(rows[0]!.actualExpense).toBeUndefined()
  })
```

- [ ] **Step 7: テストを実行して失敗を確認**

Run: `npx vitest run tests/store/selectors.test.ts`
Expected: FAIL（1件目: `actualIncome`/`actualExpense`が渡されていない）

- [ ] **Step 8: `selectors.ts`の`buildHistoricalRows`を実装**

`lifeplan/src/store/selectors.ts`の`buildHistoricalRows`内の返り値オブジェクト（既存の以下のコード）:

```ts
      return {
        year,
        agePrimary: ageAt(primary.birthYear, primary.birthMonth, year),
        ageSpouse: spouse ? ageAt(spouse.birthYear, spouse.birthMonth, year) : null,
        agesChildren: children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
        income: 0,
        expenses: ZERO_EXPENSES,
        totalExpense: 0,
        annualCashFlow: 0,
        investmentContribution: null,
        investmentReturn: null,
        investmentBalance: a.investmentBalance,
        cashBalance: a.cashBalance,
        totalAssets,
        investmentRatio: totalAssets !== 0 ? a.investmentBalance / totalAssets : 0,
        coastFireNumber: 0,
        isActual: true,
        isHistoricalReference: true,
      }
```

を以下に置き換える。

```ts
      return {
        year,
        agePrimary: ageAt(primary.birthYear, primary.birthMonth, year),
        ageSpouse: spouse ? ageAt(spouse.birthYear, spouse.birthMonth, year) : null,
        agesChildren: children.map(c => ageAt(c.birthYear, c.birthMonth, year)),
        income: 0,
        expenses: ZERO_EXPENSES,
        totalExpense: 0,
        annualCashFlow: 0,
        investmentContribution: null,
        investmentReturn: null,
        investmentBalance: a.investmentBalance,
        cashBalance: a.cashBalance,
        totalAssets,
        investmentRatio: totalAssets !== 0 ? a.investmentBalance / totalAssets : 0,
        coastFireNumber: 0,
        isActual: true,
        isHistoricalReference: true,
        actualIncome: a.actualIncome,
        actualExpense: a.actualExpense,
      }
```

- [ ] **Step 9: テストを実行してパスを確認**

Run: `npx vitest run tests/store/selectors.test.ts`
Expected: PASS（全件）

- [ ] **Step 10: コミット**

```bash
git add lifeplan/src/types.ts lifeplan/src/engine/simulate.ts lifeplan/src/store/selectors.ts lifeplan/tests/simulate.integration.test.ts lifeplan/tests/store/selectors.test.ts
git commit -m "feat(engine): YearRowに実績収入・実績支出を表示専用フィールドとして受け渡す"
```

---

### Task 5: `AnnualTable`で収支の実績/シミュレーション区別を表示する

**Files:**
- Modify: `lifeplan/src/components/dashboard/AnnualTable.tsx`
- Modify: `lifeplan/src/components/dashboard/AnnualTable.test.tsx`

**Interfaces:**
- Consumes: `YearRow.actualIncome?`/`actualExpense?`（Task 4）、`styles.actualBadge`/`styles.negative`（既存の`AnnualTable.module.css`、変更不要）

- [ ] **Step 1: `makeRow`テストヘルパーを拡張し、失敗するテストを書く**

`lifeplan/src/components/dashboard/AnnualTable.test.tsx`の`makeRow`関数（既存の以下のコード）:

```tsx
function makeRow(
  year: number,
  agePrimary: number,
  cashBalance: number,
  investmentBalance: number,
  annualCashFlow: number,
  income = 5_000_000,
  totalExpense = 0,
  isActual = false,
): YearRow {
  return {
    year, agePrimary, ageSpouse: agePrimary - 1, agesChildren: [2],
    income,
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
    totalExpense,
    annualCashFlow,
    investmentContribution: isActual ? null : 0,
    investmentReturn: isActual ? null : 0,
    investmentBalance,
    cashBalance,
    totalAssets: investmentBalance + cashBalance,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual,
  }
}
```

を以下に置き換える（末尾に`actualIncome`/`actualExpense`の任意引数を追加。既存の呼び出しは全て非破壊）。

```tsx
function makeRow(
  year: number,
  agePrimary: number,
  cashBalance: number,
  investmentBalance: number,
  annualCashFlow: number,
  income = 5_000_000,
  totalExpense = 0,
  isActual = false,
  actualIncome?: number,
  actualExpense?: number,
): YearRow {
  return {
    year, agePrimary, ageSpouse: agePrimary - 1, agesChildren: [2],
    income,
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
    totalExpense,
    annualCashFlow,
    investmentContribution: isActual ? null : 0,
    investmentReturn: isActual ? null : 0,
    investmentBalance,
    cashBalance,
    totalAssets: investmentBalance + cashBalance,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual,
    actualIncome,
    actualExpense,
  }
}
```

次に、`describe('AnnualTable', ...)`ブロックの最後（既存の最後の`it('shows "-" for flow columns on isHistoricalReference rows ...', ...)`の後）に以下を追加する。

```tsx
  it('shows an actual income with a badge while the expense/cash-flow columns stay simulated (partial actual)', () => {
    const partialRow = makeRow(2027, 37, 900_000, 3_500_000, -200_000, 5_000_000, 5_200_000, false, 5_500_000)
    render(
      <AnnualTable
        series={[series[0]!, makePoint(2027, 37, 4_400_000, 4_900_000, 4_000_000)]}
        central={[central[0]!, partialRow]}
        events={events}
      />,
    )

    const row = screen.getAllByRole('row')[2]!
    const cells = within(row).getAllByRole('cell')
    expect(cells[8]).toHaveTextContent('550万')
    expect(within(cells[8]!).getByText('実績')).toBeInTheDocument()
    // 支出は未入力なのでシミュレーション値のまま、バッジ無し
    expect(cells[9]).toHaveTextContent('520万')
    expect(within(cells[9]!).queryByText('実績')).not.toBeInTheDocument()
    // 収支は片方だけ実績なので実績収入(550万)-シミュレーション支出(520万)=30万、バッジ無し
    expect(cells[10]).toHaveTextContent('30万')
    expect(within(cells[10]!).queryByText('実績')).not.toBeInTheDocument()
  })

  it('shows an actual cash flow with a badge when both actual income and expense are present', () => {
    const fullActualRow = makeRow(2027, 37, 900_000, 3_500_000, -200_000, 5_000_000, 5_200_000, false, 5_500_000, 4_800_000)
    render(
      <AnnualTable
        series={[series[0]!, makePoint(2027, 37, 4_400_000, 4_900_000, 4_000_000)]}
        central={[central[0]!, fullActualRow]}
        events={events}
      />,
    )

    const row = screen.getAllByRole('row')[2]!
    const cells = within(row).getAllByRole('cell')
    expect(cells[10]).toHaveTextContent('70万') // 550万-480万
    expect(within(cells[10]!).getByText('実績')).toBeInTheDocument()
  })

  it('shows actual income for a historical-reference row but leaves cash-flow as "-" when only one side is actual', () => {
    const historicalPartial: YearRow = {
      ...makeRow(2024, 34, 300_000, 100_000, 0, 0, 0, true, 4_000_000),
      isHistoricalReference: true,
    }
    const historicalPoint = makePoint(2024, 34, 400_000, 400_000, 400_000, true)
    render(
      <AnnualTable series={[historicalPoint, ...series]} central={[historicalPartial, ...central]} events={events} />,
    )

    const row = screen.getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell')
    expect(cells[8]).toHaveTextContent('400万')
    expect(within(cells[8]!).getByText('実績')).toBeInTheDocument()
    expect(cells[9]).toHaveTextContent('-') // 支出は未入力・参考実績期間なのでシミュレーション値も無い
    expect(cells[10]).toHaveTextContent('-') // 収支は片方だけなので計算しない
  })

  it('computes the cash flow for a historical-reference row when both actual income and expense are present', () => {
    const historicalFull: YearRow = {
      ...makeRow(2024, 34, 300_000, 100_000, 0, 0, 0, true, 4_000_000, 3_500_000),
      isHistoricalReference: true,
    }
    const historicalPoint = makePoint(2024, 34, 400_000, 400_000, 400_000, true)
    render(
      <AnnualTable series={[historicalPoint, ...series]} central={[historicalFull, ...central]} events={events} />,
    )

    const row = screen.getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell')
    expect(cells[10]).toHaveTextContent('50万') // 400万-350万
    expect(within(cells[10]!).getByText('実績')).toBeInTheDocument()
  })
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/dashboard/AnnualTable.test.tsx`
Expected: 既存9件は PASS のまま、新規4件が FAIL（`AnnualTable`が`actualIncome`/`actualExpense`を見ていないため、常にシミュレーション値のみ表示・バッジ無し）

- [ ] **Step 3: `AnnualTable.tsx`を実装**

`lifeplan/src/components/dashboard/AnnualTable.tsx`の全文を以下に置き換える。

```tsx
import type { YearRow } from '../../types'
import type { ChartPoint, LifeStageEvent } from '../../store/selectors'
import styles from './AnnualTable.module.css'

function yen(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万`
}

/** 単年度収入/支出セル: 実績値があればそれを、無ければシミュレーション値(参考実績期間は"-")を返す。 */
function flowCell(actual: number | undefined, simulated: number, isHistoricalReference: boolean | undefined) {
  if (actual !== undefined) return { display: yen(actual), isActual: true }
  if (isHistoricalReference) return { display: '-', isActual: false }
  return { display: yen(simulated), isActual: false }
}

/**
 * 単年度収支セル: 収入・支出の実績が両方揃った年だけ「実績収支」として計算し実績バッジを付ける。
 * 片方だけの場合は未入力側をシミュレーション値で補完する(参考実績期間はシミュレーション値が無いため"-")。
 */
function cashFlowCell(row: YearRow): { display: string; isActual: boolean; value: number | null } {
  if (row.actualIncome !== undefined && row.actualExpense !== undefined) {
    const value = row.actualIncome - row.actualExpense
    return { display: yen(value), isActual: true, value }
  }
  if (row.isHistoricalReference) {
    return { display: '-', isActual: false, value: null }
  }
  const value = (row.actualIncome ?? row.income) - (row.actualExpense ?? row.totalExpense)
  return { display: yen(value), isActual: false, value }
}

export function AnnualTable({ series, central, events }: {
  series: ChartPoint[]
  central: YearRow[]
  events: LifeStageEvent[]
}) {
  const eventsByYear = new Map<number, LifeStageEvent[]>()
  for (const e of events) {
    const list = eventsByYear.get(e.year)
    if (list) list.push(e)
    else eventsByYear.set(e.year, [e])
  }

  return (
    <section className={styles.container} aria-label="年次シミュレーション一覧">
      <h2 className={styles.title}>年次シミュレーション一覧</h2>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>西暦</th>
              <th>年齢</th>
              <th className={styles.num}>総資産(中央)</th>
              <th className={styles.num}>総資産(楽観)</th>
              <th className={styles.num}>総資産(悲観)</th>
              <th className={styles.num}>実績総資産</th>
              <th className={styles.num}>現金残高</th>
              <th className={styles.num}>投資残高</th>
              <th className={styles.num}>単年度収入</th>
              <th className={styles.num}>単年度支出</th>
              <th className={styles.num}>単年度収支</th>
              <th>ライフイベント</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p, i) => {
              const row = central[i]
              if (!row) return null
              const yearEvents = eventsByYear.get(p.year) ?? []
              const income = flowCell(row.actualIncome, row.income, row.isHistoricalReference)
              const expense = flowCell(row.actualExpense, row.totalExpense, row.isHistoricalReference)
              const cashFlow = cashFlowCell(row)
              return (
                <tr key={p.year} className={row.isActual ? styles.actualRow : undefined}>
                  <td>
                    {p.year}
                    {row.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
                  <td>{p.age}歳</td>
                  <td className={styles.num}>{yen(p.central)}</td>
                  <td className={styles.num}>{yen(p.optimistic)}</td>
                  <td className={styles.num}>{yen(p.pessimistic)}</td>
                  <td className={styles.num}>{row.isActual ? yen(row.totalAssets) : '-'}</td>
                  <td className={styles.num}>{yen(row.cashBalance)}</td>
                  <td className={styles.num}>{yen(row.investmentBalance)}</td>
                  <td className={styles.num}>
                    {income.display}
                    {income.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
                  <td className={styles.num}>
                    {expense.display}
                    {expense.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
                  <td className={`${styles.num} ${cashFlow.value !== null && cashFlow.value < 0 ? styles.negative : ''}`}>
                    {cashFlow.display}
                    {cashFlow.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
                  <td className={styles.events}>
                    {yearEvents.length > 0 && (
                      <ul className={styles.eventsList}>
                        {yearEvents.map((e, i) => (
                          <li key={i}>{e.childName ? `${e.childName}: ${e.label}` : e.label}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run src/components/dashboard/AnnualTable.test.tsx`
Expected: PASS（既存9件＋新規4件の13件）

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/dashboard/AnnualTable.tsx lifeplan/src/components/dashboard/AnnualTable.test.tsx
git commit -m "feat(dashboard): 年次一覧表の単年度収入/支出/収支に実績/シミュレーションの区別を表示"
```

---

### Task 6: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テストを実行**

Run: `npx vitest run`
Expected: PASS（全件。特に`tests/golden.integration.test.ts`が誤差0.00%のまま崩れていないことを確認）

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 4: ビルド**

Run: `npm run build`
Expected: エラー無しでビルド成功

- [ ] **Step 5: e2eスモーク**

Run: `npm run test:e2e`
Expected: 既存の全シナリオが PASS（`/actuals`・ダッシュボードのスモークが壊れていないことを確認。今回の変更用の新規e2eシナリオは追加しない＝ユニット/インテグレーション/コンポーネントテストで十分カバーしているため）

- [ ] **Step 6: CLAUDE.mdの「次にやりたいこと」を更新**

`lifeplan/CLAUDE.md`の該当セクションに、この変更の完了を1行で追記する（既存の記法に倣う）。

- [ ] **Step 7: コミット**

```bash
git add lifeplan/CLAUDE.md
git commit -m "docs: 実績値としての収支入力の完了をCLAUDE.mdに反映"
```
