# lifeplan — 夫婦世帯のライフプラン・シミュレーション ダッシュボード

このリポジトリは、夫婦2人世帯の「老後までにいくら貯める／毎月いくら積み立てるべきか」を
年次シミュレーションで確認するダッシュボードアプリ。日々の家計簿ではない（それはマネーフォワードMEに任せる）。

## 新しいセッションを始めたとき、まずこれを読む

進行中の変更はすべて `openspec/changes/` に文書化されている。**会話の記憶に頼らず、
`openspec list` / `openspec show <change-name>` でこれらを確認して再開すること。**

新機能・変更のアイデア出しは `superpowers:brainstorming` の一問一答を使う。`openspec init`が生成した
`openspec-explore`/`openspec-propose`等の自動生成スキルや `/opsx:*` スラッシュコマンドは使わない
（`superpowers:brainstorming`を優先する。詳細は
`docs/superpowers/specs/2026-07-13-openspec-adoption-design.md` §4.2）。

- OpenSpec導入の設計書: `docs/superpowers/specs/2026-07-13-openspec-adoption-design.md`
- 過去の設計履歴（仕様の源泉、OpenSpec導入前の全機能の元設計）: `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md`
- 画面デザイン依頼文: `docs/claude-design-prompt.md`（Claude Designへ貼り付け用）

### 過去の実装履歴（〜2026-07-13、OpenSpec導入前）

以下はOpenSpec導入前にフリーフォームのMarkdownで管理していた実装計画。参照用にそのまま残す
（`openspec/specs/`への移行はしない）。新規の変更は上記のとおりOpenSpec形式で管理する。

- 実装計画: `docs/superpowers/plans/` 配下
  - `2026-06-30-lifeplan-engine-foundation.md` … **Plan 1: エンジン基盤（実装完了）**
  - `2026-06-30-lifeplan-actuals.md` … **Plan 2: 実績/予実エンジン層（実装完了）** ※仕様の源泉は設計書 §11
  - `2026-07-01-lifeplan-persistence.md` … **Plan 3: 永続化レイヤー・純TS層（実装完了）** ※仕様の源泉は設計書 §12。Firestoreアダプタ/ルール/IaCは未着手（別プラン、後日）
  - `2026-07-02-lifeplan-ui.md` … **Plan 4: ダッシュボードUI MVP（実装完了）** ※仕様の源泉は設計書 §13
  - `2026-07-02-lifeplan-input-form.md` … **Plan 5: 入力フォーム画面（実装完了）** ※仕様の源泉は設計書 §14。シナリオ管理/ログイン画面/Firebase実配線は未着手（別プラン、次はここ）
  - `2026-07-04-lifeplan-scenarios.md` … **Plan 6: シナリオ管理画面（実装完了）** ※仕様の源泉は設計書 §15
  - `2026-07-07-lifeplan-firebase.md` … **Plan 7: ログイン画面＋Firebase実配線（実装完了・本番デプロイ済み）** ※仕様の源泉は設計書 §12.3②③・§8.4

> プラン番号変更メモ（2026-06-30）: 設計書 §11.6 の推奨に従い、純TSの「実績/予実エンジン層」を
> Firebase より先に実装することにした。旧 Plan 2(Firebase)→Plan 3、旧 Plan 3(UI)→Plan 4 に繰り下げ。

## 再開手順（セッションをまたぐ運用）

1. **`openspec list` で進行中の変更を確認する**。
2. **対象の変更の `tasks.md` を開き、最初の未チェック（`- [ ]`）タスクを見つける** = そこが続きの開始点。
3. そのタスクを **superpowers:subagent-driven-development**（推奨）または **superpowers:executing-plans** に従って TDD で実装する。
4. タスク完了ごとに `tasks.md` の該当チェックボックスを `- [x]` に更新し、`git commit` を実行する。
5. **変更が完了したら `openspec archive <change-name>` を実行し、セッションを切ってよい**。次セッションは手順1から繰り返す。

> 新セッションでの最短の指示例:
> 「`lifeplan` の `openspec list` で進行中の変更を確認して、最初の未チェックタスクから TDD で実装して、各ステップ後にチェックを付けてコミットして。」

## 開発メモ

