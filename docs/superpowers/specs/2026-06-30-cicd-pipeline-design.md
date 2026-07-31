# CI/CD パイプライン設計（GitHub Actions / トランクベース開発）

> 仕様の源泉。実装は writing-plans が作る実装計画に従う。

## 目的

`kaaaichi/lifeplan`（private）に GitHub Actions ベースの CI/CD を整備し、**トランクベース開発**フローを
確立する。`main` をトランクとして、品質ゲート（lint / typecheck / 単体 / 結合テスト）を通過したものだけが
マージされ、マージ時にデリバリー（ビルド成果物）を生成する。

## スコープ判断（ブレインストーミングで合意）

1. **デリバリー対象 = 段階的**。現状はエンジンのみ（Web アプリは将来の Plan で未着手）。
   今は「ビルド成果物（`dist/` の JS + d.ts）を artifact 化」までをデリバリーとする。
   将来 Web アプリができたら同じ `deliver` ジョブに Firebase Hosting デプロイを追加して拡張する。
   **npm publish はしない**（成果物は GitHub Actions artifact）。
2. **単体/結合の切り分け = 既存テストの分類**。外部サービス結合はまだ無いため、
   モジュール単位のテスト = 単体、複数モジュールを通すエンドツーエンド（`simulate` / `golden` 回帰）= 結合。
3. **開発フロー = トランクベース**。短命フィーチャーブランチ → PR → 必須チェック green → squash merge で `main`。
   `main` は保護（直 push 禁止・チェック必須・linear history）。
4. **lint を CI に含める**（ESLint + typescript-eslint）。
5. **使用バージョンは可能な限り最新**（下記「依存バージョン方針」参照）。

## 依存バージョン方針（最新化）

実装時点で各ライブラリ／アクションを最新に揃える。本書記載は 2026-06-30 時点で確認した最新版
（`npm view` / GitHub Releases）。実装時は `@latest` で導入し、解決された版を `package-lock.json` に固定する。

| 対象 | 現状 | 最新（採用） | 備考 |
|---|---|---|---|
| Node（CI） | 20想定 | **24 LTS** | v26 は Current で非LTS のため CI 安定性優先で 24 を採用。ローカル(22)は後で 24 に揃える |
| TypeScript | `^5.5.0` | **`^6.0.3`** | メジャー更新 |
| Vitest | `^2.0.0` | **`^4.1.9`** | メジャー2つ更新 |
| ESLint | （無） | **`^10.6.0`** | flat config 前提 |
| typescript-eslint | （無） | **`^8.62.1`** | ESLint 10 対応 |
| @eslint/js | （無） | **`^10.0.1`** | |
| actions/checkout | （無） | **`v7`** | |
| actions/setup-node | （無） | **`v6`** | `cache: npm` |
| actions/upload-artifact | （無） | **`v7`** | |

**メジャー更新の検証（重要）**: TypeScript 5→6・Vitest 2→4 はメジャー更新のため破壊的変更の可能性がある。
実装計画には「依存更新 → `npm run typecheck` と全34テストが green になることを確認 → 破壊があれば
設定/コードを最小修正（例: Vitest4 の config API・型グロブ `vitest/globals` の経路、ESLint10 flat config、
TS6 の厳格化）」を**独立ステップ**として含める。golden 回帰の数値は不変であること（エンジンロジックは変えない）。

## アーキテクチャ

### リポジトリ構成の前提

- エンジンはリポジトリ直下の `lifeplan/` サブディレクトリにある（`lifeplan/package.json` 等）。
- GitHub Actions ワークフローはリポジトリ直下 `.github/workflows/` に置く。
- npm 系ステップはすべて `lifeplan/` を作業ディレクトリとして実行する
  （`defaults.run.working-directory: lifeplan`）。

### ワークフロー: `.github/workflows/ci.yml`

- **トリガー**: `pull_request`（→ `main`）と `push`（→ `main`）。
- **共通**: `actions/checkout@v7` → `actions/setup-node@v6`（Node 24 LTS、`cache: npm`、
  `cache-dependency-path: lifeplan/package-lock.json`）→ `npm ci`。
- **concurrency**: 同一 ref の進行中ランをキャンセル（`group: ci-${{ github.ref }}`, `cancel-in-progress: true`）。
- **ジョブ（並列、独立）**:

| ジョブ | 内容 | コマンド |
|---|---|---|
| `lint` | ESLint | `npm run lint` |
| `typecheck` | 型チェック | `npm run typecheck` |
| `unit` | 単体テスト | `npm run test:unit` |
| `integration` | 結合テスト | `npm run test:integration` |
| `deliver` | ビルド成果物 | `needs: [lint, typecheck, unit, integration]` → `npm run build` → `actions/upload-artifact@v7`（`dist/`） |

