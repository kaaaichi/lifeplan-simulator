# Plan 5: 入力フォーム画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §8.2 の入力画面（世帯メンバー/資産/住居/生活スタイル/家電/前提）をドラフト+明示保存モデルで実装し、即時プレビュー付きで active シナリオの inputs を編集・保存できるようにする。

**Architecture:** react-router-dom で `/`（既存ダッシュボード）と `/input` を分け、Zustand の draftStore が `Inputs` 丸ごとをドラフト保持する。プレビューはドラフトを既存 engine セレクタに食わせて即時計算。保存は「save 時点の `householdStore.doc` を土台に対象シナリオの inputs のみ差し替え → `toDoc`(updatedAt打刻) → `fromDoc`(最終防壁) → `repository.save`」。仕様の源泉 = `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` **§14**（§8.2/§12 も参照）。

**Tech Stack:** React 19 + TypeScript + Zustand + Recharts（既存）、react-router-dom（新規導入）、Vitest + React Testing Library + Playwright（既存）。

## Global Constraints

- 作業ディレクトリはリポジトリ root の `lifeplan/`。テスト実行は `cd lifeplan && ...`。
- **背骨（§14.5）**: `src/engine/`・`src/persistence/` は**無改変**（import して使うのみ）。既存の全テストとゴールデン回帰（`tests/golden.integration.test.ts`）は不変で green を維持する。
- `src/store/selectors.ts` は**既存エクスポートのシグネチャ不変**。関数追加・private ヘルパー抽出のみ可。
- **フィールドの正は `src/types.ts` の `Inputs`**（§5 との乖離、例 `buildYear` は入力欄を作らない）。
- 新規依存は `react-router-dom` の1つだけ。react-hook-form/zod は導入しない。
- コンポーネントテストは `*.test.tsx`（`test:unit` に入る）、統合テストは `*.integration.test.tsx`（`test:integration` に入る）。jsdom を使う tsx テストは先頭に `// @vitest-environment jsdom` を付ける（既存慣行）。
- スタイルは CSS Modules（既存慣行）。`src/styles/theme.css` の CSS 変数を使う。
- UI 文言は日本語。
- 各タスク完了時に `npm run typecheck` が通ること。コミットは各タスク末尾で必ず行う。

---

### Task 1: householdStore — repository 保持と購読の冪等化

§14.3 step 0: 「householdStore は load 時に使用した repository を state に保持し、多重購読は unsubscribe 保持により冪等化する」。draftStore.save（Task 4）が同一 repository インスタンスを使うための前提。

**Files:**
- Modify: `lifeplan/src/store/householdStore.ts`
- Test: `lifeplan/tests/store/householdStore.test.ts`

**Interfaces:**
- Consumes: 既存 `HouseholdRepository` / `InMemoryHouseholdRepository`（`src/persistence/repository.ts`、無改変）
- Produces: `HouseholdState` に `repository: HouseholdRepository` フィールド追加（初期値 `defaultRepository`、`load()` が使用インスタンスで更新）。後続タスクは `useHouseholdStore.getState().repository` で参照する。`load()` の既存シグネチャ `(repository?: HouseholdRepository) => Promise<void>` は不変。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/householdStore.test.ts` の describe 内に追加:

```ts
  it('keeps the repository used by load in state', async () => {
    const repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository)
    expect(useHouseholdStore.getState().repository).toBe(repository)
  })

  it('unsubscribes the previous subscription when load runs again', async () => {
    const inner = new InMemoryHouseholdRepository()
    let active = 0
    const counting: HouseholdRepository = {
      load: (id) => inner.load(id),
      save: (id, doc) => inner.save(id, doc),
      subscribe: (id, cb, onError) => {
        active += 1
        const off = inner.subscribe(id, cb, onError)
        return () => {
          active -= 1
          off()
        }
      },
    }
    await useHouseholdStore.getState().load(counting)
    await useHouseholdStore.getState().load(counting)
    expect(active).toBe(1)
  })
```

import に `import type { HouseholdRepository } from '../../src/persistence/repository'` を追加。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/store/householdStore.test.ts`
Expected: FAIL（`repository` が state に無い / `active` が 2）

- [ ] **Step 3: 実装**

`lifeplan/src/store/householdStore.ts` を以下の全文に置き換える:

```ts
import { create } from 'zustand'
import type { HouseholdDoc } from '../persistence/types'
import type { HouseholdRepository } from '../persistence/repository'
import { InMemoryHouseholdRepository } from '../persistence/repository'
import { createDefaultDoc } from '../persistence/doc'

export const HOUSEHOLD_ID = 'primary'
export const defaultRepository: HouseholdRepository = new InMemoryHouseholdRepository()

export type HouseholdStatus = 'loading' | 'ready' | 'error'

interface HouseholdState {
  doc: HouseholdDoc | null
  status: HouseholdStatus
  error: unknown
  repository: HouseholdRepository
  load: (repository?: HouseholdRepository) => Promise<void>
}

// 購読の冪等化: load のたびに前回分を解除する(StrictMode の二重 effect・再 mount 対策)
let unsubscribe: (() => void) | null = null

export const useHouseholdStore = create<HouseholdState>((set) => ({
  doc: null,
  status: 'loading',
  error: null,
  repository: defaultRepository,
  load: async (repository = defaultRepository) => {
    set({ status: 'loading', error: null, repository })
    try {
      const existing = await repository.load(HOUSEHOLD_ID)
      const doc = existing ?? (await repository.save(HOUSEHOLD_ID, createDefaultDoc()))
      unsubscribe?.()
      unsubscribe = repository.subscribe(HOUSEHOLD_ID, (next) => {
        if (next) set({ doc: next, status: 'ready' })
      })
      set({ doc, status: 'ready' })
    } catch (error) {
      set({ status: 'error', error })
    }
  },
}))
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/store/householdStore.test.ts && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: 既存全テストが green のまま確認しコミット**

Run: `cd lifeplan && npm test`
Expected: 全 PASS（golden 回帰含む）

```bash
git add lifeplan/src/store/householdStore.ts lifeplan/tests/store/householdStore.test.ts
git commit -m "feat: householdStore が load 時の repository を保持し購読を冪等化"
```

---

### Task 2: react-router-dom 導入 — Layout 化と `/input` ルート雛形

**Files:**
- Modify: `lifeplan/package.json`（react-router-dom 追加）
- Modify: `lifeplan/src/App.tsx`
- Modify: `lifeplan/src/components/layout/Header.tsx`（+ `Header.module.css` にナビ用クラス）
- Create: `lifeplan/src/components/input/InputPage.tsx`（このタスクでは雛形のみ）
- Test: `lifeplan/src/App.integration.test.tsx`, `lifeplan/src/components/layout/Header.test.tsx`

**Interfaces:**
- Consumes: `useHouseholdStore.load`（Task 1）、既存 `Dashboard`/`selectDashboardData`
- Produces: ルート構成 `/` = ダッシュボード、`/input` = `InputPage`。`load()` はルート Layout の `useEffect` で一度だけ呼ぶ（§14.3 step 0）。Header に `NavLink`（「ダッシュボード」「入力」）。`InputPage` は Task 12 で全面差し替えする雛形。

- [ ] **Step 1: 依存を追加**

Run: `cd lifeplan && npm install react-router-dom`
Expected: `package.json` の dependencies に `react-router-dom` が追加される

- [ ] **Step 2: 失敗するテストを書く**

`lifeplan/src/App.integration.test.tsx` を以下の全文に置き換える:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from './App'
import { useHouseholdStore, defaultRepository } from './store/householdStore'

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
  })

  it('bootstraps the default household and renders the dashboard', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '家計の羅針盤' })).toBeInTheDocument()
  })

  it('navigates to the input page via the header link', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())

    await user.click(screen.getByRole('link', { name: '入力' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: '入力' })).toBeInTheDocument())
  })
})
```

> `@testing-library/user-event` が devDependencies に無ければ `npm install -D @testing-library/user-event` を実行する。

`lifeplan/src/components/layout/Header.test.tsx` の `render(<Header />)` を `MemoryRouter` でラップする（`import { MemoryRouter } from 'react-router-dom'` を追加し `render(<MemoryRouter><Header /></MemoryRouter>)`）。既存アサーションは不変。

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/App.integration.test.tsx`
Expected: FAIL（「入力」リンクが無い）

- [ ] **Step 4: 実装**

`lifeplan/src/components/input/InputPage.tsx`（新規・雛形）:

```tsx
export function InputPage() {
  return (
    <main>
      <h2>入力</h2>
    </main>
  )
}
```

`lifeplan/src/App.tsx` を以下の全文に置き換える:

```tsx
import { useEffect, useMemo } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { InputPage } from './components/input/InputPage'
import { useHouseholdStore } from './store/householdStore'
import { selectDashboardData } from './store/selectors'

function Layout() {
  const load = useHouseholdStore((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])
  return (
    <>
      <Header />
      <Outlet />
    </>
  )
}

function DashboardRoute() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const data = useMemo(() => (doc ? selectDashboardData(doc) : null), [doc])
  return (
    <>
      {status === 'error' && <p role="alert">データの読み込みに失敗しました</p>}
      {status !== 'error' && !data && <p>読み込み中...</p>}
      {data && <Dashboard data={data} />}
    </>
  )
}

const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardRoute /> },
      { path: '/input', element: <InputPage /> },
    ],
  },
]

