# 保育料(対象自治体)追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シミュレーションエンジンの支出計算に「保育料」カテゴリを追加し、自治体の保育料徴収基準と多子軽減ルールを反映する。

**Architecture:** 既存の教育費マスタ(`src/masterData/education.ts`)と同じ層に、対象自治体の保育料定数と多子軽減率を返す純関数を持つ新規マスタ `src/masterData/nursery.ts` を追加する。`src/engine/expenses.ts` の `expensesForYear` はこのマスタを使って学齢index 0〜5(未就学)の子を出生順に並べ、0〜2歳児クラスの子にのみ料金を計上する。`ExpenseBreakdown`(`src/types.ts`)に `保育料` フィールドを追加し、`totalExpenseOf`(`Object.values` の汎用合計)は変更不要。

**Tech Stack:** TypeScript, Vitest(テスト)。永続化層・UIコンポーネントの変更は無い。

## Global Constraints

- 仕様の源泉: `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §17。
- 階層は**世帯の所得階層・保育必要量に応じた額で固定(公開版では Assumptions.nurseryFeeMonthly として入力値化)**。動的判定・入力フォームでの上書きは対象外(§17.6)。
- 保育標準時間の月額は自治体の徴収基準表で決まる値(§17.1)。
- 多子軽減率(学齢index 0〜5の未就学兄弟姉妹における出生順位、0-based・年長い順): 0番目=1.0(全額)、1番目=0.5(半額)、2番目以降=0(無料)。3〜5歳児クラスの子も順位カウントに含めるが、課金対象は学齢index 0〜2の子のみ。
- ゴールデン回帰テスト(`tests/golden.integration.test.ts`)は `investmentBalance` のみ検証しており、支出カテゴリ追加の影響を受けない(§17.5)。この回帰テストは無改変・green を維持すること。
- 全ゲート = unit/integration(`npm test`) + typecheck(`npm run typecheck`) + lint(`npm run lint`)。UIコンポーネントは無改変のため build/e2e は対象外。

---

### Task 1: 保育料マスタ(`src/masterData/nursery.ts`)

**Files:**
- Create: `lifeplan/src/masterData/nursery.ts`
- Modify: `lifeplan/src/masterData/index.ts`
- Modify(test): `lifeplan/tests/masterData.test.ts`

**Interfaces:**
- Consumes: なし(純定数・純関数のみ)
- Produces:
  - `export const NURSERY_FEE_STANDARD_MONTHLY: number` (値は世帯ごとの入力値)
  - `export function nurseryDiscountRate(rankAmongPreschoolSiblings: number): number` (0→1, 1→0.5, 2以降→0)
  - Task 2 はこの2つを `src/masterData/nursery` からインポートして使う。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/masterData.test.ts` の末尾(`describe('education', ...)` ブロックの後)に追記する:

```ts
describe('nursery', () => {
  it('保育標準時間・月額は入力値どおり', () => {
    expect(NURSERY_FEE_STANDARD_MONTHLY).toBe(NURSERY_FEE)
  })
  it('出生順位0番目(一番上)は全額', () => {
    expect(nurseryDiscountRate(0)).toBe(1)
  })
  it('出生順位1番目(上から2番目)は半額', () => {
    expect(nurseryDiscountRate(1)).toBe(0.5)
  })
  it('出生順位2番目以降は無料', () => {
    expect(nurseryDiscountRate(2)).toBe(0)
    expect(nurseryDiscountRate(5)).toBe(0)
  })
})
```

ファイル冒頭のimportに以下を追加する:

```ts
import { NURSERY_FEE_STANDARD_MONTHLY, nurseryDiscountRate } from '../src/masterData/nursery'
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run tests/masterData.test.ts`
Expected: FAIL — `Failed to resolve import "../src/masterData/nursery"`(ファイル未作成のため)

- [ ] **Step 3: 最小実装を書く**

Create `lifeplan/src/masterData/nursery.ts`:

```ts
// src/masterData/nursery.ts
// 自治体の利用者負担(保育料)徴収基準表における、世帯の所得階層に応じた額に固定。
// 出典: 居住自治体が公開している「利用者負担(保育料)徴収基準表」。
// 3〜5歳児クラス(学齢index 3〜5)は幼児教育・保育無償化により無償のため、この定数は
// 0〜2歳児クラス(学齢index 0〜2)にのみ呼び出し側(expenses.ts)で適用する。
export const NURSERY_FEE_STANDARD_MONTHLY = NURSERY_FEE // 保育標準時間・該当階層

// 未就学(学齢index 0〜5)の兄弟姉妹における出生順位(0-based, 年長い順)に応じた軽減率。
// 一番上=全額、上から2番目=半額、上から3番目以降=無料。
// 3〜5歳児クラスの子も順位カウントに含めるが、実際の課金対象は0〜2歳児クラスの子のみ
// (呼び出し側でフィルタする)。
export function nurseryDiscountRate(rankAmongPreschoolSiblings: number): number {
  if (rankAmongPreschoolSiblings === 0) return 1
  if (rankAmongPreschoolSiblings === 1) return 0.5
  return 0
}
```

Modify `lifeplan/src/masterData/index.ts` — add nursery re-export (matches existing pattern for utilities/pension/education):

```ts
// src/masterData/index.ts
import { utilities } from './utilities'
import { pension } from './pension'
import { educationMaster } from './education'
import type { MasterData } from '../types'

export const lifeplanMaster: MasterData = {
  education: educationMaster, utilities, pension,
}
export * from './utilities'
export * from './pension'
export * from './education'
export * from './nursery'
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run tests/masterData.test.ts`
Expected: PASS(全テストgreen)

- [ ] **Step 5: コミット**

```bash
cd lifeplan
git add src/masterData/nursery.ts src/masterData/index.ts tests/masterData.test.ts
git commit -m "$(cat <<'EOF'
feat: 対象自治体保育料マスタ(該当階層固定)を追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `expensesForYear` に保育料を計上する

**Files:**
- Modify: `lifeplan/src/types.ts:81-85`(`ExpenseBreakdown` interface)
- Modify: `lifeplan/src/engine/expenses.ts`
- Modify(test): `lifeplan/tests/expenses.test.ts`
- Modify(fixture): `lifeplan/src/components/dashboard/AnnualTable.test.tsx:20`
- Modify(fixture): `lifeplan/src/components/dashboard/BreakdownTabs.test.tsx:11`

**Interfaces:**
- Consumes: `NURSERY_FEE_STANDARD_MONTHLY`, `nurseryDiscountRate` from `../masterData/nursery`(Task 1で作成)。既存の `gradeIndexAt(birthYear, birthMonth, year): number`(`./ageGrade`、`expenses.ts` に既にimport済み)。
- Produces: `ExpenseBreakdown.保育料: number`。`expensesForYear` の戻り値に `保育料` フィールドが含まれる。

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/expenses.test.ts` の `describe('expensesForYear', ...)` ブロック内、最後の `it('totalExpenseOfは各カテゴリの和', ...)` の直前に追記する(このテストは後述Step 3で `保育料` を含む形に更新するため、先に保育料専用のテストを追加する):

