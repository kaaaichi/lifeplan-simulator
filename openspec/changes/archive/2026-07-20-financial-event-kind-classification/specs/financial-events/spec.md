## MODIFIED Requirements

### Requirement: FinancialEvent データモデル
`Inputs` は `financialEvents?: FinancialEvent[]` を持たなければならない(SHALL)。各 `FinancialEvent` は `id: string`、`label: string`、`kind: '収入' | '支出'`、`startYear: number`、`endYear: number | null`、`annualAmount: number` を持たなければならない(SHALL)。`financialEvents` が未指定の場合は空配列として扱わなければならない(SHALL)。

#### Scenario: financialEvents 未指定時は既存挙動と完全に同じ
- **WHEN** `Inputs.financialEvents` が指定されていない状態で `simulate()` を実行する
- **THEN** 各年の `annualCashFlow` は本change導入前と完全に同じ値になる（golden回帰が不変であること）

#### Scenario: endYear が null のイベントは以降ずっと継続する
- **WHEN** `startYear: 2027, endYear: null` の `FinancialEvent` を持つ `Inputs` で `simulate()` を実行する
- **THEN** 2027年以降のすべての年（シミュレーション終了年まで）で `annualAmount` が反映される

### Requirement: FinancialEvent の年次キャッシュフローへの反映
`simulate()` は、対象年が `startYear <= year` かつ（`endYear === null` または `year <= endYear`）を満たす全ての `FinancialEvent` について、`kind: '収入'` の `annualAmount` は合算してその年の `income` に加算し、`kind: '支出'` の `annualAmount` は合算してその年の `totalExpense` から減算しなければならない(SHALL)。カテゴリ別内訳を持つ `ExpenseBreakdown` オブジェクト自体は変更してはならない(SHALL NOT)。`annualCashFlow`（`income - totalExpense`）の合計値は、`kind` によって `income`/`totalExpense` のどちらに反映されたかに関わらず不変でなければならない(SHALL)。

#### Scenario: 期間限定の収入減が該当年のキャッシュフローにのみ反映される
- **WHEN** `startYear: 2026, endYear: 2027, kind: '収入', annualAmount: -2_000_000` の `FinancialEvent`（育休による収入減を想定）を持つ `Inputs` で `simulate()` を実行する
- **THEN** 2026年・2027年の `income` はこのイベントを加味しない場合と比べて200万円少なく、2025年以前・2028年以降の `income` は変わらない

#### Scenario: kind:'支出' のイベントは該当年の単年度支出に反映され、ExpenseBreakdownは変わらない
- **WHEN** `startYear: 2027, endYear: 2027, kind: '支出', annualAmount: 500_000` の `FinancialEvent`（臨時支出を想定）を持つ `Inputs` で `simulate()` を実行する
- **THEN** 2027年の `totalExpense` はこのイベントを加味しない場合と比べて50万円多くなるが、`expenses`（`ExpenseBreakdown`）の各カテゴリ値自体は変わらない

#### Scenario: annualCashFlowの合計値はkindによらず不変
- **WHEN** 同じ `annualAmount` を持つが `kind` だけが異なる2つの `FinancialEvent` をそれぞれ単独で `Inputs` に設定し `simulate()` を実行する
- **THEN** 両ケースの `annualCashFlow` は同じ値になる（`income` に乗るか `totalExpense` から引かれるかが違うだけで収支への影響は同じ）

#### Scenario: 複数イベントが同一年に重なる場合は合算される
- **WHEN** 同一年に該当する複数の `FinancialEvent`（例: 車購入の頭金と、育休の収入減）を持つ `Inputs` で `simulate()` を実行する
- **THEN** 同じ `kind` を持つイベント同士は合算されたうえで、それぞれ `income` または `totalExpense` に反映される

#### Scenario: startYear が endYear より後のイベントはどの年にも寄与しない
- **WHEN** `startYear: 2030, endYear: 2025` のような不正な期間の `FinancialEvent` を持つ `Inputs` で `simulate()` を実行する
- **THEN** どの年の `income`/`totalExpense` にもこのイベントの `annualAmount` は反映されない