export function App() {
  const router = useMemo(() => createBrowserRouter(routes), [])
  return <RouterProvider router={router} />
}
```

`lifeplan/src/components/layout/Header.tsx` を以下の全文に置き換える:

```tsx
// lifeplan/src/components/layout/Header.tsx
import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

export function Header() {
  return (
    <header className={styles.header}>
      <span className={styles.logo}>¥</span>
      <h1 className={styles.title}>家計の羅針盤</h1>
      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? styles.active : undefined)}>
          ダッシュボード
        </NavLink>
        <NavLink to="/input" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          入力
        </NavLink>
      </nav>
    </header>
  )
}
```

`lifeplan/src/components/layout/Header.module.css` に追記:

```css
.nav {
  margin-left: auto;
  display: flex;
  gap: 1rem;
}
.nav a {
  color: inherit;
  text-decoration: none;
  opacity: 0.75;
}
.nav a.active,
.nav a:hover {
  opacity: 1;
  text-decoration: underline;
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/App.integration.test.tsx src/components/layout/Header.test.tsx && npm run typecheck && npm test`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
git add lifeplan/package.json lifeplan/package-lock.json lifeplan/src/App.tsx lifeplan/src/components/layout/ lifeplan/src/components/input/InputPage.tsx lifeplan/src/App.integration.test.tsx
git commit -m "feat: react-router-dom 導入、/ と /input のルーティングと Header ナビ"
```

---

### Task 3: draftStore — beginEdit / update / discard

**Files:**
- Create: `lifeplan/src/store/draftStore.ts`
- Test: `lifeplan/tests/store/draftStore.test.ts`

**Interfaces:**
- Consumes: `Inputs`（`src/types.ts`）、`useHouseholdStore`（discard が現 doc から再コピーするため）
- Produces:

```ts
interface DraftState {
  scenarioId: string | null
  draft: Inputs | null
  dirty: boolean
  saveError: string | null
  beginEdit: (scenarioId: string, inputs: Inputs) => void
  update: (fn: (prev: Inputs) => Inputs) => void
  discard: () => void
  save: () => Promise<boolean> // Task 4 で実装。このタスクでは常に false を返すスタブ
}
export const useDraftStore: UseBoundStore<StoreApi<DraftState>>
```

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/draftStore.test.ts`（新規）:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useDraftStore } from '../../src/store/draftStore'
import { useHouseholdStore, defaultRepository } from '../../src/store/householdStore'
import { defaultInputs } from '../../src/persistence/placeholderHousehold'
import { toDoc } from '../../src/persistence/doc'
import type { Inputs } from '../../src/types'

function makeInputs(): Inputs {
  return structuredClone(defaultInputs)
}

describe('useDraftStore', () => {
  beforeEach(() => {
    useDraftStore.setState({ scenarioId: null, draft: null, dirty: false, saveError: null })
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
  })

  it('beginEdit deep-copies the inputs and resets dirty', () => {
    const source = makeInputs()
    useDraftStore.getState().beginEdit('base', source)

    const { draft, scenarioId, dirty } = useDraftStore.getState()
    expect(scenarioId).toBe('base')
    expect(dirty).toBe(false)
    expect(draft).not.toBe(source)
    expect(draft).toEqual(source)

    // 元を破壊してもドラフトは影響を受けない(ディープコピー)
    source.members.children.pop()
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(1)
  })

  it('update applies the recipe immutably and marks dirty', () => {
    useDraftStore.getState().beginEdit('base', makeInputs())
    const before = useDraftStore.getState().draft!

    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 12_000_000 } },
    }))

    const after = useDraftStore.getState()
    expect(after.draft?.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(after.dirty).toBe(true)
    expect(before.members.primary.takeHomeIncome).toBe(6_000_000) // 不変更新
  })

  it('discard re-copies the scenario inputs from the current household doc', () => {
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: makeInputs() }],
      actuals: [],
    })
    useHouseholdStore.setState({ doc, status: 'ready' })
    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 1 } },
    }))

    useDraftStore.getState().discard()

    const state = useDraftStore.getState()
    expect(state.draft?.members.primary.takeHomeIncome).toBe(6_000_000)
    expect(state.dirty).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/store/draftStore.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/store/draftStore.ts`（新規）:

```ts
import { create } from 'zustand'
import type { Inputs } from '../types'
import { useHouseholdStore } from './householdStore'

interface DraftState {
  /** beginEdit で固定した編集対象シナリオ(§14.3: activeScenarioId の切替に追随しない) */
  scenarioId: string | null
  draft: Inputs | null
  dirty: boolean
  saveError: string | null
  beginEdit: (scenarioId: string, inputs: Inputs) => void
  update: (fn: (prev: Inputs) => Inputs) => void
  discard: () => void
  save: () => Promise<boolean>
}

export const useDraftStore = create<DraftState>((set, get) => ({
  scenarioId: null,
  draft: null,
  dirty: false,
  saveError: null,

  beginEdit: (scenarioId, inputs) => {
    set({ scenarioId, draft: structuredClone(inputs), dirty: false, saveError: null })
  },

  update: (fn) => {
    const { draft } = get()
    if (!draft) return
    set({ draft: fn(draft), dirty: true })
  },

  discard: () => {
    const { scenarioId } = get()
    const { doc } = useHouseholdStore.getState()
    const scenario = doc?.scenarios.find((s) => s.id === scenarioId)
    if (!scenarioId || !scenario) {
      set({ scenarioId: null, draft: null, dirty: false, saveError: null })
      return
    }
    get().beginEdit(scenarioId, scenario.inputs)
  },

  save: async () => {
    return false // Task 4 で実装
  },
}))
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/store/draftStore.test.ts && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/store/draftStore.ts lifeplan/tests/store/draftStore.test.ts
git commit -m "feat: draftStore(beginEdit/update/discard) — Inputs のドラフト編集基盤"
```

---

### Task 4: draftStore.save — 土台doc差し替え・updatedAt打刻・最終防壁

§14.3 step 4 の保存契約を実装する。

**Files:**
- Modify: `lifeplan/src/store/draftStore.ts`
- Test: `lifeplan/tests/store/draftStore.test.ts`

**Interfaces:**
- Consumes: `toDoc`/`fromDoc`（`src/persistence/doc.ts`、無改変）、`HouseholdContent`（`src/persistence/types.ts`）、`useHouseholdStore.getState().repository`（Task 1）、`HOUSEHOLD_ID`
- Produces: `save(): Promise<boolean>` — 成功で true・`dirty=false`・`saveError=null`。失敗（未 ready / 検証エラー）で false・`saveError` に message。**actuals・baseline・他シナリオは不変のまま保存される。**

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/draftStore.test.ts` の describe 内に追加:

```ts
  it('save replaces only the target scenario inputs and stamps updatedAt', async () => {
    const repository = new InMemoryHouseholdRepository()
    const otherInputs = makeInputs()
    const doc = toDoc(
      {
        baseYear: defaultInputs.baseYear,
        activeScenarioId: 'base',
        scenarios: [
          { id: 'base', name: 'ベースプラン', inputs: makeInputs() },
          { id: 'alt', name: '別プラン', inputs: otherInputs },
        ],
        actuals: [{ year: 2026, cashBalance: 1_000_000, investmentBalance: 2_000_000 }],
      },
    )
    await repository.save(HOUSEHOLD_ID, doc)
    await useHouseholdStore.getState().load(repository)

    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    useDraftStore.getState().update((prev) => ({
      ...prev,
      members: { ...prev.members, primary: { ...prev.members.primary, takeHomeIncome: 12_000_000 } },
    }))

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(true)
    expect(useDraftStore.getState().dirty).toBe(false)
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.scenarios.find((s) => s.id === 'base')?.inputs.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(saved?.scenarios.find((s) => s.id === 'alt')?.inputs).toEqual(otherInputs) // 他シナリオ不変
    expect(saved?.actuals).toEqual(doc.actuals) // actuals 不変
    expect(saved?.updatedAt).toBeDefined() // updatedAt 打刻
    // subscribe 経由で householdStore にも反映される
    expect(useHouseholdStore.getState().doc?.updatedAt).toBe(saved?.updatedAt)
  })

  it('save rejects an invalid draft via the fromDoc gate and keeps the repository untouched', async () => {
    const repository = new InMemoryHouseholdRepository()
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: makeInputs() }],
      actuals: [],
    })
    await repository.save(HOUSEHOLD_ID, doc)
    await useHouseholdStore.getState().load(repository)

    useDraftStore.getState().beginEdit('base', doc.scenarios[0]!.inputs)
    // baseYear クロスフィールド不変条件(H2)を破る = 最終防壁が発火する不正ドラフト
    useDraftStore.getState().update((prev) => ({ ...prev, baseYear: prev.baseYear + 1 }))

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(false)
    expect(useDraftStore.getState().saveError).toBeTruthy()
    const saved = await repository.load(HOUSEHOLD_ID)
    expect(saved?.updatedAt).toBeUndefined() // 保存されていない
  })

  it('save refuses when the household store is not ready (fail-closed C1)', async () => {
    useHouseholdStore.setState({ doc: null, status: 'error', error: new Error('boom') })
    useDraftStore.getState().beginEdit('base', makeInputs())

    const ok = await useDraftStore.getState().save()

    expect(ok).toBe(false)
    expect(useDraftStore.getState().saveError).toBeTruthy()
  })
