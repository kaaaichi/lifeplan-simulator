## ADDED Requirements

### Requirement: FinancialEvent データモデル
`Inputs` は `financialEvents?: FinancialEvent[]` を持たなければならない(SHALL)。各 `FinancialEvent` は `id: string`、`label: string`、`startYear: number`、`endYear: number | null`、`annualAmount: number` を持たなければならない(SHALL)。`financialEvents` が未指定の場合は空配列として扱わなければならない(SHALL)。

#### Scenario: financialEvents 未指定時は既存挙動と完全に同じ
- **WHEN** `Inputs.financialEvents` が指定されていない状態で `simulate()` を実行する
- **THEN** 各年の `annualCashFlow` は本change導入前と完全に同じ値になる（golden回帰が不変であること）

#### Scenario: endYear が null のイベントは以降ずっと継続する
- **WHEN** `startYear: 2027, endYear: null` の `FinancialEvent` を持つ `Inputs` で `simulate()` を実行する
- **THEN** 2027年以降のすべての年（シミュレーション終了年まで）で `annualAmount` が `annualCashFlow` に加算される

### Requirement: FinancialEvent の年次キャッシュフローへの反映
`simulate()` は、対象年が `startYear <= year` かつ（`endYear === null` または `year <= endYear`）を満たす全ての `FinancialEvent` の `annualAmount` を合算し、その年の `annualCashFlow`（`income - totalExpense` の後）に加算しなければならない(SHALL)。`income` および `ExpenseBreakdown`（内訳）自体は変更してはならない(SHALL NOT)。

#### Scenario: 期間限定の収入減が該当年のキャッシュフローにのみ反映される
- **WHEN** `startYear: 2026, endYear: 2027, annualAmount: -2_000_000` の `FinancialEvent`（育休による収入減を想定）を持つ `Inputs` で `simulate()` を実行する
- **THEN** 2026年・2027年の `annualCashFlow` はこのイベントを加味しない場合と比べて200万円少なく、2025年以前・2028年以降の `annualCashFlow` は変わらない

#### Scenario: 複数イベントが同一年に重なる場合は合算される
- **WHEN** 同一年に該当する複数の `FinancialEvent`（例: 車購入の頭金と、育休の収入減）を持つ `Inputs` で `simulate()` を実行する
- **THEN** その年の `annualCashFlow` にはすべての該当イベントの `annualAmount` の合計値が加算される

#### Scenario: startYear が endYear より後のイベントはどの年にも寄与しない
- **WHEN** `startYear: 2030, endYear: 2025` のような不正な期間の `FinancialEvent` を持つ `Inputs` で `simulate()` を実行する
- **THEN** どの年の `annualCashFlow` にもこのイベントの `annualAmount` は加算されない

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
