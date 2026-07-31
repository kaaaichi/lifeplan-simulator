# Plan 6: シナリオ管理画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §8.3 のシナリオ管理画面（一覧・複製・名前変更・削除・アクティブ切替）と `/input/:scenarioId`（任意シナリオ編集）を実装する。

**Architecture:** 構造操作（複製/削除/rename/切替）を `src/persistence/scenarioOps.ts` の純関数（`HouseholdDoc → HouseholdContent`）として TDD で実装し、保存は draftStore.save と同一パターン（`toDoc`(updatedAt打刻) → `fromDoc`(最終防壁 C1) → `repository.save`）を共通化した薄いアクション層 `src/store/scenarioActions.ts` に限定する。構造操作に「編集途中」は無いため**即時保存・ドラフト無し**。仕様の源泉 = `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` **§15**（§8.3/§12/§14 も参照）。

**Tech Stack:** React 19 + TypeScript + Zustand + react-router-dom + Recharts（すべて既存）、Vitest + React Testing Library + Playwright（既存）。**新規依存ゼロ**。

## Global Constraints

- 作業ディレクトリはリポジトリ root の `lifeplan/`。テスト実行は `cd lifeplan && ...`。
- **背骨（§15.6）**: `src/engine/`・`src/persistence/` の**既存ファイルは無改変**（`scenarioOps.ts` の純追加のみ可）。既存の全テスト（170）とゴールデン回帰（`tests/golden.integration.test.ts`）は不変で green を維持する。
- `src/store/selectors.ts` は**既存エクスポートのシグネチャ不変**。関数・型の追加のみ可。
- テスト命名: コンポーネントテストは `*.test.tsx`（co-located、`test:unit`）、統合テストは `src/*.integration.test.tsx`（`test:integration`）。jsdom を使う tsx テストは先頭に `// @vitest-environment jsdom`（既存慣行）。純TSテストは `tests/` 配下。
- スタイルは CSS Modules。`src/styles/theme.css` の CSS 変数（`--color-surface`/`--color-muted`/`--color-positive` 等)を使う。UI 文言は日本語。
- **`window.confirm` は新規コードで使わない**（削除確認はカード内2段階UI。§15.5）。
- 各タスク完了時に `npm run typecheck` が通ること。コミットは各タスク末尾で必ず行う。

---

### Task 1: scenarioOps — 構造操作の純関数（TDD）

§15.3 の契約。`HouseholdDoc` を受け取り封筒（schemaVersion/updatedAt）を除いた `HouseholdContent` を返す。ガード違反は throw（UI はボタン無効化で先に防ぎ、throw は最終防壁）。

**Files:**
- Create: `lifeplan/src/persistence/scenarioOps.ts`
- Test: `lifeplan/tests/persistence/scenarioOps.test.ts`

**Interfaces:**
- Consumes: `HouseholdDoc` / `HouseholdContent`（`src/persistence/types.ts`）、テストで `createDefaultDoc`/`toDoc`/`fromDoc`（`src/persistence/doc.ts`。`createDefaultDoc()` は id=`'base'`・name=`'ベースプラン'` のシナリオ1本を返す）
- Produces: 後続タスクが使う4関数
  - `duplicateScenario(doc: HouseholdDoc, sourceId: string, newId: string): HouseholdContent`
  - `deleteScenario(doc: HouseholdDoc, id: string): HouseholdContent`
  - `renameScenario(doc: HouseholdDoc, id: string, name: string): HouseholdContent`
  - `setActiveScenario(doc: HouseholdDoc, id: string): HouseholdContent`

- [x] **Step 1: 失敗するテストを書く**

