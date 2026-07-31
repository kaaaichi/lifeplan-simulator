# ダッシュボードUI(Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React + Zustand + Recharts で「ダッシュボード画面」のみを実装し、既存エンジン/永続化層(InMemoryHouseholdRepository)に配線する。入力フォーム・シナリオ管理・ログイン・Firebase実配線は対象外。

**Architecture:** 既存 `lifeplan/`（`lifeplan-engine`）パッケージに Vite + React を同居させる。`App` が `householdStore`(Zustand) 経由で `InMemoryHouseholdRepository` から `HouseholdDoc` をロード/ブートストラップし、`selectors.ts` が純粋関数で `simulate`/`goalSeek`/`computeVariance` を呼んで描画用データを導出、`Dashboard` 以下のコンポーネントが表示するだけの単方向データフロー。状態を書き込むUIはこのプランには無い。

**Tech Stack:** React 18/19 系, Vite, Zustand, Recharts, CSS Modules, Vitest + React Testing Library（コンポーネント）, Playwright（e2e）。既存: TypeScript strict, ESLint flat config, Vitest（エンジン/永続化層）。

## Global Constraints

- 作業ディレクトリは常に `lifeplan/`（このリポジトリの実装パッケージ）。コマンドはすべてそこから実行する。
- Node 24（`.github/workflows/ci.yml` と一致させる）。
- `tsconfig.json` の `strict: true` は維持する。弱めない。
- 既存の単体テスト81件・ゴールデンマスター回帰（`npm run test:unit` / `npm run test:integration`）は**無改変で green を維持**する。`src/engine/`・`src/persistence/{types,doc,validate,migrate,repository}.ts` のシグネチャは変更しない。`src/persistence/defaultHousehold.ts` の値は**一切変更しない**（ゴールデン回帰の入力データのため）。
- 追加する外部ライブラリは `react`/`react-dom`/`zustand`/`recharts`/`vite`/`@vitejs/plugin-react`/`@testing-library/react`/`@testing-library/jest-dom`/`jsdom`/`@types/react`/`@types/react-dom`/`@playwright/test` のみ（§13.1 の決定に従い、ルーティング・CSSフレームワーク・状態管理の追加ライブラリは導入しない）。
- スタイリングはプレーン CSS（CSS Modules）のみ。
- 入力フォーム・シナリオ管理画面・ログイン画面・Firebase Auth/Firestore 実配線は本プランのスコープ外（設計書 §13.6）。
- 設計の源泉は `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §13（および §5・§11.2・§12 の型）。

---

## Task 1: PII シードデータの切り分け（placeholderHousehold + seedOverride）

**Files:**
- Create: `lifeplan/src/persistence/placeholderHousehold.ts`
- Create: `lifeplan/src/persistence/seedOverride.ts`
- Modify: `lifeplan/src/persistence/doc.ts`
- Modify: `lifeplan/.gitignore`
- Test: `lifeplan/tests/persistence/seedOverride.test.ts`（新規）
- Test: `lifeplan/tests/persistence/doc.test.ts`（既存ファイルに1テスト追記）

**Interfaces:**
- Consumes: `Inputs`（`src/types.ts`）、既存 `HouseholdContent`/`createDefaultDoc`（`src/persistence/doc.ts`、`src/persistence/types.ts`）
- Produces: `placeholderHousehold.ts` は `export const defaultInputs: Inputs`。`seedOverride.ts` は `export const defaultInputs: Inputs`（ローカル `seed.local.json` があればそれ、無ければ `placeholderHousehold.defaultInputs`）。後続タスクはこれらを直接使わない（`createDefaultDoc()` 経由でのみ間接的に使われる）。

- [ ] **Step 1: 失敗するテストを書く（createDefaultDoc がプレースホルダを使うこと）**

`lifeplan/tests/persistence/doc.test.ts` の `describe('createDefaultDoc', ...)` ブロック内に以下を追記する（既存の2つの `it` の後ろに追加、`describe` は閉じない）:

```ts
  it('プレースホルダの世帯データを使う（実データではない）', () => {
    const doc = createDefaultDoc()
    expect(doc.scenarios[0]!.inputs.members.primary.name).toBe('世帯主')
  })
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts`
Expected: FAIL（`createDefaultDoc` が現状 `defaultHousehold.ts` の実名を返すため `'世帯主'` と一致しない）

- [ ] **Step 3: `placeholderHousehold.ts` を作成する**

```ts
// lifeplan/src/persistence/placeholderHousehold.ts
import type { Inputs } from '../types'

export const defaultInputs: Inputs = {
  baseYear: 2026,
  members: {
    primary: { name: '世帯主', birthYear: 1990, birthMonth: 1, takeHomeIncome: 6_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    spouse: { name: '配偶者', birthYear: 1990, birthMonth: 1, takeHomeIncome: 3_000_000, workUntilAge: 65, phonePlan: '格安simスマホ' },
    children: [{
      id: 'c1', name: '第一子', birthYear: 2024, birthMonth: 4,
      schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 100_000 },
      allowanceMonthly: 0, phoneFromGrade: 6,
    }],
  },
  assets: {
    bankAccounts: [{ label: '普通預金', balance: 4_000_000 }],
    investments: [{ label: '証券口座', balance: 3_000_000 }],
  },
  housing: { type: '賃貸', rentMonthly: 150_000, loanMonthly: 0, loanRemainingYears: 0, repairReserveMonthly: 0, propertyTaxAnnual: 0, fireInsuranceAnnual: 0 },
  lifestyle: { electricType: 'ガス併用', internetMonthly: 4_000 },
  appliances: [
    { name: '冷蔵庫', price: 100_000, lastPurchaseYear: 2022, lifespanYears: 10 },
    { name: '洗濯機', price: 200_000, lastPurchaseYear: 2022, lifespanYears: 8 },
  ],
  homeMaintenance: [],
  assumptions: {
    investmentReturnRate: 5,
    returnRateOptimistic: 7,
    returnRatePessimistic: 2,
    inflationRate: 0,
    endAge: 95,
    annualInvestmentContribution: 600_000,
    pensionStartAge: 65,
    pensionAnnualPerPerson: 780_000,
  },
}
```

- [ ] **Step 4: `seedOverride.ts` を作成する**

```ts
// lifeplan/src/persistence/seedOverride.ts
import type { Inputs } from '../types'
import { defaultInputs as placeholderInputs } from './placeholderHousehold'

