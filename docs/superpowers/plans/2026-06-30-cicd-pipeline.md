# CI/CD パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kaaaichi/lifeplan` に GitHub Actions ベースの CI/CD（lint / typecheck / 単体 / 結合 / デリバリー）を構築し、トランクベース開発フロー（短命ブランチ→PR→必須チェック→squash merge）を確立する。

**Architecture:** リポジトリ直下 `.github/workflows/ci.yml` の 5 ジョブ（lint・typecheck・unit・integration・deliver）。npm 系は `lifeplan/` サブディレクトリで実行。テストは命名規約 `*.integration.test.ts` で単体/結合を分離。デリバリーは現状ビルド成果物（`dist/`）を artifact 化（将来 Firebase デプロイへ拡張）。

**Tech Stack:** GitHub Actions（checkout@v7 / setup-node@v6 / upload-artifact@v7）、Node 24 LTS、TypeScript 6、Vitest 4、ESLint 10 + typescript-eslint 8。

仕様の源泉: `docs/superpowers/specs/2026-06-30-cicd-pipeline-design.md`

## Global Constraints

- バージョンは可能な限り最新（実装時 `@latest` で導入し lock に固定）: **typescript `^6.0.3`** / **vitest `^4.1.9`** / **eslint `^10.6.0`** / **typescript-eslint `^8.62.1`** / **@eslint/js `^10.0.1`** / **globals 最新**。CI Node = **24**。Actions = checkout@v7 / setup-node@v6 / upload-artifact@v7。
- エンジンのロジックは変更しない。**golden 回帰の数値は不変**（2027–2060 で対 golden ≈0%、全テスト green を維持）。
- npm 系コマンドは `lifeplan/`（= `/Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan`）で実行。ワークフローはリポジトリ直下 `.github/workflows/`。
- **トランクベースのドッグフーディング**: この CI/CD 作業自体を短命ブランチ `chore/cicd-setup` で行い、PR 経由で `main` に squash merge する（コントローラがブランチ作成・PR・マージを管理。各タスクのコミットはこのブランチに積む）。
- `main` 直 push はこの作業の最後（保護設定後）には行わない。設定前の中間コミットはブランチ上のみ。
- `.superpowers/`・`node_modules/`・`dist/`・xlsx はコミットしない。

---

## File Structure

- `lifeplan/package.json` — devDeps バージョン更新＋ lint/test:unit/test:integration/build スクリプト追加
- `lifeplan/eslint.config.js` — ESLint flat config（新規）
- `lifeplan/tsconfig.build.json` — emit 用 tsconfig（新規）
- `lifeplan/.gitignore` — `dist/` を追記
- `lifeplan/tests/simulate.integration.test.ts` — `simulate.test.ts` をリネーム
- `lifeplan/tests/golden.integration.test.ts` — `golden.test.ts` をリネーム
- `.github/workflows/ci.yml` — CI/CD ワークフロー（新規）
- `CONTRIBUTING.md` — トランクベース開発フロー＋ branch protection 手順（新規、リポジトリ直下）

---

## Task 1: 依存をメジャー更新（TypeScript 6 / Vitest 4）して全 green を確認

**Files:**
- Modify: `lifeplan/package.json`（devDependencies の typescript / vitest）

**Interfaces:**
- Consumes: 既存の 34 テスト・`npm run typecheck`
- Produces: TS6 / Vitest4 で green な状態（後続タスクの土台）

- [ ] **Step 1: 現状の全テストと型チェックが green なことを記録（ベースライン）**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run typecheck && npm test`
Expected: typecheck エラーなし、`Tests 34 passed`

- [ ] **Step 2: typescript と vitest を最新メジャーへ更新**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npm install -D typescript@latest vitest@latest
```
Expected: `package.json` の devDependencies が `typescript` `^6.x`、`vitest` `^4.x` に更新され、`package-lock.json` が更新される。

- [ ] **Step 3: 型チェック実行（破壊があれば最小修正）**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run typecheck`
Expected: エラーなし。
もしエラーが出たら（TS6 の厳格化等）: エラー箇所を読み、**エンジンのロジックを変えずに**型注釈・設定で最小修正する。`tsconfig.json` の `types: ["vitest/globals"]` が解決できない場合は Vitest4 の globals 型エントリ（`vitest/globals` のまま、または `vitest` の types 構成）を確認して修正。修正後に再実行して green を確認する。

- [ ] **Step 4: 全テスト実行（破壊があれば最小修正）**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm test`
Expected: `Tests 34 passed`。golden の相対誤差が 2027/2040/2060 で 0.00% のまま。
もし Vitest4 の config API 変更で失敗したら: `vitest.config.ts`（`import { defineConfig } from 'vitest/config'`、`test: { globals: true, environment: 'node' }`）が Vitest4 で有効か確認し、必要なら最小修正。テスト数・期待値は変えない。

