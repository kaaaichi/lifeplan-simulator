## ADDED Requirements

### Requirement: 子どもの年齢帯別の食費データモデル
`src/masterData/childLivingCost.ts`は、子どもの学齢index（`gradeIndexAt`の戻り値）0〜17を5つの年齢帯（0-2歳・3-5歳・小学生6-11・中学生12-14・高校生15-17）に区分し、各帯の食費年額を保持しなければならない(SHALL)。値は三澤奈菜・竹原健二（2025）「日本における0〜18歳の子育てに要する費用の調査」表3の年齢別実額を年齢帯ごとに単純平均した値とする。

#### Scenario: 年齢帯ごとの食費年額が一次資料の平均値と一致する
- **WHEN** 各年齢帯の食費年額を参照する
- **THEN** 0-2歳=230,364円、3-5歳=307,014円、小学生=387,226円、中学生=460,490円、高校生=489,204円になっている

### Requirement: 食費計算への子ども年齢帯の組み込み
`expensesForYear`の食費計算は、大人（世帯主・配偶者）には現行どおり`FOOD_PER_PERSON_MONTH`（月額×12）を適用し、学齢index 0〜17の子どもには年齢帯別の食費年額を適用し、学齢index 18〜21（大学生年代）の子どもには現行どおり`FOOD_PER_PERSON_MONTH`（月額×12）を適用しなければならない(SHALL)。

#### Scenario: 学齢index 0〜17の子どもは年齢帯別食費が適用される
- **WHEN** 学齢index 8（小学3年生）の子どもがいる世帯で`expensesForYear`を呼び出す
- **THEN** その子どもの食費は387,226円として計算される（大人の食費とは別枠）

#### Scenario: 大学生年代の子どもは現行どおりの計算が維持される
- **WHEN** 学齢index 19（大学2年目）の子どもがいる世帯で`expensesForYear`を呼び出す
- **THEN** その子どもの食費は`FOOD_PER_PERSON_MONTH * 12`（現行の大人と同一単価）として計算される

### Requirement: 子どもの衣服費の新規計上
`expensesForYear`の衣服費計算は、大人には現行どおり`CLOTHING_PER_ADULT_ANNUAL`を適用し、学齢index 0〜17の子ども1人につきフラットな年額（`CLOTHING_PER_CHILD_ANNUAL`）を新たに加算しなければならない(SHALL)。学齢index 18〜21（大学生年代）の子どもには衣服費を加算してはならない(SHALL NOT)（現行どおり0円）。

#### Scenario: 学齢index 0〜17の子どもは衣服費が加算される
- **WHEN** 学齢index 3（3歳）の子どもがいる世帯で`expensesForYear`を呼び出す
- **THEN** その子どもの衣服費として146,958円が加算される

#### Scenario: 大学生年代の子どもには衣服費を加算しない
- **WHEN** 学齢index 20（大学3年目）の子どもがいる世帯で`expensesForYear`を呼び出す
- **THEN** その子どもの衣服費として0円が加算される（現行と同じ）

### Requirement: お小遣いの年齢帯デフォルト（明示値優先）
`Child.allowanceMonthly`が数値として明示されている場合（`0`を含む）、`expensesForYear`はその値を現行どおり`allowanceMonthly * 12`として使用しなければならない(SHALL)。`Child.allowanceMonthly`が`undefined`の場合のみ、学齢indexに応じた年齢帯デフォルト年額（学齢index 0〜5=0円、6〜11=8,462円、12〜14=33,870円、15〜17=75,490円、18〜21=0円）を使用しなければならない(SHALL)。

#### Scenario: allowanceMonthlyが明示的に0の場合はそのまま0円が使われる
- **WHEN** 学齢index 16（高校2年生）の子どもの`allowanceMonthly`が明示的に`0`である世帯で`expensesForYear`を呼び出す
- **THEN** その子どものお小遣いは0円になる（年齢帯デフォルトの75,490円は適用されない）

#### Scenario: allowanceMonthlyが未入力(undefined)の場合は年齢帯デフォルトが使われる
- **WHEN** 学齢index 16（高校2年生）の子どもの`allowanceMonthly`が`undefined`である世帯で`expensesForYear`を呼び出す
- **THEN** その子どものお小遣いは75,490円になる

#### Scenario: allowanceMonthlyが正の数値で明示されている場合はその値が優先される
- **WHEN** 学齢index 13（中学2年生）の子どもの`allowanceMonthly`が`3000`（月額）である世帯で`expensesForYear`を呼び出す
- **THEN** その子どものお小遣いは36,000円（`3000*12`）になり、年齢帯デフォルトの33,870円は使われない

### Requirement: allowanceMonthlyの型と互換性
`Child.allowanceMonthly`の型は`number | undefined`でなければならない(SHALL)。`src/persistence/validate.ts`は`allowanceMonthly`が`undefined`であることをバリデーションエラーとしてはならない(SHALL NOT)。既存の永続化データ（本番Firestore・`defaultHousehold.ts`）は`allowanceMonthly`に明示的な数値を持つため、本changeの適用のみで計算結果が変わってはならない(SHALL NOT)。

#### Scenario: allowanceMonthly未指定のHouseholdDocがバリデーションを通過する
- **WHEN** `allowanceMonthly`フィールドを持たない子どもデータを含む`HouseholdDoc`を`validateHouseholdDoc`に渡す
- **THEN** バリデーションエラーにならない

#### Scenario: 既存の明示的allowanceMonthly:0のデータは本change適用後も同じ計算結果になる
- **WHEN** `allowanceMonthly: 0`を明示的に持つ既存の子どもデータで、本change適用前後それぞれの`expensesForYear`の結果を比較する
- **THEN** お小遣いの計算結果は変わらない（0円のまま）

### Requirement: 入力フォームでのお小遣い自動計算切り替え
`src/components/input/sections/MembersSection.tsx`の「子を追加」操作は、新規に追加する子どもの`allowanceMonthly`を設定してはならない(SHALL NOT)（＝`undefined`のまま、自動計算モードで開始する）。同画面は、子どもごとに「お小遣いを年齢に応じて自動計算する」チェックボックスを表示し、チェック時は`allowanceMonthly`を`undefined`に、チェック解除時は`allowanceMonthly`に数値（解除直後は`0`）を設定しなければならない(SHALL)。

#### Scenario: 新規追加した子どもは自動計算モードで始まる
- **WHEN** 「子を追加」ボタンをクリックする
- **THEN** 追加された子どもの`allowanceMonthly`は`undefined`であり、自動計算チェックボックスがチェック済みで表示される

#### Scenario: チェックを外すと手動入力欄が表示される
- **WHEN** 自動計算チェックボックスのチェックを外す
- **THEN** `allowanceMonthly`に`0`が設定され、お小遣い（月）の入力欄が表示される

### Requirement: ゴールデンマスター回帰との整合性確認
本changeの適用後、`tests/golden.integration.test.ts`の検証年（2027, 2030, 2035, 2040, 2050, 2060）における投資残高の対ゴールデン誤差率を確認し、既存の許容範囲（±5%以内）を超える場合は原因（`annualInvestmentContribution`が固定拠出額ベースか否か）を明らかにしなければならない(SHALL)。

#### Scenario: ゴールデンマスター回帰テストが実行できる
- **WHEN** 本change適用後に`npm test`（`tests/golden.integration.test.ts`を含む）を実行する
- **THEN** テストスイートが完走し、各検証年の誤差率がログに出力される
