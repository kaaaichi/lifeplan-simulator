# OpenSpec導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenSpec CLIをリポジトリに導入し、「何を作るか合意する」層をOpenSpec形式（proposal/design/specs/tasks）に一本化した開発フローを確立する。CI検証・CLAUDE.md更新を行い、Plan7最終レビューのMinor指摘2件をこのフローで実際に実装してフローを検証する。

**Architecture:** `openspec/`をリポジトリルート直下に作成し、`openspec new change`でscaffoldしたフォルダに手動でproposal.md/specs/<capability>/spec.md/tasks.mdを書く（`/opsx:*`等の自動生成は使わない）。受け入れ試験はOpenSpecのScenario記述と1:1対応させて既存のVitestに実装し、リグレッションは既存の全テストスイート＋ゴールデンマスター回帰をarchive前提条件として運用する。

**Tech Stack:** `@fission-ai/openspec` CLI（npx実行）, Vitest, Playwright, GitHub Actions

## Global Constraints

- 仕様の源泉: `docs/superpowers/specs/2026-07-13-openspec-adoption-design.md`（すべてのタスクはこの設計書の記述と一致させること）
- `openspec/`はリポジトリルート直下に作成する（`lifeplan/`パッケージ配下ではない）
- OpenSpec関連の全コマンドはリポジトリルート（`/Users/iidakaichiro/develop/portfolio/lifeplan`）から実行する
- 新規テストランナー・新規CIジョブ（`openspec-validate`以外）は追加しない。受け入れ試験・リグレッションテストは既存のVitest/Playwrightに統合する
- `git add`は対象ファイルを明示的に指定する（`git add -A`や`git add .claude/`のような広いステージングはしない。既存の未コミット変更 `lifeplan/src/components/dashboard/AssetChart.*`、および`.claude/settings.local.json`・`.claude/scheduled_tasks.lock`・`.mcp.json`・`.playwright-mcp/`・トップレベルのスクリーンショット2枚は本タスクと無関係なので一切触れない）
- lifeplanパッケージのテストコマンドは `cd lifeplan && npm run <script>`（作業ディレクトリは`lifeplan/`）

---

### Task 1: OpenSpec CLIの導入

**Files:**
- Create: `openspec/config.yaml`（`openspec init`が生成）
- Create: `.claude/commands/opsx/*.md`（6ファイル、`openspec init --tools claude`が生成）
- Create: `.claude/skills/openspec-*/SKILL.md`（6ファイル、同上）

**Interfaces:**
- Produces: `openspec` CLI (`npx --yes @fission-ai/openspec@latest <command>`) が以降の全タスクで利用可能になる

- [ ] **Step 1: openspec initを実行する**

リポジトリルートで実行:

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest init --tools claude .
```

Expected: `OpenSpec Setup Complete` / `Created: Claude Code` / `6 skills and 6 commands in .claude/` / `Config: openspec/config.yaml (schema: spec-driven)` が出力される。既存の `.claude/settings.local.json` / `.claude/scheduled_tasks.lock` は上書きされない。

- [ ] **Step 2: 生成物を確認する**

```bash
find openspec .claude/commands/opsx .claude/skills -type f | sort
```

Expected:
```
.claude/commands/opsx/apply.md
.claude/commands/opsx/archive.md
.claude/commands/opsx/explore.md
.claude/commands/opsx/propose.md
.claude/commands/opsx/sync.md
.claude/commands/opsx/update.md
.claude/skills/openspec-apply-change/SKILL.md
.claude/skills/openspec-archive-change/SKILL.md
.claude/skills/openspec-explore/SKILL.md
.claude/skills/openspec-propose/SKILL.md
.claude/skills/openspec-sync-specs/SKILL.md
.claude/skills/openspec-update-change/SKILL.md
openspec/config.yaml
```

- [ ] **Step 3: config.yamlにプロジェクトコンテキストを追記する**

`openspec/config.yaml` の末尾行（`#     Domain: e-commerce platform` の次の空行の後、
`# Per-artifact rules (optional)` ブロックの前）に、以下を追記する（既存のコメント行は残す）:

```yaml
context: |
  lifeplan は夫婦2人世帯のライフプラン・シミュレーション ダッシュボード（日々の家計簿ではない）。
  Tech stack: TypeScript, React, Vite, Zustand, Firebase (Auth/Firestore), Vitest, Playwright。
  作業ディレクトリは lifeplan/ パッケージ配下。エンジン層は src/engine/（純TypeScript、UI/Firebase非依存）。
  受け入れ試験は新しい専用テストランナーを作らず、既存のVitest（ロジック・store層）/Playwright（画面）に
  Scenario単位で実装し、it() 名またはコメントに「シナリオ: <name>（受け入れ試験）」と明記してspec.mdの
  Scenarioとのトレーサビリティを確保する。
```

- [ ] **Step 4: コミットする**

```bash
git add openspec/config.yaml .claude/commands/opsx .claude/skills
git commit -m "$(cat <<'EOF'
build: OpenSpec CLIを導入(openspec init --tools claude)

openspec/config.yamlとClaude Code向けのスラッシュコマンド・スキル
(.claude/commands/opsx, .claude/skills/openspec-*)を生成。
config.yamlにプロジェクトコンテキストを追記した。
EOF
)"
```

Run: `git status --short openspec .claude/commands .claude/skills` — Expected: clean (すべてコミット済み)。

---

### Task 2: CIに openspec-validate ジョブを追加

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: openspec-validateジョブを追加する**

`.github/workflows/ci.yml` の `firestore-emulator:` ジョブの直前に以下を挿入する（`e2e:` ジョブの直後、`firestore-emulator:` の直前）:

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

- [ ] **Step 2: ローカルでvalidateコマンドが通ることを確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest validate --all --strict
```

Expected: `No items found to validate.`（この時点では`openspec/changes/`にまだ何もないため。exit code 0）

- [ ] **Step 3: YAML構文を確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 4: コミットする**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: openspec-validate ジョブを追加

openspec/ 配下のchanges・specsの構造をPR時に自動検証する。
ワークフロー全体のdefaults.run.working-directory: lifeplanは
このジョブには適用させず、リポジトリルートで実行する。
EOF
)"
```

---

### Task 3: CLAUDE.mdの運用ルールをOpenSpecベースに更新

**Files:**
- Modify: `CLAUDE.md:6-33`

- [ ] **Step 1: 「新しいセッションを始めたとき、まずこれを読む」〜「再開手順」を書き換える**

`CLAUDE.md` の以下の範囲（6行目の見出しから33行目の指示例まで）を丸ごと置き換える。

置き換え前（該当範囲の先頭・末尾を確認するための目印）:
- 開始: `## 新しいセッションを始めたとき、まずこれを読む`
- 終了: `> 「\`lifeplan\` の Plan 2（実績/予実エンジン層）を続けて。最初の未チェックタスクから TDD で実装して、各ステップ後にチェックを付けてコミットして。」`

置き換え後:

```markdown
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
```

- [ ] **Step 2: 差分を確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git diff CLAUDE.md
```

Expected: 上記の置き換えのみが差分に出ている（47行目以降の「開発メモ」「現在のステータス」「次のタスク」「次にやりたいこと」は変更されていない）。

- [ ] **Step 3: コミットする**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: CLAUDE.mdの再開手順をOpenSpecベースに更新

進行中の変更をopenspec listで確認する運用に切り替え、
新機能のアイデア出しはsuperpowers:brainstormingを優先し
openspec-*自動生成スキル/opsx:*スラッシュコマンドは使わない旨を明記。
旧Plan 1-7の一覧は過去の実装履歴として残す。
EOF
)"
```

---

### Task 4: トライアル変更のOpenSpec提案を作成する

