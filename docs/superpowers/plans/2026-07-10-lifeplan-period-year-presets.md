# 表示期間プリセットに「10年」「20年」を追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ダッシュボードの表示期間セレクター(`PeriodSelector`)に「10年」「20年」の2プリセットを追加し、`baseYear`(シミュレーション開始年)から10年分/20年分だけを表示できるようにする。

**Architecture:** `src/store/selectors.ts` の `DashboardPeriod` 型に `'y10'`/`'y20'` を追加し、`selectPeriodFilteredData` を拡張する。既存の `full`/`to65` 分岐が重複していたパススルー処理を共通ヘルパーに抽出したうえで、`y10`/`y20` もそのヘルパーを使ってカットオフ年(`baseYear + N - 1`)でフィルタする。`PeriodSelector` の `OPTIONS` 配列にボタンを2つ追加するだけで、`Dashboard.tsx` 側の配線は無改変(既に `DashboardPeriod` を汎用的に扱っているため)。

**Tech Stack:** React + TypeScript + Vitest(unit/component) + Playwright(e2e)。既存の `selectPeriodFilteredData`/`PeriodSelector` パターンを拡張する。

## Global Constraints

- 仕様の源泉: `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §21(§18 の表示期間セレクターを拡張する)。
- `src/engine/`・`src/persistence/` は無改変(背骨: ゴールデン回帰・既存永続化テストに影響を与えない)。
- `KpiCards`・`VarianceSection` は選択期間に連動させない(既存の§18の制約を継承、変更なし)。
- `data.historicalChartPoints`(§20、baseYear より前の参考実績のチャート点)は期間セレクターの影響を受けない仕様のまま(`Dashboard.tsx` は `filtered.chartSeries` の前に無条件で連結しており、本タスクでは変更しない)。
- 「10年」「20年」は `baseYear`(＝`data.central[0].year`)を起点に、それぞれ `baseYear`〜`baseYear+9`(10行)/`baseYear`〜`baseYear+19`(20行)を表示する。
- `PeriodSelector` のボタン並び順は「10年」→「20年」→「65歳まで」→「全期間」。デフォルト選択は現状どおり `'to65'`(変更しない)。
- 選択期間はFirestore・localStorageに保存しない(既存の制約を継承)。
- 全ゲート: `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test:e2e`(いずれも `lifeplan/` ディレクトリで実行)。

---

### Task 1: `DashboardPeriod` 型の拡張と `selectPeriodFilteredData` のリファクタリング

**Files:**
- Modify: `lifeplan/src/store/selectors.ts`
- Test: `lifeplan/tests/store/selectors.test.ts`

**Interfaces:**
- Consumes: 既存の `DashboardData`(`central: YearRow[]` の先頭行が `baseYear` の年であることを利用する)、既存の `PeriodFilteredData` インターフェース(フィールド構成は変更しない)。
- Produces: `export type DashboardPeriod = 'to65' | 'full' | 'y10' | 'y20'`。`selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): PeriodFilteredData` のシグネチャは変更しない(戻り値の型・意味も変わらず、対応する `period` の種類が増えるだけ)。後続タスク(Task 2, 3, 4)がこの型をそのまま使う。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/selectors.test.ts` の `describe('selectPeriodFilteredData', ...)` ブロック内、既存の3つの `it` の後(337行目の `})` の直前)に追記する:

```ts
  it("'y10': central/centralYearStart/chartSeries/eventMarkers/lifeStageEvents を baseYearから10年分(baseYear+9まで)でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'y10')

    const baseYear = data.central[0]!.year
    expect(filtered.central).toHaveLength(10)
    expect(filtered.central[0]!.year).toBe(baseYear)
    expect(filtered.central[9]!.year).toBe(baseYear + 9)
    expect(filtered.centralYearStart).toHaveLength(10)
    expect(filtered.chartSeries.length).toBe(10)
    expect(filtered.eventMarkers.every(m => m.year <= baseYear + 9)).toBe(true)
    expect(filtered.lifeStageEvents.every(e => e.year <= baseYear + 9)).toBe(true)
  })

  it("'y20': baseYearから20年分(baseYear+19まで)でフィルタする", () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    const filtered = selectPeriodFilteredData(data, 'y20')

    const baseYear = data.central[0]!.year
    expect(filtered.central).toHaveLength(20)
    expect(filtered.central[0]!.year).toBe(baseYear)
    expect(filtered.central[19]!.year).toBe(baseYear + 19)
    expect(filtered.chartSeries.length).toBe(20)
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts -t "'y10'"`
Expected: FAIL — `filtered.central` の長さが10ではない(現状は `'y10'` を認識せず `to65` 相当のロジックに落ちるか、TypeScript の型エラーになる)。

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/store/selectors.ts` の以下の既存ブロック(267〜311行目):

```ts
export type DashboardPeriod = 'to65' | 'full'

const PERIOD_TO65_MAX_AGE = 65

export interface PeriodFilteredData {
  chartSeries: ChartPoint[]
  central: YearRow[]
  centralYearStart: YearRow[]
  eventMarkers: EventMarker[]
  lifeStageEvents: LifeStageEvent[]
}

/** ダッシュボード表示期間セレクター用(§18.4)。'to65' は agePrimary<=65 の年で打ち切る。 */
export function selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): PeriodFilteredData {
  if (period === 'full') {
    return {
      chartSeries: data.chartSeries,
      central: data.central,
      centralYearStart: data.centralYearStart,
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
      centralYearStart: data.centralYearStart,
      eventMarkers: data.eventMarkers,
      lifeStageEvents: data.lifeStageEvents,
    }
  }

  const cutoffYear = cutoffRow.year
  return {
    chartSeries: data.chartSeries.filter(p => p.year <= cutoffYear),
    central: data.central.filter(r => r.year <= cutoffYear),
    centralYearStart: data.centralYearStart.filter(r => r.year <= cutoffYear),
    eventMarkers: data.eventMarkers.filter(m => m.year <= cutoffYear),
    lifeStageEvents: data.lifeStageEvents.filter(e => e.year <= cutoffYear),
  }
}
```

を、以下に置き換える:

```ts
export type DashboardPeriod = 'to65' | 'full' | 'y10' | 'y20'

const PERIOD_TO65_MAX_AGE = 65
const PERIOD_YEAR_COUNTS: Record<'y10' | 'y20', number> = { y10: 10, y20: 20 }

export interface PeriodFilteredData {
  chartSeries: ChartPoint[]
  central: YearRow[]
  centralYearStart: YearRow[]
  eventMarkers: EventMarker[]
  lifeStageEvents: LifeStageEvent[]
}

function passthroughPeriodData(data: DashboardData): PeriodFilteredData {
  return {
    chartSeries: data.chartSeries,
    central: data.central,
    centralYearStart: data.centralYearStart,
    eventMarkers: data.eventMarkers,
    lifeStageEvents: data.lifeStageEvents,
  }
}

function filterPeriodDataByCutoffYear(data: DashboardData, cutoffYear: number): PeriodFilteredData {
  return {
    chartSeries: data.chartSeries.filter(p => p.year <= cutoffYear),
    central: data.central.filter(r => r.year <= cutoffYear),
    centralYearStart: data.centralYearStart.filter(r => r.year <= cutoffYear),
    eventMarkers: data.eventMarkers.filter(m => m.year <= cutoffYear),
    lifeStageEvents: data.lifeStageEvents.filter(e => e.year <= cutoffYear),
  }
}

/**
 * ダッシュボード表示期間セレクター用(§18.4/§21.3)。
 * 'to65' は agePrimary<=65 の年、'y10'/'y20' は baseYear からの経過年数で打ち切る。
 */
