## Why

現在のエンジン（`src/engine/income.ts`）は `Member.takeHomeIncome` を「就労終了年齢まで一定」としてしか扱えず、育休・産休のような期間限定の収入減や、車購入・ローン・旅行のような臨時支出を年次シミュレーションに反映できない。そのため直近（2026〜2027年）の予測が実態とずれている。また「こうしたらどうなる？」を試したいとき、既存の入力フォーム（GUI）を都度書き換えるのは手間が大きく、Claude Codeとの対話でヒアリングしながら試算・比較できる運用の方が実用的である。

## What Changes

- `Inputs` に `financialEvents?: FinancialEvent[]` を追加し、`FinancialEvent { id, label, startYear, endYear: number | null, annualAmount }` として期間限定/継続的な収支調整（育休の収入減、車購入・ローン返済・維持費、旅行等の臨時支出）を表現できるようにする
- `src/engine/loan.ts` に、借入元本・年利（%）・返済年数から元利均等返済方式の月次返済額を計算する `monthlyLoanPayment()` を追加し、車・住宅等のローンの`FinancialEvent.annualAmount`を金利込みで算出できるようにする（残債・利息の年次追跡は行わない簡易モデル）
- `src/engine/simulate.ts` の `annualCashFlow` 計算に、該当年のイベント合算値を加算する（`income`/`ExpenseBreakdown`自体は変更しない）
- 新規 Node.js CLIスクリプト（`scripts/simulateCli.ts`、tsxで実行）を追加し、Firebase Admin SDK経由で本番Firestore（`households/{uid}`）の既存シナリオを複製し、指定した `FinancialEvent[]` を加えて `simulate()` を実行、結果を年次テーブルとしてターミナルに表示する。`--save`で複製シナリオを永続化、`--activate`（`--save`併用時のみ）でアクティブシナリオに切り替える
- 新規スラッシュコマンド（`.claude/commands/lifeplan-simulate.md`）を追加し、Claudeがユーザーとの対話でイベント条件をヒアリングし、上記CLIを呼び出す手順を定義する
- 新規依存 `firebase-admin` を追加。サービスアカウントキーは `scripts/service-account.local.json`（既存の`.gitignore`の`*.local`パターンでコミット対象外）に配置する

このchangeは入力フォーム（GUI）・ダッシュボードUIには一切手を入れない。UIからの編集は対象外（別途必要になれば後続changeで検討）。

## Capabilities

### New Capabilities
- `financial-events`: 期間限定/継続的な収支調整（`FinancialEvent`）のデータモデル定義と、`src/engine/simulate.ts` への組み込み
- `whatif-simulation-cli`: Claude Codeのスラッシュコマンド経由で、本番Firestoreデータに対しシナリオ複製・イベント適用・シミュレーション実行・保存ができるCLI

### Modified Capabilities
（なし。既存capability `firebase-session-reliability` の要件に変更はない）

## Impact

- `src/types.ts`: `FinancialEvent`型の新規追加、`Inputs.financialEvents?`フィールド追加
- `src/engine/simulate.ts`: `annualCashFlow`計算にイベント合算値を加算するロジック追加
- 新規 `src/engine/loan.ts`: 元利均等返済の月次返済額を計算する`monthlyLoanPayment()`（純粋関数、金利0%も含む）
- `src/persistence/validate.ts`: `financialEvents`の`id`一意性チェックを追加（既存の`scenario.id`一意性チェックと同様の方式）
- 新規 `scripts/simulateCli.ts`（Firebase Admin SDK使用、既存の`src/engine/`・`src/persistence/`を純TS importとして再利用）
- 新規 `scripts/service-account.local.json`（gitignore対象、リポジトリにはコミットしない）
- 新規 `.claude/commands/lifeplan-simulate.md`
- `package.json`: 新規依存 `firebase-admin` 追加（devDependencies想定、ブラウザバンドルには含めない）
- 既存の入力フォームUI・ダッシュボードUI・`src/persistence/firestoreRepository.ts`（ブラウザ側）は無変更