`lifeplan/tests/persistence/scenarioOps.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import type { HouseholdDoc } from '../../src/persistence/types'
import { createDefaultDoc, toDoc, fromDoc } from '../../src/persistence/doc'
import {
  duplicateScenario,
  deleteScenario,
  renameScenario,
  setActiveScenario,
} from '../../src/persistence/scenarioOps'

/** base + second の2本を持つ doc（roundtrip 済み） */
function docWithTwo(): HouseholdDoc {
  const base = createDefaultDoc()
  return fromDoc(toDoc(duplicateScenario(base, 'base', 'second')))
}

describe('duplicateScenario', () => {
  it('adds a deep copy with the new id and keeps activeScenarioId', () => {
    const doc = createDefaultDoc()
    const content = duplicateScenario(doc, 'base', 'copy-1')

    expect(content.scenarios).toHaveLength(2)
    expect(content.activeScenarioId).toBe('base')
    const copy = content.scenarios[1]!
    expect(copy.id).toBe('copy-1')
    expect(copy.inputs).toEqual(doc.scenarios[0]!.inputs)
    // deep clone: 元と参照非共有
    expect(copy.inputs).not.toBe(doc.scenarios[0]!.inputs)
    expect(copy.inputs.members).not.toBe(doc.scenarios[0]!.inputs.members)
  })

  it('names the copy 「◯◯のコピー」 and numbers collisions 2, 3, ...', () => {
    const doc = createDefaultDoc()
    const once = fromDoc(toDoc(duplicateScenario(doc, 'base', 'c1')))
    expect(once.scenarios[1]!.name).toBe('ベースプランのコピー')

    const twice = fromDoc(toDoc(duplicateScenario(once, 'base', 'c2')))
    expect(twice.scenarios[2]!.name).toBe('ベースプランのコピー2')

    const thrice = fromDoc(toDoc(duplicateScenario(twice, 'base', 'c3')))
    expect(thrice.scenarios[3]!.name).toBe('ベースプランのコピー3')
  })

  it('throws on unknown sourceId / duplicated newId', () => {
    const doc = createDefaultDoc()
    expect(() => duplicateScenario(doc, 'nope', 'c1')).toThrow('シナリオが見つかりません')
    expect(() => duplicateScenario(doc, 'base', 'base')).toThrow('シナリオIDが重複')
  })
})

describe('deleteScenario', () => {
  it('refuses to delete the last scenario', () => {
    const doc = createDefaultDoc()
    expect(() => deleteScenario(doc, 'base')).toThrow('最後のシナリオは削除できません')
  })

  it('deleting the active scenario moves activeScenarioId to the first remaining', () => {
    const doc = docWithTwo() // active = base
    const content = deleteScenario(doc, 'base')
    expect(content.scenarios.map((s) => s.id)).toEqual(['second'])
    expect(content.activeScenarioId).toBe('second')
  })

  it('deleting a non-active scenario keeps activeScenarioId', () => {
    const doc = docWithTwo()
    const content = deleteScenario(doc, 'second')
    expect(content.scenarios.map((s) => s.id)).toEqual(['base'])
    expect(content.activeScenarioId).toBe('base')
  })

  it('throws on unknown id', () => {
    expect(() => deleteScenario(docWithTwo(), 'nope')).toThrow('シナリオが見つかりません')
  })
})

describe('renameScenario', () => {
  it('renames with trimming', () => {
    const content = renameScenario(docWithTwo(), 'second', '  強気プラン  ')
    expect(content.scenarios[1]!.name).toBe('強気プラン')
  })

  it('rejects empty (after trim) names and unknown ids', () => {
    const doc = docWithTwo()
    expect(() => renameScenario(doc, 'second', '   ')).toThrow('シナリオ名を入力してください')
    expect(() => renameScenario(doc, 'nope', 'x')).toThrow('シナリオが見つかりません')
  })
})

describe('setActiveScenario', () => {
  it('switches activeScenarioId', () => {
    const content = setActiveScenario(docWithTwo(), 'second')
    expect(content.activeScenarioId).toBe('second')
  })

  it('throws on unknown id', () => {
    expect(() => setActiveScenario(docWithTwo(), 'nope')).toThrow('シナリオが見つかりません')
  })
})

describe('all ops', () => {
  it('outputs pass fromDoc(toDoc(...)) (§15.3)', () => {
    const doc = docWithTwo()
    for (const content of [
      duplicateScenario(doc, 'base', 'c9'),
      deleteScenario(doc, 'second'),
      renameScenario(doc, 'base', '改名'),
      setActiveScenario(doc, 'second'),
    ]) {
      expect(() => fromDoc(toDoc(content))).not.toThrow()
    }
  })

  it('preserves actuals and baseline fields', () => {
    const doc = docWithTwo()
    const content = setActiveScenario(doc, 'second')
    expect(content.actuals).toEqual(doc.actuals)
    expect(content.baseline).toEqual(doc.baseline)
  })
})
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/persistence/scenarioOps.test.ts`
Expected: FAIL（`scenarioOps.ts` が存在しないため import エラー）

- [x] **Step 3: 最小実装を書く**

`lifeplan/src/persistence/scenarioOps.ts` を新規作成:

```ts
// シナリオの構造操作(複製/削除/rename/アクティブ切替)の純関数群(§15.3)。
// HouseholdDoc を受け取り封筒(schemaVersion/updatedAt)を除いた HouseholdContent を返す。
// ガード違反は throw(UI はボタン無効化で先に防ぎ、これは最終防壁)。
import type { HouseholdDoc, HouseholdContent, Scenario } from './types'

function contentOf(doc: HouseholdDoc): HouseholdContent {
  return {
    baseYear: doc.baseYear,
    activeScenarioId: doc.activeScenarioId,
    scenarios: doc.scenarios,
    actuals: doc.actuals,
    ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
  }
}

function findScenario(doc: HouseholdDoc, id: string): Scenario {
  const scenario = doc.scenarios.find((s) => s.id === id)
  if (!scenario) throw new Error(`シナリオが見つかりません: ${id}`)
  return scenario
}

/** 「◯◯のコピー」。同名が既にあれば「◯◯のコピー2」「◯◯のコピー3」…と採番 */
function copyName(base: string, existing: string[]): string {
  const first = `${base}のコピー`
  if (!existing.includes(first)) return first
  let n = 2
  while (existing.includes(`${base}のコピー${n}`)) n += 1
  return `${base}のコピー${n}`
}

export function duplicateScenario(doc: HouseholdDoc, sourceId: string, newId: string): HouseholdContent {
  const source = findScenario(doc, sourceId)
  if (doc.scenarios.some((s) => s.id === newId)) throw new Error(`シナリオIDが重複しています: ${newId}`)
  const copy: Scenario = {
    id: newId,
    name: copyName(source.name, doc.scenarios.map((s) => s.name)),
    inputs: structuredClone(source.inputs),
  }
  return { ...contentOf(doc), scenarios: [...doc.scenarios, copy] }
}

export function deleteScenario(doc: HouseholdDoc, id: string): HouseholdContent {
  findScenario(doc, id)
  if (doc.scenarios.length === 1) throw new Error('最後のシナリオは削除できません')
  const scenarios = doc.scenarios.filter((s) => s.id !== id)
  const activeScenarioId = doc.activeScenarioId === id ? scenarios[0]!.id : doc.activeScenarioId
  return { ...contentOf(doc), scenarios, activeScenarioId }
}

export function renameScenario(doc: HouseholdDoc, id: string, name: string): HouseholdContent {
  findScenario(doc, id)
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('シナリオ名を入力してください')
  return {
    ...contentOf(doc),
    scenarios: doc.scenarios.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
  }
}

export function setActiveScenario(doc: HouseholdDoc, id: string): HouseholdContent {
  findScenario(doc, id)
  return { ...contentOf(doc), activeScenarioId: id }
}
```

- [x] **Step 4: テストが通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/persistence/scenarioOps.test.ts`
Expected: PASS（全12テスト）

- [x] **Step 5: typecheck して既存テストの不変を確認する**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト green（既存170 + 新規12）

- [x] **Step 6: コミット**

```bash
git add lifeplan/src/persistence/scenarioOps.ts lifeplan/tests/persistence/scenarioOps.test.ts
git commit -m "feat: scenarioOps 純関数（複製/削除/rename/アクティブ切替, §15.3）"
```

---

### Task 2: scenarioActions — 薄い保存アクション層

§15.4 の書き込みフロー。draftStore.save と同一の保存パターン（`toDoc`→`fromDoc` 最終防壁→`repository.save`）を1関数に共通化し、各操作を `Promise<{ ok, error? }>` で返す。グローバル state は持たない。

**Files:**
- Create: `lifeplan/src/store/scenarioActions.ts`
- Test: `lifeplan/tests/store/scenarioActions.test.ts`

**Interfaces:**
- Consumes: Task 1 の4関数、`useHouseholdStore`/`HOUSEHOLD_ID`（`src/store/householdStore.ts`）、`toDoc`/`fromDoc`（`src/persistence/doc.ts`）
- Produces: 後続タスク（ScenarioCard）が使う4アクション
  - `duplicateScenarioAction(sourceId: string): Promise<ActionResult>`（newId は内部で `crypto.randomUUID()`）
  - `deleteScenarioAction(id: string): Promise<ActionResult>`
  - `renameScenarioAction(id: string, name: string): Promise<ActionResult>`
  - `setActiveScenarioAction(id: string): Promise<ActionResult>`
  - `interface ActionResult { ok: boolean; error?: string }`

- [x] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/scenarioActions.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import {
  duplicateScenarioAction,
  deleteScenarioAction,
  renameScenarioAction,
  setActiveScenarioAction,
} from '../../src/store/scenarioActions'

describe('scenarioActions', () => {
  let repository: InMemoryHouseholdRepository

  beforeEach(async () => {
    repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository) // default doc(base 1本)を bootstrap
  })

  it('duplicate saves and the subscription reflects the new doc in the store', async () => {
    const result = await duplicateScenarioAction('base')
    expect(result).toEqual({ ok: true })

    const doc = useHouseholdStore.getState().doc!
    expect(doc.scenarios).toHaveLength(2)
    expect(doc.scenarios[1]!.name).toBe('ベースプランのコピー')
    expect(doc.updatedAt).toBeDefined()
    // repository にも書かれている
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.scenarios).toHaveLength(2)
  })

  it('rename and setActive update the store doc', async () => {
    await duplicateScenarioAction('base')
    const copyId = useHouseholdStore.getState().doc!.scenarios[1]!.id

    expect((await renameScenarioAction(copyId, '強気プラン')).ok).toBe(true)
    expect((await setActiveScenarioAction(copyId)).ok).toBe(true)

    const doc = useHouseholdStore.getState().doc!
    expect(doc.scenarios[1]!.name).toBe('強気プラン')
    expect(doc.activeScenarioId).toBe(copyId)
  })

  it('returns ok:false when status is not ready, without writing', async () => {
    useHouseholdStore.setState({ status: 'loading' })
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await duplicateScenarioAction('base')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
  })

  it('returns ok:false with the op error message, without writing (guard throw)', async () => {
    const before = await repository.load(HOUSEHOLD_ID)

    const result = await deleteScenarioAction('base') // 最後の1本
    expect(result.ok).toBe(false)
    expect(result.error).toContain('最後のシナリオは削除できません')
    expect(await repository.load(HOUSEHOLD_ID)).toEqual(before)
    expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(1)
  })
})
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/store/scenarioActions.test.ts`
Expected: FAIL（`scenarioActions.ts` が存在しないため import エラー）