```ts
  it('学齢index 1(1〜2歳児クラス)の子1人 → 保育料は月額×12', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [{
          id: 'c1', name: '子1', birthYear: 2025, birthMonth: 4,
          schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
          allowanceMonthly: 0, phoneFromGrade: 6,
        }],
      },
    }
    // 2026年: gradeIndexAt(2025, 4, 2026) = 2026-2025-1 = 0 → 学齢index0(0才児クラス)
    // 2027年: gradeIndexAt(2025, 4, 2027) = 1 → 学齢index1(1才児クラス)
    expect(expensesForYear(inputs, lifeplanMaster, 2027).保育料).toBe(NURSERY_FEE * 12)
  })
  it('学齢index 4(年中, 3〜5歳児クラス)の子1人 → 保育料は0(無償化)', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [{
          id: 'c1', name: '子1', birthYear: 2021, birthMonth: 4,
          schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
          allowanceMonthly: 0, phoneFromGrade: 6,
        }],
      },
    }
    // gradeIndexAt(2021, 4, 2026) = 2026-2021-1 = 4 → 年中(学齢index4, 3〜5歳児クラス)
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(0)
  })
  it('0〜2歳の子2人が同時在籍 → 第1子フル額+第2子半額', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [
          { id: 'c1', name: '第1子', birthYear: 2024, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
          { id: 'c2', name: '第2子', birthYear: 2025, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
        ],
      },
    }
    // 2026年: 第1子 gradeIndexAt(2024,4,2026)=1(1才児), 第2子 gradeIndexAt(2025,4,2026)=0(0才児)
    // 出生順位: 第1子(2024年生)が0番目=全額、第2子(2025年生)が1番目=半額
    const expected = NURSERY_FEE * 12 * 1 + NURSERY_FEE * 12 * 0.5
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(expected)
  })
  it('3〜5歳の兄+0〜2歳の弟 → 兄は0円のまま、弟は出生順位1番目として半額', () => {
    const inputs = {
      ...baseInputs,
      members: {
        ...baseInputs.members,
        children: [
          { id: 'c1', name: '兄', birthYear: 2021, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
          { id: 'c2', name: '弟', birthYear: 2025, birthMonth: 4,
            schooling: { elementary: '公立' as const, junior: '公立' as const, high: '公立' as const, university: 'なし' as const, remittanceMonthly: 0 },
            allowanceMonthly: 0, phoneFromGrade: 6 },
        ],
      },
    }
    // 2026年: 兄 gradeIndexAt(2021,4,2026)=4(年中, 3〜5歳児クラス→無償), 弟 gradeIndexAt(2025,4,2026)=0(0才児)
    // 出生順位: 兄(2021年生)が0番目、弟(2025年生)が1番目=半額 だが兄自体の料金は無償化で0円
    expect(expensesForYear(inputs, lifeplanMaster, 2026).保育料).toBe(NURSERY_FEE * 12 * 0.5)
  })
```

`lifeplan/tests/expenses.test.ts` の `it('totalExpenseOfは各カテゴリの和', ...)` を更新(`保育料` を式に追加):

```ts
  it('totalExpenseOfは各カテゴリの和', () => {
    const e = expensesForYear(baseInputs, lifeplanMaster, 2026)
    const expected = e.食費 + e.日用品 + e.ライフライン + e.住宅 + e.教育費 + e.家電 + e.住宅大型 + e.こづかい + e.衣服 + e.医療 + e.外食レジャー + e.雑費 + e.車 + e.保育料
    expect(totalExpenseOf(e)).toBe(expected)
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd lifeplan && npx vitest run tests/expenses.test.ts`
Expected: FAIL — 保育料関連の4テストが `undefined` を期待値と比較して失敗(`ExpenseBreakdown` に `保育料` がまだ存在しないため)

- [ ] **Step 3: 最小実装を書く**

`lifeplan/src/types.ts:81-85` の `ExpenseBreakdown` を修正:

```ts
export interface ExpenseBreakdown {
  食費: number; 日用品: number; ライフライン: number; 住宅: number
  教育費: number; 家電: number; 住宅大型: number; こづかい: number
  衣服: number; 医療: number; 外食レジャー: number; 雑費: number; 車: number
  保育料: number
}
```

`lifeplan/src/engine/expenses.ts` のimport行に `nurseryDiscountRate` と `NURSERY_FEE_STANDARD_MONTHLY` を追加:

```ts
// src/engine/expenses.ts
import type { Inputs, MasterData, ExpenseBreakdown } from '../types'
import { gradeIndexAt } from './ageGrade'
import { electricityAnnual, gasAnnual } from '../masterData/utilities'
import { educationCostForGrade, universityCost } from '../masterData/education'
import { NURSERY_FEE_STANDARD_MONTHLY, nurseryDiscountRate } from '../masterData/nursery'
```

`expensesForYear` 内、`衣服`/`医療`/`外食レジャー`/`雑費`/`車` の定義の直後・`return` 文の直前に保育料の計算を追加(現在のコードは `lifeplan/src/engine/expenses.ts` の以下の位置):

```ts
  const 衣服 = CLOTHING_PER_ADULT_ANNUAL * (1 + (members.spouse ? 1 : 0))
  const 医療 = MEDICAL_ANNUAL
  const 外食レジャー = LEISURE_ANNUAL
  const 雑費 = MISC_ANNUAL
  const 車 = 0

  // 保育料(対象自治体 該当階層固定・保育標準時間)。3〜5歳児クラス(学齢index3〜5)は
  // 幼児教育・保育無償化により無償。未就学(学齢index0〜5)の兄弟姉妹を出生順に並べ、
  // 多子軽減(1番目=全額,2番目=半額,3番目以降=無料)を適用したうえで、
  // 実際に課金対象となる0〜2歳児クラス(学齢index0〜2)の子のみ加算する。
  const preschoolChildren = members.children
    .filter(c => { const gi = gradeIndexAt(c.birthYear, c.birthMonth, year); return gi >= 0 && gi <= 5 })
    .sort((a, b) => (a.birthYear - b.birthYear) || (a.birthMonth - b.birthMonth))
  let 保育料 = 0
  preschoolChildren.forEach((c, rank) => {
    const gi = gradeIndexAt(c.birthYear, c.birthMonth, year)
    if (gi >= 0 && gi <= 2) 保育料 += NURSERY_FEE_STANDARD_MONTHLY * 12 * nurseryDiscountRate(rank)
  })

  return { 食費, 日用品, ライフライン, 住宅, 教育費, 家電, 住宅大型, こづかい, 衣服, 医療, 外食レジャー, 雑費, 車, 保育料 }
```

(既存の `return { 食費, 日用品, ライフライン, 住宅, 教育費, 家電, 住宅大型, こづかい, 衣服, 医療, 外食レジャー, 雑費, 車 }` 行を上記の `保育料` 追加版で置き換える。)

`lifeplan/src/components/dashboard/AnnualTable.test.tsx:20` を修正(`保育料: 0` を追加):

```ts
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
```

`lifeplan/src/components/dashboard/BreakdownTabs.test.tsx:11` を修正(同様に `保育料: 0` を追加):

```ts
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0 },
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `cd lifeplan && npx vitest run tests/expenses.test.ts tests/masterData.test.ts src/components/dashboard/AnnualTable.test.tsx src/components/dashboard/BreakdownTabs.test.tsx`
Expected: PASS(全テストgreen)

- [ ] **Step 5: 全テスト・ゴールデン回帰・typecheck・lintを実行して確認する**

Run: `cd lifeplan && npm test`
Expected: PASS(既存分含め全テストgreen。`tests/golden.integration.test.ts` の `investmentBalance` 検証も不変のままgreenであること)

Run: `cd lifeplan && npm run typecheck`
Expected: エラー無し

Run: `cd lifeplan && npm run lint`
Expected: エラー無し

- [ ] **Step 6: コミット**

```bash
cd lifeplan
git add src/types.ts src/engine/expenses.ts tests/expenses.test.ts \
  src/components/dashboard/AnnualTable.test.tsx src/components/dashboard/BreakdownTabs.test.tsx
git commit -m "$(cat <<'EOF'
feat: 保育料(対象自治体該当階層)をexpensesForYearに計上

学齢index0〜2(0〜2歳児クラス)のみ課金、3〜5歳児クラスは無償化で0円。
未就学の兄弟姉妹を出生順に並べ多子軽減(2番目半額・3番目以降無料)を適用。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