export function selectPeriodFilteredData(data: DashboardData, period: DashboardPeriod): PeriodFilteredData {
  if (period === 'full') {
    return passthroughPeriodData(data)
  }

  if (period === 'y10' || period === 'y20') {
    const baseYear = data.central[0]!.year
    const cutoffYear = baseYear + PERIOD_YEAR_COUNTS[period] - 1
    return filterPeriodDataByCutoffYear(data, cutoffYear)
  }

  const cutoffRow = [...data.central].reverse().find(r => r.agePrimary <= PERIOD_TO65_MAX_AGE)
  if (!cutoffRow) {
    // baseYear時点で既に65歳を超えている場合は全期間にフォールバックする(空グラフを避ける)
    return passthroughPeriodData(data)
  }

  return filterPeriodDataByCutoffYear(data, cutoffRow.year)
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: PASS(既存の `'to65'`/`'full'`/フォールバックの3テストを含め全件green。リファクタリングで挙動は変えていないため、既存テストはそのまま通る)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/store/selectors.ts tests/store/selectors.test.ts
git commit -m "feat: 表示期間セレクターに10年/20年プリセットのフィルタロジックを追加"
```

---

### Task 2: `PeriodSelector` に「10年」「20年」ボタンを追加

**Files:**
- Modify: `lifeplan/src/components/dashboard/PeriodSelector.tsx`
- Test: `lifeplan/src/components/dashboard/PeriodSelector.test.tsx`

**Interfaces:**
- Consumes: Task 1 で拡張した `DashboardPeriod`(`'to65' | 'full' | 'y10' | 'y20'`)。
- Produces: `PeriodSelector` の外部propsシグネチャ(`{ period: DashboardPeriod; onChange: (period: DashboardPeriod) => void }`)は変更しない。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/dashboard/PeriodSelector.test.tsx` の `describe('PeriodSelector', ...)` ブロック内、既存の2つの `it` の後(22行目の `})` の直前)に追記する:

```tsx
  it('「10年」「20年」ボタンが表示され、クリックするとonChangeに対応する値を渡す', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="to65" onChange={onChange} />)

    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: '10年' }))
    expect(onChange).toHaveBeenCalledWith('y10')

    fireEvent.click(screen.getByRole('tab', { name: '20年' }))
    expect(onChange).toHaveBeenCalledWith('y20')
  })

  it('period="y10"/"y20" のとき対応するボタンに aria-selected=true が付く', () => {
    const { rerender } = render(<PeriodSelector period="y10" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')

    rerender(<PeriodSelector period="y20" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/PeriodSelector.test.tsx`
Expected: FAIL — `screen.getByRole('tab', { name: '10年' })` が見つからない。

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/components/dashboard/PeriodSelector.tsx` の以下の部分:

```tsx
const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'to65', label: '65歳まで' },
  { value: 'full', label: '全期間' },
]
```

を、以下に置き換える:

```tsx
const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'y10', label: '10年' },
  { value: 'y20', label: '20年' },
  { value: 'to65', label: '65歳まで' },
  { value: 'full', label: '全期間' },
]
```

(ファイルの他の部分は変更不要。`OPTIONS.map(...)` が自動的に4ボタンをレンダリングする。)

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/PeriodSelector.test.tsx`
Expected: PASS(既存2件+新規2件、計4件green)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/components/dashboard/PeriodSelector.tsx src/components/dashboard/PeriodSelector.test.tsx
git commit -m "feat: PeriodSelectorに10年/20年ボタンを追加"
```

---

### Task 3: `Dashboard` 統合テストに10年/20年の回帰テストを追加

**Files:**
- Test: `lifeplan/src/components/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 1(`selectPeriodFilteredData` の `'y10'`/`'y20'`)・Task 2(`PeriodSelector` の「10年」「20年」ボタン)。
- Produces: なし(このタスクはテストのみ。`Dashboard.tsx` は既に `DashboardPeriod` を汎用的に扱っており、Task 1 + Task 2 の完了だけで「10年」「20年」ボタンのクリックが正しく年次一覧表の行数を変える。プロダクションコードの追加実装は不要)。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/dashboard/Dashboard.test.tsx` の `describe('Dashboard', ...)` ブロック内、`'switches to 全期間 ...'` テストの後・`'keeps KPI values unchanged ...'` テストの前(44行目の後)に追記する:

```tsx
  it('switches to 10年 and shows exactly 10 rows starting at baseYear', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '10年' }))

    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('switches to 20年 and shows exactly 20 rows starting at baseYear', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} baseline={null} actuals={[]} />)

    fireEvent.click(screen.getByRole('tab', { name: '20年' }))

    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20)
  })