```

import に追加: `import { InMemoryHouseholdRepository } from '../../src/persistence/repository'` と `import { HOUSEHOLD_ID } from '../../src/store/householdStore'`（既存 import 行に統合してよい）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/store/draftStore.test.ts`
Expected: 新規3件が FAIL（save スタブが false を返すだけ / saveError 未設定）

- [ ] **Step 3: 実装**

`lifeplan/src/store/draftStore.ts` の import を追加し、`save` スタブを差し替える:

```ts
import type { HouseholdContent } from '../persistence/types'
import { toDoc, fromDoc } from '../persistence/doc'
import { useHouseholdStore, HOUSEHOLD_ID } from './householdStore'
```

```ts
  save: async () => {
    const { scenarioId, draft } = get()
    const { doc, status, repository } = useHouseholdStore.getState()
    if (!scenarioId || !draft || !doc || status !== 'ready') {
      set({ saveError: '保存できる状態ではありません' })
      return false
    }
    // 土台は save 時点の doc。対象シナリオの inputs のみ差し替える(§14.3 step 4)
    const scenarios = doc.scenarios.map((s) => (s.id === scenarioId ? { ...s, inputs: draft } : s))
    const content: HouseholdContent = {
      baseYear: doc.baseYear,
      activeScenarioId: doc.activeScenarioId,
      scenarios,
      actuals: doc.actuals,
      ...(doc.baseline !== undefined ? { baseline: doc.baseline } : {}),
    }
    try {
      const next = toDoc(content, { updatedAt: new Date().toISOString() })
      fromDoc(next) // 最終防壁: DocValidationError は catch へ
      await repository.save(HOUSEHOLD_ID, next)
      set({ dirty: false, saveError: null })
      return true
    } catch (e) {
      set({ saveError: e instanceof Error ? e.message : String(e) })
      return false
    }
  },
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/store/draftStore.test.ts && npm run typecheck && npm test`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/store/draftStore.ts lifeplan/tests/store/draftStore.test.ts
git commit -m "feat: draftStore.save — 土台doc差し替え/updatedAt打刻/fromDoc最終防壁"
```

---

### Task 5: selectors — selectPreviewData の追加（純追加）

**Files:**
- Modify: `lifeplan/src/store/selectors.ts`
- Test: `lifeplan/tests/store/selectors.test.ts`

**Interfaces:**
- Consumes: 既存 `simulate`/`computeKpiSummary`/`computeEventMarkers`/`buildChartSeries`、`Actual`（`src/types.ts`）
- Produces:

```ts
export interface PreviewData {
  chartSeries: ChartPoint[]
  eventMarkers: EventMarker[]
  kpi: KpiSummary
}
export function selectPreviewData(inputs: Inputs, actuals: Actual[]): PreviewData
```

既存エクスポート（`selectDashboardData` ほか）のシグネチャは**不変**。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/selectors.test.ts` に追加（既存 import 群に `selectPreviewData`, `selectDashboardData`, `toDoc`, `defaultInputs` が無ければ追加する）:

```ts
describe('selectPreviewData', () => {
  it('matches the dashboard derivation for the same inputs and actuals', () => {
    const doc = toDoc({
      baseYear: defaultInputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs: defaultInputs }],
      actuals: [],
    })
    const dashboard = selectDashboardData(doc)
    const preview = selectPreviewData(defaultInputs, [])

    expect(preview.chartSeries).toEqual(dashboard.chartSeries)
    expect(preview.eventMarkers).toEqual(dashboard.eventMarkers)
    expect(preview.kpi).toEqual(dashboard.kpi)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: FAIL（`selectPreviewData` 未定義）

- [ ] **Step 3: 実装**

`lifeplan/src/store/selectors.ts` — `import type { Inputs, YearRow }` を `import type { Inputs, YearRow, Actual }` に変更。内部ヘルパーを抽出して `selectDashboardData` と共用する（既存3連 `simulate` 呼び出しを置き換え、外部シグネチャは不変）:

```ts
function simulateAll(inputs: Inputs, actuals: Actual[]) {
  const central = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.investmentReturnRate })
  const optimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRateOptimistic })
  const pessimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRatePessimistic })
  return { central, optimistic, pessimistic }
}

export interface PreviewData {
  chartSeries: ChartPoint[]
  eventMarkers: EventMarker[]
  kpi: KpiSummary
}

/** 入力フォームの即時プレビュー用: ドラフト Inputs から直接派生値を計算する(§14.3 step 3) */
export function selectPreviewData(inputs: Inputs, actuals: Actual[]): PreviewData {
  const { central, optimistic, pessimistic } = simulateAll(inputs, actuals)
  return {
    chartSeries: buildChartSeries(central, optimistic, pessimistic),
    eventMarkers: computeEventMarkers(central, inputs),
    kpi: computeKpiSummary(inputs, central),
  }
}
```

`selectDashboardData` 内の3行の `simulate` 呼び出しを `const { central, optimistic, pessimistic } = simulateAll(inputs, actuals)` に置き換える。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts && npm test && npm run typecheck`
Expected: 全 PASS（golden 回帰・既存 selectors テスト含む）

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/store/selectors.ts lifeplan/tests/store/selectors.test.ts
git commit -m "feat: selectPreviewData — ドラフト Inputs から直接プレビュー派生を計算"
```

---

### Task 6: 共通フィールド部品 — TextField / NumberField / MoneyField / SelectField

§14.4 の「数値は入力欄ローカルに文字列保持、パース成功時のみコミット」戦略をここに集約する。

**Files:**
- Create: `lifeplan/src/components/input/fields/TextField.tsx`
- Create: `lifeplan/src/components/input/fields/NumberField.tsx`
- Create: `lifeplan/src/components/input/fields/MoneyField.tsx`
- Create: `lifeplan/src/components/input/fields/SelectField.tsx`
- Create: `lifeplan/src/components/input/fields/fields.module.css`
- Test: `lifeplan/src/components/input/fields/NumberField.test.tsx`, `lifeplan/src/components/input/fields/SelectField.test.tsx`

**Interfaces:**
- Produces:

```ts
// TextField
export interface TextFieldProps { label: string; value: string; onCommit: (v: string) => void }
// NumberField — パース不能/範囲外は role=alert を出し onCommit を呼ばない
export interface NumberFieldProps {
  label: string; value: number; onCommit: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean
}
// MoneyField — NumberField の薄いラッパ(min 既定 0, suffix 「円」)
export type MoneyFieldProps = Omit<NumberFieldProps, 'suffix'>
// SelectField — 文字列 union 用
export interface SelectFieldProps<T extends string> {
  label: string; value: T; options: readonly T[]; onCommit: (v: T) => void
}
```

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/fields/NumberField.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NumberField } from './NumberField'

describe('NumberField', () => {
  it('commits a valid parsed number', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="年間投資額" value={600000} onCommit={onCommit} min={0} />)

    const input = screen.getByLabelText('年間投資額')
    await user.clear(input)
    await user.type(input, '720000')

    expect(onCommit).toHaveBeenLastCalledWith(720000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error and does not commit when the input is empty', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="年間投資額" value={600000} onCommit={onCommit} min={0} />)

    await user.clear(screen.getByLabelText('年間投資額'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows an error and does not commit below min', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="終了年齢" value={95} onCommit={onCommit} min={37} max={120} />)

    const input = screen.getByLabelText('終了年齢')
    await user.clear(input)
    await user.type(input, '30')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('37以上')
  })

  it('follows an external value change (discard/save)', () => {
    const { rerender } = render(<NumberField label="終了年齢" value={95} onCommit={() => {}} />)
    rerender(<NumberField label="終了年齢" value={90} onCommit={() => {}} />)
    expect(screen.getByLabelText('終了年齢')).toHaveValue(90)
  })
})
```

`lifeplan/src/components/input/fields/SelectField.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SelectField } from './SelectField'

describe('SelectField', () => {
  it('commits the selected option', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<SelectField label="住居タイプ" value="賃貸" options={['賃貸', '持ち家'] as const} onCommit={onCommit} />)

    await user.selectOptions(screen.getByLabelText('住居タイプ'), '持ち家')

    expect(onCommit).toHaveBeenCalledWith('持ち家')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/fields`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/fields/fields.module.css`:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}
.label {
  font-size: 0.85rem;
  color: var(--color-text-muted, #5a6b7b);
}
.control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.control input,
.control select {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 6px;
  font: inherit;
  width: 100%;
  max-width: 16rem;
}
.suffix {
  color: var(--color-text-muted, #5a6b7b);
  font-size: 0.85rem;
  white-space: nowrap;
}
.error {
  color: var(--color-negative, #c0392b);
  font-size: 0.8rem;
}
```

`lifeplan/src/components/input/fields/NumberField.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import styles from './fields.module.css'

export interface NumberFieldProps {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  disabled?: boolean
}

export function NumberField({ label, value, onCommit, min, max, step, suffix, disabled }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const lastCommitted = useRef(value)

  // 外部要因(破棄/保存/他フィールド起因)の value 変化にだけ表示を追随させる。
  // 入力途中の不正文字列は保持する(§14.4: ドラフトは最後の正常値を維持)。
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value
      setText(String(value))
      setError(null)
    }
  }, [value])

  const handleChange = (raw: string) => {
    setText(raw)
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setError('数値を入力してください')
      return
    }
    if (min !== undefined && parsed < min) {
      setError(`${min}以上を入力してください`)
      return
    }
    if (max !== undefined && parsed > max) {
      setError(`${max}以下を入力してください`)
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
          step={step}
          disabled={disabled}
          aria-invalid={error !== null}
          onChange={(e) => handleChange(e.target.value)}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
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

`lifeplan/src/components/input/fields/MoneyField.tsx`:

```tsx
import { NumberField, type NumberFieldProps } from './NumberField'