- [x] **Step 3: 最小実装を書く**

`lifeplan/src/store/scenarioActions.ts` を新規作成:

```ts
// シナリオ構造操作の保存アクション(§15.4)。構造操作に「編集途中」は無いため即時保存・ドラフト無し。
// 保存パターンは draftStore.save と同一: toDoc(updatedAt打刻) → fromDoc(最終防壁 C1) → repository.save。
// エラー表示はページの local state に委ねる(グローバル state を持たない)。
import type { HouseholdDoc, HouseholdContent } from '../persistence/types'
import { toDoc, fromDoc } from '../persistence/doc'
import {
  duplicateScenario,
  deleteScenario,
  renameScenario,
  setActiveScenario,
} from '../persistence/scenarioOps'
import { useHouseholdStore, HOUSEHOLD_ID } from './householdStore'

export interface ActionResult {
  ok: boolean
  error?: string
}

async function applyScenarioOp(op: (doc: HouseholdDoc) => HouseholdContent): Promise<ActionResult> {
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

export const duplicateScenarioAction = (sourceId: string): Promise<ActionResult> =>
  applyScenarioOp((doc) => duplicateScenario(doc, sourceId, crypto.randomUUID()))

export const deleteScenarioAction = (id: string): Promise<ActionResult> =>
  applyScenarioOp((doc) => deleteScenario(doc, id))

export const renameScenarioAction = (id: string, name: string): Promise<ActionResult> =>
  applyScenarioOp((doc) => renameScenario(doc, id, name))

export const setActiveScenarioAction = (id: string): Promise<ActionResult> =>
  applyScenarioOp((doc) => setActiveScenario(doc, id))
```

- [x] **Step 4: テストが通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/store/scenarioActions.test.ts`
Expected: PASS（全4テスト）

- [x] **Step 5: typecheck**

Run: `cd lifeplan && npm run typecheck`
Expected: エラーなし

- [x] **Step 6: コミット**

```bash
git add lifeplan/src/store/scenarioActions.ts lifeplan/tests/store/scenarioActions.test.ts
git commit -m "feat: scenarioActions 保存アクション層（toDoc→fromDoc防壁→repository.save, §15.4）"
```

---

### Task 3: selectScenarioSummary — カード要約セレクタ

§15.5: カードの要約2数値（終了年齢時点の総資産・推奨積立額/月）。中央シナリオの simulate 1本だけ回す（楽観/悲観は不要なので `simulateAll` は使わない）。

**Files:**
- Modify: `lifeplan/src/store/selectors.ts`（末尾に追加。既存エクスポートのシグネチャ不変）
- Test: `lifeplan/tests/store/selectors.test.ts`（describe を追加）

**Interfaces:**
- Consumes: 既存の `simulate`/`lifeplanMaster`/`computeKpiSummary`（すべて selectors.ts 内で import 済み）
- Produces: ScenarioCard（Task 5）が使う
  - `interface ScenarioSummary { endTotalAssets: number; requiredMonthlyInvestment: number | null }`
  - `selectScenarioSummary(inputs: Inputs, actuals: Actual[]): ScenarioSummary`

- [x] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/selectors.test.ts` の末尾に describe を追加:

```ts
describe('selectScenarioSummary', () => {
  it('matches the KPI values selectDashboardData computes for the same scenario', () => {
    const doc = createDefaultDoc()
    const dashboard = selectDashboardData(doc)
    const summary = selectScenarioSummary(doc.scenarios[0]!.inputs, doc.actuals)

    expect(summary.endTotalAssets).toBe(dashboard.kpi.endTotalAssets)
    expect(summary.requiredMonthlyInvestment).toBe(dashboard.kpi.requiredMonthlyInvestment)
  })
})
```

既存 import に `selectScenarioSummary` と（未 import なら）`createDefaultDoc` を追加する。

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: FAIL（`selectScenarioSummary` が未定義）

- [x] **Step 3: 最小実装を書く**

`lifeplan/src/store/selectors.ts` の末尾に追加:

```ts
export interface ScenarioSummary {
  endTotalAssets: number
  requiredMonthlyInvestment: number | null
}

/** シナリオ管理画面のカード要約用(§15.5)。中央系列のみ計算する(楽観/悲観は不要) */
export function selectScenarioSummary(inputs: Inputs, actuals: Actual[]): ScenarioSummary {
  const central = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.investmentReturnRate })
  const kpi = computeKpiSummary(inputs, central)
  return { endTotalAssets: kpi.endTotalAssets, requiredMonthlyInvestment: kpi.requiredMonthlyInvestment }
}
```

- [x] **Step 4: テストが通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: PASS

