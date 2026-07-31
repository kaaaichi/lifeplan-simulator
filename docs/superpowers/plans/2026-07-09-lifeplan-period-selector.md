# ダッシュボード表示期間セレクター Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ダッシュボードの `AssetChart`/`BreakdownTabs`/`AnnualTable` に「65歳まで(デフォルト)」「全期間」を切り替えるプリセットボタンを追加する。

**Architecture:** `src/store/selectors.ts` に純関数 `selectPeriodFilteredData(data, period)` を追加し、既存の `YearRow.agePrimary` を使って `central`/`chartSeries`/`eventMarkers`/`lifeStageEvents` を年でフィルタする。`Dashboard.tsx` にローカル `useState` で選択中の期間を持ち、新規 `PeriodSelector` コンポーネントで切り替える。`KpiCards` と `VarianceSection` は対象外(変更なし)。状態は画面内のみ(永続化しない)。

**Tech Stack:** React + TypeScript + Vitest(unit/component) + Playwright(e2e)。既存の `BreakdownTabs` のタブUIパターン(`role="tablist"`/`role="tab"`/`aria-selected`)を踏襲する。

## Global Constraints

- 仕様の源泉: `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §18。
- `src/engine/`・`src/persistence/` は無改変(背骨: ゴールデン回帰・既存永続化テストに影響を与えない)。
- `KpiCards` の指標(生涯サマリー)は選択期間に連動させない。
- 選択期間は Firestore・localStorage に保存しない(ページ遷移・リロードで常に「65歳まで」に戻る)。
- 全ゲート: `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test:e2e`(いずれも `lifeplan/` ディレクトリで実行)。

---

### Task 1: `selectPeriodFilteredData` 純関数の追加

**Files:**
- Modify: `lifeplan/src/store/selectors.ts`
- Test: `lifeplan/tests/store/selectors.test.ts`

**Interfaces:**
- Consumes: 既存の `DashboardData`(`selectors.ts` で定義済み。`central: YearRow[]`, `chartSeries: ChartPoint[]`, `eventMarkers: EventMarker[]`, `lifeStageEvents: LifeStageEvent[]` を含む)、`YearRow.agePrimary: number`(`src/types.ts` で定義済み)。
- Produces: `export type DashboardPeriod = 'to65' | 'full'`、`export function selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): { chartSeries: ChartPoint[]; central: YearRow[]; eventMarkers: EventMarker[]; lifeStageEvents: LifeStageEvent[] }`。後続タスク(Task 2, 3)がこの型・関数名をそのまま使う。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/selectors.test.ts` の末尾(`selectScenarioSummary` の `describe` ブロックの後)に追記する:

```ts
describe('selectPeriodFilteredData', () => {
  it("'to65': central/chartSeries/eventMarkers/lifeStageEvents を agePrimary<=65 の年でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'to65')

    expect(filtered.central.length).toBeLessThan(data.central.length)
    expect(filtered.central.every(r => r.agePrimary <= 65)).toBe(true)
    expect(filtered.chartSeries.length).toBe(filtered.central.length)

    const cutoffYear = filtered.central[filtered.central.length - 1]!.year
    expect(filtered.eventMarkers.every(m => m.year <= cutoffYear)).toBe(true)
    expect(filtered.lifeStageEvents.every(e => e.year <= cutoffYear)).toBe(true)
  })

  it("'full': フィルタなしで central/chartSeries/eventMarkers/lifeStageEvents をそのまま返す", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'full')

    expect(filtered.central).toEqual(data.central)
    expect(filtered.chartSeries).toEqual(data.chartSeries)
    expect(filtered.eventMarkers).toEqual(data.eventMarkers)
    expect(filtered.lifeStageEvents).toEqual(data.lifeStageEvents)
  })

  it("'to65': baseYear時点で世帯主が既に65歳を超えている場合は全期間にフォールバックする", () => {
    const inputs = structuredClone(placeholderInputs)
    inputs.members.primary.birthYear = 1950 // baseYear=2026時点で75歳超、以降も常に65歳超
    const doc = toDoc({
      baseYear: inputs.baseYear,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'ベースプラン', inputs }],
      actuals: [],
    })
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'to65')

    expect(data.central.every(r => r.agePrimary > 65)).toBe(true)
    expect(filtered.central).toEqual(data.central)
  })
})
```

このファイル冒頭の import 文を更新する(`selectPeriodFilteredData` を追加):

```ts
import {
  selectDashboardData,
  selectPreviewData,
  computeKpiSummary,
  computeEventMarkers,
  computeLifeStageEvents,
  buildChartSeries,
  selectScenarioSummary,
  selectPeriodFilteredData,
} from '../../src/store/selectors'
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts -t selectPeriodFilteredData`
Expected: FAIL — `selectPeriodFilteredData is not a function`(または import エラー)。

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/store/selectors.ts` の `buildChartSeries` 関数の直後(198行目付近、`export interface ScenarioSummary` の直前)に追記する:

```ts
export type DashboardPeriod = 'to65' | 'full'

const PERIOD_TO65_MAX_AGE = 65

