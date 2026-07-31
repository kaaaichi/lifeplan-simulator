## Context

`financial-events-whatif-cli`（archive済み）の決定4「`FinancialEvent`は`annualCashFlow`にのみ加算し、`income`/`ExpenseBreakdown`は変更しない」は、ダッシュボードの内訳表示への影響を避けるためのスコープ限定だった。しかし本番運用で育休・産休による収入減を`FinancialEvent`として登録したところ、ダッシュボードの「単年度収入」列がイベントを無視した金額のまま表示され、ユーザーが「反映されていない」と誤認する実害が出た。

## Decision（決定4を上書き）

`FinancialEvent`に`kind: '収入' | '支出'`を必須フィールドとして追加し、`simulate()`で以下のように反映する。

- `kind: '収入'`の`annualAmount`は`income`（単年度収入）に加算する
- `kind: '支出'`の`annualAmount`は`totalExpense`（単年度支出）から減算する（`annualAmount`は「支出の増減」を表し、マイナス値=支出減）
- カテゴリ別内訳を持つ`ExpenseBreakdown`オブジェクト自体（`AssetChart`の内訳タブ等が参照する値）は変更しない
- `annualCashFlow`（`income - totalExpense`）の合計値は、この変更の前後で不変

代替案として「`ExpenseBreakdown`に新カテゴリ（例:「その他調整」）を追加する」も検討したが、内訳タブへの表示方法（グラフの色・凡例）まで踏み込む設計判断が必要になり、本changeのスコープ（「単年度収入/支出」列の表示を実態に合わせる）を超えるため採用しなかった。`ExpenseBreakdown`拡張が必要になった場合は別changeで扱う。

`kind`は必須フィールドとした（`FinancialEvent`は収入減・支出増のどちらも表現できる統一モデルのため、どちらの列に反映するかを呼び出し側が必ず明示する必要がある）。

## 本番データへの影響

既存の本番Firestore（`households/primary`）に保存済みの育休シナリオの`financialEvents`（4件、いずれも収入減）は`kind`フィールドを持たない状態で保存されていたため、`kind`を追加しただけでは`income`/`totalExpense`のどちらにも反映されず、無効化されてしまう（`e.kind === '収入'`も`'支出'`も偽になるため）。これを避けるため、本changeの実装と同時に本番データへ`kind: '収入'`を補完した（`/lifeplan-simulate`経由で確認・反映済み）。

**申し送り**: `kind`追加にあたって`schemaVersion`のマイグレーション（`src/persistence/migrate.ts`）は追加していない（`CURRENT_SCHEMA_VERSION`は`2`のまま）。`validate.ts`も`kind`の存在を実行時検証していない。そのため、今後`kind`を持たない`FinancialEvent`が何らかの経路（手動編集等）でFirestoreに書き込まれた場合、`income`/`totalExpense`のどちらにも反映されず静かに無効化される。恒久対策（`schemaVersion` 3への移行関数追加、または`validate.ts`での`kind`必須チェック）は別changeとして起票を検討する。
