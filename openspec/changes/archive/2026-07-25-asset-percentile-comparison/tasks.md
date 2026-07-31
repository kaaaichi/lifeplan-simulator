## 1. マスタデータ

- [x] 1.1 `src/masterData/householdAssetBenchmark.ts` に型定義（`AssetBenchmarkGroup`/`AgeBracket`）・出典定数（`ASSET_BENCHMARK_SOURCE`）・区分下限定数（`BUCKET_LOWER_BOUNDS_MAN_YEN`）を追加する
- [x] 1.2 `research/2026-07-24-household-asset-benchmark.md` の全国・年代別（20〜70代）データを `ASSET_BENCHMARK_NATIONAL` / `ASSET_BENCHMARK_BY_AGE_BRACKET` に転記する
- [x] 1.3 受け入れ試験（シナリオ: マスタデータの整合性が壊れている場合にテストが失敗する）を先に書く→`householdAssetBenchmark.test.ts`で各グループの「分布合計+無回答が100に近い」「平均値≧中央値>0」を検証する。実データが正しく転記されていれば green になることを確認する

## 2. エンジン層（`src/engine/assetBenchmark.ts`）

- [x] 2.1 標準正規分布の逆CDF近似関数（`invNormalCdf`）を実装し、既知の分位点（p=0.5→0, p=0.9772→約2, 等）でのテストを書く
- [x] 2.2 CDFアンカー点構築関数を実装する（区分下限ごとの累積%に加え、`(medianManYen, 50)`を挿入し資産額昇順でソートする。design.md §Decisions 2参照）。受け入れ試験（シナリオ: 中央値ちょうどの世帯は偏差値50になる）を先に書く→`computeAssetBenchmark`で中央値と完全一致する資産額を渡すと偏差値50.0が返ることを検証してから実装する（実装中に、中央値が既存の区分境界値と一致する場合(40代=500万円/50代=700万円)に退化区間が生じるバグを発見・修正済み）
- [x] 2.3 受け入れ試験（シナリオ: 全世帯・同年代それぞれについて独立に算出される）を書く→戻り値に`national`/`ageGroup`が独立して含まれることを検証してから実装する
- [x] 2.4 受け入れ試験（シナリオ: 資産が非保有区分に該当する）を書く→資産0円で偏差値が50未満になることを検証してから実装する
- [x] 2.5 受け入れ試験（シナリオ: 年代範囲内/範囲外の世帯主）を書く→年齢→年代区分の変換と、20歳未満/80歳以上での代用+近似フラグを検証してから実装する
- [x] 2.6 受け入れ試験（シナリオ: 最上位区分に該当する）を書く→3000万円以上のケースで近似フラグが立つことを検証してから実装する

## 3. セレクタ統合

- [x] 3.1 `src/store/selectors.ts` に `selectAssetBenchmark(data: DashboardData)` を追加し、`data.kpi.currentTotalAssets` と `data.central[0].agePrimary` から `computeAssetBenchmark` を呼び出す。既存セレクタのテストに影響がないことを確認する

## 4. UIコンポーネント

- [x] 4.1 `AssetBenchmarkCard.tsx` / `AssetBenchmarkCard.module.css` を作成し、「全世帯」「同年代」2カード（偏差値・パーセンタイル順位に基づく相対位置・平均値・中央値）を表示する
- [x] 4.2 受け入れ試験（シナリオ: 出典が常時表示される、シナリオ: 出典名がクリックで情報源に遷移する）を書く→出典テキスト・「独自推定」注記・`ASSET_BENCHMARK_SOURCE.url`への`<a>`リンク(`target="_blank" rel="noopener noreferrer"`)が常にレンダリングされることを検証してから実装する
- [x] 4.3 受け入れ試験（シナリオ: 近似発生時に注記が表示される）を書く→近似フラグがtrueの側のカードにのみ注記バッジが表示されることを検証してから実装する
- [x] 4.4 `Dashboard.tsx` に `AssetBenchmarkCard` を `RealAssetValueCard` の直後に配置する（シナリオ: 既存のダッシュボード表示・計算への影響がない、の回帰確認を兼ねる）

## 5. 最終確認

- [x] 5.1 全テスト（unit/integration）・typecheck・lint・build がgreenであることを確認する
- [x] 5.2 既存のゴールデンマスター回帰が引き続き誤差0.00%であることを確認する（新規ファイルのみの追加であり`src/engine/`本体は無改変のため影響なしのはず）
- [x] 5.3 Playwright等でダッシュボードを目視確認し、全世帯/同年代カード・出典表示・近似注記（該当する場合）が意図通り表示されることを確認する（デスクトップ幅・モバイル幅(390px)双方で確認。近似注記はデフォルトシナリオでは非発生のため非表示を確認）
- [x] 5.4 `openspec validate asset-percentile-comparison --strict` を実行し、構造チェックを通す
