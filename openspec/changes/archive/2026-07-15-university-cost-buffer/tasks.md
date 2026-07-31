## 1. universityCost() のスキーマ変更・ロジック変更（TDD）

- [x] 1.1 受け入れ試験（Red）: `tests/masterData.test.ts` の `education` describe に、`universityCost`（`../src/masterData/education`からimport追加）を使ったテストを追加する。大学1年目（`gradeIndex=18`）は`tuition+facilityFee+entranceFee`の合計、大学2〜4年目（19, 20, 21）は`entranceFee`を含まず`tuition+facilityFee`のみ、範囲外（17, 22）は0になることを、国立と私立理系それぞれで検証する（具体的な期待値は`openspec/changes/university-cost-buffer/specs/university-cost-model/spec.md`のScenarioに記載の数値を使う: 国立1年目=981,000円、国立2〜4年目=643,000円、私立理系1年目=1,837,000円、私立理系2〜4年目=1,555,000円）
- [x] 1.2 `npx vitest run tests/masterData.test.ts` を実行し、新規テストがFAILすることを確認する（現状の`education.json`が旧スキーマ`{tuition, outside}`のままのため、`facilityFee`/`entranceFee`が`undefined`になりテストが失敗する）
- [x] 1.3 実装（Green）: `src/masterData/education.json`の`大学`エントリを、4区分（国立・公立・私立文・私立理）とも`{tuition, outside}`から`{tuition, facilityFee, entranceFee}`に置き換える。値は`proposal.md`記載のとおり: 国立=`{tuition:643000, facilityFee:0, entranceFee:338000}`、公立=`{tuition:644000, facilityFee:0, entranceFee:470000}`、私立文=`{tuition:993000, facilityFee:173000, entranceFee:269000}`、私立理=`{tuition:1395000, facilityFee:160000, entranceFee:282000}`
- [x] 1.4 実装（Green続き）: `src/masterData/education.ts`の`universityCost()`を、`band[uni].tuition`のみ返す現行実装から、`tuition + facilityFee`を常に加算し、`gradeIndex === 18`のときのみ`entranceFee`も加算するロジックに変更する（`band`の参照先を`edu[INCOME_BAND]['大学'][uni]`に変更し、`band.tuition`ではなく`band`から3フィールドを読む）
- [x] 1.5 `npx vitest run tests/masterData.test.ts` を再実行し、追加したテストを含めすべてpassすることを確認する
- [x] 1.6 `git add lifeplan/src/masterData/education.json lifeplan/src/masterData/education.ts lifeplan/tests/masterData.test.ts && git commit` でコミットする

## 2. 全体回帰・ゴールデンマスター確認

- [x] 2.1 `cd lifeplan && npm test` を実行し、`golden.integration.test.ts`を含む全テストスイートがgreenであることを確認する。ログに出力される`actual`/`expected`/`err`（誤差率）を確認し、2050年・2060年の投資残高誤差が±5%以内に収まっていることを明示的に確認する（収まらない場合はここで作業を止め、想定との乖離を報告する）→ 全検証年で誤差0.00%（investmentBalanceは固定拠出額ベースで教育費変動の影響を受けない設計のため）。354 tests passed
- [x] 2.2 `npm run typecheck` と `npm run lint` を実行し、両方エラーなしであることを確認する → 両方エラーなし
- [x] 2.3 変更がなければコミット不要。何か追加修正をした場合はコミットする → 追加修正なし、コミット不要

## 3. アーカイブ

- [x] 3.1 `npx @fission-ai/openspec@latest validate university-cost-buffer --strict` を実行しpassすることを確認する → "Change 'university-cost-buffer' is valid"
- [x] 3.2 `npx @fission-ai/openspec@latest archive university-cost-buffer` を実行し、`openspec/specs/university-cost-model/spec.md`に本changeの要件が統合されたことを確認する → 4 Requirements・Scenarioが統合されたことを確認
- [x] 3.3 `git add` してコミットする（archiveによるファイル移動・生成分）