- [ ] **Step 5: Commit**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/package.json lifeplan/package-lock.json
git commit -m "chore: upgrade typescript 6 and vitest 4"
```

---

## Task 2: 単体/結合テストの分離（命名規約＋スクリプト）

**Files:**
- Rename: `lifeplan/tests/simulate.test.ts` → `lifeplan/tests/simulate.integration.test.ts`
- Rename: `lifeplan/tests/golden.test.ts` → `lifeplan/tests/golden.integration.test.ts`
- Modify: `lifeplan/package.json`（scripts に `test:unit`・`test:integration` 追加）

**Interfaces:**
- Consumes: Task 1 の green な Vitest4
- Produces: `npm run test:unit` / `npm run test:integration`（合計が全件と一致）

- [ ] **Step 1: 結合テスト 2 ファイルをリネーム（git mv）**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git mv lifeplan/tests/simulate.test.ts lifeplan/tests/simulate.integration.test.ts
git mv lifeplan/tests/golden.test.ts lifeplan/tests/golden.integration.test.ts
```
Expected: 2 ファイルがリネームされる（中身は import されないので変更不要）。

- [ ] **Step 2: package.json に分離スクリプトを追加**

`lifeplan/package.json` の `scripts` に以下を追加（既存の `test`/`test:watch`/`typecheck` は残す）:
```json
"test:unit": "vitest run --exclude '**/*.integration.test.ts'",
"test:integration": "vitest run integration"
```

- [ ] **Step 3: 単体テストを実行**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run test:unit`
Expected: 単体のみ実行され green（`simulate`/`golden` は含まれない）。

- [ ] **Step 4: 結合テストを実行**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run test:integration`
Expected: `simulate.integration` と `golden.integration` のみ実行され green。

- [ ] **Step 5: 合計件数が全件と一致することを確認**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm test`
Expected: `Tests 34 passed`。単体件数 + 結合件数 = 34 になっていること（Step3/4 の合計と照合）。

- [ ] **Step 6: Commit**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/tests/simulate.integration.test.ts lifeplan/tests/golden.integration.test.ts lifeplan/package.json
git commit -m "test: split unit and integration suites by naming convention"
```

---

## Task 3: ESLint 導入（flat config）＋ lint を green に

**Files:**
- Create: `lifeplan/eslint.config.js`
- Modify: `lifeplan/package.json`（devDeps に eslint/typescript-eslint/@eslint/js/globals、scripts に lint/lint:fix）

**Interfaces:**
- Consumes: 既存 `src/`・`tests/`・`scripts/`
- Produces: `npm run lint`（green）

- [ ] **Step 1: ESLint 関連 devDependencies を最新で追加**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npm install -D eslint@latest typescript-eslint@latest @eslint/js@latest globals@latest
```
Expected: 4 パッケージが devDependencies に追加される。

- [ ] **Step 2: flat config を作成**

Create `lifeplan/eslint.config.js`:
```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    // 抽出スクリプトは Node ランタイム（process/console 等）
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
```

- [ ] **Step 3: lint スクリプトを追加**

`lifeplan/package.json` の `scripts` に追加:
```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

- [ ] **Step 4: lint 実行**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run lint`
Expected: エラー 0。
もし指摘が出たら: まず `npm run lint:fix` で自動修正できるものを修正。残りは内容を確認し、**エンジンのロジックを変えない**範囲で（未使用変数の削除、`scripts/extract-master.mjs` の不要な `gradeKeys` 削除など）コードを直すか、過剰なルールは config で `rules` 緩和する（例: テストの慣習に合わないルールを off）。再実行して 0 にする。

- [ ] **Step 5: lint 修正後も全テスト green を確認**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm test`
Expected: `Tests 34 passed`（lint 修正でロジックを壊していないこと）。

- [ ] **Step 6: Commit**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/eslint.config.js lifeplan/package.json lifeplan/package-lock.json
# lint 修正でソースを触った場合はそのファイルも add
git add -u lifeplan/src lifeplan/tests lifeplan/scripts 2>/dev/null || true
git commit -m "chore: add ESLint (flat config) with typescript-eslint"
```

---

## Task 4: ビルド設定（emit 用 tsconfig ＋ build スクリプト）

**Files:**
- Create: `lifeplan/tsconfig.build.json`
- Modify: `lifeplan/package.json`（scripts に build）
- Modify: `lifeplan/.gitignore`（`dist/` 追記）

**Interfaces:**
- Consumes: `src/`
- Produces: `npm run build` → `dist/`（JS + d.ts）

- [ ] **Step 1: emit 用 tsconfig を作成**

Create `lifeplan/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: build スクリプトを追加**

