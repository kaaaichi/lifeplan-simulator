## ADDED Requirements

### Requirement: what-if シミュレーションCLI
`scripts/simulateCli.ts` は、Firebase Admin SDK経由で指定した `households/{householdId}` ドキュメントを読み込み、指定したシナリオ（`--scenario <scenarioId|active>`）を複製し、指定した `FinancialEvent[]`（一時JSONファイル経由、`--events <path>`）を複製シナリオの `inputs.financialEvents` に追加した上で `simulate()` を実行し、結果を年次テーブルとしてターミナルに出力しなければならない(SHALL)。

#### Scenario: イベントを追加したシナリオの試算結果が表示される
- **WHEN** 既存のアクティブシナリオを指定し、育休による収入減を表す `FinancialEvent` を含むJSONファイルを渡して `scripts/simulateCli.ts` を実行する
- **THEN** 複製されたシナリオに対して `simulate()` が実行され、年次の `income`・`totalExpense`・`annualCashFlow`・`totalAssets` を含むテーブルがターミナルに出力される

#### Scenario: 存在しないシナリオIDを指定するとエラーになる
- **WHEN** `households/{householdId}` に存在しない `scenarioId` を `--scenario` に指定して実行する
- **THEN** CLIはFirestoreを変更せず、エラーメッセージを出力して終了する

### Requirement: 保存フラグによる永続化制御
`--save` フラグを指定しない限り、CLIの実行は本番Firestoreを一切変更してはならない(SHALL NOT)（試算のみ）。`--save` を指定した場合のみ、複製・イベント追加したシナリオを `households/{householdId}` の `scenarios` 配列に追加してFirestoreへ保存しなければならない(SHALL)。

#### Scenario: --save なしではFirestoreが変更されない
- **WHEN** `--save` を付けずに `scripts/simulateCli.ts` を実行する
- **THEN** 実行前後で `households/{householdId}` ドキュメントの `scenarios` 配列の内容（要素数・各シナリオの中身）は変化しない

#### Scenario: --save ありで新シナリオが永続化される
- **WHEN** `--save` を付けて `scripts/simulateCli.ts` を実行する
- **THEN** 実行後の `households/{householdId}` ドキュメントの `scenarios` 配列に、複製元とは異なる `id` を持つ新しいシナリオが1件追加されている

#### Scenario: 保存前に永続化バリデーションを通す
- **WHEN** `--save` を付けて実行し、生成されたシナリオが `validateHouseholdDoc` に違反する内容（例: `financialEvents` の id 重複）を含む
- **THEN** CLIはFirestoreへの書き込みを行わず、エラーメッセージを出力して終了する

### Requirement: アクティブシナリオへの切り替え制御
`--activate` フラグは `--save` と併用した場合のみ有効であり、指定すると保存した新シナリオの `id` を `households/{householdId}.activeScenarioId` に設定しなければならない(SHALL)。`--activate` を指定しない場合、`activeScenarioId` は変更してはならない(SHALL NOT)。

#### Scenario: --save のみでは activeScenarioId が変わらない
- **WHEN** `--save` のみを付けて（`--activate` なしで）実行する
- **THEN** 実行後の `households/{householdId}.activeScenarioId` は実行前と同じ値のままである

#### Scenario: --save と --activate を両方指定するとアクティブシナリオが切り替わる
- **WHEN** `--save --activate` を付けて実行する
- **THEN** 実行後の `households/{householdId}.activeScenarioId` は、新しく保存されたシナリオの `id` になっている

### Requirement: Claude Codeスラッシュコマンドからの起動
`.claude/commands/lifeplan-simulate.md` は、ユーザーとの対話でイベント条件（種類・期間・金額）をヒアリングし、不明な金額（給付金等）は必要に応じてWeb調査で概算した上で `FinancialEvent[]` のJSONを組み立て、`scripts/simulateCli.ts` を呼び出す手順を定義しなければならない(SHALL)。

#### Scenario: スラッシュコマンド実行後にヒアリング結果が試算に反映される
- **WHEN** ユーザーが `/lifeplan-simulate` を実行し、育休期間・想定収入減額をClaudeとの対話で回答する
- **THEN** Claudeはヒアリング内容から `FinancialEvent[]` のJSONを組み立てて `scripts/simulateCli.ts` を実行し、試算結果をユーザーに提示する
