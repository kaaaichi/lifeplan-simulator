## Why

`FinancialEvent`は`annualCashFlow`にのみ加算され、`income`/`ExpenseBreakdown`自体は変更しない設計だった（`financial-events-whatif-cli`の決定4）。このため育休・産休による収入減が本番シナリオに`FinancialEvent`として登録されていても、ダッシュボードの「単年度収入」列には反映されず、通常時と同じ金額のまま表示されていた。ユーザーから「育休があるのに単年度収入が一定になっている」と指摘があり、実用上わかりにくいため設計を見直す。

## What Changes

- `FinancialEvent`に必須フィールド`kind: '収入' | '支出'`を追加する
- `simulate()`で、`kind: '収入'`の`annualAmount`は`income`に、`kind: '支出'`の`annualAmount`は`totalExpense`から減算する形で反映する（`annualCashFlow`の合計値自体は従来どおり不変。カテゴリ別内訳を持つ`ExpenseBreakdown`オブジェクト自体は変更しない）
- 本番Firestoreに保存済みの育休シナリオの既存`financialEvents`（4件、いずれも収入減）に`kind: '収入'`を補完する

このchangeは既存の`financial-events`capability（`financial-events-whatif-cli`で導入）の決定4を上書きする。UI（入力フォーム）・CLIの引数体系には変更を加えない。

## Capabilities

### Modified Capabilities
- `financial-events`: `FinancialEvent`に`kind`を追加し、`income`/`totalExpense`への反映方法を変更する

## Impact

- コード: `src/types.ts`（`FinancialEvent.kind`追加）、`src/engine/simulate.ts`（`income`/`totalExpense`への反映ロジック）、`scripts/simulateCli.ts`（`validateFinancialEvents`に`kind`検証を追加）、既存テスト一式（`FinancialEvent`リテラルに`kind`を追加）
- データ: 本番Firestore（`households/primary`）の育休シナリオ`financialEvents`4件に`kind: '収入'`を補完
- 実装・本番データ反映・全ゲート（テスト/typecheck/lint/build）は本change起票前に完了済み。本changeは実施済みの変更を仕様に同期するために起票する。