`lifeplan/package.json` の `scripts` に追加:
```json
"build": "tsc -p tsconfig.build.json"
```

- [ ] **Step 3: .gitignore に dist を追記**

`lifeplan/.gitignore` に `dist/` の行を追加（既存内容は残す。ファイルが無ければ作成し `node_modules/` と `dist/` を記載）。

- [ ] **Step 4: build 実行して出力を確認**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan && npm run build && ls dist/engine dist/masterData
```
Expected: `dist/` に `.js` と `.d.ts` が出力される（例 `dist/engine/simulate.js`・`simulate.d.ts`）。tsc エラー 0。
注: `education.json` は `dist/` にコピーされない（resolveJsonModule の既知の制約）。**今は成果物が消費されないため許容**。実消費時にバンドラ導入 or json コピーで対応（CONTRIBUTING に記載）。

- [ ] **Step 5: dist が git に乗らないことを確認**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan && git status --porcelain lifeplan/dist`
Expected: 出力なし（`dist/` は .gitignore 済み）。

- [ ] **Step 6: Commit**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/tsconfig.build.json lifeplan/package.json lifeplan/.gitignore
git commit -m "build: add tsconfig.build.json and build script (dist artifact)"
```

---

## Task 5: GitHub Actions ワークフロー `ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run lint`/`typecheck`/`test:unit`/`test:integration`/`build`
- Produces: PR・push(main) で走る CI/CD ワークフロー（ジョブ contexts: `lint`/`typecheck`/`unit`/`integration`/`deliver`）

- [ ] **Step 1: ワークフローを作成**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

defaults:
  run:
    working-directory: lifeplan

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npm run typecheck

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npm run test:unit

  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - run: npm ci
      - run: npm run test:integration

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
          name: engine-dist
          path: lifeplan/dist
          if-no-files-found: error
      # 将来 (UI/Firebase 着手時): main への push で本番デプロイ
      # - name: Deploy to Firebase Hosting
      #   if: github.event_name == 'push' && github.ref == 'refs/heads/main'
      #   run: npx firebase deploy --only hosting --token "${{ secrets.FIREBASE_TOKEN }}"
```

- [ ] **Step 2: YAML 構文を検証**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (lint/typecheck/unit/integration/deliver)"
```

---

## Task 6: PR を作成して CI をエンドツーエンドで検証

**Files:** （コード変更なし。ブランチを push して PR 作成）

**Interfaces:**
- Consumes: Task 1-5 のコミット（ブランチ `chore/cicd-setup` 上）
- Produces: green な CI 実行（チェック contexts が GitHub に登録される＝ Task 7 の必須チェック指定が可能になる）

- [ ] **Step 1: ブランチを push**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git push -u origin chore/cicd-setup
```
Expected: ブランチが origin に push される。

- [ ] **Step 2: PR を作成**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
gh pr create --base main --head chore/cicd-setup \
  --title "ci: add CI/CD pipeline (trunk-based)" \
  --body "Adds GitHub Actions CI/CD (lint/typecheck/unit/integration/deliver), splits unit/integration suites, upgrades to TS6/Vitest4/ESLint10. See docs/superpowers/specs/2026-06-30-cicd-pipeline-design.md"
```
Expected: PR URL が返る。

- [ ] **Step 3: CI 実行を待って結果を確認**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan && gh pr checks chore/cicd-setup --watch`
Expected: `lint`/`typecheck`/`unit`/`integration`/`deliver` がすべて pass。
もし fail したら: `gh run view --log-failed` で原因を確認し、該当タスクのファイルを修正→ブランチに commit→push→再実行。green になるまで繰り返す（systematic-debugging）。

- [ ] **Step 4: deliver の artifact を確認**

Run: `cd /Users/iidakaichiro/develop/portfolio/lifeplan && gh run view --json jobs --jq '.jobs[].name'` で `deliver` が成功していること、Actions UI で `engine-dist` artifact が生成されていることを確認（または `gh api repos/kaaaichi/lifeplan/actions/artifacts --jq '.artifacts[].name'` に `engine-dist`）。
Expected: `engine-dist` artifact が存在。

（このタスクはコミット不要。PR とブランチ上のコミットが成果物。）

---

## Task 7: トランクベース確立（branch protection ＋ マージ設定）＋ ドキュメント

**Files:**
- Create: `CONTRIBUTING.md`（リポジトリ直下）

**Interfaces:**
- Consumes: Task 6 で登録されたチェック contexts（`lint`/`typecheck`/`unit`/`integration`）
- Produces: 保護された `main`、squash-only 設定、開発フロー文書