```

- [ ] **Step 2: テストを実行して結果を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: Task 1・Task 2 が完了済みであれば最初からPASSする(このタスクはプロダクションコードを追加しない回帰テストのため)。もし直前のタスクを飛ばしてこのタスク単体を検証している場合はFAILする — その場合はTask 1・Task 2 が未完了であることを意味するので、それらを先に完了させる。

- [ ] **Step 3: 実装(Task 1・Task 2で完了済みのため追加実装は不要)**

このタスクはTask 1・Task 2の実装を前提とした統合レベルの回帰テストの追加のみであり、プロダクションコードの追加実装は無い。

- [ ] **Step 4: 全体のテストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS(既存5件+新規2件、計7件green)。

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/components/dashboard/Dashboard.test.tsx
git commit -m "$(cat <<'EOF'
test: 10年/20年プリセットでDashboardの表示行数が変わることを回帰テストで固定する

Task 1(selectPeriodFilteredData)・Task 2(PeriodSelector)で実装済みの
機能に対する統合レベルの回帰確認のみで、プロダクションコードの追加
実装は無い。
EOF
)"
```

---

### Task 4: Playwright e2e テストを4プリセット対応に拡張

**Files:**
- Modify: `lifeplan/tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: 実行中のダッシュボードUI(`role="tab"` の `10年`/`20年`/`65歳まで`/`全期間`、`role="region"` の `年次シミュレーション一覧`)。他タスクへの新規インターフェース提供なし。

- [ ] **Step 1: 既存のe2eテストを拡張する**

`lifeplan/tests/e2e/dashboard.spec.ts` の以下の既存テスト全体(16〜28行目):

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

を、以下に置き換える:

```ts
test('period selector defaults to 65歳まで, and 10年/20年/全期間 change the row count accordingly', async ({ page }) => {
  await page.goto('/')

  const rows = page.getByRole('region', { name: '年次シミュレーション一覧' }).locator('tbody tr')
  await expect(page.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')
  const filteredCount = await rows.count()

  await page.getByRole('tab', { name: '10年' }).click()
  await expect(page.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')
  await expect(rows).toHaveCount(10)

  await page.getByRole('tab', { name: '20年' }).click()
  await expect(page.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
  await expect(rows).toHaveCount(20)

  await page.getByRole('tab', { name: '全期間' }).click()
  await expect(page.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
  const fullCount = await rows.count()

  expect(fullCount).toBeGreaterThan(filteredCount)
})
```

- [ ] **Step 2: ビルドしてe2eテストを実行する**

Playwrightはビルド済みの `dist/` に対して実行するため、変更を反映するには先にビルドが必要。

Run: `cd lifeplan && npm run build && npx playwright test dashboard.spec.ts`
Expected: PASS(2件: 既存の「KPIカード・チャート・内訳タブ」テスト、更新後の「10年/20年/65歳まで/全期間」テスト)。

- [ ] **Step 3: コミット**

```bash
cd lifeplan
git add tests/e2e/dashboard.spec.ts
git commit -m "test: 表示期間セレクターのe2eスモークテストを10年/20年プリセット対応に拡張"
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
Expected: PASS(既存の dashboard/input/scenarios/actuals 各specに加え、Task 4で拡張した期間セレクターテストもgreen)。

- [ ] **Step 6: 最終コミット(差分が無ければスキップ)**

```bash
cd lifeplan
git status
# 差分が残っていればコミット。無ければこのステップは不要。
```
