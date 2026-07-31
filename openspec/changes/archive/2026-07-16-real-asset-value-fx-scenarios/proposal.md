## Why

昨今の円安・米国株高でダッシュボード上の投資残高・コーストFIRE達成率が名目上大きく見えている。ユーザー自身の分析（`research/2026-07-15-asset-real-value-fx-jpy-scenario.md`、非公開）で、為替・株式バリュエーションが歴史的水準へ巻き戻った場合の「実質評価額」を手動試算したところ、現状比48〜67%まで下振れる可能性が判明した。この試算をダッシュボードに常設し、都度の相場水準に対して自動で再計算できるようにする。

## What Changes

- 新しいダッシュボードカード `RealAssetValueCard` を `KpiCards` の下に追加し、3つの反転シナリオ（A: 穏当な反転、B: 企業物価PPP水準、C: 消費者物価PPP水準）ごとの実質資産評価額と、その前提条件（為替・CAPEの反転先の値）を表示する
- 為替レート（USD/JPY）とCAPEレシオ（S&P500 Shiller CAPE）を外部APIからライブ取得する仕組み（`marketDataPort`）を追加。取得に失敗した指標のみ固定フォールバック値に差し替え、カードのヘッダーに参考値である旨を小さく表示する
- 実質評価額の計算は「投資残高全体 ×（シナリオ為替÷現在為替）×（シナリオCAPE÷現在CAPE）」という一律のヘアカットとして`src/engine/`にpure関数で実装する（国内株・外国株の内訳分離は行わない）

## Capabilities

### New Capabilities
- `real-asset-value-scenarios`: 為替・CAPEのライブ取得、3シナリオの実質資産評価額計算、およびダッシュボードでの表示（前提条件つき）を提供する

### Modified Capabilities
(なし。既存のダッシュボード表示・シミュレーションエンジンの既存挙動は変更しない)

## Impact

- 新規: `src/market/marketDataPort.ts`（為替・CAPE取得ポート）, `src/masterData/realValueScenarios.ts`（シナリオ定義）, `src/store/marketDataStore.ts`（取得ライフサイクル管理）, `src/engine/realAssetValue.ts`（pure計算関数）, `src/components/dashboard/RealAssetValueCard.tsx` + `.module.css`
- 変更: `src/components/dashboard/Dashboard.tsx`（`RealAssetValueCard`の配置追加のみ）
- 依存: 外部API 2件（USD/JPYレート取得API、Shiller CAPEデータAPI）。いずれもクライアントサイドから直接fetchできる無認証・無料のエンドポイントを使用
- 既存の`src/engine/simulate.ts`・ゴールデンマスター回帰・E2Eには影響しない（新規追加のみ、ネットワーク非依存性も維持: テスト環境では`marketDataPort`をモック実装に差し替える）
