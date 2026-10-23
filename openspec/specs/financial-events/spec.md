# financial-events Specification

## Purpose
育休による収入減や車購入・ローン・旅行などの期間限定の収入・支出（`FinancialEvent`）を定義し、年次キャッシュフローに反映する。

## Requirements
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

### Requirement: 元利均等返済額の計算ヘルパー
`src/engine/loan.ts` は、借入元本・年利（%）・返済年数を受け取り、元利均等返済方式の月次返済額を計算する関数 `monthlyLoanPayment` を提供しなければならない(SHALL)。この関数は残債・支払利息の年次内訳を計算せず、月次返済額（number）のみを返す。

#### Scenario: 正の金利で正しい月次返済額を計算する
- **WHEN** 借入元本300万円、年利1.5%、返済年数5年を `monthlyLoanPayment` に渡す
- **THEN** 元利均等返済の計算式（`PMT = P × r × (1+r)^n / ((1+r)^n - 1)`、`r`は月利、`n`は返済回数）に基づく月次返済額が返される

#### Scenario: 金利が0%の場合は単純な均等割りになる
- **WHEN** 借入元本120万円、年利0%、返済年数5年を `monthlyLoanPayment` に渡す
- **THEN** ゼロ除算を避け、借入元本 ÷ (返済年数 × 12) の単純な均等割り額が返される

### Requirement: FinancialEvent の id 一意性検証
永続化バリデーション（`src/persistence/validate.ts`）は、同一シナリオ内の `financialEvents` に重複する `id` が存在する場合、既存の `scenario.id` 重複チェックと同様にエラーとして検出しなければならない(SHALL)。

#### Scenario: 同一シナリオ内で重複した id を持つ financialEvents は検証エラーになる
- **WHEN** 同一シナリオの `financialEvents` に同じ `id` を持つ要素が2件以上存在する `HouseholdDoc` を `validateHouseholdDoc` に渡す
- **THEN** バリデーションはエラーを返す