- `deliver` は 4 ジョブ green の後にのみ走る。ビルド可能性の検証も兼ねる。
- **将来の Firebase デプロイ枠**: `deliver` 内に「`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`」
  のステップを設け、現状は no-op / コメントで明示。Plan（UI/Firebase）着手時に
  `firebase deploy` ＋ `secrets.FIREBASE_*` を投入して有効化する。

### テスト分類（命名規約）

- 結合テストはファイル名サフィックス `*.integration.test.ts` で識別する。
  - `tests/simulate.test.ts` → `tests/simulate.integration.test.ts`
  - `tests/golden.test.ts` → `tests/golden.integration.test.ts`
  - リネームのみ（テストファイルは import されないので他への影響なし）。
- それ以外（`smoke` / `types` / `ageGrade` / `fixtures` / `masterData` / `income` / `expenses` / `goalSeek`）は単体。
- ローカル一括実行用の `npm test`（= `vitest run`）は従来どおり全件実行で残す。

### `package.json` スクリプト追加

| script | コマンド | 備考 |
|---|---|---|
| `test:unit` | `vitest run --exclude '**/*.integration.test.ts'` | 単体のみ |
| `test:integration` | `vitest run integration` | パスに `integration` を含むファイル |
| `lint` | `eslint .` | |
| `lint:fix` | `eslint . --fix` | ローカル用 |
| `build` | `tsc -p tsconfig.build.json` | emit 有効・テスト除外 |

（既存 `test` / `test:watch` / `typecheck` は維持）

### Lint ツール

- ESLint v10 **flat config**（`lifeplan/eslint.config.js`）。
- `typescript-eslint` の **recommended**（型情報なしの軽量セット。`recommendedTypeChecked` は使わない＝高速・簡素）。
- 対象: `src/**`, `tests/**`, `scripts/**`。`dist/`・`node_modules/` は無視。
- devDependencies 追加: `eslint@^10.6.0`, `typescript-eslint@^8.62.1`, `@eslint/js@^10.0.1`。

### ビルド設定

- `lifeplan/tsconfig.build.json`（ベース `tsconfig.json` を継承）:
  `"compilerOptions": { "noEmit": false, "outDir": "dist", "declaration": true }`,
  `"include": ["src"]`（`tests`/`scripts` を除外）。
- `dist/` は `.gitignore` に追加（成果物はコミットせず artifact 化）。

### トランクベース / `main` 保護

- `gh api` で `main` に branch protection（または ruleset）を設定:
  - PR 経由のみ（直 push 禁止）。
  - 必須ステータスチェック: `lint` / `typecheck` / `unit` / `integration` が green。
  - squash merge のみ・linear history。
  - （任意）会話の解決必須。
- **フォールバック**: private リポジトリのプランで branch protection / ruleset が制限される場合は、
  設定手順を本ドキュメント＋README に記載し「運用ルール＋CI ゲート（PR 上にチェック表示）」で運用する。
  CI 自体はプランに依存せず常に動作する。

## データフロー（CI 実行）

```
PR 作成/更新 ──▶ ci.yml 起動
   ├─ lint        (eslint .)
   ├─ typecheck   (tsc --noEmit)
   ├─ unit        (vitest 単体)
   └─ integration (vitest 結合: simulate/golden)
        └─(全 green)─▶ deliver: build → dist/ を artifact 化
                          └─ (push to main のみ) 将来: Firebase deploy [枠のみ]

main マージは「4 チェック green」を必須化 ──▶ マージ後 push で deliver 実行
```

## テスト戦略（この設計自体の検証）

- ワークフローは PR を 1 本作って実際に Actions が緑になることで検証する。
- `test:unit` / `test:integration` がローカルで期待どおり分割実行されることを確認（合計件数が全件と一致）。
- `npm run build` が `dist/` に JS + d.ts を出力することを確認。
- `npm run lint` が既存コードで green になること（初回は軽微な指摘が出れば修正 or ルール調整）。

## 非スコープ（将来）

- Firebase Hosting への実デプロイ（Web アプリ着手時に `deliver` を拡張）。
- E2E / ブラウザテスト（UI 着手後）。
- npm レジストリへの publish。
- リリースノート自動生成・semver タグ付け。

## オープン項目 / 既定

- Node バージョンは CI で **24 LTS 単一**（最新LTS。v26 は非LTSのため不採用）。ローカル(22)は実装後に 24 へ揃える想定。必要なら後でマトリクス化。
- Prettier（整形）は今回入れない（lint = ESLint のみ）。必要になれば後追加。
- TypeScript 6 / Vitest 4 のメジャー更新で既存設定の調整が必要になった場合は最小修正で対応（エンジンロジックは不変）。
