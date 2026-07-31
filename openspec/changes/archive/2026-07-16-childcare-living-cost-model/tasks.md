## 1. マスターデータ（`src/masterData/childLivingCost.ts`）（TDD）

- [x] 1.1 受け入れ試験（Red）: 新規`tests/masterData.test.ts`（または既存ファイルに追記）に、学齢index 0〜17を年齢帯にマッピングする関数（例: `childAgeBandOf(gradeIndex)`）が、境界値（2/3, 5/6, 11/12, 14/15, 17/18）を正しく区分すること、および各年齢帯の食費年額（0-2歳=230,364円、3-5歳=307,014円、小学生=387,226円、中学生=460,490円、高校生=489,204円）とお小遣いデフォルト年額（0-5歳=0円、小学生=8,462円、中学生=33,870円、高校生=75,490円）を返す関数を検証するテストを書く
- [x] 1.2 実装（Green）: `src/masterData/childLivingCost.ts`を新規作成し、年齢帯定義・食費テーブル・お小遣いデフォルトテーブル・フラット衣服費定数（`CLOTHING_PER_CHILD_ANNUAL = 146_958`）と、`gradeIndex`から各値を引く関数群を実装する。ファイル冒頭に出典コメント（三澤奈菜・竹原健二, 2025, 日本公衆衛生雑誌, doi:10.11236/jph.25-023, 表3）を`education.ts`/`nursery.ts`と同様の形式で記載する
- [x] 1.3 学齢index 18〜21（大学生年代）およびそれ以外の範囲外の値を渡した場合に、食費・お小遣いデフォルト関数が「対象外」を示す値（`undefined`または呼び出し側でガードできる値）を返すことを検証するテストを追加する
- [x] 1.4 `git add src/masterData/childLivingCost.ts tests/masterData.test.ts && git commit`

## 2. 型変更とバリデーション緩和（TDD）

- [x] 2.1 受け入れ試験（Red）: `src/persistence/validate.ts`のテストに、`allowanceMonthly`フィールドを持たない子どもデータを含む`HouseholdDoc`がバリデーションを通過することを検証する失敗するテストを追加する → `tests/persistence/doc.test.ts`に追加（validate.tsはもともとchildren個別フィールドを検証していなかったため、型レベルの回帰ガードとして機能）
- [x] 2.2 実装（Green）: `src/types.ts`の`Child.allowanceMonthly`を`number`から`number | undefined`に変更し、`src/persistence/validate.ts`の該当チェックを`undefined`許容に緩和する → 型変更のみ実施（validate.tsは変更不要と確認）
- [x] 2.3 型変更によりコンパイルエラーになる既存箇所（`src/persistence/defaultHousehold.ts`、`src/persistence/placeholderHousehold.ts`、`scripts/simulateCli.ts`等）がないか`npm run typecheck`で確認し、あれば型エラーのみ解消する（値は変更しない）→ `src/engine/expenses.ts`・`MembersSection.tsx`で型エラーが発生、`?? 0`フォールバックで解消（Task3/4向けTODOコメント付き）
- [x] 2.4 `git add` してコミットする → コミット`6cd15bc`

## 3. `expenses.ts`の食費・衣服費・お小遣いロジック変更（TDD）

- [x] 3.1 受け入れ試験（Red）: `tests/engine/expenses.test.ts`（または既存の該当テストファイル）に、以下を検証する失敗するテストを追加する
  - 学齢index 8（小学3年生）の子どもがいる世帯で食費が387,226円（大人の食費とは別枠で加算）になること
  - 学齢index 19（大学2年目）の子どもの食費が現行どおり`FOOD_PER_PERSON_MONTH*12`になること（回帰）
  - 学齢index 3の子どもの衣服費として146,958円が加算されること
  - 学齢index 20の子どもには衣服費が加算されないこと（0円、回帰）
  - `allowanceMonthly: 0`（明示）の学齢index 16の子どものお小遣いが0円のままであること（年齢帯デフォルト75,490円は適用されない）
  - `allowanceMonthly: undefined`の学齢index 16の子どものお小遣いが75,490円になること
  - `allowanceMonthly: 3000`（明示）の学齢index 13の子どものお小遣いが36,000円になること（年齢帯デフォルト33,870円は使われない）
