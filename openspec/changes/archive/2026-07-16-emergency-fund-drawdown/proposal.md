## Why

現行の`simulate()`（`src/engine/simulate.ts`）は、単年度収支の黒字/赤字をそのまま現金残高に積み上げ/取り崩す一方、投資への拠出額（`annualInvestmentContribution`）は収支と無関係の固定額であり、現金残高と投資残高の間に連動はない。そのため、教育費・保育料等の支出が重い年は現金残高がマイナスになりうる（実際、現行のダッシュボードで2027年=-88万円、2028年=-27万円という表示が出ている）。現実には、家計はこうした年に投資資産を取り崩して生活防衛資金を確保するため、シミュレーションもこの資金繰りを反映させたい。

## What Changes

- `Assumptions`に`emergencyFundCash: number`（現金として常に維持したい最低額。デフォルト1,200,000円）を新設する
- `simulate()`の年次ループで、その年の`cash`/`invest`を現行ロジックで計算した後、`cash < emergencyFundCash`であれば不足額ぶん投資残高を取り崩して現金を補填する処理を追加する。投資残高で賄いきれない場合は投資残高を0にし、現金は閾値未満（マイナスも許容）のままにする
- 取り崩しは楽観/中央/悲観の3シナリオいずれの`simulate()`呼び出しにも同一ロジックで適用する
- 入力フォームの前提条件セクションに「生活防衛資金」の数値入力フィールドを追加する
- `src/persistence/migrate.ts`に、`emergencyFundCash`未設定の既存ドキュメント（本番Firestoreデータ含む）へデフォルト値1,200,000円を補完するマイグレーションを追加する

このchangeは総資産（現金+投資）の計算には影響しない。現金と投資の内訳を変えるのみで、単年度収支・投資利回り・拠出額のロジック自体は変更しない。

## Capabilities

### New Capabilities
- `emergency-fund-drawdown`: シミュレーションエンジンにおける、現金残高が生活防衛資金の閾値を下回った際の投資資産取り崩しロジックと、その閾値の入力フォーム編集・永続化

### Modified Capabilities
（なし。既存capabilityの要件に変更はない）

## Impact

- `src/types.ts`: `Assumptions.emergencyFundCash`を追加
- `src/engine/simulate.ts`: 年次ループに取り崩しロジックを追加
- `src/persistence/defaultHousehold.ts`・`src/persistence/placeholderHousehold.ts`: `emergencyFundCash`のデフォルト値設定
- `src/persistence/migrate.ts`: 既存ドキュメントへのデフォルト値補完マイグレーション（schemaVersion更新）
- `src/components/input/`: 前提条件セクションへの入力フィールド追加
- ゴールデンマスター回帰（`tests/golden.integration.test.ts`）: 2027年は現行シミュレーションで現金残高が-88万円（閾値120万円を下回る）であることが確認済みのため、取り崩しが発生し投資残高が変化する可能性が高い。既存の許容範囲（±5%以内）を超える場合は、一次資料（スプレッドシート）が本ロジックを含まないことに起因する意図した乖離として扱う
- 本番Firestore（`households/primary`）: マイグレーション適用により`emergencyFundCash`が補完される（値そのものはデフォルトが入るのみで、既存の他フィールドの挙動は変わらない）