// 開発者がローカルにのみ置く実データ (gitignore 対象、Inputs 型準拠の JSON)。
// 無ければプレースホルダにフォールバックする。
const localSeeds = import.meta.glob('./seed.local.json', { eager: true }) as Record<string, { default: Inputs }>
const localSeedModule = Object.values(localSeeds)[0]

export const defaultInputs: Inputs = localSeedModule?.default ?? placeholderInputs
```

- [ ] **Step 5: `doc.ts` の import を切り替える**

`lifeplan/src/persistence/doc.ts` の5行目を変更:

```ts
// before
import { defaultInputs } from './defaultHousehold'
// after
import { defaultInputs } from './seedOverride'
```

- [ ] **Step 6: `.gitignore` にローカル実データファイルを追加する**

`lifeplan/.gitignore` に追記:

```
src/persistence/seed.local.json
```

- [ ] **Step 7: seedOverride のフォールバック単体テストを書く**

```ts
// lifeplan/tests/persistence/seedOverride.test.ts
import { describe, it, expect } from 'vitest'
import { defaultInputs } from '../../src/persistence/seedOverride'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'

describe('seedOverride', () => {
  it('ローカル seed.local.json が無ければプレースホルダにフォールバックする', () => {
    expect(defaultInputs).toEqual(placeholderInputs)
  })
})
```

- [ ] **Step 8: テストを実行し、すべて通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/persistence/doc.test.ts tests/persistence/seedOverride.test.ts`
Expected: PASS（全テスト green）

- [ ] **Step 9: 既存の全テスト・ゴールデン回帰が壊れていないことを確認する**

Run: `cd lifeplan && npm test`
Expected: PASS（既存81件 + 今回追加分が全て green。`defaultHousehold.ts` は無改変なのでゴールデン回帰は不変のはず）

- [ ] **Step 10: Commit**

```bash
cd lifeplan
git add src/persistence/placeholderHousehold.ts src/persistence/seedOverride.ts src/persistence/doc.ts .gitignore tests/persistence/doc.test.ts tests/persistence/seedOverride.test.ts
git commit -m "feat: bootstrap UI seed from a placeholder, not the golden-fixture real data"
```

---

## Task 2: Vite + React 雛形（scaffold）