- 作業ディレクトリ: `lifeplan/`。テストは `cd lifeplan && npm test`（Vitest）。
- エンジンは純TypeScript（UI/Firebase非依存）。`src/engine/` と `src/masterData/`。
- **ゴールデンマスター**: ユーザーの実スプレッドシート `~/Downloads/ライフプランニング2026~.xlsx` を
  正解データとして回帰テストする（Plan 1 Task4の抽出スクリプトが `education.json` と `tests/fixtures/golden.json` を生成）。
  この xlsx は個人の金融データを含むため**リポジトリにはコミットしない**（ローカル参照のみ）。
  別マシン/別セッションで Task4 を実行する場合はこの xlsx が `~/Downloads/` に必要。
- MVP方針=「案② コア＋主要ドライバー」: 収入/住居/教育費/投資・利回り/家電/年金は忠実、
  児童手当の所得制限や医療費加齢カーブ等のロングテールは簡易化。
- **このリポジトリでの作業は必ず git worktree を使う**（superpowers:using-git-worktrees）。作業完了後はworktreeを掃除する。

## 現在のステータス

- [x] ブレインストーミング・設計合意（Firebase構成、React/TS、案②）
- [x] 設計書コミット
- [x] Plan 1（エンジン基盤）作成
- [x] Plan 1 実装（全10タスク完了・レビュー済み。ゴールデン回帰は2027–2060で対スプレッドシート≈0%。全34テストgreen）
- [x] Plan 2（実績/予実エンジン層）作成
- [x] Plan 2 実装（全4タスク完了・SDDレビュー済み。actuals 上書き/リベース・baseline 凍結・variance。背骨達成=actuals 未指定で golden 0% 不変。全48テストgreen＋typecheck。最終レビュー=merge可）
- [x] Plan 3（永続化レイヤー・純TS層）作成
- [x] Plan 3 実装（全5タスク完了・SDDレビュー済み。`src/persistence/`: types/errors/validate/doc(toDoc/fromDoc/createDefaultDoc)/migrate/repository。5つの契約凍結（未来schemaVersion fail-closed・migrate→validate順・baseYearクロスフィールド不変条件・save確定doc返却・subscribe初期発火）を実装・検証。背骨達成=`src/engine/`無改変で golden 0% 不変。全81テストgreen＋typecheck。最終レビュー=merge可（PII seedデータの扱いはPlan 4検討事項として申し送り）。Firestoreアダプタ/ルール/IaCはスコープ外・別プラン）
- [x] Plan 4（UI）作成・実装（全10タスク完了・SDDレビュー済み。Vite+React+Zustand+RechartsをlifeplanパッケージにScaffold、`src/store/`: householdStore(InMemoryRepository bootstrap)/selectors(engine派生: KPI/チャート系列/イベントマーカー)。`src/components/`: Header/KpiCards/AssetChart(楽観/悲観バンド+イベントマーカー)/BreakdownTabs/Dashboard。PII対応=ゴールデン回帰用`defaultHousehold.ts`は無改変のまま、UI初期シードは新規`placeholderHousehold.ts`に分離。Playwrightスモークe2eをCI追加。全97テストgreen＋typecheck+lint+build+e2e。最終レビュー(opus)=Ready to merge。PR #2をmainへsquash merge済み。入力フォーム/シナリオ管理/ログイン画面/Firebase実配線(Auth/Firestoreアダプタ/デプロイ)は次プラン以降）
- [x] Plan 5（入力フォーム画面）設計（§14）・プラン作成・実装（全13タスク完了・SDDレビュー済み。react-router-dom 導入で `/`ダッシュボード・`/input`入力画面・Headerナビを構成。`src/store/draftStore.ts`（ドラフト+明示保存: beginEdit/update/discard/save=土台doc差し替え・updatedAt打刻・fromDoc最終防壁・fail-closed C1）、householdStore repository保持+購読冪等化、`selectPreviewData`。`src/components/input/`（fields 4部品=文字列保持パース+aria-label、6セクション、PreviewPane=200ms debounce+error boundary、SaveBar、InputPage=アコーディオン/2カラム/useBlocker+beforeunload遷移ガード/baseYear固定表示）。設計書§14.4に子birthYear例外を追記済み。背骨達成=`src/engine/`・`src/persistence/`無改変で golden 回帰不変。全155テストgreen＋typecheck+lint+build+e2e(dashboard/input各1本)。Playwright MCPで目視確認済み(編集→プレビュー→保存→ダッシュボード反映・遷移ガード・不正値エラー・モバイル幅)。シナリオ管理/ログイン画面/Firebase実配線は未着手（別プラン、次はここ）
- [x] Plan 5 最終レビュー申し送り2件の堅牢化（PR #8 squash merge済み=b3e8a30。①draftStore.save: beginEdit で固定した scenarioId が save 時点の doc.scenarios に無ければ saveError+false・repository 未書込・dirty 維持。②App.tsx Layout が state.repository を load(repository) に渡す配線＋InputPage.integration.test の load monkeypatch を setState({repository}) に簡素化。157 unit/integration＋e2e 2本、CI全green。engine/persistence 無改変）
- [x] Plan 6（シナリオ管理画面）設計（§15）・プラン作成・実装（全6タスク完了。`/scenarios` 画面（ScenariosPage/ScenarioCard=複製・インラインrename・2段階削除・アクティブ切替）、`/input/:scenarioId`（任意シナリオ編集）、Headerに「シナリオ」ナビ、`src/persistence/scenarioOps.ts`（純追加）・`src/store/scenarioActions.ts`。全197 unit/integrationテストgreen＋typecheck+lint+build+e2e 3本（dashboard/input/scenarios=複製→編集→保存→切替→ダッシュボード反映）。`src/engine/`・`src/persistence/`既存ファイル無改変）
- [x] Plan 7（ログイン画面＋Firebase実配線）設計（§12.3②③・§8.4）・プラン作成・実装・本番デプロイ完了（全6タスク完了・SDDレビュー済み。詳細・保留事項・次にやりたいことは「次のタスク」セクション参照。本番URL: https://YOUR_FIREBASE_PROJECT_ID.web.app）
- [x] ダッシュボード表示期間セレクター設計（§18）・プラン作成・実装（全5タスク完了・SDDレビュー済み。`AssetChart`/`BreakdownTabs`/`AnnualTable`に「65歳まで(デフォルト)」「全期間」切替を追加。`selectPeriodFilteredData`(純関数, `src/store/selectors.ts`)が`YearRow.agePrimary`で年フィルタ、baseYear時点で65歳超の場合は全期間へフォールバック。`KpiCards`/`VarianceSection`は対象外・フィルタ不変を回帰テストで固定。選択状態は画面内のみ(永続化なし)。`src/engine/`・`src/persistence/`無改変。全269テストgreen＋typecheck+lint+build+e2e5本。最終レビュー(opus)=Ready to merge、Critical/Important指摘0。PR #17をmainへsquash merge済み=791cb58）
- [x] 表示期間セレクターに10年/20年プリセットを追加（設計§21・プラン作成・実装、全5タスク完了・SDDレビュー済み。`DashboardPeriod`に`'y10'`/`'y20'`を追加、`baseYear`起点で`baseYear+9`/`baseYear+19`までフィルタ。`selectPeriodFilteredData`を`passthroughPeriodData`/`filterPeriodDataByCutoffYear`ヘルパーへリファクタリング(挙動不変)。ボタン順「10年→20年→65歳まで→全期間」、デフォルトは65歳までのまま。`Dashboard.tsx`は無改変。全291テストgreen＋typecheck+lint+build+e2e5本。最終レビュー(opus)=Ready to merge、Critical/Important指摘0。PR #18をmainへsquash merge済み=e078bde）
- [x] OpenSpec導入（設計の源泉=`docs/superpowers/specs/2026-07-13-openspec-adoption-design.md`）・実装完了（全10タスク完了。`openspec init --tools claude`でCLI導入、CIに`openspec-validate`ジョブ追加、CLAUDE.mdの再開手順をOpenSpecベースに更新。受け入れ試験・リグレッションテストは新規テストランナーを増やさず既存Vitest/Playwrightに統合する運用ルールを確立。トライアル変更`fix-plan7-minor-issues`（Plan7最終レビューのMinor指摘2件）をこのフローでTDD実装し、`openspec/specs/firebase-session-reliability/spec.md`にarchive済み。全テストgreen＋typecheck+lint+build+e2e）
- [x] **FinancialEvent（育休・車購入・ローン等のwhat-ifイベント）＋Claude Codeスラッシュコマンド経由のシミュレーションCLI**を設計（`superpowers:brainstorming`→OpenSpec `financial-events-whatif-cli`）・実装完了（全8タスク・SDDレビュー済み）。`Inputs.financialEvents?: FinancialEvent[]`（`id`/`label`/`startYear`/`endYear: number|null`/`annualAmount`）を追加し`simulate()`の`annualCashFlow`にのみ反映（`income`/`ExpenseBreakdown`は不変）。`src/engine/loan.ts`の`monthlyLoanPayment()`で車・住宅ローンの元利均等返済額を金利込みで算出。新規`scripts/simulateCli.ts`（Firebase Admin SDK、`npx tsx`実行）が本番Firestoreの既存シナリオを複製→`FinancialEvent`マージ→`simulate()`実行→年次テーブル出力、`--save`で永続化・`--activate`（`--save`併用時のみ）でアクティブ切替。`.claude/commands/lifeplan-simulate.md`からClaudeが対話的に条件をヒアリングして呼び出す。Task8最終確認で`npx tsx`実運用起動時のクラッシュ（`seedOverride.ts`のVite専用`import.meta.glob`）を発見・修正。最終レビュー(opus)=Ready to merge with fixes、Critical指摘0・Important指摘1件（スラッシュコマンドの`allowed-tools`が本番`--save`書き込みまで自動承認していた安全性懸念）は修正済み。全350 unit/integration＋e2e5本green、`openspec validate --strict`パス。mainへfast-forward merge済み。**次にやりたいこと**: `scripts/service-account.local.json`（Firebase Admin SDKサービスアカウントキー）をユーザーが未発行のため、実際に`/lifeplan-simulate`を使うにはFirebase Consoleでの発行・配置が必要（`lifeplan/scripts/README.md`に手順あり）
- [x] **生活防衛資金(現金120万円)維持のための投資取り崩し**（2026-07-16完了）: ダッシュボードで現金残高がマイナス表示される年があった（例: 実データ2027年-88万円）ことを受け、`superpowers:brainstorming`→OpenSpec `emergency-fund-drawdown`として起票・実装（全5タスク完了・SDDレビュー済み）。`Assumptions.emergencyFundCash: number`（デフォルト1,200,000円、入力フォーム編集可）を追加し、`simulate()`の年次ループで現金残高が閾値を下回った年は投資残高を取り崩して現金を閾値まで回復（総資産=cash+investは不変）。投資残高でも賄いきれない場合は投資残高0・現金は閾値未満のまま。実績年(actual)の上書きが常に優先される。永続化は`migrate.ts`にschemaVersion 1→2のマイグレーションを追加し、既存Firestoreデータへ`emergencyFundCash: 1_200_000`を補完。ゴールデンマスター回帰は誤差0.00%（`defaultHousehold.ts`にはFinancialEventsが無く閾値を下回らないため、取り崩しロジック自体が発火しない＝ダッシュボードで見えていたマイナス現金は本番シナリオ固有の育休等イベントによるもの）。全360 unit/integration＋typecheck+lint+build+e2e5本green。`openspec/specs/emergency-fund-drawdown/spec.md`に統合済み。**申し送り**: 本番Firestoreへのマイグレーション適用（デプロイ・実データでの動作確認）は未実施
- [x] **FinancialEventのkind(収入/支出)追加・単年度収入/支出への正しい反映**（2026-07-20完了）: 「育休があるのに単年度収入が一定になっている」というユーザー指摘を受け、`FinancialEvent`は`annualCashFlow`にのみ加算し`income`/`ExpenseBreakdown`は変更しない旧決定（`financial-events-whatif-cli`決定4）を見直した。`FinancialEvent`に必須フィールド`kind: '収入' | '支出'`を追加し、`kind:'収入'`は`income`に加算・`kind:'支出'`は`totalExpense`から減算（`annualCashFlow`合計・カテゴリ別`ExpenseBreakdown`自体は不変）。実装はコミット`a6a4c82`（全400テストgreen＋typecheck/lint green）。本番Firestore（`households/primary`）の育休シナリオ4件（既存分）にも`kind: '収入'`を補完済みで、読み取り専用の`scripts/simulateCli.ts`試算で2026年855.3万円・2027年941.4万円（育休による収入減を反映した金額）になっていることを確認した。OpenSpec `financial-event-kind-classification`として起票し`openspec/specs/financial-events/spec.md`に統合済み。**申し送り**: `kind`追加にschemaVersionマイグレーション（`migrate.ts`）・`validate.ts`での実行時必須チェックは未対応。`kind`を持たない`FinancialEvent`が将来書き込まれた場合、`income`/`totalExpense`のどちらにも反映されず静かに無効化されるリスクが残る（恒久対策は別change候補）

