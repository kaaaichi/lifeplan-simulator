## 1. シナリオ定義とpure計算関数（`src/masterData/`, `src/engine/`）

- [x] 1.1 `src/masterData/realValueScenarios.ts` にシナリオA/B/C（targetFx/targetCape/label/description）とフォールバック定数（為替162円・CAPE41）を定義する
- [x] 1.2 `src/engine/realAssetValue.ts` に `computeRealAssetValueScenarios(investmentBalance, currentFx, currentCape, scenarios)` をTDDで実装する（シナリオ: 3シナリオそれぞれの実質評価額が算出される／シナリオ: 現在値がシナリオの目標値と一致する場合はヘアカットなし、受け入れ試験としてVitestに実装）

## 2. ライブ取得ポート（`src/market/`）

- [x] 2.1 `src/market/marketDataPort.ts` に `MarketDataPort` インターフェース（`fetchUsdJpyRate`/`fetchCapeRatio`）を定義する
- [x] 2.2 `createLiveMarketDataPort()` を実装する（`open.er-api.com`・`shiller_wrapper_data`への fetch、失敗時は例外を投げる）
- [x] 2.3 テスト用のモック実装（`createFakeMarketDataPort`等、固定値やthrowを返せるもの）をテストヘルパーとして用意する

## 3. 取得ライフサイクルの状態管理（`src/store/`）

- [x] 3.1 `src/store/marketDataStore.ts` に `MarketIndicatorState<T>`（loading/live/fallback）と `MarketDataState`（usdJpy/cape独立管理）をTDDで実装する（シナリオ: 両指標とも取得成功／シナリオ: 片方のみ取得失敗、受け入れ試験としてVitestに実装。`marketDataPort`をモックして検証）
- [x] 3.2 取得失敗時に自動でフォールバック定数へ状態遷移するロジックを実装する（シナリオ: フォールバック時も実質評価額の計算は継続する）

## 4. ダッシュボード表示（`src/components/dashboard/`）

- [x] 4.1 `RealAssetValueCard.tsx` + `.module.css` を実装する。`marketDataStore`から現在値を取得し、`computeRealAssetValueScenarios`で3シナリオ分を計算して横並びカードで表示する
- [x] 4.2 ヘッダー部に現在の為替・CAPEの値と取得状態（ライブ取得時刻 or 「取得失敗のため参考値」注記）を表示する（シナリオ: 各シナリオカードに金額と条件が表示される／シナリオ: フォールバック値使用時の注記表示）
- [x] 4.3 `Dashboard.tsx` に `RealAssetValueCard` を `KpiCards` の下に配置する（シナリオ: 既存のダッシュボード表示・計算への影響がない、既存のDashboard.test.tsx/AssetChart.test.tsx等が引き続きgreenであることで確認）

## 5. 最終確認

- [x] 5.1 `npm test`（Vitest全件）・typecheck・lint・buildがすべてgreenであることを確認する（428 passed / 18 skipped、typecheck/lint/build clean）
- [x] 5.2 Playwright E2Eでダッシュボード表示を1本確認する（ネットワークをモックし、live表示・fallback表示の両方をカバーする。`tests/e2e/realAssetValue.spec.ts`）
- [x] 5.3 `openspec validate real-asset-value-fx-scenarios --strict` を実行し、`openspec archive real-asset-value-fx-scenarios` でアーカイブする