**Files:**
- Create: `lifeplan/index.html`
- Create: `lifeplan/vite.config.ts`
- Create: `lifeplan/src/main.tsx`
- Create: `lifeplan/src/App.tsx`
- Create: `lifeplan/src/App.test.tsx`
- Create: `lifeplan/tests/setupTests.ts`
- Modify: `lifeplan/package.json`
- Modify: `lifeplan/tsconfig.json`
- Modify: `lifeplan/vitest.config.ts`
- Modify: `lifeplan/eslint.config.js`
- Modify: `lifeplan/.gitignore`
- Delete: `lifeplan/tsconfig.build.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: なし（このタスクは新規スキャフォールドのみ）
- Produces: `export function App()`（`src/App.tsx`、後続タスクで内容を差し替える）。`npm run dev`/`npm run build`/`npm run preview` が使えるようになる。

- [ ] **Step 1: 依存パッケージを追加する**

Run:
```bash
cd lifeplan
npm install react react-dom zustand recharts
npm install -D vite @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/react @types/react-dom
```

- [ ] **Step 2: 失敗するテストを書く（App の雛形）**

```tsx
// lifeplan/src/App.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the scaffold placeholder', () => {
    render(<App />)
    expect(screen.getByText('ライフプラン・ダッシュボード')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/App.test.tsx`
Expected: FAIL（`src/App.tsx` が存在しない、または jsx 変換未設定でエラー）

- [ ] **Step 4: `tsconfig.json` を更新する（JSX・DOM lib・型を追加）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 5: `tsconfig.build.json` を削除する**

`build` スクリプトが `tsc` から `vite build` に変わるため、ライブラリビルド専用の tsconfig は不要になる。

Run: `cd lifeplan && rm tsconfig.build.json`

- [ ] **Step 6: `vite.config.ts` を作成する**

```ts
// lifeplan/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 7: `index.html` を作成する**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>家計の羅針盤</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: `src/App.tsx` を作成する（このタスクではプレースホルダ）**

```tsx
// lifeplan/src/App.tsx
export function App() {
  return (
    <main>
      <p>ライフプラン・ダッシュボード</p>
    </main>
  )
}
```

- [ ] **Step 9: `src/main.tsx` を作成する**

```tsx
// lifeplan/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: `tests/setupTests.ts` を作成する（jest-dom matcher 登録）**

```ts
// lifeplan/tests/setupTests.ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 11: `vitest.config.ts` を更新する（jsdom・react plugin・e2e除外）**

```ts
// lifeplan/vitest.config.ts
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlob: [['**/*.test.tsx', 'jsdom']],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    setupFiles: ['./tests/setupTests.ts'],
  },
})
```

- [ ] **Step 12: `eslint.config.js` を更新する（.tsx を対象に含める）**

`files: ['**/*.ts']` を `files: ['**/*.ts', '**/*.tsx']` に変更:

```js
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // interface契約を満たすための意図的な未使用引数は `_` 接頭辞で許容する
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
```

- [ ] **Step 13: `package.json` のスクリプトを更新する**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run --exclude '**/*.integration.test.ts' --exclude '**/*.integration.test.tsx'",
    "test:integration": "vitest run integration",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

- [ ] **Step 14: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 15: dev サーバー・ビルドが動くことを手動確認する**

Run:
```bash
cd lifeplan
npm run build
npm run preview -- --port 4173 &
sleep 2
curl -sf http://localhost:4173/ | grep -q '家計の羅針盤' && echo "OK: title found"
kill %1
```
Expected: `dist/` が生成され、`OK: title found` が出力される。

- [ ] **Step 16: 既存の全テストが壊れていないことを確認する**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: PASS（既存82件 + 今回分。lintも通る）

- [ ] **Step 17: CI の `deliver` ジョブのアーティファクト名を更新する**

`.github/workflows/ci.yml` の `deliver` ジョブを変更（`engine-dist` → `web-dist`、コメントも更新）:

```yaml
  deliver:
    needs: [lint, typecheck, unit, integration]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v7
        with:
          name: web-dist
          path: lifeplan/dist
          if-no-files-found: error
      # 将来 (Firebase 実配線完了時): main への push で本番デプロイ
      # - name: Deploy to Firebase Hosting
      #   if: github.event_name == 'push' && github.ref == 'refs/heads/main'
      #   run: npx firebase deploy --only hosting --token "${{ secrets.FIREBASE_TOKEN }}"
```

- [ ] **Step 18: Commit**

```bash
git add lifeplan/index.html lifeplan/vite.config.ts lifeplan/src/main.tsx lifeplan/src/App.tsx lifeplan/src/App.test.tsx lifeplan/tests/setupTests.ts lifeplan/package.json lifeplan/package-lock.json lifeplan/tsconfig.json lifeplan/vitest.config.ts lifeplan/eslint.config.js .github/workflows/ci.yml
git rm lifeplan/tsconfig.build.json
git commit -m "feat: scaffold Vite + React app in lifeplan/, switch build to vite build"
```

---

## Task 3: テーマCSS + Header コンポーネント

**Files:**
- Create: `lifeplan/src/styles/theme.css`
- Create: `lifeplan/src/components/layout/Header.tsx`
- Create: `lifeplan/src/components/layout/Header.module.css`
- Test: `lifeplan/src/components/layout/Header.test.tsx`
- Modify: `lifeplan/src/main.tsx`（theme.css の import 追加）

**Interfaces:**
- Consumes: なし
- Produces: `export function Header()`（props無し）。CSS変数: `--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-text`, `--color-muted`, `--color-primary`, `--color-accent`, `--color-positive`, `--color-negative`, `--color-band`（後続タスクの CSS Modules が参照する）。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// lifeplan/src/components/layout/Header.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Header } from './Header'

describe('Header', () => {
  it('renders the app name', () => {
    render(<Header />)
    expect(screen.getByRole('heading', { name: '家計の羅針盤' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/layout/Header.test.tsx`
Expected: FAIL（`./Header` が存在しない）

- [ ] **Step 3: `theme.css` を作成する**

```css
/* lifeplan/src/styles/theme.css */
:root {
  --color-bg: #0b1f2a;
  --color-surface: #12303f;
  --color-surface-alt: #16394a;
  --color-text: #eef4f7;
  --color-muted: #9fb4bd;
  --color-primary: #1f7a8c;
  --color-accent: #5bbccb;
  --color-positive: #4caf82;
  --color-negative: #e2665b;
  --color-band: #5bbccb;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic', sans-serif;
}
```

- [ ] **Step 4: `Header.module.css` を作成する**

```css
/* lifeplan/src/components/layout/Header.module.css */
.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-surface-alt);
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 900;
}

.title {
  font-size: 1.1rem;
  margin: 0;
  font-weight: 700;
}
```

- [ ] **Step 5: `Header.tsx` を実装する**

```tsx
// lifeplan/src/components/layout/Header.tsx
import styles from './Header.module.css'

export function Header() {
  return (
    <header className={styles.header}>
      <span className={styles.logo}>¥</span>
      <h1 className={styles.title}>家計の羅針盤</h1>
    </header>
  )
}
```

- [ ] **Step 6: `main.tsx` に `theme.css` の import を追加する**

```tsx
// lifeplan/src/main.tsx （import 部分に1行追加）
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/theme.css'
```

- [ ] **Step 7: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/layout/Header.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd lifeplan
git add src/styles/theme.css src/components/layout/Header.tsx src/components/layout/Header.module.css src/components/layout/Header.test.tsx src/main.tsx
git commit -m "feat: add theme tokens and Header component"
```

---

## Task 4: householdStore（Zustand ブートストラップ）

**Files:**
- Create: `lifeplan/src/store/householdStore.ts`
- Test: `lifeplan/tests/store/householdStore.test.ts`

**Interfaces:**
- Consumes: `HouseholdRepository`/`InMemoryHouseholdRepository`（`src/persistence/repository.ts`）、`createDefaultDoc`（`src/persistence/doc.ts`）、`HouseholdDoc`（`src/persistence/types.ts`）
- Produces: `export const HOUSEHOLD_ID = 'primary'`、`export const defaultRepository: HouseholdRepository`、`export const useHouseholdStore`（Zustand hook。state shape: `{ doc: HouseholdDoc | null; status: 'loading' | 'ready' | 'error'; error: unknown; load: (repository?: HouseholdRepository) => Promise<void> }`）。後続タスク（selectors 呼び出し側・App）が `useHouseholdStore` を使う。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// lifeplan/tests/store/householdStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../src/store/householdStore'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'
import type { HouseholdDoc } from '../../src/persistence/types'

describe('useHouseholdStore', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null })
  })

  it('bootstraps a default doc when the repository has none', async () => {
    const repository = new InMemoryHouseholdRepository()
    await useHouseholdStore.getState().load(repository)
    const state = useHouseholdStore.getState()
    expect(state.status).toBe('ready')
    expect(state.doc?.activeScenarioId).toBe('base')
    expect(await repository.load(HOUSEHOLD_ID)).not.toBeNull()
  })

  it('loads an existing doc without overwriting it', async () => {
    const repository = new InMemoryHouseholdRepository()
    const seeded: HouseholdDoc = {
      schemaVersion: 1,
      baseYear: 2030,
      activeScenarioId: 'base',
      scenarios: [{ id: 'base', name: 'X', inputs: { ...placeholderInputs, baseYear: 2030 } }],
      actuals: [],
    }
    await repository.save(HOUSEHOLD_ID, seeded)

    await useHouseholdStore.getState().load(repository)

    expect(useHouseholdStore.getState().doc?.baseYear).toBe(2030)
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/store/householdStore.test.ts`
Expected: FAIL（`../../src/store/householdStore` が存在しない）

- [ ] **Step 3: `householdStore.ts` を実装する**

```ts
// lifeplan/src/store/householdStore.ts
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
  load: (repository?: HouseholdRepository) => Promise<void>
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  doc: null,
  status: 'loading',
  error: null,
  load: async (repository = defaultRepository) => {
    set({ status: 'loading', error: null })
    try {
      const existing = await repository.load(HOUSEHOLD_ID)
      const doc = existing ?? (await repository.save(HOUSEHOLD_ID, createDefaultDoc()))
      repository.subscribe(HOUSEHOLD_ID, (next) => {
        if (next) set({ doc: next, status: 'ready' })
      })
      set({ doc, status: 'ready' })
    } catch (error) {
      set({ status: 'error', error })
    }
  },
}))
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/store/householdStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd lifeplan
git add src/store/householdStore.ts tests/store/householdStore.test.ts
git commit -m "feat: add Zustand household store with InMemory bootstrap"
```

---

## Task 5: selectors（エンジン派生値・イベントマーカー）

**Files:**
- Create: `lifeplan/src/store/selectors.ts`
- Test: `lifeplan/tests/store/selectors.test.ts`

**Interfaces:**
- Consumes: `simulate`（`src/engine/simulate.ts`）、`requiredMonthlyInvestment`（`src/engine/goalSeek.ts`）、`computeVariance`・`VariancePoint`（`src/engine/variance.ts`）、`lifeplanMaster`（`src/masterData/index.ts`）、`HouseholdDoc`・`Scenario`（`src/persistence/types.ts`）、`Inputs`・`YearRow`（`src/types.ts`）
- Produces: `export interface KpiSummary`, `export interface EventMarker`, `export interface ChartPoint`, `export interface DashboardData`, `export function selectActiveScenario(doc): Scenario`, `export function selectDashboardData(doc): DashboardData`, `export function computeKpiSummary(inputs, central): KpiSummary`, `export function computeEventMarkers(rows, inputs): EventMarker[]`, `export function buildChartSeries(central, optimistic, pessimistic): ChartPoint[]`。後続タスク（KpiCards/AssetChart/BreakdownTabs/Dashboard/App）はこれらの型・関数を使う。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// lifeplan/tests/store/selectors.test.ts
import { describe, it, expect } from 'vitest'
import {
  selectDashboardData,
  computeKpiSummary,
  computeEventMarkers,
  buildChartSeries,
} from '../../src/store/selectors'
import { createDefaultDoc } from '../../src/persistence/doc'
import { simulate } from '../../src/engine/simulate'
import { lifeplanMaster } from '../../src/masterData'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'

describe('selectDashboardData', () => {
  it('中央/楽観/悲観の3系列と KPI・イベントマーカー・チャート系列を返す', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)

    expect(data.central.length).toBeGreaterThan(0)
    expect(data.optimistic.length).toBe(data.central.length)
    expect(data.pessimistic.length).toBe(data.central.length)
    expect(data.variance).toBeNull() // baseline 未キャプチャ
    expect(data.chartSeries.length).toBe(data.central.length)
    expect(data.kpi.endTotalAssets).toBe(data.central[data.central.length - 1]!.totalAssets)
  })
})

describe('computeKpiSummary', () => {
  it('資産が尽きない場合 assetsDepletionYear は null', () => {
    const central = simulate(placeholderInputs, lifeplanMaster)
    const kpi = computeKpiSummary(placeholderInputs, central)
    const neverNegative = central.every(r => r.totalAssets >= 0)
    expect(kpi.assetsDepletionYear === null).toBe(neverNegative)
  })
})

describe('computeEventMarkers', () => {
  it('退職年に退職マーカーを含む', () => {
    const rows = simulate(placeholderInputs, lifeplanMaster)
    const markers = computeEventMarkers(rows, placeholderInputs)
    const retirementYear = placeholderInputs.members.primary.birthYear + placeholderInputs.members.primary.workUntilAge
    expect(markers.some(m => m.kind === 'retirement' && m.year === retirementYear)).toBe(true)
  })
})

describe('buildChartSeries', () => {
  it('中央/楽観/悲観から year ごとの band(=optimistic-pessimistic) を計算する', () => {
    const central = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.investmentReturnRate })
    const optimistic = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.returnRateOptimistic })
    const pessimistic = simulate(placeholderInputs, lifeplanMaster, { returnRate: placeholderInputs.assumptions.returnRatePessimistic })
    const series = buildChartSeries(central, optimistic, pessimistic)
    expect(series[0]!.band).toBeCloseTo(optimistic[0]!.totalAssets - pessimistic[0]!.totalAssets)
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: FAIL（`../../src/store/selectors` が存在しない）

- [ ] **Step 3: `selectors.ts` を実装する**

```ts
// lifeplan/src/store/selectors.ts
import type { HouseholdDoc, Scenario } from '../persistence/types'
import type { Inputs, YearRow } from '../types'
import type { VariancePoint } from '../engine/variance'
import { simulate } from '../engine/simulate'
import { requiredMonthlyInvestment } from '../engine/goalSeek'
import { computeVariance } from '../engine/variance'
import { lifeplanMaster } from '../masterData'

const SCHOOL_GRADE_AGES = [6, 12, 15, 18]

export interface KpiSummary {
  currentTotalAssets: number
  endTotalAssets: number
  assetsDepletionYear: number | null
  requiredMonthlyInvestment: number | null
  coastFireRatio: number
}

export interface EventMarker {
  year: number
  label: string
  kind: 'appliance' | 'home' | 'retirement' | 'pension' | 'school'
}

export interface ChartPoint {
  year: number
  age: number
  central: number
  optimistic: number
  pessimistic: number
  band: number
}

export interface DashboardData {
  scenario: Scenario
  central: YearRow[]
  optimistic: YearRow[]
  pessimistic: YearRow[]
  kpi: KpiSummary
  variance: VariancePoint[] | null
  eventMarkers: EventMarker[]
  chartSeries: ChartPoint[]
}

export function selectActiveScenario(doc: HouseholdDoc): Scenario {
  const scenario = doc.scenarios.find(s => s.id === doc.activeScenarioId)
  if (!scenario) throw new Error(`active scenario not found: ${doc.activeScenarioId}`)
  return scenario
}

export function selectDashboardData(doc: HouseholdDoc): DashboardData {
  const scenario = selectActiveScenario(doc)
  const inputs = scenario.inputs
  const actuals = doc.actuals

  const central = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.investmentReturnRate })
  const optimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRateOptimistic })
  const pessimistic = simulate(inputs, lifeplanMaster, { actuals, returnRate: inputs.assumptions.returnRatePessimistic })

  return {
    scenario,
    central,
    optimistic,
    pessimistic,
    kpi: computeKpiSummary(inputs, central),
    variance: doc.baseline ? computeVariance(doc.baseline, actuals) : null,
    eventMarkers: computeEventMarkers(central, inputs),
    chartSeries: buildChartSeries(central, optimistic, pessimistic),
  }
}

