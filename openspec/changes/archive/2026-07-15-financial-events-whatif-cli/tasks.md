## 1. FinancialEvent データモデルとエンジン組み込み（TDD）

- [x] 1.1 `financialEvents` 未指定時に既存golden回帰・既存テストが不変であることを確認するテストを先に追加し（Red）、`src/types.ts` に `FinancialEvent` 型と `Inputs.financialEvents?: FinancialEvent[]` を追加、`src/engine/simulate.ts` の `annualCashFlow` 計算にイベント合算ロジックを組み込む（Green）
- [x] 1.2 期間限定イベント（例: 育休による収入減を模したケース）が該当年のみ `annualCashFlow` に反映され、他の年に影響しないことを検証するテストを追加
- [x] 1.3 `endYear: null` のイベントが、開始年以降（シミュレーション終了年まで）ずっと継続することを検証するテストを追加
- [x] 1.4 同一年に複数イベントが該当する場合、`annualAmount` が合算されることを検証するテストを追加
- [x] 1.5 `startYear > endYear` のような不正な期間のイベントがどの年にも寄与しないことを検証するテストを追加

## 2. 元利均等返済額の計算ヘルパー（TDD）

- [x] 2.1 `src/engine/loan.ts` に `monthlyLoanPayment(principal, annualRatePercent, years)` を実装する。正の金利での計算式（PMT）と、金利0%時のゼロ除算回避（単純均等割り）の両方をテストで先に固定する（Red→Green）

## 3. 永続化層のバリデーション（TDD）

- [x] 3.1 同一シナリオ内の `financialEvents` に重複した `id` が存在する場合に `validateHouseholdDoc`（`src/persistence/validate.ts`）がエラーを返すことを検証するテストを追加し（Red）、既存の `scenario.id` 重複チェックと同様の方式で実装する（Green）

## 4. CLIスクリプトのセットアップ

- [x] 4.1 `firebase-admin` を `package.json` の `devDependencies` に追加する
- [x] 4.2 `scripts/service-account.local.json` を`.gitignore`に明示的に追加する（`*.local`パターンは`.local.json`のような複合拡張子にはマッチしないため）。README等にサービスアカウントキーの発行手順・配置手順・「絶対にコミットしない」旨を記載する
- [x] 4.3 `scripts/simulateCli.ts` の引数解析（`--household`, `--scenario`, `--events`, `--save`, `--activate`）と、Firebase Admin SDK初期化・`households/{householdId}` 読み込みを実装する

## 5. CLIスクリプトの本体ロジック

- [x] 5.1 対象シナリオ（`--scenario <scenarioId|active>`）を検索し、新しい `id`・`name` を採番して複製するロジックを実装する。存在しない `scenarioId` を指定した場合はFirestoreを変更せずエラー終了することを含む
- [x] 5.2 `--events` で指定した一時JSONファイルから `FinancialEvent[]` を読み込み、複製シナリオの `inputs.financialEvents` に追加（既存イベントは保持、concat）する
- [x] 5.3 明らかに不正なイベント（`startYear > endYear` 等）を投入前に検出して弾く簡易バリデーションを実装する
- [x] 5.4 複製・イベント追加後のシナリオに対して既存の `simulate()` を実行し、年次テーブル（year, income, totalExpense, annualCashFlow, totalAssets等）をターミナルに出力する
- [x] 5.5 `--save` 未指定時はFirestoreへの書き込みを行わないこと、`--save` 指定時は `validateHouseholdDoc` を通過した場合のみ複製シナリオを `households/{householdId}.scenarios` に追加して保存することを実装する
- [x] 5.6 `--activate` は `--save` と併用した場合のみ有効で、保存した新シナリオの `id` を `activeScenarioId` に設定するロジックを実装する。`--save` のみ（`--activate` なし）では `activeScenarioId` が変わらないことを含む

## 6. Firestoreエミュレータでの検証

- [x] 6.1 既存のFirestoreエミュレータ環境（CI `firestore-emulator` ジョブ）で、`scripts/simulateCli.ts` の主要シナリオ（試算のみ／`--save`のみ／`--save --activate`／存在しないscenarioId／バリデーション違反での保存拒否）を検証するテストを追加する

## 7. Claude Codeスラッシュコマンド

- [x] 7.1 `.claude/commands/lifeplan-simulate.md` を作成する。ユーザーとの対話でイベント条件（種類・期間・金額）をヒアリングし、不明な金額は必要に応じてWeb調査で概算し、`FinancialEvent[]` のJSONを一時ファイルに書き出して `scripts/simulateCli.ts` を実行、結果を提示した上で保存するか確認する手順を記述する。ローン（車・住宅等）を含める場合は `monthlyLoanPayment()` 相当の計算を経て `annualAmount` を組み立てることを含む

## 8. 最終確認

- [x] 8.1 typecheck / lint / build / 既存テストスイート（unit・integration・e2e）全体がgreenであることを確認する
- [x] 8.2 `npx @fission-ai/openspec@latest validate financial-events-whatif-cli --strict` がpassすることを確認する
- [x] 8.3 Firestoreエミュレータ上で実際に育休シナリオ相当の `FinancialEvent` を投入し、CLIのターミナル出力を目視確認する（この過程で `npx tsx scripts/simulateCli.ts` 実運用起動時のクラッシュを発見・修正=`src/persistence/seedOverride.ts`）
