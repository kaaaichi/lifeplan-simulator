## Why

`research/2026-07-15-childcare-living-cost-benchmark.md`の一次資料調査（総務省家計調査・国立成育医療研究センター2025年調査等）により、`src/engine/expenses.ts`の食費・衣服費・お小遣いが、子どもの年齢によらず一律固定額（食費は大人と同一単価、衣服費は子ども分ゼロ計上、お小遣いはデフォルト0円の任意入力）であることが判明した。実態は食費が乳児期〜高校生で約3.2倍、お小遣いが乳児期ほぼ0円〜高校生で年7万円台まで変化し、衣服費は全年齢で年8.6万〜18.3万円程度が継続的に発生している。教育費・保育料（既存調査済み・大学費用は直近修正済み）以外のこの3項目についても、一次資料に基づく年齢帯モデルへ見直す。

## What Changes

- 新規マスターデータ `src/masterData/childLivingCost.ts` を追加し、子どもの年齢帯（0-2歳・3-5歳・小学生・中学生・高校生の5帯、大学生年代18-21歳は対象外）ごとの食費・お小遣いデフォルト額（年額）を定義する。衣服費は年齢帯で分けず、子ども1人あたりのフラット年額とする。出典は三澤奈菜・竹原健二（2025）「日本における0〜18歳の子育てに要する費用の調査」日本公衆衛生雑誌, doi:10.11236/jph.25-023, 表3（一次PDF直接確認済み）
- `src/engine/expenses.ts` の食費計算を、大人は現行の`FOOD_PER_PERSON_MONTH`のまま、子ども（gradeIndex 0-17）は年齢帯テーブル、大学生年代（18-21）は現行どおり`FOOD_PER_PERSON_MONTH`を適用するロジックに変更する
- `src/engine/expenses.ts` の衣服費計算に、子ども（gradeIndex 0-17）1人あたりのフラット年額を新規加算する（大学生年代は現行どおり0円のまま）
- `src/engine/expenses.ts` のお小遣い計算を、`Child.allowanceMonthly`が明示値（`0`を含む）のときは現行どおりその値を使い、`undefined`（未入力）のときのみ年齢帯デフォルト額（年額）を使うロジックに変更する
- `Child.allowanceMonthly` の型を `number` から `number | undefined` に変更する（**BREAKING**: 型変更。ただし既存データは常に明示値を持つため実行時の挙動は変わらない）
- `src/persistence/validate.ts` のバリデーションを、`allowanceMonthly`が`undefined`でも許容するよう緩和する
- `src/components/input/sections/MembersSection.tsx` の「子を追加」時の初期値から`allowanceMonthly: 0`を削除し（＝新規追加した子どもは自動計算モードから始まる）、お小遣い欄に「年齢に応じて自動計算する」チェックボックスを追加し、`allowanceMonthly`が`undefined`か明示値かをUIで切り替えられるようにする

このchangeは既存の教育費・保育料・きょうだい多子軽減ロジックには一切手を入れない（`research/2026-07-15-childcare-living-cost-benchmark.md` §7の調査により、きょうだい割引・規模の経済は一次資料の裏付けが不十分と判断し見送り）。

## Capabilities

### New Capabilities
- `childcare-living-cost-model`: 子どもの年齢に応じた食費・衣服費・お小遣いのデータモデルと`expenses.ts`への組み込み、および入力フォームでの自動計算切り替えUI

### Modified Capabilities
（なし。既存capability `university-cost-model` 等の要件に変更はない）

## Impact

- `src/masterData/childLivingCost.ts`（新規）
- `src/engine/expenses.ts`: 食費・衣服費・お小遣いの計算ロジック変更
- `src/types.ts`: `Child.allowanceMonthly` を `number | undefined` に変更
- `src/persistence/validate.ts`: `allowanceMonthly`のバリデーション緩和
- `src/components/input/sections/MembersSection.tsx`: 「子を追加」時の初期値変更、自動計算切り替えUIの追加
- ゴールデンマスター回帰（`tests/golden.integration.test.ts`）: 食費・衣服費が変わるため、投資残高への影響（`annualInvestmentContribution`が固定拠出額ベースであれば無影響の可能性が高いが、要確認）
- 本番Firestore（`households/primary`）の実データには触れない（`allowanceMonthly`は既に両シナリオの両方の子どもで明示的に`0`が設定済みのため、本changeの適用のみでは実データの挙動は変わらない）