export function computeKpiSummary(inputs: Inputs, central: YearRow[]): KpiSummary {
  const firstRow = central[0]
  if (!firstRow) throw new Error('simulate returned an empty series')
  const lastRow = central[central.length - 1]!
  const latestActual = [...central].reverse().find(r => r.isActual)
  const currentRow = latestActual ?? firstRow
  const depletion = central.find(r => r.totalAssets < 0)

  return {
    currentTotalAssets: currentRow.totalAssets,
    endTotalAssets: lastRow.totalAssets,
    assetsDepletionYear: depletion?.year ?? null,
    requiredMonthlyInvestment: requiredMonthlyInvestment(inputs, lifeplanMaster),
    coastFireRatio: currentRow.coastFireNumber !== 0 ? currentRow.investmentBalance / currentRow.coastFireNumber : 0,
  }
}

export function computeEventMarkers(rows: YearRow[], inputs: Inputs): EventMarker[] {
  const markers: EventMarker[] = []
  for (const row of rows) {
    if (row.expenses.家電 > 0) markers.push({ year: row.year, label: '家電買い替え', kind: 'appliance' })
    if (row.expenses.住宅大型 > 0) markers.push({ year: row.year, label: '住宅大型支出', kind: 'home' })
    if (row.agePrimary === inputs.members.primary.workUntilAge) markers.push({ year: row.year, label: '退職', kind: 'retirement' })
    if (row.agePrimary === inputs.assumptions.pensionStartAge) markers.push({ year: row.year, label: '年金開始', kind: 'pension' })
    if (row.agesChildren.some(age => SCHOOL_GRADE_AGES.includes(age))) {
      markers.push({ year: row.year, label: '子の進学/卒業', kind: 'school' })
    }
  }
  return markers
}