**Files:**
- Create: `openspec/changes/fix-plan7-minor-issues/proposal.md`
- Create: `openspec/changes/fix-plan7-minor-issues/specs/firebase-session-reliability/spec.md`
- Create: `openspec/changes/fix-plan7-minor-issues/tasks.md`

**Interfaces:**
- Produces: `openspec/changes/fix-plan7-minor-issues/tasks.md` のタスク一覧（Task 5〜10が実装する）

- [ ] **Step 1: changeフォルダをscaffoldする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest new change fix-plan7-minor-issues
```

Expected: `Created change 'fix-plan7-minor-issues' at openspec/changes/fix-plan7-minor-issues/`

- [ ] **Step 2: proposal.mdを書く**

`openspec/changes/fix-plan7-minor-issues/proposal.md` を以下の内容で作成する:

```markdown
## Why

Plan7（ログイン画面＋Firebase実配線）の最終レビューで、Firebaseセッション状態のエッジケースに対する
防御的処理が2件、Minor指摘として保留されていた。放置すると権限失効時にUIが古いデータのまま止まる、
サインアウト後の再サインインで古いrepositoryを使い続けるといった実害につながるため対応する。

## What Changes

- `householdStore.load` が `repository.subscribe` に onError コールバックを渡し、購読エラー発生時に
  `status` を `'error'` に遷移させる
- `FirebaseAuthGate` が認証 `status` が `'allowed'` から外れたタイミングで `repositoryReady` を
  false にリセットし、次に `'allowed'` になったとき repository を再差し替えする

## Capabilities

### New Capabilities
- `firebase-session-reliability`: Firebaseセッション（認証状態・Firestore購読）のエッジケースにおける
  状態整合性を扱う

### Modified Capabilities

## Impact

- `lifeplan/src/store/householdStore.ts`
- `lifeplan/src/components/auth/FirebaseAuthGate.tsx`
- 新規ファイルは作らず、既存の `lifeplan/tests/store/householdStore.test.ts` /
  `lifeplan/src/components/auth/FirebaseAuthGate.test.tsx` に受け入れ試験を追加する

design.md は作成しない: 単一ファイルずつの独立した防御的修正であり、cross-cuttingな変更・新規依存・
移行・大きなあいまいさのいずれにも該当しないため（OpenSpecのdesign.md作成基準に従う判断）。
```

- [ ] **Step 3: specs/firebase-session-reliability/spec.mdを書く**

```bash
mkdir -p openspec/changes/fix-plan7-minor-issues/specs/firebase-session-reliability
```

`openspec/changes/fix-plan7-minor-issues/specs/firebase-session-reliability/spec.md` を以下の内容で作成する:

```markdown
## ADDED Requirements

### Requirement: householdStore は購読エラーを status に反映する
`householdStore.load` はリポジトリの `subscribe` 購読が初回発火後にエラーを報告した場合、`status` を
`'error'` に遷移させ、エラー内容を `error` に保持しなければならない(SHALL)。

#### Scenario: 購読エラー発火時にstatusがerrorになる
- **WHEN** `load` 完了後の購読が `onError` コールバックでエラーを報告する
- **THEN** `status` が `'error'` になり、`error` に発火したエラーが保持される

### Requirement: FirebaseAuthGate はセッション終了時に repository 差し替え状態をリセットする
`FirebaseAuthGate` は認証 `status` が `'allowed'` 以外に遷移したとき `repositoryReady` を false に
戻さなければならない(SHALL)。これにより次に `'allowed'` になったとき `repository` が再差し替えされる。

#### Scenario: サインアウト後に再サインインするとrepositoryが再差し替えされる
- **WHEN** `status` が `'allowed'` から `'signedOut'` に変わり、その後別のセッションで再び `'allowed'` になる
- **THEN** `createRepository` が再度呼ばれ、`useHouseholdStore` の `repository` が新しいインスタンスに
  差し替わる
