# 実績値入力・リベース UI (Plan 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 世帯共通の年末残高「実績」を記録し、当初プラン（baseline）を凍結・再ベースラインし、ダッシュボードに予実比較を表示する UI を追加する。

**Architecture:** エンジン層（`src/engine/baseline.ts`・`src/engine/variance.ts`）と永続化層（`actuals`/`baseline` の読み書き・validate 制約）は Plan 2/3 で実装済み。`src/store/selectors.ts` の `DashboardData.variance` も配線済み。本プランは**残っている UI 層のみ**を追加する: `/actuals` ページ（一覧・追加・削除・baseline 記録/再ベースライン）、ダッシュボードの予実比較セクション、`AnnualTable` の実績年マーカー。合わせて `scenarioActions.ts` に重複している保存パターンを共有ヘルパーに切り出す。

**Tech Stack:** React 19 + TypeScript + Zustand + Recharts + Vitest + Testing Library + Playwright（既存スタックそのまま、新規依存追加なし）。

## Global Constraints

- 仕様の源泉は `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §11（データモデル・エンジン）と §16（本プランの UI 仕様）。実装で判断に迷ったら §16 を参照する。
- `src/engine/` は無改変（Plan 2 で完成済み）。
- `src/persistence/` の既存ファイル（`doc.ts`・`validate.ts`・`migrate.ts`・`repository.ts`・`types.ts`・`scenarioOps.ts` の関数シグネチャ）は無改変。`actualsOps.ts` は純追加。
- `src/store/selectors.ts` は無改変（`variance` は既に配線済み。baseline/actuals は `HouseholdDoc` から直接 props で渡す）。
- 保存は即時保存・ドラフト無し（§16.1）。`toDoc(content, { updatedAt })` → `fromDoc(next)` 最終防壁 → `repository.save` の順を必ず守る。
- `window.confirm` は使わない（テスト容易性のため、2段階確認は自前のローカル state で実装。§15.5/§16.5 を踏襲）。
- 既存224テスト（+emulator 12件）とゴールデンマスター回帰は不変であること。全ゲート = `npm run test:unit` / `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test:e2e`。
- Firestore は `undefined` フィールドを書き込めない（`ignoreUndefinedProperties` 未設定）。`Actual.note` を空にする場合はキー自体を省略する（`note: undefined` を書かない）。

---

### Task 1: `applyHouseholdOp` 共有ヘルパーの抽出（scenarioActions.ts リファクタ）

実績アクション（Task 3）にも同じ保存パターンが必要になる。現在 `scenarioActions.ts` にだけある `applyScenarioOp` を独立モジュールへ切り出し、`scenarioActions.ts` をそれを使う形にリファクタする（振る舞いは不変）。

**Files:**
- Create: `lifeplan/src/store/applyHouseholdOp.ts`
- Modify: `lifeplan/src/store/scenarioActions.ts`
- Test: 既存 `lifeplan/tests/store/scenarioActions.test.ts`（新規テストは書かず、既存テストがリファクタ後も green であることを確認する）

**Interfaces:**
- Produces: `applyHouseholdOp(op: (doc: HouseholdDoc) => HouseholdContent): Promise<ActionResult>`、`export interface ActionResult { ok: boolean; error?: string }` — Task 3 の `actualsActions.ts` がこれを consume する。

- [ ] **Step 1: 現状のテストが green であることを確認する（リファクタ前のベースライン）**

Run: `npm run test:unit -- scenarioActions`
Expected: 5 tests PASS（既存 `tests/store/scenarioActions.test.ts` の全件）

- [ ] **Step 2: `applyHouseholdOp.ts` を新規作成する**

```ts
// lifeplan/src/store/applyHouseholdOp.ts
// 保存パターンの共通化: toDoc(updatedAt打刻) → fromDoc 最終防壁(C1) → repository.save。
// scenarioActions.ts / actualsActions.ts の双方から使う薄いヘルパー。
import type { HouseholdDoc, HouseholdContent } from '../persistence/types'
import { toDoc, fromDoc } from '../persistence/doc'
import { useHouseholdStore, HOUSEHOLD_ID } from './householdStore'

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function applyHouseholdOp(
  op: (doc: HouseholdDoc) => HouseholdContent,
): Promise<ActionResult> {
  const { doc, status, repository } = useHouseholdStore.getState()
  if (!doc || status !== 'ready') return { ok: false, error: '操作できる状態ではありません' }
  try {
    const next = toDoc(op(doc), { updatedAt: new Date().toISOString() })
    fromDoc(next) // 最終防壁: DocValidationError は catch へ
    await repository.save(HOUSEHOLD_ID, next)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 3: `scenarioActions.ts` を `applyHouseholdOp` を使う形に書き換える**

```ts
// lifeplan/src/store/scenarioActions.ts
// シナリオ構造操作の保存アクション(§15.4)。構造操作に「編集途中」は無いため即時保存・ドラフト無し。
// 保存パターンは applyHouseholdOp に共通化済み(§16.1)。エラー表示はページの local state に委ねる。
import {
  duplicateScenario,
  deleteScenario,
  renameScenario,
  setActiveScenario,
} from '../persistence/scenarioOps'
import { applyHouseholdOp, type ActionResult } from './applyHouseholdOp'

export type { ActionResult }

export const duplicateScenarioAction = (sourceId: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => duplicateScenario(doc, sourceId, crypto.randomUUID()))

export const deleteScenarioAction = (id: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => deleteScenario(doc, id))

export const renameScenarioAction = (id: string, name: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => renameScenario(doc, id, name))

export const setActiveScenarioAction = (id: string): Promise<ActionResult> =>
  applyHouseholdOp((doc) => setActiveScenario(doc, id))
```

`ScenarioCard.tsx` は `import { ..., type ActionResult } from '../../store/scenarioActions'` のままで良い（re-export しているため変更不要）。

- [ ] **Step 4: 既存テストが引き続き green であることを確認する**

Run: `npm run test:unit -- scenarioActions`
Expected: 5 tests PASS（Step 1 と同じ件数・振る舞い）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: エラー無し（`ScenarioCard.tsx` 含め型エラー無し）

- [ ] **Step 6: Commit**

```bash
git add lifeplan/src/store/applyHouseholdOp.ts lifeplan/src/store/scenarioActions.ts
git commit -m "refactor: 保存パターンをapplyHouseholdOpへ共通化(scenarioActions)"
```

---

### Task 2: `actualsOps.ts`（永続化層の純関数）

**Files:**
- Create: `lifeplan/src/persistence/actualsOps.ts`
- Test: `lifeplan/tests/persistence/actualsOps.test.ts`

**Interfaces:**
- Consumes: `HouseholdDoc`/`HouseholdContent`（`../types`から）、`Actual`（`../../types`から）、`captureBaseline`（`../engine/baseline`、以下 `engineCaptureBaseline` としてリネーム import）、`lifeplanMaster`（`../masterData`）、`toDoc`/`fromDoc`（テストのみ、`./doc`）。
- Produces: `setActual(doc, actual: Actual): HouseholdContent`、`deleteActual(doc, year: number): HouseholdContent`、`captureBaseline(doc, opts: { capturedAt: string }): HouseholdContent`、`recaptureBaseline(doc, opts: { capturedAt: string }): HouseholdContent` — Task 3 の `actualsActions.ts` がこれらを consume する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// lifeplan/tests/persistence/actualsOps.test.ts
import { describe, it, expect } from 'vitest'
import type { HouseholdDoc } from '../../src/persistence/types'
import { createDefaultDoc, toDoc, fromDoc } from '../../src/persistence/doc'
import { setActual, deleteActual, captureBaseline, recaptureBaseline } from '../../src/persistence/actualsOps'
import { captureBaseline as engineCaptureBaseline } from '../../src/engine/baseline'
import { lifeplanMaster } from '../../src/masterData'

function docWithActual(year: number, cashBalance: number, investmentBalance: number): HouseholdDoc {
  const base = createDefaultDoc()
  return fromDoc(toDoc(setActual(base, { year, cashBalance, investmentBalance })))
}

describe('setActual', () => {
  it('adds a new year and keeps ascending order regardless of insertion order', () => {
    const doc = createDefaultDoc()
    const withLater = fromDoc(toDoc(setActual(doc, { year: doc.baseYear + 1, cashBalance: 100, investmentBalance: 200 })))
    const content = setActual(withLater, { year: doc.baseYear, cashBalance: 50, investmentBalance: 60 })
    expect(content.actuals.map((a) => a.year)).toEqual([doc.baseYear, doc.baseYear + 1])
  })

  it('overwrites an existing year in place (no duplicate entries)', () => {
    const doc = docWithActual(2026, 100, 200)
    const content = setActual(doc, { year: 2026, cashBalance: 999, investmentBalance: 888 })
    expect(content.actuals).toEqual([{ year: 2026, cashBalance: 999, investmentBalance: 888 }])
  })

  it('preserves an optional note', () => {
    const doc = createDefaultDoc()
    const content = setActual(doc, { year: doc.baseYear, cashBalance: 100, investmentBalance: 200, note: 'メモ' })
    expect(content.actuals[0]!.note).toBe('メモ')
  })
})

describe('deleteActual', () => {
  it('removes the given year', () => {
    const doc = docWithActual(2026, 100, 200)
    const content = deleteActual(doc, 2026)
    expect(content.actuals).toEqual([])
  })

  it('throws on unknown year', () => {
    const doc = createDefaultDoc()
    expect(() => deleteActual(doc, 2026)).toThrow('実績が見つかりません')
  })
})

describe('captureBaseline', () => {
  it('freezes the active scenario simulate() output with the given capturedAt', () => {
    const doc = createDefaultDoc()
    const content = captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' })
    const expected = engineCaptureBaseline(doc.scenarios[0]!.inputs, lifeplanMaster, {
      capturedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(content.baseline).toEqual(expected)
  })

  it('throws if a baseline already exists', () => {
    const captured = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    expect(() => captureBaseline(captured, { capturedAt: '2026-02-01T00:00:00.000Z' })).toThrow('既に記録')
  })
})

describe('recaptureBaseline', () => {
  it('throws if no baseline exists yet', () => {
    expect(() =>
      recaptureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' }),
    ).toThrow('まだ記録されていません')
  })

  it('overwrites an existing baseline with a fresh capturedAt', () => {
    const captured = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    const content = recaptureBaseline(captured, { capturedAt: '2026-03-01T00:00:00.000Z' })
    expect(content.baseline!.capturedAt).toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('all ops', () => {
  it('outputs pass fromDoc(toDoc(...)) (§16.3)', () => {
    const doc = createDefaultDoc()
    for (const content of [
      setActual(doc, { year: doc.baseYear, cashBalance: 100, investmentBalance: 200 }),
      captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' }),
    ]) {
      expect(() => fromDoc(toDoc(content))).not.toThrow()
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:unit -- actualsOps`
Expected: FAIL（`Cannot find module '../../src/persistence/actualsOps'`）

- [ ] **Step 3: 最小実装を書く**

```ts
// lifeplan/src/persistence/actualsOps.ts
// 実績(actuals)・baseline の操作の純関数群(§16.3)。
// HouseholdDoc を受け取り封筒(schemaVersion/updatedAt)を除いた HouseholdContent を返す。
// ガード違反は throw(UI はボタン無効化で先に防ぎ、これは最終防壁)。
import type { HouseholdDoc, HouseholdContent } from './types'
import type { Actual } from '../types'
import { captureBaseline as engineCaptureBaseline } from '../engine/baseline'
import { lifeplanMaster } from '../masterData'

function contentOf(doc: HouseholdDoc): HouseholdContent {
  return {
    baseYear: doc.baseYear,
    activeScenarioId: doc.activeScenarioId,
    scenarios: doc.scenarios,
    actuals: doc.actuals,
    ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
  }
}

function activeScenarioInputs(doc: HouseholdDoc) {
  const scenario = doc.scenarios.find((s) => s.id === doc.activeScenarioId)
  if (!scenario) throw new Error(`アクティブなシナリオが見つかりません: ${doc.activeScenarioId}`)
  return scenario.inputs
}

/** 同じ year が既にあれば上書き、無ければ追加。常に year 昇順で返す(validate の年昇順制約に自前で適合)。 */
export function setActual(doc: HouseholdDoc, actual: Actual): HouseholdContent {
  const others = doc.actuals.filter((a) => a.year !== actual.year)
  const actuals = [...others, actual].sort((a, b) => a.year - b.year)
  return { ...contentOf(doc), actuals }
}

export function deleteActual(doc: HouseholdDoc, year: number): HouseholdContent {
  if (!doc.actuals.some((a) => a.year === year)) {
    throw new Error(`実績が見つかりません: ${year}年`)
  }
  return { ...contentOf(doc), actuals: doc.actuals.filter((a) => a.year !== year) }
}

/** アクティブシナリオの現在の inputs で当初プランを凍結する。baseline 既存時は throw(再ベースラインを使う)。 */
export function captureBaseline(doc: HouseholdDoc, opts: { capturedAt: string }): HouseholdContent {
  if (doc.baseline) {
    throw new Error('当初プランは既に記録されています。再ベースラインを使ってください')
  }
  const baseline = engineCaptureBaseline(activeScenarioInputs(doc), lifeplanMaster, {
    capturedAt: opts.capturedAt,
  })
  return { ...contentOf(doc), baseline }
}

/** 既存の baseline をアクティブシナリオの現在の inputs で上書きする。baseline 未設定時は throw。 */
export function recaptureBaseline(doc: HouseholdDoc, opts: { capturedAt: string }): HouseholdContent {
  if (!doc.baseline) {
    throw new Error('当初プランはまだ記録されていません')
  }
  const baseline = engineCaptureBaseline(activeScenarioInputs(doc), lifeplanMaster, {
    capturedAt: opts.capturedAt,
  })
  return { ...contentOf(doc), baseline }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test:unit -- actualsOps`
Expected: 10 tests PASS

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 6: Commit**

```bash
git add lifeplan/src/persistence/actualsOps.ts lifeplan/tests/persistence/actualsOps.test.ts
git commit -m "feat: actuals/baselineの純関数操作(actualsOps)を追加"
```

---

### Task 3: `actualsActions.ts`（薄い保存アクション層）

**Files:**
- Create: `lifeplan/src/store/actualsActions.ts`
- Test: `lifeplan/tests/store/actualsActions.test.ts`

**Interfaces:**
- Consumes: `setActual`/`deleteActual`/`captureBaseline`/`recaptureBaseline`（Task 2, `../persistence/actualsOps`）、`applyHouseholdOp`/`ActionResult`（Task 1, `./applyHouseholdOp`）、`Actual`（`../types`）。
- Produces: `setActualAction(actual: Actual): Promise<ActionResult>`、`deleteActualAction(year: number): Promise<ActionResult>`、`captureBaselineAction(): Promise<ActionResult>`、`recaptureBaselineAction(): Promise<ActionResult>` — Task 4 の `ActualsPage.tsx`/`ActualRow.tsx` がこれらを consume する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// lifeplan/tests/store/actualsActions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import {
  setActualAction,
  deleteActualAction,
  captureBaselineAction,
  recaptureBaselineAction,
} from '../../src/store/actualsActions'

describe('actualsActions', () => {
  let repository: InMemoryHouseholdRepository

  beforeEach(async () => {
    repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository) // default doc(base 1本)を bootstrap
  })

  it('setActual saves and the store doc reflects the new year', async () => {
    const result = await setActualAction({ year: 2026, cashBalance: 100, investmentBalance: 200 })
    expect(result).toEqual({ ok: true })

    const doc = useHouseholdStore.getState().doc!
    expect(doc.actuals).toEqual([{ year: 2026, cashBalance: 100, investmentBalance: 200 }])
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(doc)
  })

  it('deleteActual removes the year from the store doc', async () => {
    await setActualAction({ year: 2026, cashBalance: 100, investmentBalance: 200 })
    expect((await deleteActualAction(2026)).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.actuals).toEqual([])
  })

  it('captureBaseline then recaptureBaseline both succeed', async () => {
    expect((await captureBaselineAction()).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.baseline).toBeDefined()

    expect((await recaptureBaselineAction()).ok).toBe(true)
    expect(useHouseholdStore.getState().doc!.baseline).toBeDefined()
  })

  it('captureBaseline twice fails with the guard error, without a second write', async () => {
    await captureBaselineAction()
    const before = useHouseholdStore.getState().doc

    const result = await captureBaselineAction()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('既に記録')
    expect(useHouseholdStore.getState().doc).toEqual(before)
  })

  it('recaptureBaseline fails before any baseline exists', async () => {
    const result = await recaptureBaselineAction()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('まだ記録されていません')
  })

  it('returns ok:false when status is not ready, without writing', async () => {
    useHouseholdStore.setState({ status: 'loading' })
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await setActualAction({ year: 2026, cashBalance: 1, investmentBalance: 1 })
    expect(result.ok).toBe(false)
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:unit -- actualsActions`
Expected: FAIL（`Cannot find module '../../src/store/actualsActions'`）

- [ ] **Step 3: 最小実装を書く**

```ts
// lifeplan/src/store/actualsActions.ts
// 実績・baseline操作の保存アクション(§16.4)。構造操作(scenarioActions.ts)と同じく即時保存・ドラフト無し。
import type { Actual } from '../types'
import { setActual, deleteActual, captureBaseline, recaptureBaseline } from '../persistence/actualsOps'
import { applyHouseholdOp, type ActionResult } from './applyHouseholdOp'

export type { ActionResult }

export const setActualAction = (actual: Actual): Promise<ActionResult> =>
  applyHouseholdOp((doc) => setActual(doc, actual))

export const deleteActualAction = (year: number): Promise<ActionResult> =>
  applyHouseholdOp((doc) => deleteActual(doc, year))

export const captureBaselineAction = (): Promise<ActionResult> =>
  applyHouseholdOp((doc) => captureBaseline(doc, { capturedAt: new Date().toISOString() }))

export const recaptureBaselineAction = (): Promise<ActionResult> =>
  applyHouseholdOp((doc) => recaptureBaseline(doc, { capturedAt: new Date().toISOString() }))
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm run test:unit -- actualsActions`
Expected: 6 tests PASS

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 6: Commit**

```bash
git add lifeplan/src/store/actualsActions.ts lifeplan/tests/store/actualsActions.test.ts
git commit -m "feat: actuals/baseline保存アクション(actualsActions)を追加"
```

---

### Task 4: `/actuals` ページ（`ActualsPage`・`ActualRow`）＋ Header ナビ＋ ルーティング

**Files:**
- Create: `lifeplan/src/components/actuals/ActualsPage.tsx`
- Create: `lifeplan/src/components/actuals/ActualsPage.module.css`
- Create: `lifeplan/src/components/actuals/ActualRow.tsx`
- Create: `lifeplan/src/components/actuals/ActualRow.module.css`
- Create: `lifeplan/src/components/actuals/ActualsPage.test.tsx`
- Modify: `lifeplan/src/components/layout/Header.tsx`
- Modify: `lifeplan/src/components/layout/Header.test.tsx`
- Modify: `lifeplan/src/App.tsx`

**Interfaces:**
- Consumes: `setActualAction`/`deleteActualAction`/`captureBaselineAction`/`recaptureBaselineAction`（Task 3）、`useHouseholdStore`（`../../store/householdStore`）、`selectActiveScenario`（`../../store/selectors`、既存エクスポート・無改変）、`MoneyField`（`../input/fields/MoneyField`）、`TextField`（`../input/fields/TextField`）、`Actual`（`../../types`）。
- Produces: `ActualsPage`（デフォルトではなく named export の React コンポーネント、props無し）— Task 5 の App.tsx ルーティングと Task 7 の e2e が使う。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// lifeplan/src/components/actuals/ActualsPage.test.tsx
// @vitest-environment jsdom
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { ActualsPage } from './ActualsPage'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../store/householdStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { setActual, captureBaseline } from '../../persistence/actualsOps'

async function setup(opts?: { withActual?: boolean; withBaseline?: boolean }) {
  const repository = new InMemoryHouseholdRepository()
  let doc = createDefaultDoc()
  if (opts?.withActual) {
    doc = fromDoc(toDoc(setActual(doc, { year: doc.baseYear, cashBalance: 1_000_000, investmentBalance: 2_000_000 })))
  }
  if (opts?.withBaseline) {
    doc = fromDoc(toDoc(captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' })))
  }
  await repository.save(HOUSEHOLD_ID, doc)
  await useHouseholdStore.getState().load(repository)
  return { repository, doc: useHouseholdStore.getState().doc! }
}

describe('ActualsPage', () => {
  it('shows the baseline capture prompt when nothing recorded yet', async () => {
    await setup()
    render(<ActualsPage />)
    expect(
      screen.getByText('まだ記録されていません。現在の入力内容を当初プランとして凍結します。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '当初プランとして記録する' })).toBeInTheDocument()
  })

  it('adds a new year via the year picker', async () => {
    const user = userEvent.setup()
    const { doc } = await setup()
    render(<ActualsPage />)

    await user.selectOptions(screen.getByLabelText('追加する年'), String(doc.baseYear))
    await user.click(screen.getByRole('button', { name: '年を追加' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals).toHaveLength(1))
    expect(screen.getByRole('listitem', { name: `${doc.baseYear}年` })).toBeInTheDocument()
  })

  it('edits cash balance for a recorded year', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear}年` })
    const cashInput = within(row).getByLabelText('現金残高')
    await user.clear(cashInput)
    await user.type(cashInput, '3000000')

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals[0]?.cashBalance).toBe(3_000_000))
  })

  it('deletes a recorded year', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear}年` })
    await user.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals).toHaveLength(0))
  })

  it('captures a baseline and then offers recapture', async () => {
    const user = userEvent.setup()
    await setup()
    render(<ActualsPage />)

    await user.click(screen.getByRole('button', { name: '当初プランとして記録する' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.baseline).toBeDefined())
    expect(screen.getByRole('button', { name: '再ベースライン' })).toBeInTheDocument()
  })

  it('recaptures a baseline only after two-step confirmation', async () => {
    const user = userEvent.setup()
    await setup({ withBaseline: true })
    render(<ActualsPage />)

    await user.click(screen.getByRole('button', { name: '再ベースライン' }))
    expect(
      screen.getByText('現在の入力内容で当初プランを上書きします。よろしいですか？'),
    ).toBeInTheDocument()
    // 1段階目ではまだ上書きされない
    expect(useHouseholdStore.getState().doc?.baseline?.capturedAt).toBe('2026-01-01T00:00:00.000Z')

    await user.click(screen.getByRole('button', { name: '上書きする' }))
    await waitFor(() =>
      expect(useHouseholdStore.getState().doc?.baseline?.capturedAt).not.toBe('2026-01-01T00:00:00.000Z'),
    )
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:unit -- ActualsPage`
Expected: FAIL（`Cannot find module './ActualsPage'`）

- [ ] **Step 3: `ActualRow.tsx` を実装する**

```tsx
// lifeplan/src/components/actuals/ActualRow.tsx
import { MoneyField } from '../input/fields/MoneyField'
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

export function ActualRow({ actual, onError }: Props) {
  const run = async (action: Promise<ActionResult>) => {
    const result = await action
    onError(result.ok ? null : (result.error ?? '操作に失敗しました'))
  }

  return (
    <li className={styles.row} aria-label={`${actual.year}年`}>
      <span className={styles.year}>{actual.year}年</span>
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

```css
/* lifeplan/src/components/actuals/ActualRow.module.css */
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-surface-alt);
}

.year {
  min-width: 4rem;
  font-weight: 700;
  align-self: center;
}
```

- [ ] **Step 4: `ActualsPage.tsx` を実装する**

```tsx
// lifeplan/src/components/actuals/ActualsPage.tsx
import { useState } from 'react'
import { useHouseholdStore } from '../../store/householdStore'
import { selectActiveScenario } from '../../store/selectors'
import type { HouseholdDoc } from '../../persistence/types'
import { ActualRow } from './ActualRow'
import {
  setActualAction,
  captureBaselineAction,
  recaptureBaselineAction,
  type ActionResult,
} from '../../store/actualsActions'
import styles from './ActualsPage.module.css'

/** baseYear からアクティブシナリオの終了年までで、まだ記録されていない年の一覧(§16.5)。 */
function availableYears(doc: HouseholdDoc): number[] {
  const scenario = selectActiveScenario(doc)
  const endYear = scenario.inputs.members.primary.birthYear + scenario.inputs.assumptions.endAge
  const recorded = new Set(doc.actuals.map((a) => a.year))
  const years: number[] = []
  for (let y = doc.baseYear; y <= endYear; y++) {
    if (!recorded.has(y)) years.push(y)
  }
  return years
}

export function ActualsPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRecapture, setConfirmingRecapture] = useState(false)
  const [addingYear, setAddingYear] = useState<number | ''>('')

  if (status === 'error') {
    return (
      <main className={styles.main}>
        <p role="alert">データの読み込みに失敗したため、操作できません。アプリを更新してください。</p>
      </main>
    )
  }
  if (!doc) {
    return (
      <main className={styles.main}>
        <p>読み込み中...</p>
      </main>
    )
  }

  const run = async (action: Promise<ActionResult>): Promise<boolean> => {
    const result = await action
    setError(result.ok ? null : (result.error ?? '操作に失敗しました'))
    return result.ok
  }

  const years = availableYears(doc)

  return (
    <main className={styles.main}>
      <h2>実績値</h2>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <section className={styles.baseline} aria-label="当初プラン">
        {doc.baseline ? (
          <>
            <p>記録日時: {new Date(doc.baseline.capturedAt ?? '').toLocaleString('ja-JP')}</p>
            {confirmingRecapture ? (
              <span className={styles.confirm}>
                現在の入力内容で当初プランを上書きします。よろしいですか？
                <button
                  type="button"
                  onClick={() => {
                    void run(recaptureBaselineAction()).then(() => setConfirmingRecapture(false))
                  }}
                >
                  上書きする
                </button>
                <button type="button" onClick={() => setConfirmingRecapture(false)}>
                  キャンセル
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingRecapture(true)}>
                再ベースライン
              </button>
            )}
          </>
        ) : (
          <>
            <p>まだ記録されていません。現在の入力内容を当初プランとして凍結します。</p>
            <button type="button" onClick={() => void run(captureBaselineAction())}>
              当初プランとして記録する
            </button>
          </>
        )}
      </section>

      <ul className={styles.list} aria-label="記録済みの実績">
        {doc.actuals.map((a) => (
          <ActualRow key={a.year} actual={a} onError={setError} />
        ))}
      </ul>

      <div className={styles.addRow}>
        <label>
          <span>追加する年</span>
          <select
            aria-label="追加する年"
            value={addingYear}
            onChange={(e) => setAddingYear(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={years.length === 0}
          >
            <option value="" disabled>
              年を選択
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={addingYear === ''}
          onClick={() => {
            if (addingYear === '') return
            void run(setActualAction({ year: addingYear, cashBalance: 0, investmentBalance: 0 })).then((ok) => {
              if (ok) setAddingYear('')
            })
          }}
        >
          年を追加
        </button>
      </div>
    </main>
  )
}
```

```css
/* lifeplan/src/components/actuals/ActualsPage.module.css */
.main {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}

.error {
  color: var(--color-negative);
}

.baseline {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-negative);
}

.list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}

.addRow {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm run test:unit -- ActualsPage`
Expected: 6 tests PASS

- [ ] **Step 6: Header にナビリンクを追加する**

`lifeplan/src/components/layout/Header.tsx` の `<nav className={styles.nav}>` 内、「シナリオ」リンクの後ろに追加:

```tsx
        <NavLink to="/scenarios" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          シナリオ
        </NavLink>
        <NavLink to="/actuals" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          実績
        </NavLink>
```

`lifeplan/src/components/layout/Header.test.tsx` の `describe('Header')` 内に追加:

```tsx
  it('has a nav link to the actuals page', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '実績' })).toHaveAttribute('href', '/actuals')
  })
```

- [ ] **Step 7: `App.tsx` にルートを追加する**

`lifeplan/src/App.tsx` の import 群に追加:

```tsx
import { ActualsPage } from './components/actuals/ActualsPage'
```

`routes` の `children` 配列、`/scenarios` の後ろに追加:

```tsx
      { path: '/scenarios', element: <ScenariosPage /> },
      { path: '/actuals', element: <ActualsPage /> },
```

- [ ] **Step 8: Header テストが通ることを確認する**

Run: `npm run test:unit -- Header`
Expected: 5 tests PASS

- [ ] **Step 9: typecheck・lint・build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 全て成功

- [ ] **Step 10: Commit**

```bash
git add lifeplan/src/components/actuals/ lifeplan/src/components/layout/Header.tsx lifeplan/src/components/layout/Header.test.tsx lifeplan/src/App.tsx
git commit -m "feat: /actualsページ(実績一覧・baseline記録/再ベースライン)を追加"
```

---

### Task 5: ダッシュボードの予実比較セクション（`VarianceSection`）

**Files:**
- Create: `lifeplan/src/components/dashboard/VarianceSection.tsx`
- Create: `lifeplan/src/components/dashboard/VarianceSection.module.css`
- Create: `lifeplan/src/components/dashboard/VarianceSection.test.tsx`
- Modify: `lifeplan/src/components/dashboard/Dashboard.tsx`
- Modify: `lifeplan/src/components/dashboard/Dashboard.test.tsx`
- Modify: `lifeplan/src/App.tsx`（`DashboardRoute` が `doc.baseline`/`doc.actuals` を `Dashboard` に渡す）

**Interfaces:**
- Consumes: `Baseline`（`../../engine/baseline`）、`VariancePoint`（`../../engine/variance`）、`Actual`/`YearRow`（`../../types`）、`formatYenCompact`/`yAxisWidth`（`./format`、既存・無改変）、`DashboardData`（`../../store/selectors`、既存・無改変）。
- Produces: `VarianceSection({ baseline, actuals, central, variance }: Props)` — `Dashboard.tsx` から `data.variance !== null` のときだけ描画される。`Dashboard` の props は `{ data: DashboardData; baseline: Baseline | null; actuals: Actual[] }` に変わる（Task 7 の e2e とこの後の App.tsx 呼び出し側が consume する）。

- [ ] **Step 1: 失敗するテストを書く（`VarianceSection`）**

```tsx
// lifeplan/src/components/dashboard/VarianceSection.test.tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VarianceSection } from './VarianceSection'
import type { Baseline } from '../../engine/baseline'
import type { YearRow } from '../../types'

function row(year: number, totalAssets: number, isActual = false): YearRow {
  return {
    year,
    agePrimary: 36,
    ageSpouse: 35,
    agesChildren: [],
    income: 0,
    expenses: {
      食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0,
      こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0,
    },
    totalExpense: 0,
    annualCashFlow: 0,
    investmentContribution: isActual ? null : 0,
    investmentReturn: isActual ? null : 0,
    investmentBalance: totalAssets / 2,
    cashBalance: totalAssets / 2,
    totalAssets,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual,
  }
}

const baseline: Baseline = {
  capturedAt: '2026-01-01T00:00:00.000Z',
  series: [
    { year: 2026, totalAssets: 1_000_000, investmentBalance: 500_000, cashBalance: 500_000 },
    { year: 2027, totalAssets: 1_200_000, investmentBalance: 600_000, cashBalance: 600_000 },
  ],
}

describe('VarianceSection', () => {
  it('renders one table row per variance year with predicted/actual/diff/diffPct', () => {
    render(
      <VarianceSection
        baseline={baseline}
        actuals={[{ year: 2026, cashBalance: 400_000, investmentBalance: 700_000 }]}
        central={[row(2026, 1_100_000, true), row(2027, 1_300_000)]}
        variance={[{ year: 2026, predicted: 1_000_000, actual: 1_100_000, diff: 100_000, diffPct: 0.1 }]}
      />,
    )

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(2) // ヘッダー1行 + 実績年1行
    expect(rows[1]).toHaveTextContent('2026')
    expect(rows[1]).toHaveTextContent('10%')
  })

  it('renders a chart', () => {
    render(
      <VarianceSection
        baseline={baseline}
        actuals={[{ year: 2026, cashBalance: 400_000, investmentBalance: 700_000 }]}
        central={[row(2026, 1_100_000, true), row(2027, 1_300_000)]}
        variance={[{ year: 2026, predicted: 1_000_000, actual: 1_100_000, diff: 100_000, diffPct: 0.1 }]}
      />,
    )
    expect(document.querySelector('svg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:unit -- VarianceSection`
Expected: FAIL（`Cannot find module './VarianceSection'`）

- [ ] **Step 3: `VarianceSection.tsx` を実装する**

```tsx
// lifeplan/src/components/dashboard/VarianceSection.tsx
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Baseline } from '../../engine/baseline'
import type { VariancePoint } from '../../engine/variance'
import type { Actual, YearRow } from '../../types'
import { formatYenCompact, yAxisWidth } from './format'
import styles from './VarianceSection.module.css'

interface Props {
  baseline: Baseline
  actuals: Actual[]
  central: YearRow[]
  variance: VariancePoint[]
}

interface Point {
  year: number
  baseline?: number
  actual?: number
  predicted?: number
}

export function VarianceSection({ baseline, actuals, central, variance }: Props) {
  const actualsByYear = new Map(actuals.map((a) => [a.year, a.cashBalance + a.investmentBalance]))
  const centralByYear = new Map(central.map((r) => [r.year, r.totalAssets]))
  const lastActualYear = actuals.length > 0 ? Math.max(...actuals.map((a) => a.year)) : null

  const points: Point[] = baseline.series.map((b) => ({
    year: b.year,
    baseline: b.totalAssets,
    actual: actualsByYear.get(b.year),
    predicted: lastActualYear === null || b.year > lastActualYear ? centralByYear.get(b.year) : undefined,
  }))

  const axisValues = points.flatMap((p) => [p.baseline, p.actual, p.predicted]).filter((v): v is number => v !== undefined)
  const axisWidth = yAxisWidth(axisValues)

  return (
    <section className={styles.container} aria-label="予実比較">
      <h2 className={styles.title}>予実比較</h2>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={formatYenCompact} width={axisWidth} />
          <Tooltip formatter={(value) => (typeof value === 'number' ? formatYenCompact(value) : String(value))} />
          <Line
            dataKey="baseline" name="当初プラン" stroke="var(--color-muted)" strokeDasharray="4 4"
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
          <Line
            dataKey="actual" name="実績" stroke="var(--color-primary)" strokeWidth={2}
            connectNulls dot isAnimationActive={false}
          />
          <Line
            dataKey="predicted" name="現行予測" stroke="var(--color-accent)" strokeWidth={2}
            dot={false} isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>西暦</th>
              <th className={styles.num}>当初プラン</th>
              <th className={styles.num}>実績</th>
              <th className={styles.num}>差分</th>
              <th className={styles.num}>差分%</th>
            </tr>
          </thead>
          <tbody>
            {variance.map((v) => (
              <tr key={v.year}>
                <td>{v.year}</td>
                <td className={styles.num}>{formatYenCompact(v.predicted)}</td>
                <td className={styles.num}>{formatYenCompact(v.actual)}</td>
                <td className={`${styles.num} ${v.diff < 0 ? styles.negative : ''}`}>
                  {formatYenCompact(v.diff)}
                </td>
                <td className={styles.num}>{(v.diffPct * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

```css
/* lifeplan/src/components/dashboard/VarianceSection.module.css */
.container {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
}

.title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.scroll {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin-top: 0.75rem;
}

.table th {
  color: var(--color-muted);
  font-weight: 600;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-surface-alt);
}

.table td {
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--color-surface-alt);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.negative {
  color: var(--color-negative);
}
```

- [ ] **Step 4: `VarianceSection` テストが通ることを確認する**

Run: `npm run test:unit -- VarianceSection`
Expected: 2 tests PASS

- [ ] **Step 5: `Dashboard.tsx` を baseline/actuals を受け取って `VarianceSection` を条件描画するよう修正する**

```tsx
// lifeplan/src/components/dashboard/Dashboard.tsx
import { KpiCards } from './KpiCards'
import { AssetChart } from './AssetChart'
import { BreakdownTabs } from './BreakdownTabs'
import { AnnualTable } from './AnnualTable'
import { VarianceSection } from './VarianceSection'
import type { DashboardData } from '../../store/selectors'
import type { Baseline } from '../../engine/baseline'
import type { Actual } from '../../types'
import styles from './Dashboard.module.css'

interface Props {
  data: DashboardData
  baseline: Baseline | null
  actuals: Actual[]
}

export function Dashboard({ data, baseline, actuals }: Props) {
  return (
    <main className={styles.main}>
      <KpiCards kpi={data.kpi} />
      <AssetChart series={data.chartSeries} eventMarkers={data.eventMarkers} />
      {baseline && data.variance && (
        <VarianceSection baseline={baseline} actuals={actuals} central={data.central} variance={data.variance} />
      )}
      <BreakdownTabs rows={data.central} />
      <AnnualTable series={data.chartSeries} central={data.central} events={data.lifeStageEvents} />
    </main>
  )
}
```

- [ ] **Step 6: `Dashboard.test.tsx` を新しい props に合わせて更新し、`VarianceSection` の条件描画テストを追加する**

```tsx
// lifeplan/src/components/dashboard/Dashboard.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Dashboard } from './Dashboard'
import { selectDashboardData } from '../../store/selectors'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { captureBaseline } from '../../persistence/actualsOps'

describe('Dashboard', () => {
  it('renders KPI cards and the chart for the default household', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    expect(screen.getByText('現在の総資産')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toBeInTheDocument()
  })

  it('renders the annual simulation table at the end', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    expect(screen.getByText('年次シミュレーション一覧')).toBeInTheDocument()
    const table = screen.getByRole('table')
    // ヘッダー1行 + シミュレーション年数分の行
    expect(table.querySelectorAll('tbody tr')).toHaveLength(data.central.length)
  })

  it('does not render the variance section when no baseline is set', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)
    expect(screen.queryByRole('region', { name: '予実比較' })).not.toBeInTheDocument()
  })

  it('renders the variance section when a baseline is set', () => {
    const doc = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={doc.baseline ?? null} actuals={doc.actuals} />)
    expect(screen.getByRole('region', { name: '予実比較' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: `App.tsx` の `DashboardRoute` から `Dashboard` に `baseline`/`actuals` を渡す**

`lifeplan/src/App.tsx` の `DashboardRoute` を修正:

```tsx
function DashboardRoute() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const data = useMemo(() => (doc ? selectDashboardData(doc) : null), [doc])
  return (
    <>
      {status === 'error' && <p role="alert">データの読み込みに失敗しました</p>}
      {status !== 'error' && !data && <p>読み込み中...</p>}
      {data && doc && <Dashboard data={data} baseline={doc.baseline ?? null} actuals={doc.actuals} />}
    </>
  )
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm run test:unit -- Dashboard`
Expected: 4 tests PASS

- [ ] **Step 9: typecheck・lint・build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 全て成功

- [ ] **Step 10: Commit**

```bash
git add lifeplan/src/components/dashboard/VarianceSection.tsx lifeplan/src/components/dashboard/VarianceSection.module.css lifeplan/src/components/dashboard/VarianceSection.test.tsx lifeplan/src/components/dashboard/Dashboard.tsx lifeplan/src/components/dashboard/Dashboard.test.tsx lifeplan/src/App.tsx
git commit -m "feat: ダッシュボードに予実比較セクション(VarianceSection)を追加"
```

---

### Task 6: `AnnualTable` の実績年マーカー

**Files:**
- Modify: `lifeplan/src/components/dashboard/AnnualTable.tsx`
- Modify: `lifeplan/src/components/dashboard/AnnualTable.module.css`
- Modify: `lifeplan/src/components/dashboard/AnnualTable.test.tsx`

**Interfaces:**
- Consumes: `YearRow.isActual`（既存フィールド、`../../types`）。
- Produces: なし（末端コンポーネント）。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/dashboard/AnnualTable.test.tsx` の `makeRow` 呼び出しを1件だけ実績年にし、テストを追加する。まず `makeRow` に `isActual` を渡せるよう引数を1つ増やす:

```ts
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
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0 },
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

`central` の1年目を実績年に変更:

```ts
const central: YearRow[] = [
  makeRow(2026, 36, 1_000_000, 3_000_000, 500_000, 5_000_000, 4_500_000, true),
  makeRow(2027, 37, 900_000, 3_500_000, -200_000, 5_000_000, 5_200_000),
]
```

`describe('AnnualTable')` の最後に追加:

```ts
  it('marks isActual rows with a badge', () => {
    render(<AnnualTable series={series} central={central} events={events} />)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]!).getByText('実績')).toBeInTheDocument()
    expect(within(rows[2]!).queryByText('実績')).not.toBeInTheDocument()
  })
```

ファイル先頭の import に `within` を追加:

```ts
import { render, screen, within } from '@testing-library/react'
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:unit -- AnnualTable`
Expected: 既存3件 PASS、新規1件 FAIL（バッジが無い）

- [ ] **Step 3: `AnnualTable.tsx` に実績バッジを追加する**

`西暦` の `<td>` を修正:

```tsx
                  <td>
                    {p.year}
                    {row.isActual && <span className={styles.actualBadge}>実績</span>}
                  </td>
```

`<tr key={p.year}>` を実績年の行に背景色クラスを付けるよう修正:

```tsx
                <tr key={p.year} className={row.isActual ? styles.actualRow : undefined}>
```

- [ ] **Step 4: `AnnualTable.module.css` にスタイルを追加する**

末尾に追加:

```css
.actualRow {
  background: var(--color-surface-alt);
}

.actualBadge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.65rem;
  vertical-align: middle;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm run test:unit -- AnnualTable`
Expected: 4 tests PASS

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 7: Commit**

```bash
git add lifeplan/src/components/dashboard/AnnualTable.tsx lifeplan/src/components/dashboard/AnnualTable.module.css lifeplan/src/components/dashboard/AnnualTable.test.tsx
git commit -m "feat: 年次一覧表に実績年(isActual)のバッジ表示を追加"
```

---

### Task 7: e2e（Playwright）

**Files:**
- Create: `lifeplan/tests/e2e/actuals.spec.ts`

**Interfaces:**
- Consumes: Task 4〜6 で作った `/actuals` ページ・ダッシュボードの `VarianceSection`。既存の `tests/e2e/scenarios.spec.ts` と同じ `page.goto('/')` からのナビゲーションパターンを踏襲する。

- [ ] **Step 1: e2e テストを書く**

```ts
// lifeplan/tests/e2e/actuals.spec.ts
import { test, expect } from '@playwright/test'

test('actuals: record two years → capture baseline → record a drifted year → dashboard shows variance', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '実績' }).click()
  await expect(page.getByRole('heading', { name: '実績値' })).toBeVisible()

  // baseYear を1年目として記録
  const yearSelect = page.getByLabel('追加する年')
  const firstYear = await yearSelect.locator('option').nth(1).getAttribute('value')
  await yearSelect.selectOption(firstYear!)
  await page.getByRole('button', { name: '年を追加' }).click()

  const firstRow = page.getByRole('listitem', { name: `${firstYear}年` })
  await expect(firstRow).toBeVisible()
  await firstRow.getByLabel('現金残高').fill('1000000')
  await firstRow.getByLabel('投資残高').fill('2000000')

  // 当初プランを記録
  await page.getByRole('button', { name: '当初プランとして記録する' }).click()
  await expect(page.getByRole('button', { name: '再ベースライン' })).toBeVisible()

  // 2年目をズレた値で記録
  const secondYear = await yearSelect.locator('option').nth(1).getAttribute('value')
  await yearSelect.selectOption(secondYear!)
  await page.getByRole('button', { name: '年を追加' }).click()
  const secondRow = page.getByRole('listitem', { name: `${secondYear}年` })
  await secondRow.getByLabel('現金残高').fill('500000')
  await secondRow.getByLabel('投資残高').fill('900000')

  // ダッシュボードで予実比較セクションが表示される
  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByRole('region', { name: '予実比較' })).toBeVisible()
})
```

- [ ] **Step 2: e2e を実行して通ることを確認する**

Run: `npm run test:e2e -- actuals`
Expected: 1 test PASS

- [ ] **Step 3: Commit**

```bash
git add lifeplan/tests/e2e/actuals.spec.ts
git commit -m "test: 実績記録→baseline記録→予実比較確認のe2eを追加"
```

---

### Task 8: 全ゲート確認と目視確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 全ユニット/統合テスト**

Run: `npm run test:unit`
Expected: 全件 PASS（既存224 + このプランで追加した約24件）

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: エラー無し

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 4: build**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: e2e 全件**

Run: `npm run test:e2e`
Expected: 全件 PASS（既存 dashboard/input/scenarios + 新規 actuals）

- [ ] **Step 6: Playwright MCP で目視確認**

`npm run dev` でローカル起動し、Playwright MCP（`mcp__playwright__browser_navigate` 等）で以下を確認する:
- `/actuals` で年を追加→現金/投資残高を編集→一覧に反映される
- 「当初プランとして記録する」→「再ベースライン」ボタンに切り替わる
- 「再ベースライン」→2段階確認ダイアログが出る→キャンセルで戻る／上書きするで更新される
- ダッシュボードに「予実比較」セクションが表示され、チャートとテーブルが描画される
- 年次シミュレーション一覧表で実績年に「実績」バッジが付く
- モバイル幅（375px 程度）でも `/actuals` ページと予実比較セクションが崩れない

スクリーンショットはビューポート撮影で行う（fullPage は Recharts の ResponsiveContainer が空白に写るため、既存の教訓を踏襲）。

- [ ] **Step 7: 最終確認のコミット（もしドキュメント更新のみ残っていれば）**

目視確認で問題が無ければ追加コミットは不要。問題が見つかった場合は該当タスクに戻って修正し、そのタスクの粒度でコミットする。

---

## Self-Review メモ

- **spec coverage**: §16.1(画面配置/baseline操作/表示/保存/共通化) → Task1,4,5。§16.2(ファイル構成) → 全タスクのFilesが対応。§16.3(actualsOps契約) → Task2。§16.4(データフロー) → Task1,3。§16.5(画面仕様) → Task4。§16.6(ダッシュボード側) → Task5,6。§16.7(テスト戦略) → 各タスクのTDDステップ+Task7,8。§16.8(対象外) → 実装しない(シナリオ比較・一括インポート・baseline複数保持は本プランのスコープ外のまま)。
- **placeholder scan**: 各ステップに実コードを記載済み。「TODO」「後で実装」等の記述なし。
- **type consistency**: `Actual`(year/cashBalance/investmentBalance/note?) は types.ts の既存定義をそのまま使用。`setActualAction(actual: Actual)`・`ActualRow`・`ActualsPage` 間で型不一致なし。`Dashboard` の新 props (`baseline: Baseline | null`, `actuals: Actual[]`) は Task5 の Step5(定義)・Step7(呼び出し側)・Step6(テスト)で一貫。
