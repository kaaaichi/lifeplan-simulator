## Context

現在のダッシュボードは、投資残高やコーストFIRE達成率をすべて「シミュレーション実行時点の名目円換算額」で表示している。ユーザーの保有資産は米国株インデックスファンド中心（全世界株式・S&P500・オールカントリー等が投資残高の大半を占める）で、2026年7月時点の為替（約162円/ドル）とS&P500 Shiller CAPE（約41〜42）はいずれも歴史的に見て極端な水準にある。この乖離を「歴史的な正常水準まで巻き戻った場合いくらになるか」という3シナリオで可視化し、常設のダッシュボード指標にする。

ユーザーとのbrainstorming対話で以下が確定済み:
- 投資残高全体に一律のヘアカットを適用する（国内株/外国株の内訳分離はしない。日経225連動分の誤差は許容する）
- 為替・CAPEともにライブ取得を試みる。取得失敗時は指標ごとに固定フォールバック値へ差し替え、参考値である旨を注記表示する
- 表示はKPIカードエリアに追加する専用ブロック（横並び3ミニカード、A案で確定）
- シナリオ自体（反転先の為替・CAPE値）は静的定数。ライブ取得するのは「現在値」側のみ

## Goals / Non-Goals

**Goals:**
- 為替・CAPEの現在値を、認証不要の無料APIからクライアントサイドで取得する
- 取得値と静的シナリオ定義から、3シナリオ分の実質資産評価額をpure関数で計算する
- 取得失敗時もダッシュボードがクラッシュせず、フォールバック値＋参考値注記で動作を継続する
- 既存の`src/engine/`のネットワーク非依存性・決定性（ゴールデンマスター回帰）を壊さない

**Non-Goals:**
- 投資残高の内訳（国内株/外国株比率）の入力・管理機能は作らない（Bで決定済み）
- シナリオ自体（反転先の値）をユーザーが編集できるUIは今回作らない（静的定数のみ）
- 為替・CAPE以外の指標（金利、インフレ率等）の反映は対象外
- 過去の為替・CAPEの時系列データ取得やチャート化は対象外（現在値のみ使用)

## Decisions

### 1. `src/engine/`を汚さず、`src/market/`にポートを新設する

`src/engine/`は「純TypeScript・外部依存なし」という設計原則（CLAUDE.md記載、ゴールデンマスター回帰の決定性の根拠）を一貫して守ってきた。ライブ取得はこの原則に反するため、`src/firebase/authPort.ts`と同じ「ポート＋アダプタ」パターンで`src/market/marketDataPort.ts`に隔離する。

```ts
// src/market/marketDataPort.ts
export interface MarketDataPort {
  fetchUsdJpyRate(): Promise<number>
  fetchCapeRatio(): Promise<number>
}
export function createLiveMarketDataPort(): MarketDataPort { /* fetch実装 */ }
```

実際の計算（`computeRealAssetValueScenarios`）は`src/engine/realAssetValue.ts`にpure関数として置き、為替・CAPEの値は引数で受け取る。ネットワークは一切知らない。これにより既存のunitテスト・ゴールデンマスター回帰のパターンをそのまま踏襲できる。

代替案として検討したが却下: エンジン内で直接fetchする案 → `src/engine/`のテスト決定性・SSR/CLI（`scripts/simulateCli.ts`）からの再利用性を壊すため却下。

### 2. 外部APIの選定とフォールバック

- 為替: `open.er-api.com`（ExchangeRate-API open endpoint。認証不要・CORS許可・無料）
- CAPE: `shiller_wrapper_data`（GitHub Pages上の個人メンテナンスAPI、Yale大学Shillerデータの週次ラップ）

CAPE APIは商用SLAのない個人プロジェクトであるため、可用性が為替APIより低いことを前提とする。両APIとも失敗時は例外を投げるだけで、フォールバック判断はしない（呼び出し側=`marketDataStore`の責務とする）。

