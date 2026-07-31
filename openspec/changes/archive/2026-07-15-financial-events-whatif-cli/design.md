## Context

現在の `src/engine/income.ts` の `memberIncome` は `Member.takeHomeIncome` を「就労終了年齢まで一定」として扱い、`src/engine/expenses.ts` も `appliances`/`homeMaintenance` のような周期的な単発支出しか表現できない。育休・産休のような期間限定の収入減、車購入・ローン・旅行のような臨時支出は表現できず、直近年の予測精度が落ちている。

既存コードベースには類似の前例がある: `Assumptions.oneTimeInvestments`（単年の投資額加算）、`Housing.loanMonthly`+`loanRemainingYears`（金利計算なしの簡易住宅ローンモデル）。今回の設計はこれらの前例と一貫性を保つ。

このchangeは2つのレイヤーからなる: (A) エンジンのデータモデル拡張（`financial-events` capability）、(B) Claude Codeコマンド経由の運用ツール（`whatif-simulation-cli` capability）。(B)は(A)に依存する。

## Goals / Non-Goals

**Goals:**
- 期間限定/継続的な収支調整（育休の収入減、車の購入・ローン返済・維持費、旅行等の臨時支出）を `FinancialEvent` として表現し、`simulate()` に反映する
- 借入元本・年利・返済年数から、元利均等返済方式の月次返済額を計算するヘルパー関数を提供し、車・住宅等のローンの `FinancialEvent.annualAmount` を金利込みで算出できるようにする
- 既存の永続化層（`toDoc`/`fromDoc`/`migrate.ts`/`validate.ts`）・golden回帰との後方互換性を崩さない
- Claude Codeのスラッシュコマンド経由で、ヒアリングした条件をもとに本番Firestoreデータに対しwhat-ifシミュレーションを実行できる
- 本番データへの書き込みは明示的な操作（`--save`）のみで発生し、デフォルトでは試算のみ（本番データ不変）

**Non-Goals:**
- 入力フォーム（GUI）からの `FinancialEvent` 編集（本changeのスコープ外。UI不要という要件による）
- 返済期間中の残債・支払利息の年次内訳を追跡する精密なローンシミュレーション、繰上返済シミュレーション（月次返済額は元利均等返済方式で一度算出したら、返済期間中は一定額として扱う近似で十分とする）
- 月単位の期間指定（年単位のみ。エンジン自体が年次シミュレーションのため）
- `ExpenseBreakdown`（内訳グラフ）へのイベント反映（`annualCashFlow`にのみ影響させる）
- 専用MCPサーバーの構築

## Decisions

1. **収入/支出を分けず統一 `FinancialEvent` モデルにする。**
   代替案: `IncomeAdjustment[]`と`ExpenseAdjustment[]`を別々に持つ。
   採用理由: 車購入（支出）→維持費（支出）や育休（収入減）は概念的に同じ「期間×金額」の調整であり、型を分けるメリットがない。ユーザー要望でも統一モデルが選ばれた。

2. **期間は年単位（`startYear`/`endYear`）のみ。月単位の按分機能は持たない。**
   採用理由: エンジンが年次シミュレーションのため、月単位対応は`simulate.ts`の年ループ構造を変える大改修になる。月単位の精度が必要な場合は、呼び出し側（ヒアリングするClaude）が年間換算額を計算してから渡す運用でカバーする。

3. **`endYear: number | null`（`undefined`ではなく`null`）。**
   TypeScript専門レビューで検証済み: 既存の`Assumptions`系optionalフィールドは「未設定＝デフォルト値」という`undefined`スタイルだが、`endYear`は「無期限に継続する」という明示的な値を表すため意味が異なる。`null`はFirestoreが正規サポートする値であり曖昧さがない。

4. **`FinancialEvent`は`annualCashFlow`にのみ加算し、`income`/`ExpenseBreakdown`は変更しない。**
   採用理由: ダッシュボードの内訳タブ（カテゴリ別グラフ）にどう表示するかは非自明な設計判断（新カテゴリを作るか等）であり、本changeのスコープを絞るため対象外とする。総資産推移（`AssetChart`）には正しく反映される。

5. **車のローンは専用型を作らず、`FinancialEvent`の組み合わせ（頭金1件＋返済期間の一定額1件＋維持費の継続1件）で表現する。**
   既存の`Housing`住宅ローンモデル（金利計算なし）と一貫性を保つための判断。

5a. **ローンの金利は「月次返済額を一度算出するための入力」としてのみ扱い、返済期間中の残債・利息内訳は追跡しない。**
   `src/engine/loan.ts` に、借入元本・年利（%）・返済年数を受け取り元利均等返済方式の月次返済額を返す `monthlyLoanPayment()` を純粋関数として追加する。この結果を`FinancialEvent.annualAmount`（月次返済額×12、返済完了年までの一定額）として使う。
   代替案: `Loan`型を新設し`simulate.ts`側で年次残債・利息を計算する。
   採用理由: 本プロジェクトの目的はライフプランの精度向上であり、正確な会計処理（利息費用の期間帰属等）までは不要。既存の`Housing`住宅ローンと同じ簡易方針に揃えることで一貫性を保てる。