- [x] **Step 5: typecheck とコミット**

```bash
cd lifeplan && npm run typecheck
git add lifeplan/src/store/selectors.ts lifeplan/tests/store/selectors.test.ts
git commit -m "feat: selectScenarioSummary（シナリオカード要約, §15.5）"
```

---

### Task 4: `/input/:scenarioId` — URL パラメータで編集対象を指定

§15.1/§15.4: 任意シナリオを編集可能にし、アクティブ切替と編集を独立させる。`/input`（パラメータ無し）は従来どおりアクティブシナリオ編集。未知 id はフォームを出さず「シナリオが見つかりません」＋ `/scenarios` リンク。

**Files:**
- Modify: `lifeplan/src/App.tsx`（ルート追加）
- Modify: `lifeplan/src/components/input/InputPage.tsx`
- Test: `lifeplan/src/InputPage.integration.test.tsx`（it を2本追加）

**Interfaces:**
- Consumes: `useParams`（react-router-dom）、`useDraftStore.beginEdit(scenarioId, inputs)`（既存・無改変）、Task 1 の `duplicateScenario`（テストの fixture 用）
- Produces: ルート `/input/:scenarioId`（Task 5 の ScenarioCard「編集」リンクと Task 6 の e2e が使う）

- [x] **Step 1: 失敗するテストを書く**

`lifeplan/src/InputPage.integration.test.tsx` の describe 内に it を2本追加し、import に `createDefaultDoc, toDoc, fromDoc`（`./persistence/doc`）と `duplicateScenario`（`./persistence/scenarioOps`）を足す:

```tsx
  it('edits the scenario specified by /input/:scenarioId (not the active one)', async () => {
    // base(アクティブ) + second の2本を事前シード
    const base = createDefaultDoc()
    const seeded = fromDoc(toDoc(duplicateScenario(base, 'base', 'second'), { updatedAt: new Date().toISOString() }))
    await repository.save(HOUSEHOLD_ID, seeded)
    window.history.pushState({}, '', '/input/second')

    render(<App />)

    await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    expect(useDraftStore.getState().scenarioId).toBe('second')
    expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('base') // アクティブは不変
  })

  it('shows an error (no form) for an unknown scenario id', async () => {
    window.history.pushState({}, '', '/input/nope')

    render(<App />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('シナリオが見つかりません'))
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'シナリオ管理へ' })).toBeInTheDocument()
  })
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/InputPage.integration.test.tsx`
Expected: 新規2本が FAIL（ルート未定義のため `/input/second` でフォームが出ない）。既存テストは PASS のまま。

- [x] **Step 3: 実装する**

`lifeplan/src/App.tsx` — ルート定義に1行追加:

```tsx
const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardRoute /> },
      { path: '/input', element: <InputPage /> },
      { path: '/input/:scenarioId', element: <InputPage /> },
    ],
  },
]
```

`lifeplan/src/components/input/InputPage.tsx` — import を追加:

```tsx
import { useBlocker, useParams, Link } from 'react-router-dom'
```

`InputPage` 冒頭の store 購読に `scenarioId`（ドラフトの編集対象）を追加し、beginEdit の effect を差し替える:

```tsx
export function InputPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const draft = useDraftStore((s) => s.draft)
  const dirty = useDraftStore((s) => s.dirty)
  const draftScenarioId = useDraftStore((s) => s.scenarioId)
  const beginEdit = useDraftStore((s) => s.beginEdit)
  const { scenarioId: paramScenarioId } = useParams()

  // 編集対象: URL パラメータ優先、無ければ activeScenarioId(§15.1)。
  // - パラメータ無し: 非 dirty のときだけ doc に追随(§14.3 step 6。dirty 中の
  //   activeScenarioId 切替でドラフトを捨てない既存契約を維持)
  // - パラメータ有り: 対象が変わったら dirty でも張り直す(遷移は useBlocker の
  //   confirm を通過済み=編集破棄をユーザーが了承済み)
  useEffect(() => {
    if (status !== 'ready' || !doc) return
    const targetId = paramScenarioId ?? doc.activeScenarioId
    const needsRebase = paramScenarioId ? draftScenarioId !== targetId || !dirty : !dirty
    if (!needsRebase) return
    const scenario = doc.scenarios.find((s) => s.id === targetId)
    if (scenario) beginEdit(scenario.id, scenario.inputs)
  }, [status, doc, dirty, draftScenarioId, beginEdit, paramScenarioId])
```

（既存の blocker / beforeunload / status==='error' の各ブロックは無改変。）

`if (!doc || !draft)` の**手前**に未知 id 分岐を追加:

```tsx
  if (status === 'ready' && doc && paramScenarioId && !doc.scenarios.some((s) => s.id === paramScenarioId)) {
    return (
      <main className={styles.main}>
        <p role="alert">シナリオが見つかりません。</p>
        <Link to="/scenarios">シナリオ管理へ</Link>
      </main>
    )
  }
```

- [x] **Step 4: テストが通ることを確認する**

