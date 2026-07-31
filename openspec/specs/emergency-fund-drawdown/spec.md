# emergency-fund-drawdown Specification

## Purpose
TBD - created by archiving change emergency-fund-drawdown. Update Purpose after archive.
## Requirements
### Requirement: 生活防衛資金の閾値定義
`Assumptions`型は`emergencyFundCash: number`（現金として維持する最低額、円単位）を持たなければならない(SHALL)。デフォルト値は1,200,000円とする。

#### Scenario: デフォルト世帯データのemergencyFundCashは120万円
- **WHEN** `defaultHousehold.ts`・`placeholderHousehold.ts`の`Assumptions`を参照する
- **THEN** `emergencyFundCash`は`1200000`である

### Requirement: 年末現金残高が閾値未満の場合の投資取り崩し
`simulate()`の年次ループは、その年の`cash`と`invest`を既存ロジック（拠出額・利回り込み）で計算した後、`cash < emergencyFundCash`であれば、`shortfall = emergencyFundCash - cash`、`drawdown = Math.min(shortfall, Math.max(invest, 0))`を計算し、`invest`から`drawdown`を減算、`cash`に`drawdown`を加算しなければならない(SHALL)。

#### Scenario: 投資残高が十分な場合は現金が閾値ちょうどまで回復する
- **WHEN** ある年の既存ロジック計算後の投資残高が500万円、現金残高が-88万円、`emergencyFundCash`が120万円である
- **THEN** 取り崩し後の現金残高は120万円、投資残高は292万円（500万円 - (120万円 - (-88万円))）になる

#### Scenario: 投資残高が不足する場合は投資残高が0になり現金は閾値未満のまま
- **WHEN** ある年の既存ロジック計算後の投資残高が50万円、現金残高が-88万円、`emergencyFundCash`が120万円である
- **THEN** 取り崩し後の投資残高は0円、現金残高は-38万円（-88万円+50万円）のまま（120万円未満）になる

#### Scenario: 現金残高が既に閾値以上の場合は取り崩しが発生しない
- **WHEN** ある年の既存ロジック計算後の現金残高が200万円、`emergencyFundCash`が120万円である
- **THEN** 現金残高・投資残高とも変化しない

### Requirement: 総資産不変
取り崩しロジックの適用前後で、`cash + invest`（総資産）の値は変化してはならない(SHALL NOT)。

#### Scenario: 取り崩しがあっても総資産合計は変わらない
- **WHEN** 取り崩しが発生する年について、取り崩し前後の`cash + invest`を比較する
- **THEN** 両者は完全に一致する

### Requirement: 3シナリオ（楽観/中央/悲観）への一律適用
`selectors.ts`等が`simulate()`を楽観/中央/悲観の異なる利回りで3回呼び出す際、いずれの呼び出しにも同一の`emergencyFundCash`閾値による取り崩しロジックが適用されなければならない(SHALL)。

#### Scenario: 楽観シナリオでも現金残高が閾値を下回れば取り崩しが発生する
- **WHEN** 楽観シナリオ（`returnRateOptimistic`適用）で計算した年の現金残高が閾値未満になる
- **THEN** 中央・悲観シナリオと同じ取り崩しロジックにより、投資残高が十分な場合は現金が閾値まで回復する

### Requirement: 既存データへの後方互換マイグレーション
`src/persistence/migrate.ts`は、`emergencyFundCash`フィールドを持たない既存の`HouseholdDoc`（本番Firestoreデータを含む）を読み込む際、デフォルト値1,200,000円を補完しなければならない(SHALL)。

#### Scenario: emergencyFundCash未設定の既存ドキュメントがマイグレーションされる
- **WHEN** `emergencyFundCash`フィールドを持たない`HouseholdDoc`を`migrate`に渡す
- **THEN** 結果の`Assumptions`に`emergencyFundCash: 1200000`が設定される

### Requirement: 入力フォームでの生活防衛資金の編集
入力フォームの前提条件セクションは、`emergencyFundCash`を数値入力フィールドとして表示し、ユーザーが変更できなければならない(SHALL)。

#### Scenario: 生活防衛資金を入力フォームで変更できる
- **WHEN** 入力フォームの生活防衛資金欄に`1500000`を入力して保存する
- **THEN** 保存後の`HouseholdDoc`の`Assumptions.emergencyFundCash`は`1500000`になる

### Requirement: ゴールデンマスター回帰との整合性確認
本changeの適用後、`tests/golden.integration.test.ts`の検証年（2027, 2030, 2035, 2040, 2050, 2060）における投資残高の対ゴールデン誤差率を確認しなければならない(SHALL)。2027年は現行シミュレーションで現金残高がマイナス（-88万円、120万円の閾値を下回る）であることが確認されているため、取り崩しが発生し投資残高が変化する可能性が高い。既存の許容範囲（±5%以内）を超える場合は、一次資料（スプレッドシート）が本ロジックを含まないことに起因する意図した乖離として扱う。

#### Scenario: ゴールデンマスター回帰テストが実行でき、乖離の有無が判明する
- **WHEN** 本change適用後に`npm test`を実行する
- **THEN** `golden.integration.test.ts`が完走し、2027年を含む各検証年の誤差率が判明する