export function buildChartSeries(central: YearRow[], optimistic: YearRow[], pessimistic: YearRow[]): ChartPoint[] {
  return central.map((row, i) => {
    const opt = optimistic[i]!.totalAssets
    const pess = pessimistic[i]!.totalAssets
    return {
      year: row.year,
      age: row.agePrimary,
      central: row.totalAssets,
      optimistic: opt,
      pessimistic: pess,
      band: opt - pess,
    }
  })
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run tests/store/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd lifeplan
git add src/store/selectors.ts tests/store/selectors.test.ts
git commit -m "feat: derive dashboard KPIs, chart series, and event markers from YearRow[]"
```

---

## Task 6: KpiCards コンポーネント

**Files:**
- Create: `lifeplan/src/components/dashboard/KpiCards.tsx`
- Create: `lifeplan/src/components/dashboard/KpiCards.module.css`
- Test: `lifeplan/src/components/dashboard/KpiCards.test.tsx`

**Interfaces:**
- Consumes: `KpiSummary`（`src/store/selectors.ts`）
- Produces: `export function KpiCards({ kpi }: { kpi: KpiSummary })`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// lifeplan/src/components/dashboard/KpiCards.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { KpiCards } from './KpiCards'
import type { KpiSummary } from '../../store/selectors'

const kpi: KpiSummary = {
  currentTotalAssets: 10_000_000,
  endTotalAssets: -500_000,
  assetsDepletionYear: 2058,
  requiredMonthlyInvestment: 80_000,
  coastFireRatio: 0.42,
}

describe('KpiCards', () => {
  it('renders formatted KPI values', () => {
    render(<KpiCards kpi={kpi} />)
    expect(screen.getByText('¥10,000,000')).toBeInTheDocument()
    expect(screen.getByText('¥-500,000')).toBeInTheDocument()
    expect(screen.getByText('2058年')).toBeInTheDocument()
    expect(screen.getByText('¥80,000/月')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('shows a lifelong-surplus badge when assets never deplete', () => {
    render(<KpiCards kpi={{ ...kpi, assetsDepletionYear: null }} />)
    expect(screen.getByText('生涯黒字')).toBeInTheDocument()
  })

  it('shows a fallback when the required monthly investment is infeasible', () => {
    render(<KpiCards kpi={{ ...kpi, requiredMonthlyInvestment: null }} />)
    expect(screen.getByText('計算不可')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/KpiCards.test.tsx`
Expected: FAIL（`./KpiCards` が存在しない）

- [ ] **Step 3: `KpiCards.module.css` を作成する**

```css
/* lifeplan/src/components/dashboard/KpiCards.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
  margin: 0;
}

.card {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
}

.card dt {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-bottom: 0.25rem;
}

.card dd {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.positive { color: var(--color-positive); }
.negative { color: var(--color-negative); }

.badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--color-positive);
  color: #fff;
  font-size: 0.85rem;
}

.progress {
  display: block;
  width: 100%;
  margin-top: 0.4rem;
  accent-color: var(--color-accent);
}

@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: `KpiCards.tsx` を実装する**

```tsx
// lifeplan/src/components/dashboard/KpiCards.tsx
import type { KpiSummary } from '../../store/selectors'
import styles from './KpiCards.module.css'

function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}

