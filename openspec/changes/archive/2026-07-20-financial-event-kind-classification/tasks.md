## 1. FinancialEvent への kind 追加とエンジン反映（TDD）

- [x] 1.1 `src/types.ts`の`FinancialEvent`に`kind: '収入' | '支出'`（必須）を追加する
- [x] 1.2 `src/engine/simulate.ts`で、`kind: '収入'`は`income`に加算・`kind: '支出'`は`totalExpense`から減算するロジックをテストで先に固定してから実装する（`annualCashFlow`合計・`ExpenseBreakdown`不変を回帰テストで固定）
- [x] 1.3 型変更に伴うコンパイルエラー（既存テストの`FinancialEvent`リテラル、`scripts/simulateCli.ts`の`validateFinancialEvents`、`.claude/commands/lifeplan-simulate.md`のJSON組み立て例）を解消する

## 2. 本番データ反映

- [x] 2.1 本番Firestore（`households/primary`）の育休シナリオ`financialEvents`（4件）に`kind: '収入'`を補完する
- [x] 2.2 読み取り専用の試算（`scripts/simulateCli.ts`、`--save`なし）で、本番アクティブシナリオの2026/2027年の単年度収入が育休による収入減を反映した金額（8,553,000円 / 9,414,000円）になっていることを確認する

## 3. 検証・仕様同期

- [x] 3.1 全テストgreen・typecheck/lint/build確認
- [x] 3.2 `financial-events`capabilityの仕様（`openspec/specs/financial-events/spec.md`）を決定4の上書き内容に同期する