```

- [ ] **Step 4: tasks.mdを書く**

`openspec/changes/fix-plan7-minor-issues/tasks.md` を以下の内容で作成する:

```markdown
## 1. householdStore の購読エラー伝播

- [ ] 1.1 受け入れ試験（Red）: 購読エラー発火時にstatusがerrorになることを検証する失敗するテストを書く
- [ ] 1.2 実装（Green）: `load` が `repository.subscribe` にonErrorコールバックを渡すようにする

## 2. FirebaseAuthGate の repositoryReady リセット

- [ ] 2.1 受け入れ試験（Red）: サインアウト後の再サインインでrepositoryが再差し替えされることを検証する失敗するテストを書く
- [ ] 2.2 実装（Green）: `status` が `'allowed'` から外れたら `repositoryReady` をfalseに戻すeffectを追加する

## 3. 回帰確認・アーカイブ

- [ ] 3.1 既存の全テストスイート（unit/integration/e2e）・typecheck・lint・buildがgreenであることを確認する
- [ ] 3.2 `openspec archive fix-plan7-minor-issues` でアーカイブし、
      `openspec/specs/firebase-session-reliability/spec.md` に統合されたことを確認する
```

- [ ] **Step 5: validateする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest validate fix-plan7-minor-issues --strict
```

Expected: `Change 'fix-plan7-minor-issues' is valid`

- [ ] **Step 6: コミットする**

```bash
git add openspec/changes/fix-plan7-minor-issues
git commit -m "$(cat <<'EOF'
docs(openspec): fix-plan7-minor-issues の提案を作成

Plan7最終レビューのMinor指摘2件(householdStore.loadのonError未配線・
FirebaseAuthGateのrepositoryReady未リセット)をfirebase-session-reliability
capabilityとして提案。OpenSpec導入フローの最初のトライアル変更。
EOF
)"
```

---

### Task 5: householdStore の受け入れ試験（Red）

**Files:**
- Modify: `lifeplan/tests/store/householdStore.test.ts`