export function KpiCards({ kpi }: { kpi: KpiSummary }) {
  const isSurplus = kpi.endTotalAssets >= 0

  return (
    <dl className={styles.grid}>
      <div className={styles.card}>
        <dt>現在の総資産</dt>
        <dd>{formatYen(kpi.currentTotalAssets)}</dd>
      </div>
      <div className={styles.card}>
        <dt>終了年齢時点の総資産</dt>
        <dd className={isSurplus ? styles.positive : styles.negative}>{formatYen(kpi.endTotalAssets)}</dd>
      </div>
      <div className={styles.card}>
        <dt>資産が尽きる年</dt>
        <dd>
          {kpi.assetsDepletionYear ? `${kpi.assetsDepletionYear}年` : <span className={styles.badge}>生涯黒字</span>}
        </dd>
      </div>
      <div className={styles.card}>
        <dt>推奨される毎月の積立額</dt>
        <dd>{kpi.requiredMonthlyInvestment != null ? `${formatYen(kpi.requiredMonthlyInvestment)}/月` : '計算不可'}</dd>
      </div>
      <div className={styles.card}>
        <dt>コーストFIRE達成率</dt>
        <dd>
          {(kpi.coastFireRatio * 100).toFixed(0)}%
          <progress className={styles.progress} value={Math.min(kpi.coastFireRatio, 1)} max={1} />
        </dd>
      </div>
    </dl>
  )
}
```

- [ ] **Step 5: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/KpiCards.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd lifeplan
git add src/components/dashboard/KpiCards.tsx src/components/dashboard/KpiCards.module.css src/components/dashboard/KpiCards.test.tsx
git commit -m "feat: add KpiCards component"
```

---

## Task 7: AssetChart コンポーネント（メイングラフ）

**Files:**
- Create: `lifeplan/src/components/dashboard/AssetChart.tsx`
- Create: `lifeplan/src/components/dashboard/AssetChart.module.css`
- Test: `lifeplan/src/components/dashboard/AssetChart.test.tsx`
- Modify: `lifeplan/tests/setupTests.ts`（Recharts の `ResponsiveContainer` を jsdom で計測可能にする）

**Interfaces:**
- Consumes: `ChartPoint`・`EventMarker`（`src/store/selectors.ts`）
- Produces: `export function AssetChart({ series, eventMarkers }: { series: ChartPoint[]; eventMarkers: EventMarker[] })`

- [ ] **Step 1: `tests/setupTests.ts` に jsdom 計測モックを追加する**

Recharts の `ResponsiveContainer` は要素サイズを `getBoundingClientRect`/`ResizeObserver` で測るが、jsdom はデフォルトで幅・高さ0を返すため、モックしないとSVGが描画されない。

```ts
// lifeplan/tests/setupTests.ts
import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom has no ResizeObserver
globalThis.ResizeObserver = ResizeObserverMock

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} }),
})
```

- [ ] **Step 2: 失敗するテストを書く**

```tsx
// lifeplan/src/components/dashboard/AssetChart.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AssetChart } from './AssetChart'
import type { ChartPoint, EventMarker } from '../../store/selectors'

const series: ChartPoint[] = [
  { year: 2026, age: 34, central: 1_000_000, optimistic: 1_100_000, pessimistic: 900_000, band: 200_000 },
  { year: 2027, age: 35, central: 1_200_000, optimistic: 1_400_000, pessimistic: 1_000_000, band: 400_000 },
]
const eventMarkers: EventMarker[] = [{ year: 2027, label: '退職', kind: 'retirement' }]

describe('AssetChart', () => {
  it('renders an SVG chart with the event marker label', () => {
    const { container } = render(<AssetChart series={series} eventMarkers={eventMarkers} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText('退職')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/AssetChart.test.tsx`
Expected: FAIL（`./AssetChart` が存在しない）

- [ ] **Step 4: `AssetChart.module.css` を作成する**

```css
/* lifeplan/src/components/dashboard/AssetChart.module.css */
.container {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
}
```

- [ ] **Step 5: `AssetChart.tsx` を実装する**

```tsx
// lifeplan/src/components/dashboard/AssetChart.tsx
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { ChartPoint, EventMarker } from '../../store/selectors'
import styles from './AssetChart.module.css'

function yenTick(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万`
}