export type MoneyFieldProps = Omit<NumberFieldProps, 'suffix'>

export function MoneyField(props: MoneyFieldProps) {
  return <NumberField {...props} min={props.min ?? 0} suffix="円" />
}
```

`lifeplan/src/components/input/fields/TextField.tsx`:

```tsx
import styles from './fields.module.css'

export interface TextFieldProps {
  label: string
  value: string
  onCommit: (v: string) => void
}

export function TextField({ label, value, onCommit }: TextFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <input type="text" value={value} onChange={(e) => onCommit(e.target.value)} />
      </span>
    </label>
  )
}
```

`lifeplan/src/components/input/fields/SelectField.tsx`:

```tsx
import styles from './fields.module.css'

export interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  onCommit: (v: T) => void
}

export function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <select value={value} onChange={(e) => onCommit(e.target.value as T)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/fields && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/fields/
git commit -m "feat: 共通フィールド部品(TextField/NumberField/MoneyField/SelectField)"
```

---

### Task 7: MembersSection — 世帯メンバー（§8.2 ①）

**Files:**
- Create: `lifeplan/src/components/input/sections/MembersSection.tsx`
- Test: `lifeplan/src/components/input/sections/MembersSection.test.tsx`

**Interfaces:**
- Consumes: `useDraftStore`（`draft`/`update`）、フィールド部品（Task 6）、`Member`/`Child`/`PhonePlan`/`SchoolType`/`UniversityType`（`src/types.ts`）
- Produces: `export function MembersSection(): JSX.Element | null` — props なし、draftStore を直接読む。`draft === null` なら `null` を返す（全セクション共通の規約）。各メンバーは `<fieldset><legend>` で括る（テストは `getByRole('group', { name: ... })` でスコープする）。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/sections/MembersSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MembersSection } from './MembersSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('MembersSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits the primary member income into the draft', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    const primary = screen.getByRole('group', { name: '世帯主' })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '12000000')

    expect(useDraftStore.getState().draft?.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(useDraftStore.getState().dirty).toBe(true)
  })

  it('removes the spouse after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MembersSection />)

    await user.click(screen.getByRole('checkbox', { name: '配偶者あり' }))

    expect(useDraftStore.getState().draft?.members.spouse).toBeNull()
  })

  it('keeps the spouse when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MembersSection />)

    await user.click(screen.getByRole('checkbox', { name: '配偶者あり' }))

    expect(useDraftStore.getState().draft?.members.spouse).not.toBeNull()
  })

  it('adds and removes a child', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    await user.click(screen.getByRole('button', { name: '子を追加' }))
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(2)

    const firstChild = screen.getByRole('group', { name: '第一子' })
    await user.click(within(firstChild).getByRole('button', { name: '削除' }))
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(1)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/MembersSection.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/sections/MembersSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { Child, Member, PhonePlan, SchoolType, UniversityType } from '../../../types'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const PHONE_PLANS = ['大手キャリアスマホ', '格安simスマホ', 'ガラケー'] as const satisfies readonly PhonePlan[]
const SCHOOL_TYPES = ['公立', '私立'] as const satisfies readonly SchoolType[]
const UNIVERSITY_TYPES = ['国立', '公立', '私立文', '私立理', 'なし'] as const satisfies readonly UniversityType[]

function MemberFields({
  legend,
  member,
  baseYear,
  maxAge,
  onChange,
}: {
  legend: string
  member: Member
  baseYear: number
  maxAge: number
  onChange: (m: Member) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <TextField label="名前" value={member.name} onCommit={(name) => onChange({ ...member, name })} />
      <NumberField label="生まれ年" value={member.birthYear} min={1900} max={baseYear} suffix="年" onCommit={(birthYear) => onChange({ ...member, birthYear })} />
      <NumberField label="生まれ月" value={member.birthMonth} min={1} max={12} suffix="月" onCommit={(birthMonth) => onChange({ ...member, birthMonth })} />
      <MoneyField label="手取り年収" value={member.takeHomeIncome} onCommit={(takeHomeIncome) => onChange({ ...member, takeHomeIncome })} />
      <NumberField label="就労終了年齢" value={member.workUntilAge} min={0} max={maxAge} suffix="歳" onCommit={(workUntilAge) => onChange({ ...member, workUntilAge })} />
      <SelectField label="携帯プラン" value={member.phonePlan} options={PHONE_PLANS} onCommit={(phonePlan) => onChange({ ...member, phonePlan })} />
    </fieldset>
  )
}

function ChildFields({
  child,
  baseYear,
  onChange,
  onRemove,
}: {
  child: Child
  baseYear: number
  onChange: (c: Child) => void
  onRemove: () => void
}) {
  const schooling = child.schooling
  const setSchooling = (patch: Partial<Child['schooling']>) => onChange({ ...child, schooling: { ...schooling, ...patch } })
  return (
    <fieldset>
      <legend>{child.name}</legend>
      <TextField label="名前" value={child.name} onCommit={(name) => onChange({ ...child, name })} />
      <NumberField label="生まれ年" value={child.birthYear} min={1900} max={baseYear + 30} suffix="年" onCommit={(birthYear) => onChange({ ...child, birthYear })} />
      <NumberField label="生まれ月" value={child.birthMonth} min={1} max={12} suffix="月" onCommit={(birthMonth) => onChange({ ...child, birthMonth })} />
      <SelectField label="小学校" value={schooling.elementary} options={SCHOOL_TYPES} onCommit={(elementary) => setSchooling({ elementary })} />
      <SelectField label="中学校" value={schooling.junior} options={SCHOOL_TYPES} onCommit={(junior) => setSchooling({ junior })} />
      <SelectField label="高校" value={schooling.high} options={SCHOOL_TYPES} onCommit={(high) => setSchooling({ high })} />
      <SelectField label="大学" value={schooling.university} options={UNIVERSITY_TYPES} onCommit={(university) => setSchooling({ university })} />
      <MoneyField label="大学期の仕送り(月)" value={schooling.remittanceMonthly} onCommit={(remittanceMonthly) => setSchooling({ remittanceMonthly })} />
      <MoneyField label="こづかい(月)" value={child.allowanceMonthly} onCommit={(allowanceMonthly) => onChange({ ...child, allowanceMonthly })} />
      <NumberField label="携帯開始学年(小1=6)" value={child.phoneFromGrade} min={0} max={22} onCommit={(phoneFromGrade) => onChange({ ...child, phoneFromGrade })} />
      <button type="button" onClick={onRemove}>削除</button>
    </fieldset>
  )
}

export function MembersSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const { primary, spouse, children } = draft.members
  const maxAge = draft.assumptions.endAge

  const setPrimary = (m: Member) => update((prev) => ({ ...prev, members: { ...prev.members, primary: m } }))
  const setSpouse = (m: Member | null) => update((prev) => ({ ...prev, members: { ...prev.members, spouse: m } }))
  const setChildren = (cs: Child[]) => update((prev) => ({ ...prev, members: { ...prev.members, children: cs } }))

  const toggleSpouse = (checked: boolean) => {
    if (checked) {
      setSpouse({ name: '配偶者', birthYear: primary.birthYear, birthMonth: 1, takeHomeIncome: 0, workUntilAge: 65, phonePlan: '格安simスマホ' })
    } else if (window.confirm('配偶者の入力内容は破棄されます。よろしいですか?')) {
      setSpouse(null)
    }
  }

  const addChild = () => {
    setChildren([
      ...children,
      {
        id: crypto.randomUUID(),
        name: `第${children.length + 1}子`,
        birthYear: draft.baseYear,
        birthMonth: 4,
        schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 0 },
        allowanceMonthly: 0,
        phoneFromGrade: 6,
      },
    ])
  }

  return (
    <div>
      <MemberFields legend="世帯主" member={primary} baseYear={draft.baseYear} maxAge={maxAge} onChange={setPrimary} />
      <label>
        <input type="checkbox" checked={spouse !== null} onChange={(e) => toggleSpouse(e.target.checked)} />
        配偶者あり
      </label>
      {spouse && <MemberFields legend="配偶者" member={spouse} baseYear={draft.baseYear} maxAge={maxAge} onChange={setSpouse} />}
      {children.map((c) => (
        <ChildFields
          key={c.id}
          child={c}
          baseYear={draft.baseYear}
          onChange={(next) => setChildren(children.map((x) => (x.id === c.id ? next : x)))}
          onRemove={() => setChildren(children.filter((x) => x.id !== c.id))}
        />
      ))}
      <button type="button" onClick={addChild}>子を追加</button>
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/MembersSection.test.tsx && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/sections/MembersSection.tsx lifeplan/src/components/input/sections/MembersSection.test.tsx
git commit -m "feat: MembersSection — 世帯メンバー入力(配偶者トグル/子の追加削除)"
```

---

### Task 8: AssetsSection + HousingSection（§8.2 ②③）

**Files:**
- Create: `lifeplan/src/components/input/sections/AssetsSection.tsx`
- Create: `lifeplan/src/components/input/sections/HousingSection.tsx`
- Test: `lifeplan/src/components/input/sections/AssetsSection.test.tsx`, `lifeplan/src/components/input/sections/HousingSection.test.tsx`

**Interfaces:**
- Consumes: `useDraftStore`、フィールド部品、`NamedBalance`/`Housing`（`src/types.ts`）
- Produces: `export function AssetsSection()`, `export function HousingSection()` — いずれも props なし・draft null で null 返し（Task 7 と同じ規約）。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/sections/AssetsSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AssetsSection } from './AssetsSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AssetsSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits an existing bank balance into the draft', async () => {
    const user = userEvent.setup()
    render(<AssetsSection />)

    const banks = screen.getByRole('group', { name: '銀行口座' })
    const balance = within(banks).getByLabelText('残高')
    await user.clear(balance)
    await user.type(balance, '5000000')

    expect(useDraftStore.getState().draft?.assets.bankAccounts[0]?.balance).toBe(5_000_000)
  })

  it('adds and removes an investment account', async () => {
    const user = userEvent.setup()
    render(<AssetsSection />)

    const investments = screen.getByRole('group', { name: '投資口座' })
    await user.click(within(investments).getByRole('button', { name: '追加' }))
    expect(useDraftStore.getState().draft?.assets.investments).toHaveLength(2)

    await user.click(within(investments).getAllByRole('button', { name: '削除' })[1]!)
    expect(useDraftStore.getState().draft?.assets.investments).toHaveLength(1)
  })
})
```

`lifeplan/src/components/input/sections/HousingSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { HousingSection } from './HousingSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('HousingSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('shows rent fields for 賃貸 and hides loan fields', () => {
    render(<HousingSection />)
    expect(screen.getByLabelText('家賃(月)')).toBeInTheDocument()
    expect(screen.queryByLabelText('ローン返済(月)')).not.toBeInTheDocument()
  })

  it('switches to 持ち家 and shows owner fields', async () => {
    const user = userEvent.setup()
    render(<HousingSection />)

    await user.selectOptions(screen.getByLabelText('住居タイプ'), '持ち家')

    expect(useDraftStore.getState().draft?.housing.type).toBe('持ち家')
    expect(screen.getByLabelText('ローン返済(月)')).toBeInTheDocument()
    expect(screen.getByLabelText('固定資産税(年)')).toBeInTheDocument()
    expect(screen.queryByLabelText('家賃(月)')).not.toBeInTheDocument()
  })

  it('edits the rent into the draft', async () => {
    const user = userEvent.setup()
    render(<HousingSection />)

    const rent = screen.getByLabelText('家賃(月)')
    await user.clear(rent)
    await user.type(rent, '180000')

    expect(useDraftStore.getState().draft?.housing.rentMonthly).toBe(180_000)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/AssetsSection.test.tsx src/components/input/sections/HousingSection.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/sections/AssetsSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { NamedBalance } from '../../../types'
import { TextField } from '../fields/TextField'
import { MoneyField } from '../fields/MoneyField'

function BalanceList({
  legend,
  items,
  newLabel,
  onChange,
}: {
  legend: string
  items: NamedBalance[]
  newLabel: string
  onChange: (items: NamedBalance[]) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {items.map((item, i) => (
        <div key={i}>
          <TextField label="名称" value={item.label} onCommit={(label) => onChange(items.map((x, j) => (j === i ? { ...x, label } : x)))} />
          <MoneyField label="残高" value={item.balance} onCommit={(balance) => onChange(items.map((x, j) => (j === i ? { ...x, balance } : x)))} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}>削除</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { label: newLabel, balance: 0 }])}>追加</button>
    </fieldset>
  )
}

export function AssetsSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  return (
    <div>
      <BalanceList
        legend="銀行口座"
        items={draft.assets.bankAccounts}
        newLabel="新しい口座"
        onChange={(bankAccounts) => update((prev) => ({ ...prev, assets: { ...prev.assets, bankAccounts } }))}
      />
      <BalanceList
        legend="投資口座"
        items={draft.assets.investments}
        newLabel="新しい投資口座"
        onChange={(investments) => update((prev) => ({ ...prev, assets: { ...prev.assets, investments } }))}
      />
    </div>
  )
}
```

`lifeplan/src/components/input/sections/HousingSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { Housing } from '../../../types'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const HOUSING_TYPES = ['賃貸', '持ち家'] as const satisfies readonly Housing['type'][]