フォールバック定数（2026-07-15時点の分析値、`realValueScenarios.ts`に定義）:
- 為替フォールバック: 162円
- CAPEフォールバック: 41

### 3. `marketDataStore`の状態設計

Zustandストアで以下の状態を持つ（`src/store/authStore.ts`の設計パターンを踏襲）:

```ts
type MarketIndicatorState<T> =
  | { status: 'loading' }
  | { status: 'live', value: T, fetchedAt: string }
  | { status: 'fallback', value: T }  // 取得失敗時。valueは固定フォールバック定数

interface MarketDataState {
  usdJpy: MarketIndicatorState<number>
  cape: MarketIndicatorState<number>
}
```

為替とCAPEは独立に取得・独立に状態遷移する（片方が失敗してももう片方はlive表示できる）。ダッシュボードマウント時に一度だけfetchし、以降は再取得しない（ページリロードで再取得される程度の鮮度で十分。ユーザーは日次で見る想定）。

### 4. 計算式

```
haircut(scenario) = (scenario.targetFx / currentFx) × (scenario.targetCape / currentCape)
realAssetValue(scenario) = investmentBalance × haircut(scenario)
```

`investmentBalance`は`selectors.ts`が既に算出しているダッシュボード表示中の投資残高（現金除く）をそのまま使う。シナリオ定義（`targetFx`/`targetCape`/ラベル/説明文）は`src/masterData/realValueScenarios.ts`に静的配列として保持する。

```ts
export const REAL_VALUE_SCENARIOS = [
  { id: 'a', label: '穏当な反転', targetFx: 135, targetCape: 30, description: '為替→135円 / CAPE→30' },
  { id: 'b', label: '企業物価PPP水準', targetFx: 92, targetCape: 28, description: '為替→92円 / CAPE→28' },
  { id: 'c', label: '消費者物価PPP水準', targetFx: 106, targetCape: 25, description: '為替→106円 / CAPE→25' },
] as const
```

### 5. カード表示・フォールバック注記

`RealAssetValueCard`はヘッダーに現在値を表示する。live/fallbackで文言を切り替える:

- live: `為替162.2円・CAPE41.8 (ライブ取得 2026-07-16 10:32)`
- fallback（片方のみ失敗の場合も指標ごとに出し分け）: `為替162円 (取得失敗のため参考値) ・CAPE41.8 (ライブ取得 10:32)`

## Risks / Trade-offs

- [CAPE取得元(`shiller_wrapper_data`)がSLAのない個人プロジェクトで、長期的にサービス終了・仕様変更するリスク] → フォールバック定数への自動降格で機能停止は避けられる。ただし定数が古くなり続ける点は許容し、将来別のCAPEソースに差し替え可能なようポート越しに隔離しておく
- [投資残高全体への一律ヘアカットは、日経225連動分（現状比4.6%程度）を過大に割り引く誤差を含む] → brainstormingでB案として明示的に許容済み。将来ポートフォリオの外国株比率が大きく変わった場合は再検討が必要
- [外部APIへの依存によりオフライン時・CORSブロック時にfallback状態が常態化する可能性] → fallback状態そのものがUIで正直に表示される設計のため、誤った数値を正常値として見せることはない
- [シナリオの反転先の値(135/92/106円、30/28/25)は分析時点(2026-07)の静的スナップショットであり、時間とともに実態と乖離する] → Non-Goalsで明記した通り今回はシナリオ編集UIを作らない。将来的な見直しが必要になった場合は`realValueScenarios.ts`を直接更新する運用とする

## Migration Plan

新規追加のみで既存機能への破壊的変更はないため、通常のfeatureブランチ→レビュー→mainマージで完結する。ロールバックは`RealAssetValueCard`の`Dashboard.tsx`への配置行を削除するだけで良い（他コンポーネントへの依存なし）。

## Open Questions

なし（brainstormingで主要な設計判断はすべて確定済み）