export function AssetChart({ series, eventMarkers }: { series: ChartPoint[]; eventMarkers: EventMarker[] }) {
  const ageByYear = new Map(series.map(p => [p.year, p.age]))

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={series} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
          <XAxis dataKey="year" tickFormatter={(year: number) => `${year}/${ageByYear.get(year) ?? ''}歳`} />
          <YAxis tickFormatter={yenTick} width={64} />
          <Tooltip formatter={(value: number) => yenTick(value)} />
          <Area dataKey="pessimistic" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area dataKey="band" stackId="band" stroke="none" fill="var(--color-band)" fillOpacity={0.2} isAnimationActive={false} />
          <Line dataKey="central" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
          {eventMarkers.map((marker, i) => (
            <ReferenceLine
              key={`${marker.year}-${marker.kind}-${i}`}
              x={marker.year}
              stroke="var(--color-accent)"
              strokeDasharray="4 4"
              label={{ value: marker.label, position: 'top', fontSize: 10, fill: 'var(--color-muted)' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 6: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/AssetChart.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd lifeplan
git add src/components/dashboard/AssetChart.tsx src/components/dashboard/AssetChart.module.css src/components/dashboard/AssetChart.test.tsx tests/setupTests.ts
git commit -m "feat: add AssetChart with optimistic/pessimistic band and event markers"
```

---

## Task 8: BreakdownTabs コンポーネント（内訳ビュー）

**Files:**
- Create: `lifeplan/src/components/dashboard/BreakdownTabs.tsx`
- Create: `lifeplan/src/components/dashboard/BreakdownTabs.module.css`
- Test: `lifeplan/src/components/dashboard/BreakdownTabs.test.tsx`

**Interfaces:**
- Consumes: `YearRow`（`src/types.ts`）
- Produces: `export function BreakdownTabs({ rows }: { rows: YearRow[] })`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// lifeplan/src/components/dashboard/BreakdownTabs.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BreakdownTabs } from './BreakdownTabs'
import type { YearRow } from '../../types'

function makeRow(year: number, annualCashFlow: number, investmentBalance: number, cashBalance: number): YearRow {
  return {
    year, agePrimary: 34, ageSpouse: 33, agesChildren: [2],
    income: 5_000_000,
    expenses: { 食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0, こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0 },
    totalExpense: 0,
    annualCashFlow,
    investmentContribution: 0,
    investmentReturn: 0,
    investmentBalance,
    cashBalance,
    totalAssets: investmentBalance + cashBalance,
    investmentRatio: 0.5,
    coastFireNumber: 1,
    isActual: false,
  }
}

const rows: YearRow[] = [
  makeRow(2026, 500_000, 1_000_000, 100_000),
  makeRow(2027, -200_000, 1_200_000, -50_000),
]

describe('BreakdownTabs', () => {
  it('defaults to the balance tab and switches to cashflow on click', () => {
    render(<BreakdownTabs rows={rows} />)
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: '単年度収支' }))

    expect(screen.getByRole('tab', { name: '単年度収支' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toHaveAttribute('aria-selected', 'false')
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/BreakdownTabs.test.tsx`
Expected: FAIL（`./BreakdownTabs` が存在しない）

- [ ] **Step 3: `BreakdownTabs.module.css` を作成する**

```css
/* lifeplan/src/components/dashboard/BreakdownTabs.module.css */
.container {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 1rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
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

- [ ] **Step 4: `BreakdownTabs.tsx` を実装する**

```tsx
// lifeplan/src/components/dashboard/BreakdownTabs.tsx
import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { YearRow } from '../../types'
import styles from './BreakdownTabs.module.css'

type Tab = 'balance' | 'cashflow'

export function BreakdownTabs({ rows }: { rows: YearRow[] }) {
  const [tab, setTab] = useState<Tab>('balance')
  const data = rows.map(r => ({ year: r.year, cash: r.cashBalance, investment: r.investmentBalance, cashFlow: r.annualCashFlow }))

  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'balance'} className={styles.tab} onClick={() => setTab('balance')}>
          現金 vs 投資
        </button>
        <button type="button" role="tab" aria-selected={tab === 'cashflow'} className={styles.tab} onClick={() => setTab('cashflow')}>
          単年度収支
        </button>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        {tab === 'balance' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
            <XAxis dataKey="year" />
            <YAxis />
            <Tooltip />
            <Area dataKey="cash" stackId="assets" stroke="none" fill="var(--color-accent)" isAnimationActive={false} />
            <Area dataKey="investment" stackId="assets" stroke="none" fill="var(--color-primary)" isAnimationActive={false} />
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-alt)" />
            <XAxis dataKey="year" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="cashFlow" isAnimationActive={false}>
              {data.map(d => (
                <Cell key={d.year} fill={d.cashFlow >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 5: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/BreakdownTabs.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd lifeplan
git add src/components/dashboard/BreakdownTabs.tsx src/components/dashboard/BreakdownTabs.module.css src/components/dashboard/BreakdownTabs.test.tsx
git commit -m "feat: add BreakdownTabs component (balance / cashflow views)"
```

---

## Task 9: Dashboard 合成 + App 配線

**Files:**
- Create: `lifeplan/src/components/dashboard/Dashboard.tsx`
- Create: `lifeplan/src/components/dashboard/Dashboard.module.css`
- Create: `lifeplan/src/components/dashboard/Dashboard.test.tsx`
- Modify: `lifeplan/src/App.tsx`
- Rename+Modify: `lifeplan/src/App.test.tsx` → `lifeplan/src/App.integration.test.tsx`（Task 2 のプレースホルダテストを置き換える）

**Interfaces:**
- Consumes: `DashboardData`（`src/store/selectors.ts`）、`KpiCards`/`AssetChart`/`BreakdownTabs`（Task 6-8）、`Header`（Task 3）、`useHouseholdStore`/`selectDashboardData`（Task 4-5）
- Produces: `export function Dashboard({ data }: { data: DashboardData })`。`App` はブートストラップ完了後にこれを描画する。

- [ ] **Step 1: 失敗するテストを書く（Dashboard）**

```tsx
// lifeplan/src/components/dashboard/Dashboard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Dashboard } from './Dashboard'
import { selectDashboardData } from '../../store/selectors'
import { createDefaultDoc } from '../../persistence/doc'

describe('Dashboard', () => {
  it('renders KPI cards and the chart for the default household', () => {
    const doc = createDefaultDoc()
    const data = selectDashboardData(doc)
    render(<Dashboard data={data} />)

    expect(screen.getByText('現在の総資産')).toBeInTheDocument()
    expect(document.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '現金 vs 投資' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: FAIL（`./Dashboard` が存在しない）

- [ ] **Step 3: `Dashboard.module.css` を作成する**

```css
/* lifeplan/src/components/dashboard/Dashboard.module.css */
.main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}
```

- [ ] **Step 4: `Dashboard.tsx` を実装する**

```tsx
// lifeplan/src/components/dashboard/Dashboard.tsx
import { KpiCards } from './KpiCards'
import { AssetChart } from './AssetChart'
import { BreakdownTabs } from './BreakdownTabs'
import type { DashboardData } from '../../store/selectors'
import styles from './Dashboard.module.css'

export function Dashboard({ data }: { data: DashboardData }) {
  return (
    <main className={styles.main}>
      <KpiCards kpi={data.kpi} />
      <AssetChart series={data.chartSeries} eventMarkers={data.eventMarkers} />
      <BreakdownTabs rows={data.central} />
    </main>
  )
}
```

- [ ] **Step 5: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/components/dashboard/Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 6: 失敗するテストを書く（App の実配線、Task 2 のプレースホルダテストを置き換え）**

`lifeplan/src/App.test.tsx` を削除し、`lifeplan/src/App.integration.test.tsx` を新規作成する:

```tsx
// lifeplan/src/App.integration.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from './App'
import { useHouseholdStore } from './store/householdStore'

describe('App', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null })
  })

  it('bootstraps the default household and renders the dashboard', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '家計の羅針盤' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: テストを実行し、失敗することを確認する**

Run:
```bash
cd lifeplan
rm src/App.test.tsx
npx vitest run src/App.integration.test.tsx
```
Expected: FAIL（`App` がまだ Task 2 のプレースホルダのまま）

- [ ] **Step 8: `App.tsx` を実配線する**

```tsx
// lifeplan/src/App.tsx
import { useEffect, useMemo } from 'react'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { useHouseholdStore } from './store/householdStore'
import { selectDashboardData } from './store/selectors'

export function App() {
  const { doc, status, load } = useHouseholdStore()

  useEffect(() => {
    load()
  }, [load])

  const data = useMemo(() => (doc ? selectDashboardData(doc) : null), [doc])

  return (
    <>
      <Header />
      {status === 'error' && <p role="alert">データの読み込みに失敗しました</p>}
      {status !== 'error' && !data && <p>読み込み中...</p>}
      {data && <Dashboard data={data} />}
    </>
  )
}
```

- [ ] **Step 9: テストを実行し、通ることを確認する**

Run: `cd lifeplan && npx vitest run src/App.integration.test.tsx`
Expected: PASS

- [ ] **Step 10: `test:integration` に含まれることを確認する**

Run: `cd lifeplan && npm run test:integration`
Expected: `App.integration.test.tsx`・`golden.integration.test.ts` 等が実行され、すべて PASS

- [ ] **Step 11: 全テスト・型・lintを確認する**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
cd lifeplan
git add src/components/dashboard/Dashboard.tsx src/components/dashboard/Dashboard.module.css src/components/dashboard/Dashboard.test.tsx src/App.tsx src/App.integration.test.tsx
git commit -m "feat: compose Dashboard and wire App to the household store"
```

---

## Task 10: Playwright e2e スモークテスト + CI 統合

**Files:**
- Create: `lifeplan/playwright.config.ts`
- Create: `lifeplan/tests/e2e/dashboard.spec.ts`
- Modify: `lifeplan/package.json`
- Modify: `lifeplan/.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: `npm run build` / `npm run preview` の成果物（Task 2 で追加済み）、Dashboard の表示テキスト（Task 6-9 で実装済み: 「家計の羅針盤」「現在の総資産」「推奨される毎月の積立額」「単年度収支」タブ）
- Produces: `npm run test:e2e`

- [ ] **Step 1: Playwright を追加する**

Run: `cd lifeplan && npm install -D @playwright/test && npx playwright install --with-deps chromium`

- [ ] **Step 2: `playwright.config.ts` を作成する**

```ts
// lifeplan/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: 'npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: 失敗する e2e テストを書く**

```ts
// lifeplan/tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test('dashboard renders KPI cards, main chart, and breakdown tabs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '家計の羅針盤' })).toBeVisible()
  await expect(page.getByText('現在の総資産')).toBeVisible()
  await expect(page.getByText('推奨される毎月の積立額')).toBeVisible()
  await expect(page.locator('svg').first()).toBeVisible()

  await page.getByRole('tab', { name: '単年度収支' }).click()
  await expect(page.getByRole('tab', { name: '単年度収支' })).toHaveAttribute('aria-selected', 'true')
})
```

- [ ] **Step 4: `package.json` に `test:e2e` を追加する**

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```
（既存の `scripts` オブジェクトに1行追加する。他のキーは変更しない）

- [ ] **Step 5: `.gitignore` に Playwright の出力ディレクトリを追加する**

```
playwright-report/
test-results/
```

- [ ] **Step 6: e2e テストを実行し、通ることを確認する**

Run: `cd lifeplan && npm run build && npm run test:e2e`
Expected: PASS（`webServer` 設定により `vite preview` が自動起動し、テスト後に自動終了する）

- [ ] **Step 7: CI に `e2e` ジョブを追加する**

`.github/workflows/ci.yml` の `deliver` ジョブの直前に追加:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
```

- [ ] **Step 8: `CONTRIBUTING.md` を更新する**

`## CI/CD` の箇条書きに e2e ジョブの説明を1行追加し、「ローカルでの確認（push 前）」のコマンド例に `npm run test:e2e` を追加する:

```markdown
- テスト分類: 結合は `*.integration.test.ts`（`simulate`/`golden`）。それ以外は単体。
  - 単体: `npm run test:unit` / 結合: `npm run test:integration` / 全件: `npm test`
  - e2e（ブラウザ・スモーク）: `npm run test:e2e`（`e2e` ジョブ。ログイン画面が無いため認証不要で決定論的に実行できる）
```

```bash
cd lifeplan
npm ci
npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e
```

- [ ] **Step 9: main 保護の必須チェックへの追記を明記する**

`## main 保護` の箇条書きに追記:

```markdown
- branch protection: PR 必須・直 push 禁止・必須チェック（`lint`/`typecheck`/`unit`/`integration`/`e2e`）・linear history。
```

（実際の GitHub branch protection 設定への反映はリポジトリ設定操作のため、ユーザーが GitHub 上で行う。本ステップはドキュメント更新のみ）

- [ ] **Step 10: Commit**

```bash
git add lifeplan/playwright.config.ts lifeplan/tests/e2e/dashboard.spec.ts lifeplan/package.json lifeplan/package-lock.json lifeplan/.gitignore .github/workflows/ci.yml CONTRIBUTING.md
git commit -m "test: add Playwright smoke e2e for the dashboard and wire it into CI"
```

---

## 完了条件（このプランの合格ライン）

- 既存の単体/結合テスト（81件+新規分）とゴールデンマスター回帰が green（`npm test`）
- `npm run typecheck`・`npm run lint` が通る
- `npm run build` が成功し、`npm run preview` でダッシュボードが表示される
- `npm run test:e2e` が green
- `defaultHousehold.ts`（ゴールデン回帰用の実データ）は無改変
- CI（`lint`/`typecheck`/`unit`/`integration`/`e2e`/`deliver`）が green
