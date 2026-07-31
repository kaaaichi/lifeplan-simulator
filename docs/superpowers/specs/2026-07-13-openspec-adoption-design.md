# OpenSpec導入による仕様駆動開発フロー整備 設計書

- 日付: 2026-07-13
- ステータス: 承認済み（brainstorming完了）
- 参考資料:
  - [OpenSpec (Fission-AI/OpenSpec)](https://github.com/Fission-AI/OpenSpec/)
  - 北浦智也「SREの積み重ねがAI駆動開発のガードレールになった ― 7つの実践」SRE Next 2026
    ([Speaker Deck](https://speakerdeck.com/tomoyakitaura/sre-guardrails-the-7))

## 1. 背景・目的

参考スライドは「AIは与えられた入力を増幅する装置であり、出力品質は入力品質に依存する」という前提のもと、
AI駆動開発を安全に進めるための7つの実践（ガードレール）を紹介している。その第1が「仕様駆動開発（OpenSpec）」で、
「認知（何を作るか固定する）を実装（AIが書く）より先に済ませる」ことを狙いとする。

本プロジェクト（lifeplan）は既に `docs/superpowers/specs/` + `docs/superpowers/plans/` と
superpowers スキル群（brainstorming → writing-plans → executing-plans/subagent-driven-development → TDD）による
自前の仕様駆動フローを運用しており、Plan 1〜7＋αまで機能してきた。しかし各Planはフリーフォームな
Markdown設計書であり、構造化・検証（validate）・機械的な一覧性（`list`/`show`）を欠く。

本スコープは、スライドの7つのガードレールのうち **①仕様駆動開発（OpenSpec）・②受け入れ試験・③リグレッションテスト**
の導入に絞る。④〜⑦（k6性能試験・JIT-PAM・ボーイスカウトルール・モブプログラミング）は、個人開発プロジェクトという
性質上チーム運用や本番負荷試験を前提としたものが多く、将来の別課題として棚上げする。

②③については、スライドの実装（独立した受け入れ試験フレームワーク・専用CIジョブ）をそのまま持ち込まず、
個人開発の規模に合わせて既存ツール（Vitest/Playwright/ゴールデンマスター回帰）に統合する形で導入する（詳細は§4.1）。

## 2. スコープ

### やること
- OpenSpec CLI (`@fission-ai/openspec`) の導入（`openspec init`）
- `openspec/` ディレクトリ構造の確立（`specs/` / `changes/` / `changes/archive/`）
- 「何を作るか合意する」層をOpenSpec形式（proposal.md/design.md/tasks.md）に一本化する開発フローの確立
- OpenSpecのScenario記述と1:1対応する受け入れ試験を、既存のVitest/Playwrightに組み込む運用ルールの確立（§4.1）
- 既存のゴールデンマスター回帰＋全テストスイートを正式なリグレッションゲートとして位置づける運用ルールの確立（§4.1）
- bug-fix-loopなど既存スキルとOpenSpecフローの使い分け（規模で判断）を明文化する（§4.3）
- CLAUDE.md の運用ルール更新（旧フロー記述をOpenSpecベースに書き換え）
- CI（`.github/workflows/ci.yml`）への `openspec validate --all --strict` ジョブ追加
- トライアル変更として、Plan7最終レビューのMinor指摘2件をこのフローで実際に実装し、フローを検証する

### やらないこと（明示的に対象外）
- スライドの④〜⑦（k6性能試験・JIT-PAM・ボーイスカウトルール・モブプログラミング）の導入
- 受け入れ試験・リグレッションテスト専用の新しいテストランナー／CIジョブの新設
  （既存の`vitest`/`playwright`ジョブ・命名規約・tasks.mdテンプレートで対応する）
- 既存の `docs/superpowers/specs/*.md` / `docs/superpowers/plans/*.md` を `openspec/specs/` 形式へ移行すること
  （過去の設計履歴としてそのまま残す。参照が必要な場合は都度リンクする）
- OpenSpecの `Stores`（複数リポジトリ横断機能、ベータ版）の利用

## 3. アーキテクチャ

```
openspec/
  config.yaml                openspec init が生成する設定（schema: spec-driven）
  specs/                      現行仕様（archiveされた変更が統合される場所。「生きたドキュメント」）
    <capability>/spec.md       カバレッジ単位（機能領域）ごとの仕様
  changes/
    <change-name>/
      proposal.md               Why / What Changes / Capabilities（新規・変更対象の一覧） / Impact
      design.md                  技術アプローチ（cross-cutting・新規依存・移行を伴う場合のみ作成、任意）
      specs/<capability>/spec.md  Requirement + Scenario（WHEN/THEN）のdelta。受け入れ試験の元ネタ（§4.1）
      tasks.md                    実装チェックリスト（`- [ ] X.Y ...`形式、TDDで1タスクずつ消化）
    archive/                   archive済みの変更（openspec archive後の移動先）

.claude/commands/opsx/*.md    openspec init --tools claude が生成するスラッシュコマンド（§4.3で利用方針を明記）
.claude/skills/openspec-*/    同上のAI向けスキル定義（§4.3で利用方針を明記）

docs/superpowers/specs/*.md   既存の設計履歴（移行しない、そのまま残す）
docs/superpowers/plans/*.md   既存のPlan履歴（同上、そのまま残す）
```

`openspec/` はリポジトリルート直下に作成する（`lifeplan/` パッケージ配下ではない）。理由: OpenSpecは
アプリケーションコードのビルド成果物ではなく、リポジトリ全体の開発プロセスに属するため。

`openspec init --tools claude` を実行すると、`openspec/config.yaml` に加えて `.claude/commands/opsx/*.md`
（`/opsx:propose`等のスラッシュコマンド）と `.claude/skills/openspec-*/SKILL.md`（同等のAIスキル）が
自動生成される。これらはOpenSpec公式の「対話一発でproposal/design/specs/tasksを全自動生成する」フローで、
本設計が採用する「brainstormingの一問一答→手動でartifactを書き出す」方針とは目的が異なる。§4.3で扱いを定める。

## 4. 開発フロー

新規機能・変更ごとに以下のフローで進める。

1. **対話**（superpowers:brainstorming の一問一答を継続使用）
   ユーザーの着想 → Claude が一問一答で要件の解像度を上げる。必要なら2〜3案を提示しトレードオフを議論する。
   この段階はOpenSpec導入前と変更しない。
2. **OpenSpec提案の作成**
   `openspec new change <change-name>` でフォルダを scaffold し、対話の成果を手動で書き出す
   （`openspec instructions <artifact-id> --change <change-name> --json` でテンプレートを取得して埋める。
   `/opsx:propose` 等の自動生成コマンドは使わない、§4.3）。
   - `proposal.md` … Why / What Changes / Capabilities（新規・変更する機能領域の一覧）/ Impact
   - `design.md` … アーキテクチャ・データフロー・エラー処理・移行方針（cross-cuttingな変更のときのみ作成、任意）
   - `specs/<capability>/spec.md` … Requirement + `#### Scenario: <name>`（`WHEN ... THEN ...`）形式の受け入れ基準
     （§4.1）。新規機能は`## ADDED Requirements`、既存仕様の変更は`## MODIFIED Requirements`
   - `tasks.md` … TDDで実装する単位に分解したチェックリスト（旧`writing-plans`スキルのタスク分解手法を適用、
     `- [ ] X.Y ...`形式）
3. **検証・人間レビュー**
   `openspec validate <change-name> --strict` で構造チェック（プレースホルダ・矛盾・スコープ漏れがないか）。
   ユーザーが `proposal.md` / `design.md` / `specs/` をレビューし、承認する。
4. **実装**
   `tasks.md` の各タスクを、既存のCLAUDE.md運用どおり
   「TDD（superpowers:test-driven-development）で実装 → チェックボックスを`- [x]`に更新 → `git commit`」で1つずつ消化する。
   subagent-driven-development / executing-plans スキルの使い分けも従来どおり。
5. **アーカイブ**
   `openspec archive <change-name>` で完了した変更を `openspec/specs/` に統合し、
   `openspec/changes/archive/<change-name>/` に移動する。**前提条件として既存の全テストスイート
   （unit/integration/e2e、ゴールデンマスター回帰含む）がgreenであること**（§4.1のリグレッションゲート）。

### 4.1 受け入れ試験・リグレッションテストの位置づけ

スライドの②③を、新しいテストランナーやCIジョブを増やさず、既存ツールへの統合として導入する。

**受け入れ試験（②）**
- `openspec/changes/<name>/specs/<capability>/spec.md` にOpenSpec標準の `#### Scenario: <name>` 形式
  （`WHEN ... THEN ...`）で受け入れ基準を書く（OpenSpecの`specs`アーティファクトそのもの。design.mdではない）
- `tasks.md` では、各実装タスクより前に「受け入れ試験タスク」を置く。TDDのRed（失敗するテストを書く）が
  このタスクに相当する
- 受け入れ試験は既存の `vitest`（ロジック・store層）または `playwright`（画面を跨ぐ振る舞い）のどちらかに
  実装し、テストの`it()`名またはコメントに `シナリオ: <name>（受け入れ試験）` と明記して、
  `specs/<capability>/spec.md` のScenarioとのトレーサビリティを確保する。新しい `*.acceptance.test.ts` のような
  専用命名規則・専用ディレクトリは作らない
- 新規CIジョブは不要（既存の `unit`/`integration`/`e2e` ジョブがそのまま実行する）

**リグレッションテスト（③）**
- 既存の `tests/fixtures/golden.json` によるゴールデンマスター回帰（エンジン層）と、
  既存の全テストスイート（unit/integration/e2e）を「正式なリグレッションテスト」と位置づける
- 新しい回帰専用テストは作らない。`openspec/specs/<capability>/spec.md`（archive済みの現行仕様）にある
  既存Requirementを変更する場合、`tasks.md` に「既存シナリオの回帰確認」タスクを明記し、
  影響範囲のテストが変更後も引き続きgreenであることを確認する
- `openspec archive` 前提条件（上記5.）としてCIの全ジョブgreenを要求することが、実質的な回帰ゲートになる

### 4.2 openspec init が生成する自動化コマンド・スキルの扱い

`openspec init --tools claude` は `.claude/commands/opsx/*.md`（`/opsx:explore`・`/opsx:propose`・`/opsx:apply`・
`/opsx:archive`等）と `.claude/skills/openspec-*/SKILL.md`（`openspec-propose`等、descriptionベースで自動的に
起動しうるAIスキル）を生成する。これらはOpenSpec公式の「AskUserQuestionで1〜2往復ヒアリングし、
proposal/design/specs/tasksを一括自動生成する」フローであり、本設計が開発フロー手順1〜2（上記）で定めた
「brainstormingの一問一答で要件の解像度を上げてから、CLI（`openspec new change`/`openspec instructions`）で
scaffoldし手動で書き出す」方針とは異なる。

- `/opsx:*` スラッシュコマンドは明示的に呼ばない限り実行されないため、使わなければよい
- `.claude/skills/openspec-*/SKILL.md` はdescriptionに基づき自動起動されうる（superpowers:using-superpowers
  と同じ仕組み）。「新機能を作りたい」という発話に対して`openspec-explore`/`openspec-propose`と
  `superpowers:brainstorming`のどちらも合致してしまう場合、**`superpowers:brainstorming`を優先する**
  ことをCLAUDE.mdに明記する（§5で反映）
- `openspec new change` / `openspec instructions` / `openspec status` / `openspec validate` / `openspec archive`
  というCLIコマンド自体は`.claude/skills/openspec-*/`を経由せず直接実行できるため、そのまま使う

### 4.3 既存スキルとの関係

- **bug-fix-loop**（GitHub issueを起点にした自動修正ループ。ユーザーが別プロジェクトで「impl-issue」と
  呼んでいるものと同一）: 対象issueが「単一の明確な不具合修正」である場合は、issue本文自体が十分な
  仕様として機能するため、OpenSpecの`change`フォルダを作らずそのまま実行してよい。ただし、修正の過程で
  `openspec/specs/`の既存仕様と矛盾する変更や、新たな要件判断（挙動の選択肢が複数ありどれが正しいか
  自明でない等）が必要になった場合は、その時点でbug-fix-loopを中断し、通常のOpenSpecフロー
  （brainstorming対話 → proposal作成 → validate → apply → archive）にエスカレーションする
- **systematic-debugging / test-driven-development / receiving-code-review / requesting-code-review /
  using-git-worktrees / finishing-a-development-branch** などの実装・検証層のスキル: 「どう直すか・どう
  検証するか」を扱うものであり、OpenSpecが担う「何を作るか合意する」層とは独立している。今回の変更による
  影響はなく、OpenSpecの`tasks.md`消化中・bug-fix-loop実行中のいずれでも従来通り使用される

### 旧フローとの対応関係

| 旧（superpowers単体） | 新（OpenSpec併用） |
|---|---|
| brainstorming対話 | 継続（変更なし） |
| `docs/superpowers/specs/*.md`（design doc） | `openspec/changes/<name>/proposal.md` + `design.md`（任意）+ `specs/<capability>/spec.md` |
| `docs/superpowers/plans/*.md`（実装計画） | `openspec/changes/<name>/tasks.md` |
| writing-plansスキルでのタスク分解 | 継続（tasks.md作成時に手法として適用） |
| TDD実装（executing-plans/subagent-driven-development） | 継続（変更なし） |
| CLAUDE.mdの「現在のステータス」棚卸し | 継続。加えて `openspec list` / `openspec show <name>` で機械的に一覧・詳細確認可能に |

## 5. CLAUDE.md の更新方針

現行の「新しいセッションを始めたとき、まずこれを読む」「再開手順（セッションをまたぐ運用）」セクションを
以下の方針で書き換える：

- 冒頭に「進行中の変更はすべて `openspec/changes/` に文書化されている。会話の記憶に頼らず
  `openspec list` / `openspec show <change-name>` で確認すること」という原則を追加する
- 「新機能・変更のアイデア出しは `superpowers:brainstorming` を使う。`openspec init`が生成する
  `openspec-explore`/`openspec-propose`等の自動生成スキルや `/opsx:*` スラッシュコマンドは使わない
  （§4.2）」という優先順位を明記する
- 旧セクション（Plan 1〜7の一覧、番号付き再開手順）は「過去の実装履歴（〜2026-07-13、OpenSpec導入前）」として
  見出しを付けてそのまま残す（削除しない。過去のPlanドキュメントへのリンクとして引き続き有効なため）
- 「次にやりたいこと」リストのうち、今回のトライアルで消化する1件（Plan7 Minor修正2件）を除去し、
  残り2件（シナリオ比較トグル・actuals入力UI）は「今後 `openspec/changes/` で起票する」旨の注記に更新する
- 「再開手順」の番号付き手順をOpenSpecベースに更新:
  1. `openspec list` で進行中の変更を確認する
  2. 対象の変更の `tasks.md` を開き、最初の未チェック（`- [ ]`）タスクを見つける
  3. そのタスクを superpowers:subagent-driven-development（推奨）または superpowers:executing-plans に従ってTDDで実装する
  4. タスク完了ごとに `tasks.md` の該当チェックボックスを `- [x]` に更新し、`git commit` する
  5. 変更が完了したら `openspec archive <change-name>` を実行し、セッションを切ってよい

## 6. CI連携

`.github/workflows/ci.yml` に、既存の `lint`/`typecheck`/`unit`/`integration`/`e2e` と並列の新規ジョブを追加する。

```yaml
openspec-validate:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: .
  steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v6
      with:
        node-version: 24
    - run: npm install -g @fission-ai/openspec@latest
    - run: openspec validate --all --strict
```

ワークフロー全体に `defaults.run.working-directory: lifeplan` が設定されているため、`openspec/` を
リポジトリルート直下で検証するには、このジョブ自身の `defaults.run.working-directory` を `.`（リポジトリ
ルート）に明示的に上書きする必要がある（何もしなければ`lifeplan/`配下で実行されてしまう）。

## 7. トライアル変更

`openspec/changes/fix-plan7-minor-issues/` を作成し、Plan7最終レビューで申し送りとなっていたMinor指摘2件を
このフローで実装し、フロー自体を検証する。capabilityは `firebase-session-reliability`（新規）1つにまとめる
（両方ともFirebaseセッション状態のエッジケース対応という同一領域のため）。

- `lifeplan/src/store/householdStore.ts` の `load` が `repository.subscribe(HOUSEHOLD_ID, cb)` を
  onError無しで呼んでいる。初回load後にエラーが来ても（権限失効・他端末が未来schemaVersionを書き込み等）
  UIに反映されず古いデータのまま。3引数目に `(e) => set({ status: 'error', error: e })` 相当を渡す。
- `lifeplan/src/components/auth/FirebaseAuthGate.tsx` の `repositoryReady` がサインアウト後にリセットされない。
  `status` が `'allowed'` から外れたら `repositoryReady` を false に戻す。

このトライアルで以下を確認する：
- proposal.md/specs/design.md/tasks.mdの粒度が実際のTDD実装に使いやすいか
- `openspec validate` がこのプロジェクト構成で問題なく動くか（Node v22.20.0で要件20.19.0以上を満たす）
- `openspec archive` 後、`openspec/specs/firebase-session-reliability/spec.md` に期待通り統合されるか
- §4.1で定めた受け入れ試験（Scenario→テストのトレーサビリティ）・リグレッションゲート
  （archive前提条件としての全テストgreen）が実際に機能するか

## 8. テスト・検証方針

- 上記2件のMinor修正はそれぞれ `specs/firebase-session-reliability/spec.md` にScenario
  （`WHEN onErrorが発火 THEN status/errorが更新される` など）として書き、対応する受け入れ試験を
  先にVitestで書いてから実装する（§4.1のRed→Green）
- 既存の全テストスイート（unit/integration/e2e、ゴールデンマスター回帰含む）が引き続きgreenであることを
  `openspec archive` 前に確認する（§4.1のリグレッションゲート）
- `openspec validate --all --strict` がCI・ローカル双方でエラーなく通ることを確認する

## 9. リスク・留意事項

- OpenSpecはまだ比較的新しいOSSツールであり、CLIコマンド体系（特にスラッシュコマンド `/opsx:*`）が
  将来変更される可能性がある。`openspec update` でツール指示ファイルを追従させる運用とする
- 既存の `docs/superpowers/specs/` / `docs/superpowers/plans/` を残すことで、しばらくは「設計の参照先が2箇所」
  になる。CLAUDE.mdの更新（§5）で「新規は`openspec/changes/`、過去は`docs/superpowers/`」という参照ルールを
  明確にすることでこれを緩和する