## 次のタスク（2026-07-04 棚卸し、同日更新）

- [x] **issue #4 + #5（チャート修正）**: PR #9 squash merge 済み=d1320d2（stale コミット2つを main に cherry-pick して再検証。formatYenCompact/yAxisWidth 導入・現金=アンバー/投資=ティール分離・凡例追加。170 unit/integration＋全ゲート＋Playwright 目視3ビュー確認、CI 全green。issue #4/#5 自動クローズ済み）。
   ※教訓: Recharts は **fullPage スクリーンショットだと ResponsiveContainer 再測定で空白に写る**（コードは正常）。目視確認はビューポート撮影で行うこと。
- [x] **棚卸しの残り**（2026-07-06 ユーザー操作で完了・検証済み）: issue #6 クローズ（open issue 0件）、issue系 worktree/branch 3組削除、root直下の残骸（誤パス `src/`・jsdomのみの `package.json`+`node_modules`・スクリーンショット類）削除。
- [x] **本線 = Plan 6 作成・実装**: シナリオ管理（一覧/複製/rename/削除/アクティブ切替、`/input/:scenarioId`）実装完了。全197テスト＋全ゲート＋e2e 3本green。詳細は「現在のステータス」参照。
- [x] **Plan 7（ログイン画面＋Firebase実配線）作成・実装・デプロイ完了**: 設計の源泉=§12.3②③・§8.4。プラン=`docs/superpowers/plans/2026-07-07-lifeplan-firebase.md`（全6タスク完了・SDDレビュー済み）。ports-and-adapters を維持し、既定は従来どおり `memory` モード（`VITE_PERSISTENCE` 未設定）で完全パススルー、`--mode firebase`（`dev:fb`/`build:fb`）でのみ認証ゲート＋Firestore有効。`src/firebase/`(config/app/authPort)・`src/persistence/firestoreRepository.ts`（純追加・H3/H4/C1をエミュレータ検証）・`src/store/authStore.ts`（fail-closed許可判定）・`src/components/auth/`(LoginPage/AccessDenied/AuthGate/FirebaseAuthGate=lazy分割)。IaC一式（`firebase.json`/`.firebaserc`/`firestore.rules`/`firestore.indexes.json`）とCI `firestore-emulator` ジョブ追加。全224 unit/integration＋emu12件green、typecheck/lint/build/build:fb/e2e3本green。最終レビュー(opus)=Ready to merge、Critical/Important指摘0（Minor2件=`householdStore.load`のsubscribe onError未配線・`FirebaseAuthGate`のsignOut時repositoryReady未リセット、いずれも保留可）。
   - [x] **Task 7（手動配線）**: 1人目UID（`kaaaichi.iida@gmail.com` = `REPLACE_WITH_YOUR_UID_A`）取得・`firestore.rules`/`.env.local`へ登録・`deploy:rules`実施・`dev:fb`ローカルで実アクセス確認・`deploy:hosting`実施・本番URL（https://YOUR_FIREBASE_PROJECT_ID.web.app）で実アクセス確認、全て完了。PR #11 を main へ squash merge済み。
   - [x] **2人目（配偶者）のUID登録**（2026-07-09完了）: 2人目のUIDを`firestore.rules`の許可リスト2枠目（旧`PLACEHOLDER_UID_B`）と`.env.local`の`VITE_FIREBASE_ALLOWED_UIDS`に追記し、`npm run deploy:rules`で本番デプロイ済み。