export function HousingSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const housing = draft.housing
  const setHousing = (patch: Partial<Housing>) => update((prev) => ({ ...prev, housing: { ...prev.housing, ...patch } }))

  return (
    <div>
      <SelectField label="住居タイプ" value={housing.type} options={HOUSING_TYPES} onCommit={(type) => setHousing({ type })} />
      {housing.type === '賃貸' && (
        <MoneyField label="家賃(月)" value={housing.rentMonthly} onCommit={(rentMonthly) => setHousing({ rentMonthly })} />
      )}
      {housing.type === '持ち家' && (
        <>
          <MoneyField label="ローン返済(月)" value={housing.loanMonthly} onCommit={(loanMonthly) => setHousing({ loanMonthly })} />
          <NumberField label="ローン残年数" value={housing.loanRemainingYears} min={0} max={50} suffix="年" onCommit={(loanRemainingYears) => setHousing({ loanRemainingYears })} />
          <MoneyField label="修繕積立(月)" value={housing.repairReserveMonthly} onCommit={(repairReserveMonthly) => setHousing({ repairReserveMonthly })} />
          <MoneyField label="固定資産税(年)" value={housing.propertyTaxAnnual} onCommit={(propertyTaxAnnual) => setHousing({ propertyTaxAnnual })} />
          <MoneyField label="火災保険(年)" value={housing.fireInsuranceAnnual} onCommit={(fireInsuranceAnnual) => setHousing({ fireInsuranceAnnual })} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/AssetsSection.test.tsx src/components/input/sections/HousingSection.test.tsx && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/sections/AssetsSection.tsx lifeplan/src/components/input/sections/AssetsSection.test.tsx lifeplan/src/components/input/sections/HousingSection.tsx lifeplan/src/components/input/sections/HousingSection.test.tsx
git commit -m "feat: AssetsSection/HousingSection — 資産と住居の入力"
```

---

### Task 9: LifestyleSection + AppliancesSection（§8.2 ④⑤）

**Files:**
- Create: `lifeplan/src/components/input/sections/LifestyleSection.tsx`
- Create: `lifeplan/src/components/input/sections/AppliancesSection.tsx`
- Test: `lifeplan/src/components/input/sections/LifestyleSection.test.tsx`, `lifeplan/src/components/input/sections/AppliancesSection.test.tsx`

**Interfaces:**
- Consumes: `useDraftStore`、フィールド部品、`ElectricType`/`Appliance`（`src/types.ts`）、`Inputs['homeMaintenance']` の要素型
- Produces: `export function LifestyleSection()`, `export function AppliancesSection()`（homeMaintenance も後者に含む）。year 系フィールドは §14.4 の範囲ヒント（`lastPurchaseYear`/`lastYear` は 1980〜baseYear）。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/sections/LifestyleSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { LifestyleSection } from './LifestyleSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('LifestyleSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('switches the electric type into the draft', async () => {
    const user = userEvent.setup()
    render(<LifestyleSection />)

    await user.selectOptions(screen.getByLabelText('電気契約'), 'オール電化')

    expect(useDraftStore.getState().draft?.lifestyle.electricType).toBe('オール電化')
  })

  it('edits the internet cost into the draft', async () => {
    const user = userEvent.setup()
    render(<LifestyleSection />)

    const net = screen.getByLabelText('インターネット(月)')
    await user.clear(net)
    await user.type(net, '5500')

    expect(useDraftStore.getState().draft?.lifestyle.internetMonthly).toBe(5_500)
  })
})
```

`lifeplan/src/components/input/sections/AppliancesSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AppliancesSection } from './AppliancesSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AppliancesSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('adds and removes an appliance', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const appliances = screen.getByRole('group', { name: '家電買い替え' })
    await user.click(within(appliances).getByRole('button', { name: '追加' }))
    expect(useDraftStore.getState().draft?.appliances).toHaveLength(3)

    await user.click(within(appliances).getAllByRole('button', { name: '削除' })[2]!)
    expect(useDraftStore.getState().draft?.appliances).toHaveLength(2)
  })

  it('edits an appliance price into the draft', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const appliances = screen.getByRole('group', { name: '家電買い替え' })
    const price = within(appliances).getAllByLabelText('価格')[0]!
    await user.clear(price)
    await user.type(price, '150000')

    expect(useDraftStore.getState().draft?.appliances[0]?.price).toBe(150_000)
  })

  it('adds a home maintenance item', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const home = screen.getByRole('group', { name: '住宅メンテナンス' })
    await user.click(within(home).getByRole('button', { name: '追加' }))

    expect(useDraftStore.getState().draft?.homeMaintenance).toHaveLength(1)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/LifestyleSection.test.tsx src/components/input/sections/AppliancesSection.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/sections/LifestyleSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { ElectricType } from '../../../types'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const ELECTRIC_TYPES = ['オール電化', 'ガス併用'] as const satisfies readonly ElectricType[]

export function LifestyleSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  return (
    <div>
      <SelectField
        label="電気契約"
        value={draft.lifestyle.electricType}
        options={ELECTRIC_TYPES}
        onCommit={(electricType) => update((prev) => ({ ...prev, lifestyle: { ...prev.lifestyle, electricType } }))}
      />
      <MoneyField
        label="インターネット(月)"
        value={draft.lifestyle.internetMonthly}
        onCommit={(internetMonthly) => update((prev) => ({ ...prev, lifestyle: { ...prev.lifestyle, internetMonthly } }))}
      />
    </div>
  )
}
```

`lifeplan/src/components/input/sections/AppliancesSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { Appliance, Inputs } from '../../../types'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'

type HomeMaintenanceItem = Inputs['homeMaintenance'][number]

export function AppliancesSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const baseYear = draft.baseYear
  const setAppliances = (appliances: Appliance[]) => update((prev) => ({ ...prev, appliances }))
  const setHome = (homeMaintenance: HomeMaintenanceItem[]) => update((prev) => ({ ...prev, homeMaintenance }))

  return (
    <div>
      <fieldset>
        <legend>家電買い替え</legend>
        {draft.appliances.map((a, i) => (
          <div key={i}>
            <TextField label="名称" value={a.name} onCommit={(name) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, name } : x)))} />
            <MoneyField label="価格" value={a.price} onCommit={(price) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, price } : x)))} />
            <NumberField label="最終購入年" value={a.lastPurchaseYear} min={1980} max={baseYear} suffix="年" onCommit={(lastPurchaseYear) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, lastPurchaseYear } : x)))} />
            <NumberField label="寿命" value={a.lifespanYears} min={1} max={50} suffix="年" onCommit={(lifespanYears) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, lifespanYears } : x)))} />
            <button type="button" onClick={() => setAppliances(draft.appliances.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setAppliances([...draft.appliances, { name: '新しい家電', price: 100_000, lastPurchaseYear: baseYear, lifespanYears: 10 }])}>追加</button>
      </fieldset>
      <fieldset>
        <legend>住宅メンテナンス</legend>
        {draft.homeMaintenance.map((m, i) => (
          <div key={i}>
            <TextField label="名称" value={m.name} onCommit={(name) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, name } : x)))} />
            <MoneyField label="価格" value={m.price} onCommit={(price) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, price } : x)))} />
            <NumberField label="周期" value={m.intervalYears} min={1} max={50} suffix="年" onCommit={(intervalYears) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, intervalYears } : x)))} />
            <NumberField label="最終実施年" value={m.lastYear} min={1980} max={baseYear} suffix="年" onCommit={(lastYear) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, lastYear } : x)))} />
            <button type="button" onClick={() => setHome(draft.homeMaintenance.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setHome([...draft.homeMaintenance, { name: '外壁塗装', price: 1_000_000, intervalYears: 15, lastYear: baseYear }])}>追加</button>
      </fieldset>
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/LifestyleSection.test.tsx src/components/input/sections/AppliancesSection.test.tsx && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/sections/LifestyleSection.tsx lifeplan/src/components/input/sections/LifestyleSection.test.tsx lifeplan/src/components/input/sections/AppliancesSection.tsx lifeplan/src/components/input/sections/AppliancesSection.test.tsx
git commit -m "feat: LifestyleSection/AppliancesSection — 生活スタイルと家電/住宅メンテ入力"
```

---

### Task 10: AssumptionsSection — 前提（§8.2 ⑥）

§14.4 の意味的範囲（`endAge` > baseYear 時点の primary 年齢、`pensionStartAge ≤ endAge` 等）をフォーム層で強制する要のセクション。

**Files:**
- Create: `lifeplan/src/components/input/sections/AssumptionsSection.tsx`
- Test: `lifeplan/src/components/input/sections/AssumptionsSection.test.tsx`

**Interfaces:**
- Consumes: `useDraftStore`、フィールド部品、`Assumptions`（`src/types.ts`）
- Produces: `export function AssumptionsSection()`。`coastFireTargetAmount` はチェックボックス「コーストFIRE目標額を上書きする」で optional を表現（OFF でプロパティ削除）。`oneTimeInvestments` は年+金額の行を追加/削除。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/sections/AssumptionsSection.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AssumptionsSection } from './AssumptionsSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AssumptionsSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits the central return rate into the draft', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    const rate = screen.getByLabelText('利回り(中央)')
    await user.clear(rate)
    await user.type(rate, '4.5')

    expect(useDraftStore.getState().draft?.assumptions.investmentReturnRate).toBe(4.5)
  })

  it('rejects an endAge at or below the primary age at baseYear', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    // placeholder: baseYear 2026, primary birthYear 1990 → 現在年齢 36 → min 37
    const endAge = screen.getByLabelText('終了年齢')
    await user.clear(endAge)
    await user.type(endAge, '36')

    expect(screen.getByRole('alert')).toHaveTextContent('37以上')
    expect(useDraftStore.getState().draft?.assumptions.endAge).toBe(95)
  })

  it('clears coastFireTargetAmount when the override is unchecked', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE目標額を上書きする' }))

    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAmount).toBeUndefined()
  })

  it('adds a one-time investment row', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    await user.click(screen.getByRole('button', { name: 'スポット投資を追加' }))

    expect(useDraftStore.getState().draft?.assumptions.oneTimeInvestments).toHaveLength(1)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/AssumptionsSection.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/sections/AssumptionsSection.tsx`（新規）:

```tsx
import { useDraftStore } from '../../../store/draftStore'
import type { Assumptions } from '../../../types'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'

export function AssumptionsSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const a = draft.assumptions
  const setAssumptions = (patch: Partial<Assumptions>) =>
    update((prev) => ({ ...prev, assumptions: { ...prev.assumptions, ...patch } }))

  // §14.4: endAge > baseYear 時点の primary 年齢
  const primaryAgeAtBase = draft.baseYear - draft.members.primary.birthYear
  const minEndAge = primaryAgeAtBase + 1
  const endYear = draft.members.primary.birthYear + a.endAge

  const toggleCoastFire = (checked: boolean) => {
    update((prev) => {
      const rest = { ...prev.assumptions }
      delete rest.coastFireTargetAmount
      return {
        ...prev,
        assumptions: checked ? { ...rest, coastFireTargetAmount: 40_000_000 } : rest,
      }
    })
  }

  const oneTime = a.oneTimeInvestments ?? []
  const setOneTime = (rows: { year: number; amount: number }[]) =>
    setAssumptions({ oneTimeInvestments: rows.length > 0 ? rows : undefined })

  return (
    <div>
      <NumberField label="利回り(中央)" value={a.investmentReturnRate} min={-100} max={100} step={0.1} suffix="%" onCommit={(investmentReturnRate) => setAssumptions({ investmentReturnRate })} />
      <NumberField label="利回り(楽観)" value={a.returnRateOptimistic} min={-100} max={100} step={0.1} suffix="%" onCommit={(returnRateOptimistic) => setAssumptions({ returnRateOptimistic })} />
      <NumberField label="利回り(悲観)" value={a.returnRatePessimistic} min={-100} max={100} step={0.1} suffix="%" onCommit={(returnRatePessimistic) => setAssumptions({ returnRatePessimistic })} />
      <NumberField label="インフレ率" value={a.inflationRate} min={-100} max={100} step={0.1} suffix="%" onCommit={(inflationRate) => setAssumptions({ inflationRate })} />
      <NumberField label="終了年齢" value={a.endAge} min={minEndAge} max={120} suffix="歳" onCommit={(endAge) => setAssumptions({ endAge })} />
      <MoneyField label="年間投資額" value={a.annualInvestmentContribution} onCommit={(annualInvestmentContribution) => setAssumptions({ annualInvestmentContribution })} />
      <NumberField label="年金開始年齢" value={a.pensionStartAge} min={60} max={a.endAge} suffix="歳" onCommit={(pensionStartAge) => setAssumptions({ pensionStartAge })} />
      <MoneyField label="年金額(1人あたり年)" value={a.pensionAnnualPerPerson} onCommit={(pensionAnnualPerPerson) => setAssumptions({ pensionAnnualPerPerson })} />

      <label>
        <input type="checkbox" checked={a.coastFireTargetAmount !== undefined} onChange={(e) => toggleCoastFire(e.target.checked)} />
        コーストFIRE目標額を上書きする
      </label>
      {a.coastFireTargetAmount !== undefined && (
        <MoneyField label="コーストFIRE目標額" value={a.coastFireTargetAmount} onCommit={(coastFireTargetAmount) => setAssumptions({ coastFireTargetAmount })} />
      )}

      <fieldset>
        <legend>スポット投資</legend>
        {oneTime.map((row, i) => (
          <div key={i}>
            <NumberField label="年" value={row.year} min={draft.baseYear} max={endYear} suffix="年" onCommit={(year) => setOneTime(oneTime.map((x, j) => (j === i ? { ...x, year } : x)))} />
            <MoneyField label="金額" value={row.amount} onCommit={(amount) => setOneTime(oneTime.map((x, j) => (j === i ? { ...x, amount } : x)))} />
            <button type="button" onClick={() => setOneTime(oneTime.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setOneTime([...oneTime, { year: draft.baseYear, amount: 1_000_000 }])}>スポット投資を追加</button>
      </fieldset>
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/sections/AssumptionsSection.test.tsx && npm run typecheck`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/input/sections/AssumptionsSection.tsx lifeplan/src/components/input/sections/AssumptionsSection.test.tsx
git commit -m "feat: AssumptionsSection — 前提入力(意味的範囲ガード/コーストFIRE上書き/スポット投資)"
```

---

### Task 11: PreviewPane（debounce + error boundary）と SaveBar

**Files:**
- Create: `lifeplan/src/components/formatYen.ts`（KpiCards の private フォーマッタを共有化）
- Modify: `lifeplan/src/components/dashboard/KpiCards.tsx`（formatYen を import に切替。表示は不変）
- Create: `lifeplan/src/components/input/useDebouncedValue.ts`
- Create: `lifeplan/src/components/input/PreviewErrorBoundary.tsx`
- Create: `lifeplan/src/components/input/PreviewPane.tsx`（+ `PreviewPane.module.css`）
- Create: `lifeplan/src/components/input/SaveBar.tsx`（+ `SaveBar.module.css`）
- Test: `lifeplan/src/components/input/PreviewPane.test.tsx`, `lifeplan/src/components/input/SaveBar.test.tsx`

**Interfaces:**
- Consumes: `selectPreviewData`（Task 5）、`useDraftStore`（Task 3/4）、`useHouseholdStore`（actuals 取得）、既存 `AssetChart`（props: `series: ChartPoint[]`, `eventMarkers: EventMarker[]`）
- Produces:

```ts
export function formatYen(amount: number): string       // '¥1,234,567'
export function useDebouncedValue<T>(value: T, delayMs: number): T
export function PreviewErrorBoundary(props: { resetKey: unknown; children: ReactNode }): ReactNode
export function PreviewPane(): JSX.Element | null       // aria-label="プレビュー" の aside
export function SaveBar(): JSX.Element                  // 保存/破棄ボタン + dirty/saveError 表示
```

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/input/PreviewPane.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { PreviewPane } from './PreviewPane'
import { useDraftStore } from '../../store/draftStore'
import { useHouseholdStore, defaultRepository } from '../../store/householdStore'
import { defaultInputs } from '../../persistence/placeholderHousehold'

describe('PreviewPane', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('renders preview KPIs and the chart for the draft', async () => {
    render(<PreviewPane />)

    await waitFor(() => expect(screen.getByText('終了年齢時点の総資産')).toBeInTheDocument())
    expect(screen.getByText('推奨毎月積立額')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'プレビュー' })).toBeInTheDocument()
  })

  it('falls back gracefully when the simulation cannot run', async () => {
    // endAge を現在年齢未満に細工 → simulate が空系列 → セレクタ throw → boundary が受ける
    const broken = structuredClone(defaultInputs)
    broken.assumptions.endAge = 10
    useDraftStore.getState().beginEdit('base', broken)

    render(<PreviewPane />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('この設定ではシミュレーションできません'))
  })
})
```

`lifeplan/src/components/input/SaveBar.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SaveBar } from './SaveBar'
import { useDraftStore } from '../../store/draftStore'
import { defaultInputs } from '../../persistence/placeholderHousehold'

describe('SaveBar', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('disables buttons when the draft is clean', () => {
    render(<SaveBar />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '破棄' })).toBeDisabled()
  })

  it('shows the dirty badge and calls save', async () => {
    const user = userEvent.setup()
    useDraftStore.getState().update((prev) => ({ ...prev }))
    const save = vi.fn().mockResolvedValue(true)
    useDraftStore.setState({ save })
    render(<SaveBar />)

    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(save).toHaveBeenCalled()
  })

  it('shows the saveError as an alert', () => {
    useDraftStore.setState({ saveError: 'DocValidationError: ...' })
    render(<SaveBar />)
    expect(screen.getByRole('alert')).toHaveTextContent('DocValidationError')
  })

  it('discards only after confirmation', async () => {
    const user = userEvent.setup()
    useDraftStore.getState().update((prev) => ({ ...prev }))
    const discard = vi.fn()
    useDraftStore.setState({ discard })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SaveBar />)

    await user.click(screen.getByRole('button', { name: '破棄' }))
    expect(discard).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/components/input/PreviewPane.test.tsx src/components/input/SaveBar.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/components/formatYen.ts`（新規）:

```ts
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}
```

`lifeplan/src/components/dashboard/KpiCards.tsx` — 先頭の private `function formatYen` を削除し、`import { formatYen } from '../formatYen'` に置き換える（他は不変）。

`lifeplan/src/components/input/useDebouncedValue.ts`（新規）:

```ts
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
```

`lifeplan/src/components/input/PreviewErrorBoundary.tsx`（新規）:

```tsx
import { Component, type ReactNode } from 'react'

interface Props {
  resetKey: unknown
  children: ReactNode
}
interface State {
  hasError: boolean
}

/** プレビュー計算の保険(§14.4)。resetKey(=ドラフト)が変わったら再試行する。 */
export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return <p role="alert">この設定ではシミュレーションできません</p>
    }
    return this.props.children
  }
}
```

`lifeplan/src/components/input/PreviewPane.module.css`（新規）:

```css
.pane {
  position: sticky;
  top: 1rem;
  align-self: flex-start;
  min-width: 0;
}
.kpis {
  display: flex;
  gap: 1.5rem;
  margin: 0 0 0.75rem;
}
.kpis dt {
  font-size: 0.8rem;
  color: var(--color-text-muted, #5a6b7b);
}
.kpis dd {
  margin: 0;
  font-weight: 700;
}
```

`lifeplan/src/components/input/PreviewPane.tsx`（新規）:

```tsx
import { useMemo } from 'react'
import type { Actual, Inputs } from '../../types'
import { selectPreviewData } from '../../store/selectors'
import { useDraftStore } from '../../store/draftStore'
import { useHouseholdStore } from '../../store/householdStore'
import { AssetChart } from '../dashboard/AssetChart'
import { formatYen } from '../formatYen'
import { PreviewErrorBoundary } from './PreviewErrorBoundary'
import { useDebouncedValue } from './useDebouncedValue'
import styles from './PreviewPane.module.css'

function PreviewContent({ inputs, actuals }: { inputs: Inputs; actuals: Actual[] }) {
  const data = useMemo(() => selectPreviewData(inputs, actuals), [inputs, actuals])
  return (
    <>
      <dl className={styles.kpis}>
        <div>
          <dt>終了年齢時点の総資産</dt>
          <dd>{formatYen(data.kpi.endTotalAssets)}</dd>
        </div>
        <div>
          <dt>推奨毎月積立額</dt>
          <dd>{data.kpi.requiredMonthlyInvestment != null ? `${formatYen(data.kpi.requiredMonthlyInvestment)}/月` : '計算不可'}</dd>
        </div>
      </dl>
      <AssetChart series={data.chartSeries} eventMarkers={data.eventMarkers} />
    </>
  )
}

export function PreviewPane() {
  const draft = useDraftStore((s) => s.draft)
  const actuals = useHouseholdStore((s) => s.doc?.actuals)
  const debounced = useDebouncedValue(draft, 200)
  if (!debounced) return null

  return (
    <aside aria-label="プレビュー" className={styles.pane}>
      <PreviewErrorBoundary resetKey={debounced}>
        <PreviewContent inputs={debounced} actuals={actuals ?? []} />
      </PreviewErrorBoundary>
    </aside>
  )
}
```

`lifeplan/src/components/input/SaveBar.module.css`（新規）:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  position: sticky;
  bottom: 0;
  background: var(--color-bg, #fff);
  border-top: 1px solid var(--color-border, #cbd5e1);
}
.dirty {
  font-size: 0.85rem;
  color: var(--color-warning, #b7791f);
}
.error {
  font-size: 0.85rem;
  color: var(--color-negative, #c0392b);
}
.bar button {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: 1px solid var(--color-border, #cbd5e1);
  background: var(--color-accent, #0f766e);
  color: #fff;
  cursor: pointer;
}
.bar button:disabled {
  opacity: 0.4;
  cursor: default;
}
.bar button.secondary,
.secondary {
  background: transparent;
  color: inherit;
}
```

`lifeplan/src/components/input/SaveBar.tsx`（新規）:

```tsx
import { useDraftStore } from '../../store/draftStore'
import styles from './SaveBar.module.css'

export function SaveBar() {
  const dirty = useDraftStore((s) => s.dirty)
  const saveError = useDraftStore((s) => s.saveError)
  const save = useDraftStore((s) => s.save)
  const discard = useDraftStore((s) => s.discard)

  return (
    <div className={styles.bar}>
      {dirty && <span className={styles.dirty}>未保存の変更があります</span>}
      {saveError && (
        <span role="alert" className={styles.error}>
          {saveError}
        </span>
      )}
      <button type="button" disabled={!dirty} onClick={() => void save()}>
        保存
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={!dirty}
        onClick={() => {
          if (window.confirm('編集内容を破棄しますか?')) discard()
        }}
      >
        破棄
      </button>
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/input/PreviewPane.test.tsx src/components/input/SaveBar.test.tsx src/components/dashboard/KpiCards.test.tsx && npm run typecheck`
Expected: 全 PASS（KpiCards の既存テストも不変で green）

- [ ] **Step 5: コミット**

```bash
git add lifeplan/src/components/formatYen.ts lifeplan/src/components/dashboard/KpiCards.tsx lifeplan/src/components/input/
git commit -m "feat: PreviewPane(debounce+error boundary)/SaveBar、formatYen 共有化"
```

---

### Task 12: InputPage 組み立て — アコーディオン/2カラム/blocker/C1 + 統合テスト

**Files:**
- Modify: `lifeplan/src/components/input/InputPage.tsx`（Task 2 の雛形を全面差し替え）
- Create: `lifeplan/src/components/input/InputPage.module.css`
- Test: `lifeplan/src/InputPage.integration.test.tsx`（新規）

**Interfaces:**
- Consumes: 全セクション（Task 7-10）、`PreviewPane`/`SaveBar`（Task 11）、`useDraftStore`、`useHouseholdStore`、`useBlocker`（react-router-dom）
- Produces: `/input` の完成画面。①非 dirty 時は doc 更新に `beginEdit` で追随・dirty 時はリベースしない（§14.3 step 6）②`status === 'error'` で編集 UI を出さない（C1）③dirty 中の遷移は confirm、`beforeunload` 併用。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/InputPage.integration.test.tsx`（新規）:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from './App'
import { useHouseholdStore } from './store/householdStore'
import { useDraftStore } from './store/draftStore'
import { InMemoryHouseholdRepository } from './persistence/repository'

describe('InputPage integration', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/input')
    // 毎テスト新しい repository を注入して独立させる
    const repository = new InMemoryHouseholdRepository()
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository })
    useDraftStore.setState({ scenarioId: null, draft: null, dirty: false, saveError: null })
    // Layout の load() は state の repository ではなく引数 default を使うため、
    // ここでは load を repository 固定版に差し替える
    const originalLoad = useHouseholdStore.getState().load
    useHouseholdStore.setState({ load: () => originalLoad(repository) })
  })

  it('edits, previews, saves, and reflects on the dashboard', async () => {
    const user = userEvent.setup()
    render(<App />)

    // ドラフトが張られてフォームが出る(手取り年収は世帯主/配偶者で重複するため group でスコープ)
    const primary = await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '12000000')

    // プレビューが出ている(debounce 後)
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'プレビュー' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(
        useHouseholdStore.getState().doc?.scenarios.find((s) => s.id === 'base')?.inputs.members.primary.takeHomeIncome,
      ).toBe(12_000_000),
    )
    expect(useDraftStore.getState().dirty).toBe(false)

    // ダッシュボードへ遷移して表示される(保存済みなので blocker は出ない)
    await user.click(screen.getByRole('link', { name: 'ダッシュボード' }))
    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())
  })

  it('blocks navigation while dirty until confirmed', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)

    const primary = await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '9000000')

    await user.click(screen.getByRole('link', { name: 'ダッシュボード' }))

    // confirm=false → /input に留まる
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('refuses editing when the household store is in error state (C1)', async () => {
    useHouseholdStore.setState({
      status: 'error',
      error: new Error('boom'),
      load: async () => {}, // error 状態を上書きさせない
    })
    render(<App />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('編集できません'))
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd lifeplan && npx vitest run src/InputPage.integration.test.tsx`
Expected: FAIL（雛形 InputPage にフォームが無い）

- [ ] **Step 3: 実装**

`lifeplan/src/components/input/InputPage.module.css`（新規）:

```css
.main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}
@media (min-width: 900px) {
  .main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.baseYear {
  color: var(--color-text-muted, #5a6b7b);
  font-size: 0.85rem;
}
.section {
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}
.section summary {
  cursor: pointer;
  font-weight: 600;
  padding: 0.5rem 0;
}
```

`lifeplan/src/components/input/InputPage.tsx` を以下の全文に置き換える:

```tsx
import { useEffect, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { useHouseholdStore } from '../../store/householdStore'
import { useDraftStore } from '../../store/draftStore'
import { MembersSection } from './sections/MembersSection'
import { AssetsSection } from './sections/AssetsSection'
import { HousingSection } from './sections/HousingSection'
import { LifestyleSection } from './sections/LifestyleSection'
import { AppliancesSection } from './sections/AppliancesSection'
import { AssumptionsSection } from './sections/AssumptionsSection'
import { PreviewPane } from './PreviewPane'
import { SaveBar } from './SaveBar'
import styles from './InputPage.module.css'

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary>{title}</summary>
      {children}
    </details>
  )
}

export function InputPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const draft = useDraftStore((s) => s.draft)
  const dirty = useDraftStore((s) => s.dirty)
  const beginEdit = useDraftStore((s) => s.beginEdit)

  // 非 dirty なら doc に追随してドラフトを張り直す。dirty 中はリベースしない(§14.3 step 6)
  useEffect(() => {
    if (status !== 'ready' || !doc || dirty) return
    const scenario = doc.scenarios.find((s) => s.id === doc.activeScenarioId)
    if (scenario) beginEdit(scenario.id, scenario.inputs)
  }, [status, doc, dirty, beginEdit])

  // dirty 中の画面遷移ガード(router blocker)
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('未保存の変更があります。移動しますか?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])

  // dirty 中のリロード/タブ閉じガード
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (status === 'error') {
    return (
      <main className={styles.main}>
        <p role="alert">データの読み込みに失敗したため、編集できません。アプリを更新してください。</p>
      </main>
    )
  }
  if (!doc || !draft) {
    return (
      <main className={styles.main}>
        <p>読み込み中...</p>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div>
        <h2>入力</h2>
        <p className={styles.baseYear}>基準年: {doc.baseYear}年（変更不可）</p>
        <Section title="世帯メンバー" defaultOpen>
          <MembersSection />
        </Section>
        <Section title="資産">
          <AssetsSection />
        </Section>
        <Section title="住居">
          <HousingSection />
        </Section>
        <Section title="生活スタイル">
          <LifestyleSection />
        </Section>
        <Section title="家電・住宅メンテナンス">
          <AppliancesSection />
        </Section>
        <Section title="前提">
          <AssumptionsSection />
        </Section>
        <SaveBar />
      </div>
      <PreviewPane />
    </main>
  )
}
```

> 注: `useBlocker` は data router（`createBrowserRouter`、Task 2 で導入済み）が前提。

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/InputPage.integration.test.tsx && npm run typecheck && npm test`
Expected: 全 PASS（既存テスト・golden 回帰含む）

- [ ] **Step 5: Playwright MCP または dev サーバーで目視確認（CLAUDE.md 方針）**

Run: `cd lifeplan && npm run dev`
`/input` を開き、①アコーディオン開閉 ②数値編集でプレビューが約200ms後に動く ③不正値（終了年齢30等）でフィールドエラー ④保存→ダッシュボード反映 ⑤dirty で遷移すると confirm、を確認する。Playwright MCP が接続されていればそれで、無ければユーザーにブラウザ確認を依頼する。

- [ ] **Step 6: コミット**

```bash
git add lifeplan/src/components/input/InputPage.tsx lifeplan/src/components/input/InputPage.module.css lifeplan/src/InputPage.integration.test.tsx
git commit -m "feat: InputPage 組み立て — アコーディオン/2カラム/遷移ガード/C1 継承"
```

---

### Task 13: e2e スモーク + ドキュメント更新

**Files:**
- Create: `lifeplan/tests/e2e/input.spec.ts`
- Modify: `CLAUDE.md`（リポジトリ root — Plan 5 のステータス反映）

**Interfaces:**
- Consumes: Task 12 までの完成画面、既存 `playwright.config.ts`（`vite preview` を port 4173 で起動、変更不要）

- [ ] **Step 1: e2e テストを書く**

`lifeplan/tests/e2e/input.spec.ts`（新規）:

```ts
// lifeplan/tests/e2e/input.spec.ts
import { test, expect } from '@playwright/test'

test('input page: edit updates the preview and save reflects on the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '入力' }).click()

  await expect(page.getByText('基準年: 2026年（変更不可）')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'プレビュー' })).toBeVisible()

  const income = page.getByRole('group', { name: '世帯主' }).getByLabel('手取り年収')
  await income.fill('12000000')

  await expect(page.getByText('未保存の変更があります')).toBeVisible()
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()

  await page.getByRole('link', { name: 'ダッシュボード' }).click()
  await expect(page.getByText('現在の総資産')).toBeVisible()
})
```

- [ ] **Step 2: e2e が通ることを確認**

Run: `cd lifeplan && npm run build && npm run test:e2e`
Expected: dashboard.spec.ts と input.spec.ts が全 PASS

- [ ] **Step 3: 全体検証（verification-before-completion）**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: すべて成功。golden 回帰不変。

- [ ] **Step 4: CLAUDE.md を更新**

リポジトリ root の `CLAUDE.md`:
- 「実装計画」リストに `2026-07-02-lifeplan-input-form.md … **Plan 5: 入力フォーム画面** ※仕様の源泉は設計書 §14` を追加
- 「現在のステータス」に Plan 5 の完了行を追加（テスト数・達成事項は実績値で記入）
- 冒頭の「入力フォーム/シナリオ管理/ログイン画面/Firebase実配線は未着手（別プラン、次はここ）」の記述を「シナリオ管理/ログイン画面/Firebase実配線は未着手（別プラン、次はここ）」に更新

- [ ] **Step 5: コミット**

```bash
git add lifeplan/tests/e2e/input.spec.ts CLAUDE.md
git commit -m "test: 入力画面の e2e スモーク追加、CLAUDE.md ステータス更新"
```

---

## 完了条件（Plan 5 全体）

- 全テスト green（`npm test`）+ `typecheck` + `lint` + `build` + `test:e2e` 通過
- ゴールデン回帰不変（`src/engine/`・`src/persistence/` 無改変）
- `/input` で §8.2 の全セクションが編集でき、即時プレビューが動き、保存でダッシュボードに反映される
- 完了後は superpowers:finishing-a-development-branch に従って PR / merge を判断する