6. **運用ツールはCLIスクリプト（`scripts/simulateCli.ts`）+ スラッシュコマンドとし、専用MCPサーバーは作らない。**
   採用理由: 既存の`src/engine/`が純TypeScriptでNode.jsから直接importできるため、CLIスクリプトの実装コストが最小。MCPサーバーはボイラープレートが大きく本用途にはオーバースペック。

7. **CLIはFirebase Admin SDKで本番Firestoreを直接読み書きする。**
   採用理由: 既存の「シナリオ複製」機能をそのまま活かし、試した結果を即座にダッシュボードUIでも確認できるようにするため。認証情報は`scripts/service-account.local.json`に保管する。`*.local`パターンは`.local.json`のような複合拡張子にはマッチしないため、既存の`src/persistence/seed.local.json`と同じ方式で`.gitignore`に`scripts/service-account.local.json`への明示的なエントリを追加する（Task 4実装時に判明・対応済み）。

8. **既存シナリオへの直接上書きではなく、自動複製した新シナリオにイベントを追加する。**
   採用理由: what-if比較（元シナリオと変更後シナリオを両方残して見比べる）がしやすく、誤って元データを壊すリスクを避けられる。

9. **`--save`（永続化）と`--activate`（アクティブシナリオへの切り替え）を分離したフラグにする。**
   採用理由: 「試算だけ」「保存だけ（あとで確認）」「保存してすぐダッシュボードに反映」の3段階を明示的に制御できるようにするため。デフォルトは最も安全側（試算のみ、Firestore不変）。

## Risks / Trade-offs

- [Risk] `financialEvents`内で`id`が重複登録されると、編集・削除操作を`id`で特定する将来のUI実装時に誤動作しうる → [Mitigation] `src/persistence/validate.ts`に、既存の`scenario.id`一意性チェック（`new Set(ids).size !== ids.length`）と同様の方式で`financialEvents`のid一意性チェックを追加する
- [Risk] `startYear > endYear`や、`endYear`が`baseYear`より過去のイベントを誤登録しても、エンジンは無検証で「該当年なし＝0扱い」として静かに握りつぶす（既存の`housing`/`appliances`と同じ設計方針を踏襲するため） → [Mitigation] `scripts/simulateCli.ts`側で投入前に明らかな矛盾（`startYear > endYear`）を弾く簡易バリデーションを入れる。あわせて`tests/simulate.integration.test.ts`にこれらのエッジケースを固定するテストを追加する
- [Risk] Firebase Admin SDKのサービスアカウントキー漏洩（誤コミット・誤共有） → [Mitigation] `.gitignore`に`scripts/service-account.local.json`への明示的なエントリを追加する（`*.local`パターンは`.local.json`にはマッチしないため）。加えてREADMEに「このファイルは絶対にコミットしない」旨を明記する
- [Risk] `--activate`によって本番のアクティブシナリオが意図せず切り替わる → [Mitigation] デフォルトでは`--activate`なし。使用時はCLIがターミナルに確認メッセージ（切り替え前後のシナリオ名）を表示してから実行する
- [Risk] `firestoreRepository.ts`（ブラウザ側）は`initializeFirestore`に`ignoreUndefinedProperties`を渡しておらず、`undefined`値を含むオブジェクトの`setDoc`は例外になる（`oneTimeInvestments`が既に抱える既存の技術的負債） → [Mitigation] 本change自体は`endYear: null`を使うため直接の影響はないが、`scripts/simulateCli.ts`で`FinancialEvent`を組み立てる際に`undefined`を含む値を作らないようにする。既存の`undefined`地雷そのものの解消は本changeのスコープ外とし、Impact節に既知の負債として記録するに留める

## Migration Plan

- `Inputs.financialEvents?`はoptionalフィールドであり、`CURRENT_SCHEMA_VERSION`は変更しない。既存Firestoreドキュメント（`financialEvents`フィールドを持たない）は`fromDoc`/`migrateHouseholdDoc`が無変更のまま通過し、`simulate()`側も`inputs.financialEvents ?? []`で空配列扱いするため、golden回帰・既存シナリオの挙動は一切変わらない
- デプロイはコード変更（型追加・エンジン変更・新規スクリプト・新規コマンド定義）のみで、Firestoreへのマイグレーション作業は不要
- ロールバック: 本changeで追加されるのは新規ファイル（`scripts/simulateCli.ts`, `.claude/commands/lifeplan-simulate.md`）と型への追加フィールドのみなので、コミットをrevertするだけで容易にロールバックできる。仮にCLI経由で`financialEvents`を含むシナリオが本番に保存された後にロールバックしても、UIはこのフィールドを無視するため実害はない

## Open Questions

- `financialEvents`のid一意性チェックは「シナリオ内でのユニーク性」を検証する想定だが、実装時に`validate.ts`の既存チェックの粒度（シナリオ単位かdoc全体か）と揃える必要がある
- 将来、`ExpenseBreakdown`（内訳グラフ）にイベントの影響を表示したくなった場合の拡張方針は本changeのスコープ外とし、別途changeで検討する