## 次にやりたいこと（2026-07-13 更新、OpenSpec導入トライアルで1件消化）

- [ ] **シナリオ比較トグル**（設計の源泉=§8.1・§7③。§13.6/14.6/15.7で繰り返し「後続プラン」と明記されてきたもの）: 複数シナリオの総資産線を重ね描き＋差分テーブル表示。Plan 6でシナリオ複製ができたので今初めて意味を持つ。今後は`superpowers:brainstorming`→OpenSpec（`openspec new change`）で起票する。
- [ ] **actuals（実績値）入力UI・リベース操作**（設計の源泉=§11、§14.6/15.7で繰り返し保留）: エンジン層（Plan 2）は完成済みだがUIが無い。今後はOpenSpecで起票する（ブレストが要るかは設計書§11を見て判断）。
- [x] **Plan 7最終レビューのMinor指摘2件の後片付け**: OpenSpec導入のトライアル変更として実施（`openspec/changes/archive/2026-07-13-fix-plan7-minor-issues/`）。householdStore.loadのonError未配線・FirebaseAuthGateのrepositoryReady未リセットをTDDで解消し、`openspec/specs/firebase-session-reliability/spec.md`に統合済み。
- [x] **大学費用の実額+バッファ見直し**（2026-07-15完了）: 同年代・同年収・同居住地の実例調査（`research/2026-07-15-education-cost-benchmark.md`）で、`education.json`の大学費用（国立81.8万円/年等）が出典不明・国立の値が別統計の孫引きらしき値と一致していたことが判明。OpenSpec `university-cost-buffer`として起票し、一次資料（e-Gov省令・文科省/私学事業団調査）の実額+20%バッファへ4区分すべて更新、入学金（大学1年目のみ一時計上）を新たにモデル化。`universityCost()`シグネチャ不変のため`engine/expenses.ts`は無改変。全354テストgreen、ゴールデン回帰は誤差0.00%（investmentBalanceは固定拠出額ベースで教育費変動と無関係）。PR #20をmainへsquash merge・本番デプロイ済み。`openspec/specs/university-cost-model/spec.md`に統合済み。
- [x] **教育費・保育料以外の養育費（食費・衣服費・お小遣い）の年齢帯モデル見直し**（2026-07-16完了、OpenSpec `childcare-living-cost-model`、SDDレビュー済み）: 第2子誕生をきっかけに、教育費・保育料以外の養育費が年齢によらず固定額（食費は大人と同一単価、衣服費は子ども分ゼロ計上、お小遣いはデフォルト0円）だったことを`research/2026-07-15-childcare-living-cost-benchmark.md`（国立成育医療研究センター2025年調査の表3を一次PDF直接確認）で発見。新規`src/masterData/childLivingCost.ts`に5年齢帯（0-2/3-5/小学生/中学生/高校生）の食費・お小遣いデフォルト年額テーブルと子ども用フラット衣服費定数(146,958円)を追加し、`src/engine/expenses.ts`に組み込み（大学生年代・大人の計算式は不変）。`Child.allowanceMonthly`を`number|undefined`化し、`/input`画面に「お小遣いを年齢に応じて自動計算する」チェックボックスを追加（新規追加した子どもは自動モードで開始、既存の明示値は変更なし）。最終レビュー(opus)でCritical指摘1件（Firestoreが`undefined`フィールド書き込みで例外を投げ、新規追加した自動モードの子どもが本番で保存できない）・Important指摘1件（研究ファイル未コミット）を発見・修正（`initializeFirestore(..., {ignoreUndefinedProperties:true})`をFirestoreエミュレータで検証）、re-review=Ready to merge。全394 unit/integration＋emu18件＋e2e5本green、golden回帰6年すべて誤差0.00%。`openspec/specs/childcare-living-cost-model/spec.md`に統合済み。mainへマージ済み（`61eaf06 Merge branch 'childcare-living-cost-model' into main`）。
- [x] **実質資産評価額（円安・CAPE反転シナリオ）カードをダッシュボードに追加**（2026-07-20完了）: 昨今の円安・米国株高で名目の投資残高・コーストFIRE達成率が嵩上げされている問題を受け、`superpowers:brainstorming`（ビジュアルコンパニオンでレイアウト案比較）→OpenSpec `real-asset-value-fx-scenarios`として起票・実装完了（全4タスク・SDDレビュー済み）。為替(USD/JPY)とS&P500 Shiller CAPEレシオが歴史的水準へ巻き戻った場合の実質評価額を3シナリオ（A:穏当な反転／B:企業物価PPP水準／C:消費者物価PPP水準）でダッシュボードに常設表示。計算はpure関数`src/engine/realAssetValue.ts`に隔離（`src/engine/`の決定性・ゴールデンマスター回帰は無改変）、シナリオ定義は`src/masterData/realValueScenarios.ts`の静的定数、為替・CAPEは`src/market/marketDataPort.ts`経由でライブ取得（`open.er-api.com`・Shiller CAPEミラー）、取得失敗時は指標ごとにフォールバック定数（為替162円・CAPE41）へ自動降格しカードに参考値である旨を表示。`src/store/marketDataStore.ts`がusdJpy/cape独立の loading/live/fallback 状態を管理。`KpiSummary`に`currentInvestmentBalance`（現金除く投資残高）を追加。タスク単位レビュー4回・最終の全ブランチレビュー(opus, Critical/Important指摘0・Minor3件は修正済み)に加え、PR化後に独立の外部コードレビュー(ワークフロー, Critical/Important指摘0)でも3件（ライブ取得値の妥当性範囲チェック欠如・一部テストのfetchスタブ漏れ・JSON parseエラーのラップ不整合）を追加修正。全433 unit/integration＋typecheck/lint/build+e2e6本green。PR #21をmainへsquash merge済み（`224a952`）、`openspec/specs/real-asset-value-scenarios/spec.md`に統合済み。**申し送り**: 個人の実資産評価額・保有ファンド構成の分析は`research/2026-07-15-asset-real-value-fx-jpy-scenario.md`（`.gitignore`済み・非公開）に集約。反転シナリオの前提値(為替135/92/106円・CAPE30/28/25、フォールバック162円/41)は2026-07時点の静的スナップショットで、editable UIは今回スコープ外（design.mdのNon-Goals）
- [x] **資産の全国・同年代比較（推定偏差値）カードをダッシュボードに追加**（2026-07-25完了）: 「同年代・全世帯と比べてどのくらいの位置にいるか」を知りたいという要望を受け、`superpowers:brainstorming`→OpenSpec `asset-percentile-comparison`として起票・実装完了（全5タスク・レビュー済み）。出典は金融広報中央委員会(J-FLEC)「家計の金融行動に関する世論調査2025年」（二人以上世帯調査、図表4）。現在の総資産(`KpiSummary.currentTotalAssets`)を「全世帯」「同年代（世帯主の10歳刻み年代）」と比較し、推定偏差値・パーセンタイル順位に基づく相対位置・平均値・中央値を表示。偏差値は平均・標準偏差ベースの古典的算出ではなく、公表分布（資産額レンジ別世帯割合）から補間したパーセンタイル順位を標準正規分布の逆CDF（Acklam近似を自前実装）で換算する独自方式を採用（実際の分布が右に大きく歪んでいるため）。中央値をCDFのアンカー点として明示的に挿入し、中央値ちょうどの世帯は必ず偏差値50になることを構成上保証（TDD中に中央値が区分境界値と一致するケース(40代/50代)で退化区間が生じるバグを発見・修正）。全国+6年代の7グループ全てで単調性を検証するテストを追加。3000万円以上（開区間）・20歳未満/80歳以上（年代範囲外）は近似フラグを立てカードに注記。出典はカード上に常時表示し、出典名は一次情報源URLへのクリック可能なリンク（`target="_blank" rel="noopener noreferrer"`）にした。データは`src/masterData/householdAssetBenchmark.ts`に静的スナップショットとして保持（ライブ取得API不在のため手動更新前提、整合性テストで転記ミスを検知）。一次データは`research/2026-07-24-household-asset-benchmark.md`に記録。`src/engine/`本体・ゴールデンマスター回帰は無改変。全500 unit/integration＋typecheck/lint/build green、Playwrightでデスクトップ/モバイル幅目視確認済み。最終レビュー(code-reviewer)でCritical/Major指摘0、Minor指摘2件（単調性テストの追加・近似注記テストの検証力強化）は対応済み。mainへマージ済み（`0c9740c`）、`openspec/specs/household-asset-benchmark/spec.md`に統合済み。**申し送り**: 反転シナリオ同様、統計データは2025年調査の静的スナップショットであり、来年以降の調査更新時は`householdAssetBenchmark.ts`を手動で差し替える運用（自動変換スクリプトは意図的に導入せず、design.md参照）