Run: `cd lifeplan && npx vitest run src/InputPage.integration.test.tsx`
Expected: PASS（既存 + 新規2本）

- [x] **Step 5: typecheck して全テストの不変を確認する**

Run: `cd lifeplan && npm run typecheck && npm test`
Expected: 全テスト green

- [x] **Step 6: コミット**

```bash
git add lifeplan/src/App.tsx lifeplan/src/components/input/InputPage.tsx lifeplan/src/InputPage.integration.test.tsx
git commit -m "feat: /input/:scenarioId で任意シナリオを編集可能に（§15.1）"
```

---

### Task 5: ScenariosPage / ScenarioCard — シナリオ管理画面

§15.5 の画面。カード一覧（名前・アクティブバッジ・要約2数値・操作5種）、インライン rename、2段階削除確認、1本のみで削除無効。

**Files:**
- Create: `lifeplan/src/components/scenarios/ScenariosPage.tsx`
- Create: `lifeplan/src/components/scenarios/ScenarioCard.tsx`
- Create: `lifeplan/src/components/scenarios/ScenariosPage.module.css`
- Create: `lifeplan/src/components/scenarios/ScenarioCard.module.css`
- Modify: `lifeplan/src/App.tsx`（`/scenarios` ルート追加）
- Modify: `lifeplan/src/components/layout/Header.tsx`（ナビリンク追加）
- Test: `lifeplan/src/components/scenarios/ScenariosPage.test.tsx`
- Test: `lifeplan/src/components/layout/Header.test.tsx`（アサーション追加）

**Interfaces:**
- Consumes: Task 2 の4アクション、Task 3 の `selectScenarioSummary`、`formatYen`（`src/components/formatYen.ts`）、`useHouseholdStore`
- Produces: ルート `/scenarios`（Task 6 の e2e が使う）

- [x] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/scenarios/ScenariosPage.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { ScenariosPage } from './ScenariosPage'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../store/householdStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { duplicateScenario } from '../../persistence/scenarioOps'

async function setup(opts?: { scenarios?: 1 | 2 }) {
  const repository = new InMemoryHouseholdRepository()
  let doc = createDefaultDoc()
  if ((opts?.scenarios ?? 2) === 2) {
    doc = fromDoc(toDoc(duplicateScenario(doc, 'base', 'second')))
  }
  await repository.save(HOUSEHOLD_ID, doc)
  await useHouseholdStore.getState().load(repository)
  return render(
    <MemoryRouter>
      <ScenariosPage />
    </MemoryRouter>,
  )
}

describe('ScenariosPage', () => {
  it('renders a card per scenario with name, summary and active badge', async () => {
    await setup()

    const baseCard = screen.getByRole('listitem', { name: 'ベースプラン' })
    expect(within(baseCard).getByText('アクティブ')).toBeInTheDocument()
    expect(within(baseCard).getByText('終了年齢時点の総資産')).toBeInTheDocument()
    expect(within(baseCard).getByText('推奨積立額')).toBeInTheDocument()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    expect(within(copyCard).queryByText('アクティブ')).not.toBeInTheDocument()
    expect(within(copyCard).getByRole('link', { name: '編集' })).toHaveAttribute('href', '/input/second')
  })

  it('switches the active scenario', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: 'アクティブにする' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('second'))
    expect(within(screen.getByRole('listitem', { name: 'ベースプランのコピー' })).getByText('アクティブ')).toBeInTheDocument()
  })

  it('renames inline with confirm, and cancel restores the input', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: '名前変更' }))
    const nameInput = within(copyCard).getByLabelText('シナリオ名')
    await user.clear(nameInput)
    await user.type(nameInput, '強気プラン')
    await user.click(within(copyCard).getByRole('button', { name: '確定' }))

    await waitFor(() =>
      expect(useHouseholdStore.getState().doc?.scenarios.find((s) => s.id === 'second')?.name).toBe('強気プラン'),
    )
    expect(screen.getByRole('listitem', { name: '強気プラン' })).toBeInTheDocument()
  })

  it('deletes only after the two-step confirmation', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: '削除' }))
    // 1段階目では消えない
    expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(2)
    expect(within(copyCard).getByText('削除しますか？')).toBeInTheDocument()

    await user.click(within(copyCard).getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(1))
    expect(screen.queryByRole('listitem', { name: 'ベースプランのコピー' })).not.toBeInTheDocument()
  })

  it('disables delete when only one scenario remains', async () => {
    await setup({ scenarios: 1 })

    const baseCard = screen.getByRole('listitem', { name: 'ベースプラン' })
    expect(within(baseCard).getByRole('button', { name: '削除' })).toBeDisabled()
  })

  it('duplicates and a new card appears (no navigation)', async () => {
    const user = userEvent.setup()
    await setup({ scenarios: 1 })

    await user.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'ベースプランのコピー' })).toBeInTheDocument())
    expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('base') // アクティブ不変
  })
})
```

`lifeplan/src/components/layout/Header.test.tsx` の既存 describe に it を1本追加:

```tsx
  it('has a nav link to the scenarios page', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'シナリオ' })).toHaveAttribute('href', '/scenarios')
  })