- [ ] **Step 1: リポジトリのマージ設定を squash のみに**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
gh repo edit kaaaichi/lifeplan --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
```
Expected: squash merge のみ有効、マージ後にブランチ自動削除。

- [ ] **Step 2: main に branch protection を設定（失敗時はフォールバック）**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
gh api -X PUT repos/kaaaichi/lifeplan/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["lint", "typecheck", "unit", "integration"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
Expected: 200 系レスポンス。`required_status_checks.contexts` に 4 つ、`required_linear_history: true`。
**もし 403/プラン制限で失敗したら**: 保護は諦め、CONTRIBUTING.md に「PR 必須・squash・チェック green を運用ルールとする」旨を明記（Step 3 で記載）。エラー本文を控えて報告する。

- [ ] **Step 3: CONTRIBUTING.md を作成**

Create `CONTRIBUTING.md`（リポジトリ直下）:
```markdown
# Contributing — トランクベース開発

`main` がトランク（常にリリース可能）。直接 push せず、短命ブランチ → PR → CI green → squash merge。

## フロー
1. `git switch -c <type>/<topic>`（例 `feat/...`, `fix/...`, `chore/...`）。短命（数時間〜1日）に保つ。
2. 変更を commit し push、`gh pr create --base main`。
3. CI（`lint` / `typecheck` / `unit` / `integration` / `deliver`）が green になるまで修正。
4. green になったら **squash merge**（マージコミット/リベースは無効）。マージ後ブランチは自動削除。

## CI/CD
- ワークフロー: `.github/workflows/ci.yml`。npm 系は `lifeplan/` で実行。
- テスト分類: 結合は `*.integration.test.ts`（`simulate`/`golden`）。それ以外は単体。
  - 単体: `npm run test:unit` / 結合: `npm run test:integration` / 全件: `npm test`
- Lint: `npm run lint`（ESLint flat config）。型: `npm run typecheck`。
- デリバリー: `deliver` ジョブが `npm run build` → `dist/` を `engine-dist` artifact 化。
  - 既知の制約: `education.json` は `dist/` にコピーされない（成果物が実消費される段階でバンドラ/コピー対応）。
  - 将来: Web アプリ着手時に `deliver` に Firebase Hosting デプロイを追加（`secrets.FIREBASE_TOKEN`）。

## main 保護
- branch protection: PR 必須・直 push 禁止・必須チェック（lint/typecheck/unit/integration）・linear history。
- （プラン制限で API 設定不可の場合は本ルールを運用で担保する。）
```

- [ ] **Step 4: CONTRIBUTING を PR ブランチにコミット＆ push**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING with trunk-based workflow"
git push
```

- [ ] **Step 5: CI 再 green を確認して PR を squash merge**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
gh pr checks chore/cicd-setup --watch
gh pr merge chore/cicd-setup --squash --delete-branch
```
Expected: 全チェック green、`main` に squash merge され、ブランチ削除。

- [ ] **Step 6: main の最終確認**

Run:
```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git switch main && git pull
gh api repos/kaaaichi/lifeplan/branches/main/protection --jq '.required_status_checks.contexts' 2>/dev/null || echo "(protection not set — running on convention)"
```
Expected: `main` が最新、保護設定済みなら 4 contexts、未設定なら運用ルール（CONTRIBUTING）で担保。

---

## Self-Review チェック結果

- **Spec coverage**: ワークフロー(§ci.yml)→Task5、テスト分類→Task2、lint→Task3、build/deliver→Task4・Task5、最新バージョン方針(TS6/Vitest4/ESLint10/Node24/actions)→Task1・Task3・Task5、トランクベース/保護→Task6・Task7、フォールバック文書→Task7。全項目に対応タスクあり。
- **メジャー更新の検証ステップ**: Task1 Step3/4（typecheck＋34テスト、破壊時の最小修正）として独立化済み。golden 不変も明記。
- **Placeholder scan**: 各 Step に実コマンド/実ファイル内容あり。将来 Firebase はコメント枠として明示（プレースホルダではなく意図的な非スコープ）。
- **Type/Name consistency**: ジョブ名 `lint`/`typecheck`/`unit`/`integration`/`deliver` を ci.yml(Task5) と branch protection contexts(Task7) で一致。スクリプト名 `test:unit`/`test:integration`/`lint`/`build` を package.json と ci.yml で一致。命名規約 `*.integration.test.ts` を Task2(リネーム) と Task3(eslint ignore 不要) で整合。
- **既知の制約**: `dist/` への json 非コピー（Task4 で許容＋CONTRIBUTING 記載）、branch protection のプラン制限（Task7 フォールバック）。