export interface PeriodFilteredData {
  chartSeries: ChartPoint[]
  central: YearRow[]
  eventMarkers: EventMarker[]
  lifeStageEvents: LifeStageEvent[]
}

/** ダッシュボード表示期間セレクター用(§18.4)。'to65' は agePrimary<=65 の年で打ち切る。 */
export function selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): PeriodFilteredData {
  if (period === 'full') {
    return {
      chartSeries: data.chartSeries,
      central: data.central,
      eventMarkers: data.eventMarkers,
      lifeStageEvents: data.lifeStageEvents,
    }
  }

  const cutoffRow = [...data.central].reverse().find(r => r.agePrimary <= PERIOD_TO65_MAX_AGE)
  if (!cutoffRow) {
    // baseYear時点で既に65歳を超えている場合は全期間にフォールバックする(空グラフを避ける)
    return {
      chartSeries: data.chartSeries,
      central: data.central,
      eventMarkers: data.eventMarkers,
      lifeStageEvents: data.lifeStageEvents,
    }
  }

  const cutoffYear = cutoffRow.year
  return {
    chartSeries: data.chartSeries.filter(p => p.year <= cutoffYear),
    central: data.central.filter(r => r.year <= cutoffYear),
    eventMarkers: data.eventMarkers.filter(m => m.year <= cutoffYear),
    lifeStageEvents: data.lifeStageEvents.filter(e => e.year <= cutoffYear),
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: PASS(全テスト green)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/store/selectors.ts tests/store/selectors.test.ts
git commit -m "feat: ダッシュボード表示期間フィルタの純関数を追加"
```

---

### Task 2: `PeriodSelector` コンポーネントの新規作成

**Files:**
- Create: `lifeplan/src/components/dashboard/PeriodSelector.tsx`
- Create: `lifeplan/src/components/dashboard/PeriodSelector.module.css`
- Create: `lifeplan/src/components/dashboard/PeriodSelector.test.tsx`

**Interfaces:**
- Consumes: `DashboardPeriod`(Task 1で `src/store/selectors.ts` に定義済み)。
- Produces: `export function PeriodSelector({ period, onChange }: { period: DashboardPeriod; onChange: (period: DashboardPeriod) => void }): JSX.Element`。Task 3 がこのpropsシグネチャをそのまま使う。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/dashboard/PeriodSelector.test.tsx` を新規作成する:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PeriodSelector } from './PeriodSelector'

describe('PeriodSelector', () => {
  it('選択中の期間に aria-selected=true を付け、別の期間をクリックすると onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="to65" onChange={onChange} />)

    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: '全期間' }))
    expect(onChange).toHaveBeenCalledWith('full')
  })

  it('period="full" のとき「全期間」に aria-selected=true が付く', () => {
    render(<PeriodSelector period="full" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'false')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/PeriodSelector.test.tsx`
Expected: FAIL — `Failed to resolve import "./PeriodSelector"`。

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/components/dashboard/PeriodSelector.tsx` を新規作成する:

```tsx
import type { DashboardPeriod } from '../../store/selectors'
import styles from './PeriodSelector.module.css'

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'to65', label: '65歳まで' },
  { value: 'full', label: '全期間' },
]

export function PeriodSelector({ period, onChange }: {
  period: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="表示期間">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={period === opt.value}
          className={styles.tab}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

`lifeplan/src/components/dashboard/PeriodSelector.module.css` を新規作成する(`BreakdownTabs.module.css` の `.tabs`/`.tab` と同じスタイルを踏襲):

```css
.tabs {
  display: flex;
  gap: 0.5rem;
}

.tab {
  background: transparent;
  border: 1px solid var(--color-surface-alt);
  color: var(--color-muted);
  border-radius: 999px;
  padding: 0.35rem 1rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.tab[aria-selected='true'] {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/PeriodSelector.test.tsx`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/components/dashboard/PeriodSelector.tsx src/components/dashboard/PeriodSelector.module.css src/components/dashboard/PeriodSelector.test.tsx
git commit -m "feat: 表示期間切り替え用のPeriodSelectorコンポーネントを追加"
```

---

### Task 3: `Dashboard.tsx` への配線

**Files:**
- Modify: `lifeplan/src/components/dashboard/Dashboard.tsx`
- Modify: `lifeplan/src/components/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `selectPeriodFilteredData`/`DashboardPeriod`(Task 1)、`PeriodSelector`(Task 2)。
- Produces: `Dashboard` の外部propsシグネチャ(`{ data: DashboardData; baseline: Baseline | null; actuals: Actual[] }`)は変更しない。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/dashboard/Dashboard.test.tsx` を以下の内容で置き換える(既存の1件目・4件目・5件目のテストは維持しつつ、2件目を「デフォルトで65歳までにフィルタされる」に更新し、「全期間クリックで全行表示になる」を追加する):

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Dashboard } from './Dashboard'
import { selectDashboardData, selectPeriodFilteredData } from '../../store/selectors'
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

  it('renders the annual simulation table filtered to 65歳まで by default', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    expect(screen.getByText('年次シミュレーション一覧')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')

    const table = screen.getByRole('table')
    const expectedRows = selectPeriodFilteredData(data, 'to65').central.length
    expect(expectedRows).toBeLessThan(data.central.length)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(expectedRows)
  })

  it('switches to 全期間 and shows every simulated year', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '全期間' }))

    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
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

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL — 「renders the annual simulation table filtered to 65歳まで by default」が現状の全期間表示(行数不一致)で失敗、「switches to 全期間」が `role=tab name=全期間` が見つからず失敗。

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/components/dashboard/Dashboard.tsx` を以下に置き換える:

```tsx
import { useMemo, useState } from 'react'
import { KpiCards } from './KpiCards'
import { AssetChart } from './AssetChart'
import { BreakdownTabs } from './BreakdownTabs'
import { AnnualTable } from './AnnualTable'
import { VarianceSection } from './VarianceSection'
import { PeriodSelector } from './PeriodSelector'
import { selectPeriodFilteredData } from '../../store/selectors'
import type { DashboardData, DashboardPeriod } from '../../store/selectors'
import type { Baseline } from '../../engine/baseline'
import type { Actual } from '../../types'
import styles from './Dashboard.module.css'

interface Props {
  data: DashboardData
  baseline: Baseline | null
  actuals: Actual[]
}

export function Dashboard({ data, baseline, actuals }: Props) {
  const [period, setPeriod] = useState<DashboardPeriod>('to65')
  const filtered = useMemo(() => selectPeriodFilteredData(data, period), [data, period])

  return (
    <main className={styles.main}>
      <KpiCards kpi={data.kpi} />
      <PeriodSelector period={period} onChange={setPeriod} />
      <AssetChart series={filtered.chartSeries} eventMarkers={filtered.eventMarkers} />
      {baseline && data.variance && (
        <VarianceSection baseline={baseline} actuals={actuals} central={data.central} variance={data.variance} />
      )}
      <BreakdownTabs rows={filtered.central} />
      <AnnualTable series={filtered.chartSeries} central={filtered.central} events={filtered.lifeStageEvents} />
    </main>
  )
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS(全5件 green)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.test.tsx
git commit -m "feat: DashboardにPeriodSelectorを配線し、資産グラフ/内訳/年次一覧を選択期間でフィルタする"
```

---

### Task 4: Playwright e2e テストの追加

**Files:**
- Modify: `lifeplan/tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: 実行中のダッシュボードUI(`role="tab"` の `65歳まで`/`全期間`、`role="region"` の `年次シミュレーション一覧`)。他タスクへの新規インターフェース提供なし。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/e2e/dashboard.spec.ts` の既存テストの後に追記する:

```ts
test('period selector defaults to 65歳まで and 全期間 shows every simulated year', async ({ page }) => {
  await page.goto('/')

  const rows = page.getByRole('region', { name: '年次シミュレーション一覧' }).locator('tbody tr')
  await expect(page.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')
  const filteredCount = await rows.count()

  await page.getByRole('tab', { name: '全期間' }).click()
  await expect(page.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
  const fullCount = await rows.count()

  expect(fullCount).toBeGreaterThan(filteredCount)
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx playwright test dashboard.spec.ts -g "period selector"`
Expected: FAIL — `role=tab name=65歳まで` が見つからない(Task 1〜3が未実装のブランチ状態であれば失敗する。Task 1〜3実装後にこのタスクを行う場合は最初からPASSしうるため、その場合はStep2を「実装確認」目的で実行し、Step3は不要である旨をコミットメッセージで明記する)。

- [ ] **Step 3: 実装(Task 1〜3で完了済みのため追加実装は不要)**

このタスクはTask 1〜3の実装を前提としたe2e回帰テストの追加のみであり、プロダクションコードの追加実装は無い。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx playwright test dashboard.spec.ts`
Expected: PASS(既存1件 + 新規1件、計2件 green)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add tests/e2e/dashboard.spec.ts
git commit -m "test: 表示期間セレクターのe2eスモークテストを追加"
```

---

### Task 5: 全ゲート確認

**Files:** なし(検証のみ)

**Interfaces:** なし。

- [ ] **Step 1: 全テストを実行する**

Run: `cd lifeplan && npm test`
Expected: PASS(unit/integration全件green、Task1〜4で追加・変更したテストを含む)。

- [ ] **Step 2: 型チェックを実行する**

Run: `cd lifeplan && npm run typecheck`
Expected: エラー0件。

- [ ] **Step 3: lintを実行する**

Run: `cd lifeplan && npm run lint`
Expected: エラー0件。

- [ ] **Step 4: ビルドを実行する**

Run: `cd lifeplan && npm run build`
Expected: ビルド成功。

- [ ] **Step 5: e2eを実行する**

Run: `cd lifeplan && npm run test:e2e`
Expected: PASS(既存 dashboard/input/scenarios/actuals の各specに加え、Task 4で追加した期間セレクターテストもgreen)。

- [ ] **Step 6: 最終コミット(差分が無ければスキップ)**

```bash
cd lifeplan
git status
# 差分が残っていればコミット。無ければこのステップは不要。
```