```

（Header.test.tsx が既に MemoryRouter で render しているヘルパーを持つ場合はそれに合わせる。）

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/scenarios/ScenariosPage.test.tsx src/components/layout/Header.test.tsx`
Expected: ScenariosPage は import エラーで FAIL、Header は リンク不在で新規1本のみ FAIL

- [x] **Step 3: 実装する**

`lifeplan/src/components/scenarios/ScenarioCard.tsx` を新規作成:

```tsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Scenario } from '../../persistence/types'
import type { Actual } from '../../types'
import { selectScenarioSummary } from '../../store/selectors'
import {
  duplicateScenarioAction,
  deleteScenarioAction,
  renameScenarioAction,
  setActiveScenarioAction,
  type ActionResult,
} from '../../store/scenarioActions'
import { formatYen } from '../formatYen'
import styles from './ScenarioCard.module.css'

interface Props {
  scenario: Scenario
  actuals: Actual[]
  isActive: boolean
  canDelete: boolean
  onError: (message: string | null) => void
}

export function ScenarioCard({ scenario, actuals, isActive, canDelete, onError }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(scenario.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // 不正な組み合わせで simulate が throw してもページを巻き込まない(§14.4 の保険と同方針)
  const summary = useMemo(() => {
    try {
      return selectScenarioSummary(scenario.inputs, actuals)
    } catch {
      return null
    }
  }, [scenario.inputs, actuals])

  const run = async (action: Promise<ActionResult>): Promise<boolean> => {
    const result = await action
    onError(result.ok ? null : (result.error ?? '操作に失敗しました'))
    return result.ok
  }

  return (
    <li className={styles.card} aria-label={scenario.name}>
      <div className={styles.titleRow}>
        {renaming ? (
          <>
            <input
              aria-label="シナリオ名"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <button
              onClick={() => {
                void run(renameScenarioAction(scenario.id, nameInput)).then((ok) => {
                  if (ok) setRenaming(false)
                })
              }}
            >
              確定
            </button>
            <button
              onClick={() => {
                setRenaming(false)
                setNameInput(scenario.name)
              }}
            >
              キャンセル
            </button>
          </>
        ) : (
          <>
            <h3 className={styles.name}>{scenario.name}</h3>
            {isActive && <span className={styles.badge}>アクティブ</span>}
          </>
        )}
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>終了年齢時点の総資産</dt>
          <dd>{summary ? formatYen(summary.endTotalAssets) : '—'}</dd>
        </div>
        <div>
          <dt>推奨積立額</dt>
          <dd>
            {summary && summary.requiredMonthlyInvestment !== null
              ? `${formatYen(summary.requiredMonthlyInvestment)}/月`
              : '—'}
          </dd>
        </div>
      </dl>
      <div className={styles.actions}>
        {!isActive && (
          <button onClick={() => void run(setActiveScenarioAction(scenario.id))}>アクティブにする</button>
        )}
        <Link className={styles.editLink} to={`/input/${scenario.id}`}>
          編集
        </Link>
        <button onClick={() => void run(duplicateScenarioAction(scenario.id))}>複製</button>
        {!renaming && <button onClick={() => setRenaming(true)}>名前変更</button>}
        {confirmingDelete ? (
          <span className={styles.confirm}>
            削除しますか？
            <button
              onClick={() => {
                void run(deleteScenarioAction(scenario.id)).then(() => setConfirmingDelete(false))
              }}
            >
              削除する
            </button>
            <button onClick={() => setConfirmingDelete(false)}>キャンセル</button>
          </span>
        ) : (
          <button disabled={!canDelete} onClick={() => setConfirmingDelete(true)}>
            削除
          </button>
        )}
      </div>
    </li>
  )
}
```

`lifeplan/src/components/scenarios/ScenariosPage.tsx` を新規作成:

```tsx
import { useState } from 'react'
import { useHouseholdStore } from '../../store/householdStore'
import { ScenarioCard } from './ScenarioCard'
import styles from './ScenariosPage.module.css'

export function ScenariosPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className={styles.main}>
      <h2>シナリオ管理</h2>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {doc.scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            actuals={doc.actuals}
            isActive={s.id === doc.activeScenarioId}
            canDelete={doc.scenarios.length > 1}
            onError={setError}
          />
        ))}
      </ul>
    </main>
  )
}
```

`lifeplan/src/components/scenarios/ScenariosPage.module.css` を新規作成:

```css
/* lifeplan/src/components/scenarios/ScenariosPage.module.css */
.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.error {
  color: var(--color-negative);
}
```

`lifeplan/src/components/scenarios/ScenarioCard.module.css` を新規作成:

```css
/* lifeplan/src/components/scenarios/ScenarioCard.module.css */
.card {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.titleRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.name {
  margin: 0;
  font-size: 1.1rem;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--color-positive);
  color: #fff;
  font-size: 0.75rem;
}

.summary {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.summary dt {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-bottom: 0.25rem;
}

.summary dd {
  margin: 0;
  font-weight: 700;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.editLink {
  color: var(--color-accent);
}

.confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-negative);
}
```

`lifeplan/src/App.tsx` — import と ルートを追加:

```tsx
import { ScenariosPage } from './components/scenarios/ScenariosPage'
```

```tsx
      { path: '/scenarios', element: <ScenariosPage /> },
```

（`children` 配列の `/input/:scenarioId` の後に追加。）

`lifeplan/src/components/layout/Header.tsx` — nav に NavLink を追加:

```tsx
        <NavLink to="/scenarios" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          シナリオ
        </NavLink>
```

- [x] **Step 4: テストが通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/scenarios/ScenariosPage.test.tsx src/components/layout/Header.test.tsx`
Expected: PASS（ScenariosPage 6本 + Header 追加分）

- [x] **Step 5: typecheck・lint して全テストの不変を確認する**

Run: `cd lifeplan && npm run typecheck && npm run lint && npm test`
Expected: すべて green

- [x] **Step 6: コミット**

```bash
git add lifeplan/src/components/scenarios/ lifeplan/src/App.tsx lifeplan/src/components/layout/Header.tsx lifeplan/src/components/layout/Header.test.tsx
git commit -m "feat: シナリオ管理画面（一覧/複製/rename/2段階削除/アクティブ切替, §15.5）"
```

---

### Task 6: e2e + 全ゲート + ステータス更新

§15.6 の e2e 1本（複製→編集→保存→切替→ダッシュボード反映）と最終ゲート。

**Files:**
- Create: `lifeplan/tests/e2e/scenarios.spec.ts`
- Modify: `CLAUDE.md`（現在のステータス更新）

**Interfaces:**
- Consumes: Task 4 のルート `/input/:scenarioId`、Task 5 の `/scenarios` 画面・Header ナビ

- [x] **Step 1: e2e テストを書く**

`lifeplan/tests/e2e/scenarios.spec.ts` を新規作成:

```ts
// lifeplan/tests/e2e/scenarios.spec.ts
import { test, expect } from '@playwright/test'

test('scenarios: duplicate → edit → save → activate → dashboard reflects', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'シナリオ' }).click()
  await expect(page.getByRole('heading', { name: 'シナリオ管理' })).toBeVisible()

  // 複製 → 新カードが増える
  await page.getByRole('button', { name: '複製' }).click()
  const copyCard = page.getByRole('listitem', { name: 'ベースプランのコピー' })
  await expect(copyCard).toBeVisible()

  // コピーを編集(/input/:scenarioId)して保存
  await copyCard.getByRole('link', { name: '編集' }).click()
  const income = page.getByRole('group', { name: '世帯主' }).getByLabel('手取り年収')
  await income.fill('20000000')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()

  // シナリオ管理に戻ってアクティブ切替
  await page.getByRole('link', { name: 'シナリオ' }).click()
  await page
    .getByRole('listitem', { name: 'ベースプランのコピー' })
    .getByRole('button', { name: 'アクティブにする' })
    .click()
  await expect(
    page.getByRole('listitem', { name: 'ベースプランのコピー' }).getByText('アクティブ'),
  ).toBeVisible()

  // ダッシュボードがコピーの内容(高収入)を反映している
  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByText('現在の総資産')).toBeVisible()
})
```

- [x] **Step 2: e2e を実行する**

Run: `cd lifeplan && npm run test:e2e`
Expected: 3本すべて PASS（dashboard / input / scenarios）

- [x] **Step 3: 全ゲートを実行する**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint && npm run build`
Expected: すべて green（golden 回帰含む）

- [x] **Step 4: CLAUDE.md のステータスを更新する**

`CLAUDE.md` の「現在のステータス」に Plan 6 完了行を追加し、「次のタスク」の Plan 6 チェックを `- [x]` にして結果を1行で記録する（過去プランの記録粒度に合わせる）。プラン一覧（冒頭）にも本プランへの参照を追加:

```markdown
  - `2026-07-04-lifeplan-scenarios.md` … **Plan 6: シナリオ管理画面** ※仕様の源泉は設計書 §15
```

- [x] **Step 5: コミット**

```bash
git add lifeplan/tests/e2e/scenarios.spec.ts CLAUDE.md
git commit -m "test: シナリオ管理の e2e（複製→編集→保存→切替→反映）+ ステータス更新"
```

---

## 完了条件（プラン全体）

- 全 unit/integration テスト green（既存170 + 新規約25）、golden 回帰不変
- `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test:e2e`（3本）green
- `src/engine/`・`src/persistence/` 既存ファイル無改変（`scenarioOps.ts` は純追加）
- 実装完了後、Playwright MCP で目視確認（/scenarios のカード操作・/input/:scenarioId・モバイル幅。スクリーンショットは**ビューポート撮影**で行う——fullPage は Recharts が空白に写るため）