**Interfaces:**
- Consumes: `useHouseholdStore.getState().load(repository: HouseholdRepository): Promise<void>`,
  `HouseholdRepository.subscribe(id: string, cb: (doc) => void, onError?: (e: unknown) => void): () => void`

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/store/householdStore.test.ts` の末尾（`})` の直前、`describe('useHouseholdStore', ...)` ブロック内の最後のテストの後）に以下を追加する:

```ts
  // シナリオ: 購読エラー発火時にstatusがerrorになる（受け入れ試験）
  it('propagates repository errors after the initial load', async () => {
    const inner = new InMemoryHouseholdRepository()
    let capturedOnError: ((e: unknown) => void) | null = null
    const erroring: HouseholdRepository = {
      load: (id) => inner.load(id),
      save: (id, doc) => inner.save(id, doc),
      subscribe: (id, cb, onError) => {
        capturedOnError = onError ?? null
        return inner.subscribe(id, cb, onError)
      },
    }

    await useHouseholdStore.getState().load(erroring)
    expect(useHouseholdStore.getState().status).toBe('ready')

    const boom = new Error('permission-denied')
    capturedOnError?.(boom)

    expect(useHouseholdStore.getState().status).toBe('error')
    expect(useHouseholdStore.getState().error).toBe(boom)
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npx vitest run tests/store/householdStore.test.ts -t "propagates repository errors"
```

Expected: FAIL（`capturedOnError` が `null` のまま = `load` が `subscribe` の第3引数を渡していないため、
`capturedOnError?.(boom)` が何も実行せず、`status` が `'ready'` のままで `toBe('error')` に失敗する）

- [ ] **Step 3: コミットする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/tests/store/householdStore.test.ts
git commit -m "$(cat <<'EOF'
test: householdStore の購読エラー伝播テストを追加(Red)

openspec/changes/fix-plan7-minor-issues の Requirement
「householdStore は購読エラーを status に反映する」の受け入れ試験。
load が repository.subscribe に onError を渡していないため現状は失敗する。
EOF
)"
```

---

### Task 6: householdStore の実装（Green）

**Files:**
- Modify: `lifeplan/src/store/householdStore.ts:29-34`

- [ ] **Step 1: onErrorコールバックを渡すよう実装する**

`lifeplan/src/store/householdStore.ts` の `load` 内、`unsubscribe = repository.subscribe(...)` の呼び出しを
以下のように変更する。

変更前:
```ts
      unsubscribe?.()
      unsubscribe = repository.subscribe(HOUSEHOLD_ID, (next) => {
        if (next) set({ doc: next, status: 'ready' })
      })
      set({ doc, status: 'ready' })
```

変更後:
```ts
      unsubscribe?.()
      unsubscribe = repository.subscribe(
        HOUSEHOLD_ID,
        (next) => {
          if (next) set({ doc: next, status: 'ready' })
        },
        (error) => set({ status: 'error', error }),
      )
      set({ doc, status: 'ready' })
```

- [ ] **Step 2: テストが通ることを確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npx vitest run tests/store/householdStore.test.ts
```

Expected: 全テストPASS（既存3件＋新規1件の計4件）

- [ ] **Step 3: コミットする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/src/store/householdStore.ts
git commit -m "$(cat <<'EOF'
fix: householdStore.load が購読エラーをstatusに反映するようにする(Green)

repository.subscribeの第3引数(onError)に
(error) => set({ status: 'error', error }) を渡すようにした。
初回load後に権限失効等で購読がエラーを報告してもUIが古いデータの
まま止まらなくなる。
EOF
)"
```

---

### Task 7: FirebaseAuthGate の受け入れ試験（Red）

**Files:**
- Modify: `lifeplan/src/components/auth/FirebaseAuthGate.test.tsx`

**Interfaces:**
- Consumes: `FirebaseAuthGate` props `createPort`/`createRepository`/`getAllowedUids`, `FakeAuthPort.emit(user: AuthUser | null)`, `fakeUser(uid: string): AuthUser`

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/src/components/auth/FirebaseAuthGate.test.tsx` の末尾、最後の `it(...)` ブロックの後（`describe`
の閉じ `})` の直前）に以下を追加する:

```tsx
  // シナリオ: サインアウト後に再サインインするとrepositoryが再差し替えされる（受け入れ試験）
  it('サインアウト後に再度サインインすると repository を再差し替えする', () => {
    const repos = [new InMemoryHouseholdRepository(), new InMemoryHouseholdRepository()]
    let call = 0
    render(
      <FirebaseAuthGate
        createPort={() => port}
        createRepository={() => repos[call++]}
        getAllowedUids={() => ['uid-ok']}
      >
        <p>アプリ本体</p>
      </FirebaseAuthGate>,
    )

    act(() => port.emit(fakeUser('uid-ok')))
    expect(useHouseholdStore.getState().repository).toBe(repos[0])

    act(() => port.emit(null))
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()

    act(() => port.emit(fakeUser('uid-ok')))
    expect(useHouseholdStore.getState().repository).toBe(repos[1])
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npx vitest run src/components/auth/FirebaseAuthGate.test.tsx -t "サインアウト後に再度サインインする"
```

Expected: FAIL（`repositoryReady` がサインアウト後もtrueのままのため、2回目のサインインで
`createRepository` が呼ばれず、`repository` が `repos[0]` のまま = `toBe(repos[1])` が失敗する）

- [ ] **Step 3: コミットする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/src/components/auth/FirebaseAuthGate.test.tsx
git commit -m "$(cat <<'EOF'
test: FirebaseAuthGate のrepositoryReadyリセットテストを追加(Red)

openspec/changes/fix-plan7-minor-issues の Requirement
「FirebaseAuthGate はセッション終了時に repository 差し替え状態を
リセットする」の受け入れ試験。repositoryReadyがサインアウト後も
リセットされないため現状は失敗する。
EOF
)"
```

---

### Task 8: FirebaseAuthGate の実装（Green）

**Files:**
- Modify: `lifeplan/src/components/auth/FirebaseAuthGate.tsx`

- [ ] **Step 1: repositoryReadyをリセットするeffectを追加する**

`lifeplan/src/components/auth/FirebaseAuthGate.tsx` の2つ目の `useEffect`（`repository` を差し替える
effect）の直後に、以下の新しい `useEffect` を追加する:

変更前:
```tsx
  useEffect(() => {
    // allowed になってから repository を差し替え、差し替え完了後に子（Layout の load）を描画する
    if (status === 'allowed' && !repositoryReady) {
      useHouseholdStore.setState({ repository: createRepository() })
      setRepositoryReady(true)
    }
  }, [status, repositoryReady, createRepository])

  if (status === 'initializing') return <p>読み込み中...</p>
```

変更後:
```tsx
  useEffect(() => {
    // allowed になってから repository を差し替え、差し替え完了後に子（Layout の load）を描画する
    if (status === 'allowed' && !repositoryReady) {
      useHouseholdStore.setState({ repository: createRepository() })
      setRepositoryReady(true)
    }
  }, [status, repositoryReady, createRepository])

  useEffect(() => {
    // allowed から外れたら次回 allowed 時に repository を再差し替えできるようリセットする
    if (status !== 'allowed' && repositoryReady) {
      setRepositoryReady(false)
    }
  }, [status, repositoryReady])

  if (status === 'initializing') return <p>読み込み中...</p>
```

- [ ] **Step 2: テストが通ることを確認する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npx vitest run src/components/auth/FirebaseAuthGate.test.tsx
```

Expected: 全テストPASS（既存4件＋新規1件の計5件）

- [ ] **Step 3: コミットする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git add lifeplan/src/components/auth/FirebaseAuthGate.tsx
git commit -m "$(cat <<'EOF'
fix: FirebaseAuthGate がサインアウト後にrepositoryReadyをリセットする(Green)

statusが'allowed'以外に遷移したらrepositoryReadyをfalseに戻す
effectを追加した。これにより次にallowedになったとき、
createRepository()が再度呼ばれてrepositoryが再差し替えされる。
EOF
)"
```

---

### Task 9: 回帰確認

**Files:** なし（検証のみ）

- [ ] **Step 1: unit/integrationテストを実行する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npm run test:unit
npm run test:integration
```

Expected: 両方とも全件PASS（0 failed）

- [ ] **Step 2: typecheck・lintを実行する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npm run typecheck
npm run lint
```

Expected: どちらもエラーなし

- [ ] **Step 3: buildを実行する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npm run build
```

Expected: ビルド成功（`dist/` が生成される）

- [ ] **Step 4: e2eテストを実行する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan/lifeplan
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: 全件PASS（dashboard/input/scenarios の既存スモークテストが引き続きgreen）

もしこのステップで失敗した場合は、Task 5〜8の変更がFirebaseAuthGate/householdStoreを使う既存の
e2eフローに影響していないか確認し、原因を特定してから先に進む（この計画のスコープでe2eの新規テストは
追加しない。既存テストが壊れていないことの確認のみ）。

---

### Task 10: アーカイブとCLAUDE.md最終更新

**Files:**
- Modify: `CLAUDE.md`（「現在のステータス」「次にやりたいこと」）

- [ ] **Step 1: openspec archiveを実行する**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest archive fix-plan7-minor-issues -y
```

Expected: `Change 'fix-plan7-minor-issues' archived as '2026-07-13-fix-plan7-minor-issues'.`
（`Task status: ✓ Complete` と表示されること。tasks.mdの全チェックボックスが`- [x]`になっていない場合は
未完了として失敗するので、その場合はTask 4で作成した `tasks.md` の該当項目を `- [x]` に更新してから
再実行する）

- [ ] **Step 2: archive結果を確認する**

```bash
find openspec/specs openspec/changes/archive -type f | sort
```

Expected:
```
openspec/changes/archive/2026-07-13-fix-plan7-minor-issues/proposal.md
openspec/changes/archive/2026-07-13-fix-plan7-minor-issues/specs/firebase-session-reliability/spec.md
openspec/changes/archive/2026-07-13-fix-plan7-minor-issues/tasks.md
openspec/specs/firebase-session-reliability/spec.md
```

- [ ] **Step 3: CLAUDE.mdの「次にやりたいこと」を更新する**

`CLAUDE.md` の `## 次にやりたいこと（2026-07-07 時点、3件・優先度は上から）` セクション全体
（見出し行から末尾の2項目まで）を、以下に置き換える:

```markdown
## 次にやりたいこと（2026-07-13 更新、OpenSpec導入トライアルで1件消化）

- [ ] **シナリオ比較トグル**（設計の源泉=§8.1・§7③。§13.6/14.6/15.7で繰り返し「後続プラン」と明記されてきたもの）: 複数シナリオの総資産線を重ね描き＋差分テーブル表示。Plan 6でシナリオ複製ができたので今初めて意味を持つ。今後は`superpowers:brainstorming`→OpenSpec（`openspec new change`）で起票する。
- [ ] **actuals（実績値）入力UI・リベース操作**（設計の源泉=§11、§14.6/15.7で繰り返し保留）: エンジン層（Plan 2）は完成済みだがUIが無い。今後はOpenSpecで起票する（ブレストが要るかは設計書§11を見て判断）。
- [x] **Plan 7最終レビューのMinor指摘2件の後片付け**: OpenSpec導入のトライアル変更として実施（`openspec/changes/archive/2026-07-13-fix-plan7-minor-issues/`）。householdStore.loadのonError未配線・FirebaseAuthGateのrepositoryReady未リセットをTDDで解消し、`openspec/specs/firebase-session-reliability/spec.md`に統合済み。
```

- [ ] **Step 4: CLAUDE.mdの「現在のステータス」に完了エントリを追記する**

`CLAUDE.md` の `## 現在のステータス` セクション末尾（最後の箇条書きの後）に以下を追記する:

```markdown
- [x] OpenSpec導入（設計の源泉=`docs/superpowers/specs/2026-07-13-openspec-adoption-design.md`）・実装完了（全10タスク完了。`openspec init --tools claude`でCLI導入、CIに`openspec-validate`ジョブ追加、CLAUDE.mdの再開手順をOpenSpecベースに更新。受け入れ試験・リグレッションテストは新規テストランナーを増やさず既存Vitest/Playwrightに統合する運用ルールを確立。トライアル変更`fix-plan7-minor-issues`（Plan7最終レビューのMinor指摘2件）をこのフローでTDD実装し、`openspec/specs/firebase-session-reliability/spec.md`にarchive済み。全テストgreen＋typecheck+lint+build+e2e）
```

- [ ] **Step 5: 差分を確認してコミットする**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
git diff CLAUDE.md
git add CLAUDE.md openspec/specs openspec/changes
git commit -m "$(cat <<'EOF'
docs: fix-plan7-minor-issues をarchiveし、CLAUDE.mdを更新

openspec archiveでopenspec/specs/firebase-session-reliability/spec.md
に統合。CLAUDE.mdの「次にやりたいこと」からPlan7 Minor指摘2件を
完了として反映し、「現在のステータス」にOpenSpec導入完了エントリを追記。
EOF
)"
```

- [ ] **Step 6: 最終確認**

```bash
cd /Users/iidakaichiro/develop/portfolio/lifeplan
npx --yes @fission-ai/openspec@latest validate --all --strict
git log --oneline -12
git status --short
```

Expected: `validate`は`openspec/specs/firebase-session-reliability`が有効であることを示し、エラーなし。
`git status --short`は`lifeplan/src/components/dashboard/AssetChart.*`（本計画と無関係な既存の未コミット
変更）以外に変更が残っていないこと。