- [x] 3.2 実装（Green）: `src/engine/expenses.ts`の食費計算を「大人は`FOOD_PER_PERSON_MONTH`のまま、子どもは学齢indexに応じて`childLivingCost.ts`の年齢帯テーブルまたは大学生年代のフォールバックを使う」ロジックに変更する
- [x] 3.3 実装（Green続き）: 衣服費計算に、学齢index 0〜17の子ども1人につき`CLOTHING_PER_CHILD_ANNUAL`を加算するロジックを追加する
- [x] 3.4 実装（Green続き）: お小遣い計算を「`c.allowanceMonthly !== undefined`なら`c.allowanceMonthly*12`、`undefined`なら年齢帯デフォルト年額」の分岐に変更する
- [x] 3.5 `npx vitest run`で3.1のテストを含む全テストを実行し、passすることを確認する → RED 3 failed/13 passed → GREEN 384 passed（golden回帰含む）
- [x] 3.6 `git add src/engine/expenses.ts tests/ && git commit` → コミット`64b9b51`

## 4. 入力フォームの自動計算切り替えUI（TDD）

- [x] 4.1 受け入れ試験（Red）: `MembersSection`の既存テスト（`src/components/input/sections/MembersSection.test.tsx`等）に、「子を追加」した直後の子どもの`allowanceMonthly`が`undefined`であることを検証するテストを追加する
- [x] 4.2 実装（Green）: `addChild()`から`allowanceMonthly: 0`の初期値設定を削除する
- [x] 4.3 受け入れ試験（Red）: 自動計算チェックボックスの表示・チェック時に`allowanceMonthly`が`undefined`になること、チェック解除時に`0`になり手動入力欄が表示されることを検証するテストを追加する
- [x] 4.4 実装（Green）: `MembersSection.tsx`に「お小遣いを年齢に応じて自動計算する」チェックボックスを追加し、`child.allowanceMonthly === undefined`をチェック状態と連動させ、チェック解除時は`0`をセットしてから`MoneyField`を表示するロジックを実装する
- [x] 4.5 `git add src/components/input/ && git commit` → コミット`e36a16d`。Playwright MCPで目視確認済み（既存子=手動モード、新規追加子=自動モード）

## 5. 全体回帰・ゴールデンマスター確認

- [x] 5.1 `cd lifeplan && npm test`を実行し、`golden.integration.test.ts`を含む全テストスイートがgreenであることを確認する。各検証年（2027, 2030, 2035, 2040, 2050, 2060）の投資残高の対ゴールデン誤差率をログで確認し、許容範囲（±5%以内）を超える場合はその原因（`annualInvestmentContribution`が固定拠出額ベースかどうか）を明らかにする → 389 passed/17 skipped、golden回帰6年すべて誤差0.00%（investmentBalanceは固定拠出額ベースで教育費・生活費変動と無関係のため、大学費用見直し時と同じ結果）
- [x] 5.2 `npm run typecheck`と`npm run lint`を実行し、両方エラーなしであることを確認する → 両方エラーなし
- [x] 5.3 `npm run build`を実行し、ビルドが通ることを確認する → 507msでビルド成功（チャンクサイズ警告は既存・無関係）
- [x] 5.4 Playwright e2e（`/input`画面を含む既存スイート）を実行し、自動計算チェックボックスが画面上で正しく機能することを確認する → e2e 5件すべてpass。加えてdevサーバー起動+Playwright MCPで目視確認: 既存の第一子(allowanceMonthly:0明示)はチェック外れ&こづかい欄表示(手動モード)、新規追加した第2子はチェック済み&こづかい欄非表示(自動モード)、チェック解除でこづかい欄(値0)が表示されることを確認
- [x] 5.5 追加修正があればコミットする → 検証のみでコード修正なし、コミット不要

## 6. アーカイブ

- [x] 6.1 `npx @fission-ai/openspec@latest validate childcare-living-cost-model --strict`を実行しpassすることを確認する → "Change 'childcare-living-cost-model' is valid"（最終レビューでCritical/Important指摘2件発見・修正後に再検証、Ready to merge）
- [ ] 6.2 `npx @fission-ai/openspec@latest archive childcare-living-cost-model`を実行し、`openspec/specs/childcare-living-cost-model/spec.md`に本changeの要件が統合されたことを確認する
- [ ] 6.3 `git add`してコミットする（archiveによるファイル移動・生成分）
- [ ] 6.4 CLAUDE.mdの「次にやりたいこと」「現在のステータス」を本change完了に合わせて更新する
