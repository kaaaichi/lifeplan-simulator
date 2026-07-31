# ライフプラン・シミュレーション ダッシュボード 設計書

- 作成日: 2026-06-30
- ステータス: ドラフト（ユーザーレビュー待ち）

## 1. 目的とスコープ

夫婦2人世帯の「老後に向けて、どの程度の資産を持つべきか／毎月いくら積み立てるべきか」を、現在資産と将来のライフイベントから**前向きにシミュレーション**し、確認・管理するためのダッシュボード。

### やること
- 現在資産・収入・支出・ライフイベントを入力 → 老後（終了年齢）までの年次資産推移を予測
- 4つのアウトプット: ①生涯資産推移グラフ ②老後必要額（推奨積立額）の逆算 ③複数シナリオ比較 ④運用利回りの楽観/悲観バンド
- 夫婦2人だけがログインして閲覧・編集、複数端末で自動同期

### やらないこと（明確に対象外）
- 日々の支出記録・銀行/カードの自動集約・家計簿 → **マネーフォワードME**に任せる（重複しない）。現在資産はMFを見て手で転記する
- モンテカルロ・税最適化・精緻な社会保険料計算（将来拡張。MVPでは決定論モデル）

### 出典・前提
本アプリの計算モデルは、ユーザーが運用中のスプレッドシート `ライフプランニング2026.xlsx`（文部科学省「子供の学習費調査」ベースのFPテンプレートを作り込んだもの）を仕様の源泉とする。6シート構成（利用規約／シートの見方／入力／ライフプランニング表／資産グラフ／基礎データ）を、Webアプリの層構造へ写し替える。

世帯（初期データ）: 主生計者 世帯主(1992年生)、配偶者 配偶者(1991年生)、子 第一子(2024年生)。第2子(2026年生)は「仮」=what-ifシナリオとして扱う。

## 2. MVPの方針（エンジン忠実度）

**案②: コアエンジン＋主要ドライバー**を採用。
- **忠実に再現**: 年次ループ、収入（退職→年金切替）、住居（家賃/ローン）、教育費（学校種別 公立/私立/国立 × 学年マスタ）、投資残高と複利、家電買い替え周期、基礎年金
- **簡易化／後回し**: 児童手当の所得制限判定ロジック、全電気代プリセットの細部、医療費の加齢カーブ等のロングテール
- **スプレッドシートに無い新価値**: 複数シナリオ比較、利回りの楽観/悲観バンド

許容: 端数が現スプレッドシートと数千円ずれてよい。主要ドライバー（総資産残高・投資残高・単年度収支）の桁・傾向が一致することを重視。

## 3. アーキテクチャ

```
[あなた / 妻のブラウザ(PC・スマホ)]
        │ Googleログイン（2アカウントのみ許可）
        ▼
  Firebase Hosting（React SPA配信）
        ├─ Firebase Auth（UIDホワイトリスト）
        └─ Cloud Firestore（世帯データ＋シナリオを保存・自動同期）

アプリ内部:
  入力フォーム ──→ シミュレーションエンジン(純TS) ──→ ダッシュボード/グラフ
                        ▲
                  基礎データ(マスタ定数, バージョン付き)
```

- **ホスティング/運用**: Firebase 無料枠(Spark)。サーバーレス、放置で停止しない。`firebase deploy` 一発
- **認証**: Firebase Auth の Google ログイン。Firestore セキュリティルールで2人のUIDのみ read/write 許可
- **同期**: Firestore のリアルタイムリスナーで端末間自動同期

### 技術スタック
- React + TypeScript + Vite
- グラフ: Recharts
- 状態管理: Zustand
- Firebase SDK（Auth / Firestore）
- テスト: Vitest（エンジンの単体テスト＋ゴールデンマスター回帰）

## 4. コンポーネント分割

各ユニットは単一責務・独立テスト可能とする。

| ユニット | 責務 | 入力 → 出力 / 依存 |
|---|---|---|
| **engine** | 純粋関数。年次シミュレーション | `simulate(inputs, masterData) → YearRow[]`。UI・Firebase非依存 |
| **masterData** | 教育費/年金/こづかい/衣服費/電気代等のマスタ定数 | バージョン付き定数。engineが参照 |
| **goalSeek** | 推奨積立額の逆算 | `requiredMonthlyInvestment(inputs, masterData) → number` |
| **inputsForm** | 入力UI（世帯/資産/住居/生活/家電/前提） | Zustand storeを更新 |
| **scenarios** | 入力1セット=1シナリオの管理・複製・比較選択 | store |
| **dashboard** | 4アウトプット＋KPIの可視化 | YearRow[] を受け取り描画 |
| **persistence** | Firestore 読み書き＋認証ガード | store ↔ Firestore |

### データフロー
入力編集 → Zustand に反映 → engine が即時再計算（メモ化）→ グラフ更新 → デバウンス(〜1s)で Firestore へ保存 → 別端末へ自動同期。

## 5. データモデル（Firestore）

1世帯=1ドキュメント。両者が同じドキュメントを参照。

```
households/{householdId}
{
  baseYear: 2026,
  activeScenarioId: "base",
  scenarios: [
    {
      id: "base",
      name: "ベースプラン",
      inputs: {
        members: {
          primary: { name, birthYear, birthMonth, takeHomeIncome, workUntilAge, phonePlan },
          spouse:  { name, birthYear, birthMonth, takeHomeIncome, workUntilAge, phonePlan } | null,
          children: [
            { id, name, birthYear, birthMonth,
              schooling: { elementary: 公立|私立, junior: 公立|私立, high: 公立|私立, university: 国立|公立|私立文|私立理|なし },
              allowanceMonthly, phoneFromGrade }
          ]
        },
        assets: {
          bankAccounts:  [ { label, balance } ],
          investments:   [ { label, balance } ]
        },
        housing: { type: 賃貸|持ち家, rentMonthly, loanMonthly, loanRemainingYears,
                   repairReserveMonthly, propertyTaxAnnual, fireInsuranceAnnual, buildYear },
        lifestyle: { electricType: オール電化|ガス併用, internet },
        appliances: [ { name, price, lastPurchaseYear, lifespanYears } ],
        homeMaintenance: [ { name, price, intervalYears, lastYear } ],
        assumptions: {
          investmentReturnRate: 5.0,     // 中央値(%)
          returnRateOptimistic: 7.0,
          returnRatePessimistic: 2.0,
          inflationRate: 0.0,
          endAge: 95,                    // 主生計者の終了年齢
          annualInvestmentContribution,  // 年間の新規投資額
          pensionStartAge: 65,
          pensionAnnualPerPerson: 780000
        }
      }
    }
    // ... 他シナリオ（複製してoverride）
  ]
}
```

- **masterData は Firestore に置かず**、アプリ内のバージョン付き定数（`masterData/v1.ts`）として保持。教育費・電気代・年金等。差し替え時はバージョンを上げる
- Firestore ドキュメント上限1MBに対し、本データは数十KB程度で余裕
- セキュリティルール: `allow read, write: if request.auth.uid in ["UID_HUSBAND","UID_WIFE"];`

## 6. シミュレーション・エンジン

`simulate(inputs, masterData): YearRow[]` を baseYear から「主生計者が endAge になる年」まで1年ずつ計算。

```
YearRow = {
  year, agePrimary, ageSpouse, agesChildren[],
  income,                          // 給与/年金/その他
  expenses: { 食費, 日用品, ライフライン, 住宅, 教育費, 家電, 住宅大型, こづかい, 衣服, 医療, 外食レジャー, 雑費, 車, 保育料 },
  totalExpense,
  annualCashFlow,                  // income - totalExpense（=単年度収支）
  investmentContribution,
  investmentReturn,
  investmentBalance,               // (前年+拠出)×(1+r)
  cashBalance,                     // 前年 + annualCashFlow - 拠出
  totalAssets,                     // cash + investment（=総資産残高）
  investmentRatio,
  coastFireNumber
}
```

### 年次ロジック（要点）
- **年齢**: birthYear/Month と year から算出。子の「4月からの学年」を導出し教育費マスタを引く
- **収入**: 各就労メンバーは `age <= workUntilAge` の間 takeHomeIncome。退職後は `pensionStartAge` 以降 `pensionAnnualPerPerson`
- **支出**:
  - 食費: 一人当たり月額プリセット × 世帯人数 ×12
  - ライフライン: 電気代(世帯人数×電化区分マスタ) + ガス/水道 + ネット + 携帯(プラン別×人数) + NHK
  - 住宅: 賃貸=rent×12、持ち家=loanMonthly×12（残年数まで）+ 修繕積立 + 固定資産税 + 火災保険
  - 教育費: 子ごとに 学年→(学校種別×学年)マスタ で 学校教育費＋学校外費。児童手当・高校補助を控除（MVPは所得制限なしの簡易控除）。大学期は仕送り加算
  - 家電: `(year - lastPurchaseYear) % lifespanYears == 0` の年に price 計上
  - 住宅大型: intervalYears 周期で price 計上
  - こづかい/衣服/医療/外食レジャー/雑費: プリセット（年齢・在籍で変動するものは簡易カーブ）
  - 保育料: 詳細は §17
- **収支と資産**:
  - `annualCashFlow = income - totalExpense`
  - `investmentBalance = (prev.investmentBalance + investmentContribution) × (1 + r)`
  - `cashBalance = prev.cashBalance + annualCashFlow - investmentContribution`
  - `totalAssets = cashBalance + investmentBalance`
- **インフレ**: `inflationRate>0` のとき生活費系を年率で逓増（MVP既定0%）

### コーストFIRE金額
標準定義で算出（スプレッドシートの参考列に対応、端数は一致しなくてよい）:
```
requiredNestEgg   = 退職後の年間生活費 × 25            // 4%ルール
coastFireNumber(year) = requiredNestEgg / (1 + r)^(retirementYear - year)
達成率 = investmentBalance / coastFireNumber(year)
```

### テスト戦略（重要）
既存スプレッドシートの計算済み列（総資産残高・投資残高・単年度収支の年次系列）を `fixtures/` にゴールデンマスターとして取り込み、エンジン出力と比較する回帰テストを置く。案②のため完全一致は求めず、各年で**相対誤差±数%以内**を許容範囲としてアサートする。

## 7. 4つのアウトプット

| アウトプット | 計算 | 表示 |
|---|---|---|
| ①生涯資産推移 | engine の `totalAssets` 系列（＋cash/investment内訳） | 折れ線＋積み上げ面。X軸=西暦/年齢、ライフイベントのマーカー |
| ②老後必要額（推奨積立額） | `investmentContribution` を二分探索し、`totalAssets` が endAge まで0を割らない最小月額を求める | KPIカード「推奨毎月積立額 ◯万円」＋達成/未達バッジ |
| ③複数シナリオ比較 | 選択シナリオ各々で engine を実行し `totalAssets` を重ね描き | 同一グラフに複数線＋凡例、差分テーブル |
| ④運用リスクの幅 | 利回りを {悲観, 中央, 楽観} で実行 | 中央線＋悲観〜楽観の塗りバンド |

## 8. 画面仕様（Claude Design 向け）

日本語UI。トーン=「将来のお金」に相応しい**信頼感・落ち着き・数字の見やすさ**。グラフ主役。PC/スマホ両対応（夫婦が各自の端末で閲覧）。

### 8.1 ダッシュボード（メイン）
- ヘッダー: アプリ名、現在のシナリオ切替ドロップダウン、ログインユーザーアイコン
- **KPIカード列**（横並び→スマホで縦積み）:
  - 現在の総資産
  - 終了年齢時点の総資産（黒字/赤字を色で）
  - 資産が尽きる年（尽きなければ「生涯黒字」）
  - 推奨毎月積立額
  - コーストFIRE達成率（%＋進捗バー）
- **メイングラフ**: 生涯資産推移。総資産の折れ線＋利回り楽観/悲観の塗りバンド。X軸=西暦と年齢の二段ラベル。ライフイベント（子の進学/卒業、退職、年金開始、住宅・家電の大型支出）を縦マーカー＋ツールチップ
- **内訳ビュー**: 現金 vs 投資の積み上げ面グラフ、または単年度収支の棒グラフ（プラス/マイナス着色）。タブ切替
- **シナリオ比較トグル**: ONで複数シナリオの総資産線を重ね、下に差分テーブル

### 8.2 入力画面
- セクション（タブ or アコーディオン）: ①世帯メンバー ②資産（口座別残高・投資残高）③住居 ④生活スタイル ⑤家電買い替え ⑥前提（利回り・退職年齢・終了年齢・年間投資額）
- 子セクションは「子を追加」で複数。各子に 小/中/高/大の学校種別セレクト、仕送り、こづかい開始学年
- 入力すると右側（PC）/下部（スマホ）で資産推移グラフが即時プレビュー更新

### 8.3 シナリオ管理画面
- シナリオ一覧（カード）: 名前、要約（終了時総資産、推奨積立額）、複製/編集/削除、比較に含めるチェック
- 「現プランを複製して新シナリオ」→ 学校種別や退職年齢だけ変えて比較

### 8.4 ログイン画面
- 「Googleでログイン」ボタンのみ。許可外アカウントは「アクセス権がありません」を表示

## 9. 実装フェーズ（概略）

1. プロジェクト雛形（Vite+TS+React）、masterData 定数の移植（教育費・電気代・年金）
2. engine 実装＋ゴールデンマスター回帰テスト
3. goalSeek（推奨積立額）
4. Firebase 設定（Auth/Firestore/Hosting）、persistence、セキュリティルール
5. 入力フォーム
6. ダッシュボード（4アウトプット）— **UIはClaude Designの成果物を反映**
7. シナリオ比較・利回りバンド
8. デプロイ

## 10. 未確定事項（実装計画前に詰める）

- 年間投資額(`annualInvestmentContribution`)を固定値とするか、収支余剰から自動拠出ルールにするか
- 医療費・雑費の加齢カーブをどこまで簡易化するか（現スプレッドシートは加齢で逓増）
- ~~コーストFIRE金額をスプレッドシート式に寄せるか、標準4%ルール式のままにするか~~ → §22で標準定義（固定目標年齢65歳・固定目標額4000万円・固定利回り4%、いずれも上書き可）に確定
- masterData の世帯年収帯（教育費の学校外費が年収帯で変動）を固定するか入力に連動させるか

## 11. 実績値の投入とリベース・予実比較

毎年の年末「収支振り返り」で確定した実績を投入し、(A) 将来予測を最新実績から再出発させる（**リベース**）と同時に、(B) 当初の見込みからのズレを可視化する（**予実比較**）。本アプリは予測専用エンジンに「過去の確定値」という時間軸を加える。

### 11.1 方針（ブレストでの決定）

- **役割 = 両方（リベース＋比較）**。予測の起点は最新実績へ動かし、かつ過去年は「当初プラン vs 実績」のズレも見せる。
- **粒度 = 年末残高のみ**。各年末の「現金預金残高」と「投資残高」だけを記録する（MFを見て手で転記するレベル。収支内訳やカテゴリ別は対象外）。
- **スコープ = 世帯共通**。実績は「実際に起きた事実」なので世帯レベルで1本持ち、全シナリオが同じ実績でリベースされる。シナリオは「これから」の仮定だけが異なる。
- **比較基準 = 当初プラン（固定ベースライン）**。プラン確定時の予測を凍結し、毎年の実績をそれと比べる。

### 11.2 データモデル（世帯レベルに追加）

```
households/{id}
{
  baseYear: 2026,
  // 既存の初期資産 (scenario.inputs.assets) は実質「2025年末＝MFから転記した最新実績」= 系列のseed。
  // 新しい actuals 系列は baseYear の“年末”(2026年末≈2027年1月転記)から始まる。seedと二重計上しない。

  actuals: [                       // ★追加: 確定した年末残高の年次系列（疎・年キー、year昇順）
    { year: 2026, cashBalance, investmentBalance, note? },
    { year: 2027, cashBalance, investmentBalance, note? },
    ...
  ],

  baseline: {                      // ★追加: 当初プラン（凍結した計算済み系列）
    capturedAt,
    series: [ { year, totalAssets, investmentBalance, cashBalance }, ... ]
  },

  activeScenarioId,
  scenarios: [ ... ]
}
```

- `actuals` は **現金預金残高・投資残高のみ**。`[baseYear, endYear]` の範囲外の年は無視する。
- `baseline.series` は「`simulate` を実績なしで一度走らせた結果」を**凍結した計算済み系列**。Inputsスナップショットを再計算する方式は採らない（エンジンやmasterDataが今後変わると“固定”のはずの当初プランが動いてしまうため）。真に不変。明示的な「再ベースライン」操作で更新する。
  - トレードオフ: 凍結系列は当時の投影バグもそのまま保存するが、それは「当初こう見込んでいた」という予実比較の趣旨に忠実。
- 実績もベースラインも**世帯共通**（シナリオごとには持たない）。

### 11.3 エンジン変更（`simulate` に実績適用）

`simulate(inputs, master, opts?)` の `opts` に `actuals` を追加。**デフォルト無し＝既存の予測専用挙動と完全に同一**（§6・§9 のゴールデンマスター回帰は不変。`actuals` 空が現行挙動と一致することがリベース実装の背骨）。

```ts
simulate(inputs, master, { returnRate?, actuals?: Actual[] }): YearRow[]
```

年次ループ（実績適用時）:
- 各年、収入・支出・内訳は**従来どおり計算**（表示・文脈用に残す）。
- その年に実績があれば、**年末残高を上書き**: `cash = actual.cashBalance`、`invest = actual.investmentBalance`、`row.isActual = true`。
- 上書きが翌年へ繰り越されることで、**最新実績から自動的にリベース**される（将来の利回り・拠出などの仮定は現行 `inputs` のまま）。

型の追加:

```ts
interface Actual { year: number; cashBalance: number; investmentBalance: number; note?: string }
// YearRow に追加:
//   isActual: boolean
//   実績年の investmentReturn / investmentContribution は null（年末残高だけからは復元不能 → 偽の数字を出さない）
```

実績年の `income`/`expenses`/`annualCashFlow` は**モデル推定値**として残す（UIで「推定」表示）。`totalAssets` は上書き後の `cash+invest`。

### 11.4 出力（予実比較）と既存機能への波及

メイングラフは3系列を年で揃える:

| 系列 | 計算 | 描画 |
|---|---|---|
| 当初プラン | `baseline.series`（凍結値そのまま） | 基準線（点線等） |
| 実績 | `actuals` の `cash+invest` を持つ年のみ | 過去区間の実線 |
| 現行予測 | `simulate(inputs, master, { actuals })` | 過去=実績と一致するため**未来区間のみ**描画（二重描画しない） |

差分ヘルパー（新モジュール `variance.ts`）:

```ts
computeVariance(baseline, actuals): { year, predicted, actual, diff, diffPct }[]
```

既存機能への波及:
- **goalSeek（推奨積立額）**: 実績適用後（リベース後）の `simulate` で逆算する（`actuals` を渡すだけ）。「いま実際にいる場所」から老後までに必要な月額になる。
- **KPI「現在の総資産」**: 実績があれば最新実績の `totalAssets`、無ければ `baseYear` の初期資産。
- **利回りバンド（楽観/悲観）**: 過去は実績で確定。バンドは最新実績を起点に未来側だけ広がる。

### 11.5 テスト戦略（純TS・Vitest）

- **後方互換**: `actuals` 未指定で `simulate` 出力が現行（ゴールデンマスター）と完全一致。
- **上書き伝播**: ある年に実績→その年残高が実績値、翌年予測がそこから複利。
- **リベース**: 当初予測とズレた実績で未来の軌道が変わる。
- **ベースライン不変**: 凍結 `baseline.series` は実績やエンジン変更の影響を受けない。
- **variance**: `computeVariance` の差分・差分%が正しい。
- **実績年の null**: `investmentReturn`/`investmentContribution` が実績年で `null`。

### 11.6 実装の段取り

- 現行 **Plan 1（エンジン基盤）は Task 4 以降が未着手**。まず Plan 1 を予測専用のまま完成させ、ゴールデンマスター回帰を確定させる。
- 実績機能は**その上に乗る加算レイヤー**として**新規プラン**（仮 `docs/superpowers/plans/2026-06-30-lifeplan-actuals.md`）で実装。`actuals` 空＝現行挙動なので衝突しない。
- 型（`Actual`、`YearRow.isActual` 等）の追加は Plan 1 完成後の最初のタスクで入れる。
- Firebase 永続化（旧Plan 2 → 現 **Plan 3**）には `actuals` と `baseline` の読み書きを含める。

## 12. 永続化レイヤー設計（Plan 3 の仕様の源泉）

> このセクションは Plan 3（Firebase/永続化）の仕様の源泉。データモデルは §5・§11.2 を踏襲し、本節は**レイヤー分割・docマイグレーション・実装順序**の決定を定める。Plan 2 が独立specを作らず §11 を源泉にしたのと同じ運用。

### 12.1 方針（ブレストでの決定）

- **アーキテクチャ = ports-and-adapters（ヘキサゴナル）**。永続化を「純TSのドメイン⇔ドキュメント変換・検証・マイグレーション」と「Firestoreアダプタ」「セキュリティルール」に分離する。永続化は**プレーンなデータモデルにのみ束縛**し、まだ存在しない Zustand ストアには束縛しない（ストア/UI配線は Plan 4）。
- **スコープ = 永続化レイヤーのみ**。React/Vite/Zustand の雛形構築は Plan 3 に**含めない**（Plan 4）。
- **このセッションで完成させる範囲 = 純TS層のみ**。Firestoreアダプタ・ルール・IaC は**プラン化のみ**とし、実配線・エミュレータ検証は Firebaseプロジェクトと2人のUID・Firestoreエミュレータが揃ってから別途行う。
- **docマイグレーション = 導入する**。§5/§11.2 の世帯ドキュメントは masterData のようなバージョンを持っていなかったため、`schemaVersion` を追加し、読み込み時に旧版→現行へ移行する枠組みを置く。

### 12.2 データモデル（§5・§11.2 ＋ コンテナ型・封筒）

既存のドメイン型（`Inputs`・`Actual`・`Baseline`）はすべてJSON安全なプレーンオブジェクト。Plan 3 で**コンテナ型と封筒**だけを追加する。

```ts
// 1シナリオ = 1 Inputs セット（§5）
interface Scenario { id: string; name: string; inputs: Inputs }

// 1世帯 = 1ドキュメント（両者が同じドキュメントを参照）
interface HouseholdDoc {
  schemaVersion: number       // ★追加: doc マイグレーション用（現行=1）
  baseYear: number
  activeScenarioId: string
  scenarios: Scenario[]
  actuals: Actual[]           // 世帯共通・疎・year昇順（§11.2）
  baseline?: Baseline         // 世帯共通・凍結（§11.2。未キャプチャ時は省略）
  updatedAt?: string          // デバッグ／将来の楽観ロック用（ISO文字列）
}
```

- `Inputs`/`Actual`/`Baseline` の形は §5・§11.2・既存 `src/types.ts`・`src/engine/baseline.ts` に従う。再定義しない。
- `actuals`・`baseline` は**世帯共通**でドキュメント直下に1本（シナリオごとには持たない、§11.2）。
- Firestore ドキュメント上限1MBに対し本データは数十KB程度で余裕（§5）。

### 12.3 レイヤー構成

**① Pure layer（純TS・完全TDD・このセッションで実装）**

| モジュール | 責務 |
|---|---|
| `src/persistence/types.ts` | `Scenario`・`HouseholdDoc`・`CURRENT_SCHEMA_VERSION` の定義 |
| `src/persistence/doc.ts` | `toDoc(content) → HouseholdDoc`／`fromDoc(unknown) → HouseholdDoc`／`createDefaultDoc() → HouseholdDoc`。`fromDoc` は移行→検証してから返す（不正は throw） |
| `src/persistence/validate.ts` | 型ガード・必須フィールド・範囲・**クロスフィールド不変条件**チェック（CURRENT 形のみ対象。`fromDoc` が利用） |
| `src/persistence/migrate.ts` | `schemaVersion` ごとの移行関数群と runner（旧版→CURRENT） |
| `src/persistence/errors.ts` | `DocValidationError`（不正パス付き）／`UnsupportedSchemaVersionError`（未来版）の例外型 |
| `src/persistence/repository.ts` | `HouseholdRepository` ポート interface ＋ `InMemoryHouseholdRepository` 実装（テスト・将来のオフライン用） |

#### 12.3.1 `doc.ts` の関数契約

```ts
// 封筒フィールド(schemaVersion/updatedAt)を除いたドメイン内容
type HouseholdContent = Omit<HouseholdDoc, 'schemaVersion' | 'updatedAt'>

// toDoc: schemaVersion=CURRENT を付与し、updatedAt を注入(純粋関数なので呼び出し側から渡す)する
function toDoc(content: HouseholdContent, opts?: { updatedAt?: string }): HouseholdDoc

// fromDoc: 永続層から読んだ未知の値を安全な HouseholdDoc にする。順序が肝（H1）:
//   1) 封筒の schemaVersion だけ先読み
//   2) schemaVersion > CURRENT → UnsupportedSchemaVersionError を throw（★fail-closed, C1）
//   3) migrate(旧→CURRENT) … 各 migration 関数が「自分の版→次版」の形の責任を負う
//   4) validate(CURRENT 形のみ) … 不正は DocValidationError を throw
//   5) 返却（正規化しない＝reject方針, M1）
function fromDoc(raw: unknown): HouseholdDoc

// createDefaultDoc: 初回ブートストラップ用 seed doc（load→null のとき UI が作る土台, M2）。
//   schemaVersion=CURRENT, 既定世帯(_realInputs 相当)の base シナリオ1本, actuals=[], baseline 未設定。
function createDefaultDoc(): HouseholdDoc
```

> **fail-closed の徹底（C1）**: 古いデプロイ束の端末が未来版 doc を読んで**そのまま上書き保存すると新スキーマ doc を不可逆に踏み潰す**。これを防ぐため `fromDoc` は未来版で必ず throw し、Plan 4 は「load 失敗後は save しない（書き戻し禁止）／『アプリを更新してください』を表示」を契約とする。

#### 12.3.2 `HouseholdRepository` ポート（最小契約・pure 層で定義）

ポート interface は pure 層（`repository.ts`）に置き、Firebase に依存しない。InMemory 実装が同契約を満たし、Firestore 実装（②）は後日この契約を実装する。

```ts
interface HouseholdRepository {
  load(householdId: string): Promise<HouseholdDoc | null>
  // save は server 確定の updatedAt を載せた doc を返す（楽観ロックの土台, H3）
  save(householdId: string, doc: HouseholdDoc): Promise<HouseholdDoc>
  // 購読直後に現在値で必ず1回発火。doc 未作成は null。読込/移行エラーは onError へ（H4）
  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    onError?: (e: unknown) => void,
  ): () => void // unsubscribe を返す
}
```

- **`updatedAt` の表現境界**: pure 層は ISO 文字列で扱う。Firestore の `serverTimestamp()`/`Timestamp` への変換は**アダプタ境界**で行う（pure 層は Firebase 型を知らない, H3）。
- **将来拡張点（but-future）**: compare-and-set（`expectedUpdatedAt` 前提付き save / トランザクション）で last-write-wins の取りこぼしを塞ぐ。エコーループ（自分の save が `onSnapshot` を再発火→再save）は Firestore `metadata.hasPendingWrites` をアダプタ境界で判別して抑止する。いずれも実配線時（後日）に実装し、ポート契約はそれを許す形にしてある。

**② Adapter layer（このセッションは"プラン化のみ"・後日エミュレータ検証）**

- `src/persistence/firestoreRepository.ts`: `HouseholdRepository` の Firestore 実装（`getDoc`/`setDoc`/`onSnapshot`）。保存時は `toDoc`、読込時は `fromDoc`（＝検証＋マイグレーション）を通す。
- Firebase 初期化（`firebase/app`・`firestore`・`auth`）と Auth ガード（許可UID以外を弾く）。

**③ Security rules ＆ IaC（このセッションは"プラン化のみ"・後日エミュレータ検証）**

- `firestore.rules`: `households/{id}` を2人のUIDホワイトリストのみ read/write 許可（§5）。
- **IaC（将来）**: Firebaseプロジェクトのプロビジョニングをコード管理する。最小形は `firebase.json`／`.firebaserc`／`firestore.rules`／`firestore.indexes.json` をリポジトリ管理。将来的に Terraform（google/firebase provider）でプロジェクト・Firestore・ホスティング・認証設定まで宣言的に管理する方向を見据える。

### 12.4 テスト戦略（純TS・Vitest）

- **往復**: `fromDoc(toDoc(content))` が `toDoc(content)` に deep-equal。`validate` は**正規化しない（ソート/重複排除しない）＝不正は reject** 方針なので、往復不変と「actuals 昇順」不変が両立する（M1）。
- **検証（reject 一覧, M3）**: `fromDoc` は以下を `DocValidationError` で弾く——
  - `scenarios` が空 / `scenario.id` 重複 / `activeScenarioId` が `scenarios` に無い
  - `baseYear <= 0`、**`scenarios.every(s => s.inputs.baseYear === doc.baseYear)` 不成立（クロスフィールド不変, H2）**
  - `actuals` が year 昇順でない / year 重複 / `[baseYear, 全シナリオ中の最大 endYear]` 範囲外 / `cash・investment` が非数（JSON 由来の string/null 混入）
  - `baseline.series` の year が昇順でない / baseYear 起点でない
  - enum 外れ（学校種別・電化区分等）、数値の `NaN/Infinity`
- **未来版 fail-closed（C1）**: `schemaVersion > CURRENT` の doc を `fromDoc` に渡すと `UnsupportedSchemaVersionError` を throw する。
- **マイグレーション（H1 順序）**: 旧版 doc を渡すと migrate→validate を経て現行になる（各移行関数の単体テスト＋runnerの連鎖テスト）。validate より先に migrate が走ることをテストで固定（旧形を validate に通すと誤 reject する退行を防ぐ）。
- **Repository契約**: `InMemoryHouseholdRepository` で——save が**確定 doc（updatedAt 付き）を返す**（H3）／未保存時 `load`＝`null`／`subscribe` は**購読直後に現在値で1回発火**し（未作成なら `null`）、save で再発火、unsubscribe で停止（H4）。InMemory がこの初期発火契約を満たすこと（Plan 4 が InMemory で通り Firestore で壊れる事故の予防）。
- **ブートストラップ**: `createDefaultDoc()` が `fromDoc` を通る妥当な doc を返す（M2）。
- **背骨（後方互換）**: Plan 3 は `src/persistence/` 配下の純追加。`simulate`/`baseline`/`variance` のシグネチャに触れないため、既存の全テスト（現行48）と golden 回帰は**不変**。`Inputs.baseYear`（types.ts）の“きれいな削除”はエンジンに波及し golden を割るので**採らない**（H2 は validate 不変条件で担保, §12.6）。
- アダプタ／ルールのエミュレータ検証は環境が揃ってから別途（このセッションの合格条件には含めない）。

### 12.5 実装順序（このセッションの合格条件）

1. `types.ts`（コンテナ型・`CURRENT_SCHEMA_VERSION`）＋ `errors.ts`（例外型）
2. `validate.ts` ＋ `doc.ts`（`toDoc`/`fromDoc` 往復・検証・`createDefaultDoc`）。`fromDoc` は migrate→validate の順
3. `migrate.ts`（マイグレーション枠組み・未来版 fail-closed）
4. `repository.ts`（ポート＋InMemory実装・契約テスト＝save 確定 doc 返却 / subscribe 初期発火・null・onError）

各ステップ TDD。完了条件 = 全テスト green ＋ `npm run typecheck` 通過 ＋ golden 不変。`firestoreRepository.ts`・`firestore.rules`・IaC は Plan 3 のプラン文書に「後日タスク（環境依存）」として明記し、このセッションでは着手しない。

### 12.6 既知の負債・将来課題（GO を阻害しない）

- **`baseYear` の二重保持**: `HouseholdDoc.baseYear` と各 `scenario.inputs.baseYear`（`types.ts`）が重複。今期は型を正規化せず validate のクロスフィールド不変条件（`§12.4`）で整合を強制する。将来 `Inputs.baseYear` を doc 単一保持へ寄せる正規化は、エンジン波及と golden 影響を伴うため **schemaVersion を上げる移行課題**として記録。
- **`masterDataVersion` の来歴（L1）**: `baseline.series` は特定 masterData 版で凍結した計算済み系列だが、どの版で凍結/リベースしたかが doc に残らない（`schemaVersion` は doc 形状専用）。将来 masterData を上げたとき来歴照合できるよう、封筒に `masterDataVersion?: string` を**将来追加候補**として記録。今期は不要。
- **並行性の本実装**: compare-and-set／`hasPendingWrites` エコー抑止は実配線時（後日）に実装。ポート契約はこれを許す形（§12.3.2）にしてある。

## 13. UI レイヤー設計（Plan 4 の仕様の源泉）

> このセクションは Plan 4（UI）の仕様の源泉。データモデルは §5・§11.2・§12 を踏襲し、本節は**スコープ・アーキテクチャ・データフロー・テスト戦略**の決定を定める。Plan 2/3 が独立specを作らず本ドキュメントの節を源泉にしたのと同じ運用。

### 13.1 方針（ブレストでの決定）

- **スコープ = ダッシュボード画面のみの MVP**。設計書 §1「まずはダッシュボード画面を最優先」に従い、入力フォーム・シナリオ管理画面・ログイン画面・Firebase Auth/Firestore 実配線（§12.3 の②③）は本プランに**含めない**（後続プランで着手）。
- **パッケージ構成 = 既存 `lifeplan/`（`lifeplan-engine`）に同居**。新規モノレポ化はしない。`package.json` の `build` を `tsc -p tsconfig.build.json`（エンジンのライブラリビルド）から **`vite build`（Web アプリビルド）へ切り替える**。CONTRIBUTING.md が予告済みの「Web アプリ着手時にバンドラ対応」に該当し、`education.json` が `dist/` にコピーされない既知の制約（同ファイル記載）も vite のバンドルにより解消される。`typecheck`（`tsc --noEmit`）は変更なし。
- **状態管理 = Zustand**（設計書 §3 で確定済み技術）。ルーティングライブラリは**導入しない**（画面が1つのみのため時期尚早、YAGNI）。次プラン（入力フォーム／シナリオ管理／ログイン）で複数画面が生まれた時点で導入する。
- **永続化 = `InMemoryHouseholdRepository`（Plan 3 実装済み）を使用**。Firestore アダプタ配線は行わない。
- **PII シードデータの扱い（Plan 3 §12.6 からの申し送り事項）**: `src/persistence/defaultHousehold.ts` は**変更しない**。この実名・実年収・実残高データは `tests/_realInputs.ts` 経由でゴールデンマスター回帰テスト（`tests/golden.integration.test.ts` vs `tests/fixtures/golden.json`、いずれも Plan 1 で意図的にコミット済み）専用に使われており、書き換えると回帰が壊れる。UI のブートストラップ初期値は**別ファイル** `src/persistence/placeholderHousehold.ts`（汎用プレースホルダ、「世帯主」「配偶者」「第一子」・丸めた金額）を新設して使う。ローカルでの実データ投入は `src/persistence/seedOverride.ts` が `import.meta.glob('./seed.local.json', { eager: true })` で `seed.local.json`（`.gitignore` 対象・`Inputs` 型準拠）を検出したときのみそれを使い、無ければ `placeholderHousehold.ts` を使う（`defaultHousehold.ts` へはフォールバックしない）。`doc.ts` の `createDefaultDoc()` はこの `seedOverride.ts` の export を参照するよう配線し直す。**既に git 履歴にコミット済みの `defaultHousehold.ts`/`golden.json` の実データ自体を消去・秘匿する作業は本プランのスコープ外**（ユーザー確認済み。将来、別途判断する）。
- **スタイリング = プレーン CSS（CSS Modules）**。追加ライブラリ依存を増やさず、設計書 §8 のトーン（ネイビー/ティール系、信頼感重視）を `src/styles/theme.css` の CSS 変数で表現する。
- **テスト = Vitest + React Testing Library**。既存のエンジン/永続化層の単体テスト構成（`test:unit`/`test:integration`）に相乗りし、コンポーネントテストは `*.test.tsx` として `test:unit` に含める。
- **視覚参照**: Claude Design の成果物（`docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.html`、自己完結バンドル）は本セッションでは視覚確認できなかった（Playwright MCP 未接続）。本節のコンポーネント設計は**設計書 §8 のテキスト仕様のみを情報源**とする。将来 Playwright MCP 等で視覚確認できた場合は、見た目の微調整（配色・余白・コンポーネント配置）を別途行ってよい。
- **e2e テスト = Playwright を追加する**。ダッシュボード MVP にはログイン画面が無いため、Google 認証の自動化問題は本プランでは発生しない。CI で決定論的に実行できるスモーク e2e として組み込む（詳細は §13.5）。
- **Playwright MCP による対話型のファジー確認は Plan 4 以降も引き続き有効**な開発プラクティスとして扱う。実装完了後は CLAUDE.md の「UI/フロントエンド変更はブラウザで確認する」方針に従い、Playwright MCP（接続されている場合）でダッシュボードを実際に操作してゴールデンパス・エッジケースを確認する。将来ログイン画面（Firebase Auth）が入るプランでは、Google OAuth フローの自動化は行わず、**認証済みブラウザタブに Playwright MCP を接続してのファジーな対話型確認**に頼る方針とする（本節に申し送り、正式なテスト計画化はログイン画面のプランで行う）。

### 13.2 ファイル構成

```
lifeplan/
  index.html                              (新規, Vite entry)
  vite.config.ts                          (新規)
  src/
    main.tsx                              (新規, ReactDOM.createRoot)
    App.tsx                               (新規)
    store/
      householdStore.ts                   (新規, Zustand store: doc load/bootstrap)
      selectors.ts                        (新規, simulate/goalSeek/baseline/variance 派生)
    components/
      layout/
        Header.tsx (+ Header.module.css)
      dashboard/
        Dashboard.tsx
        KpiCards.tsx (+ KpiCards.module.css)
        AssetChart.tsx (+ AssetChart.module.css)      … 折れ線+楽観/悲観バンド+イベントマーカー
        BreakdownTabs.tsx (+ BreakdownTabs.module.css) … 現金/投資 積み上げ面 or 単年度収支 棒（タブ切替）
    styles/
      theme.css                           (新規, ネイビー/ティール CSS 変数)
    persistence/
      defaultHousehold.ts                 (変更なし: ゴールデン回帰専用の実データのまま)
      placeholderHousehold.ts             (新規: UI 用の汎用プレースホルダ Inputs)
      seedOverride.ts                     (新規: ローカル実データ→無ければ placeholderHousehold の差し込み口)
      doc.ts                              (修正: createDefaultDoc が seedOverride 経由の defaultInputs を参照)
  tests/
    e2e/
      dashboard.spec.ts                   (新規, Playwright スモーク e2e)
  playwright.config.ts                    (新規)
```

### 13.3 データフロー

1. `App` マウント時、`householdStore` の `load()` アクションが `InMemoryHouseholdRepository.load(HOUSEHOLD_ID)`（`HOUSEHOLD_ID` はローカル定数、例 `'primary'`）を呼ぶ。
2. `null` なら `createDefaultDoc()` を生成し `repository.save()` でブートストラップ。以後は `subscribe()` で反映を受ける（今回のダッシュボードは読み取り専用だが、次プランの書き込みに備えて配線しておく）。
3. `selectors.ts` が `doc.scenarios.find(s => s.id === doc.activeScenarioId)` から中央/楽観/悲観の3系列を `simulate(inputs, lifeplanMaster, { returnRate, actuals: doc.actuals })`（`returnRate` に `investmentReturnRate`/`returnRateOptimistic`/`returnRatePessimistic` を順に渡す）で算出する。`requiredMonthlyInvestment(inputs, lifeplanMaster)` で推奨積立額 KPI を算出する。`doc.baseline` が存在すれば `computeVariance(doc.baseline, doc.actuals)` も算出し、未キャプチャ（`baseline === undefined`）なら予実比較 UI 該当部分を非表示にする。
4. `Dashboard` とその子コンポーネントは、これらの派生値を props として受け取り描画するだけ（保存・編集操作はなし。デバウンス保存や入力反映は次プランの入力フォームで導入）。

### 13.4 メイングラフのイベントマーカー

エンジン非改修で、selectors 側が `YearRow[]` から以下を導出し、Recharts の `ReferenceLine` + カスタムツールチップで表示する:

- **家電/住宅大型支出**: その年の `expenses.家電 > 0` または `expenses.住宅大型 > 0`
- **退職**: `agePrimary` がその年 `inputs.members.primary.workUntilAge` と一致する年
- **年金開始**: `agePrimary` がその年 `inputs.assumptions.pensionStartAge` と一致する年
- **子の進学/卒業**: `agesChildren` の各値が学年区切り年齢（6/12/15/18歳）を跨ぐ年

### 13.5 テスト戦略（Vitest + React Testing Library + Playwright）

- 既存 Vitest 基盤に jsdom 環境を追加する（`vitest.config.ts` の `environment: 'jsdom'`、または component 用の別設定）。
- コンポーネントテストは `*.test.tsx` として作成し、`npm run test:unit` に含める（`*.integration.test.ts` の命名規則は既存のまま維持）。
- `KpiCards`: 与えられた派生値から期待どおりのフォーマット済み表示（円/万円、黒字/赤字の色分けクラス等）になることを検証。
- `AssetChart`: Recharts へ渡す系列データ（中央/楽観/悲観、イベントマーカー配列）が `YearRow[]` から正しく導出されることを検証（ピクセル単位の描画検証はしない）。
- `householdStore`/`selectors`: `InMemoryHouseholdRepository` を使った統合寄りテスト（例 `App.integration.test.tsx`）で、初回ブートストラップ（`createDefaultDoc` 生成→保存→購読反映）から Dashboard 表示までを通しで検証する。
- 既存のエンジン/永続化テスト（81件）・ゴールデンマスター回帰は**無改変**（背骨: `src/engine/`・`src/persistence/{types,doc,validate,migrate,repository}.ts` のシグネチャ変更なし。`defaultHousehold.ts` は無改変。`doc.ts` の変更は `createDefaultDoc` の参照先切り替えのみで型シグネチャ不変）。

**e2e（Playwright、CI で自動実行）**:
- `@playwright/test` を devDependencies に追加。`tests/e2e/dashboard.spec.ts` で `vite preview`（ビルド成果物）を起動し、ブラウザでダッシュボードにアクセスして以下をスモーク検証する: KPIカード5枚が表示される／メイングラフ（SVG）が描画される／内訳タブの切替が動作する。ログイン画面が無いため認証は不要で決定論的に実行できる。
- `package.json` に `"test:e2e": "playwright test"` を追加。`npm test` には含めず（重い・ブラウザ起動を伴うため）、CI では独立ジョブとして実行する。
- `.github/workflows/ci.yml` に `e2e` ジョブを追加（`npx playwright install --with-deps chromium` → `npm run build` → `npm run test:e2e`）。`main` 保護の必須チェック一覧（CONTRIBUTING.md「main 保護」）に `e2e` を追加する。
- `CONTRIBUTING.md` のローカル確認コマンド例に `npm run test:e2e` を追記する。

**Playwright MCP による対話型のファジー確認（CI 外・開発時の補助手段）**:
- 自動 e2e は「決定論的に再現できるスモーク確認」に限定する。実装完了後の目視確認（レイアウト・配色・ホバー動作等、CLAUDE.md の方針）は、Playwright MCP が接続されていれば dev サーバーに対してそれを使って行う。接続されていなければ人間によるブラウザ確認を依頼する。
- 将来ログイン画面のプランでは、Google OAuth 自動化は行わず、認証済みタブへの Playwright MCP 接続によるファジーな回帰確認に頼る（本節は方針の申し送りのみ、正式化はそのプランで行う）。

### 13.6 明示的に対象外（次プラン以降）

- 入力フォーム画面・シナリオ管理画面・ログイン画面
- Firebase Auth/Firestore 実配線（`firestoreRepository.ts`／`firestore.rules`／IaC、§12.3 の②③）、CI `deliver` ジョブへの Firebase Hosting デプロイ追加
- シナリオ比較トグル（比較対象となる複数シナリオを作る手段＝入力フォーム・シナリオ複製機能が無いため、本プランでは意味を持たない）

## 14. 入力フォーム画面設計（Plan 5 の仕様の源泉）

> このセクションは Plan 5（入力フォーム）の仕様の源泉。画面仕様の骨子は §8.2、データモデルは §5・§12 を踏襲し、本節は**スコープ・アーキテクチャ・データフロー・保存/検証・テスト戦略**の決定を定める。Plan 2〜4 と同じく独立 spec は作らず本ドキュメントの節を源泉にする運用。

### 14.1 方針（ブレストでの決定）

- **スコープ = §8.2 の入力画面のみ**。①世帯メンバー②資産③住居④生活スタイル⑤家電買い替え（`homeMaintenance` 含む）⑥前提（利回り3種・インフレ率・endAge・年間投資額・年金・コーストFIRE目標額上書き・`oneTimeInvestments`）を実装する。actuals（実績値, §11）の入力UI・リベース操作、シナリオ管理・比較（§8.3）、ログイン（§8.4）、Firebase 実配線は**含めない**（後続プラン）。残スコープ3系統のうち入力フォームを先行する理由: 純フロントで環境非依存（pure-first の既定方針）、かつシナリオ管理が意味を持つための前提機能だから。
- **編集・保存モデル = ドラフト + 明示保存**。編集中はドラフト state を保持し、プレビューはドラフトから即時計算。「保存」で validate→`repository.save`、「破棄」で元に戻す。不正な中間状態（空欄・範囲外）が doc に混入せず、将来 Firestore 接続時も書き込み回数が少ない。即時自動保存（debounce save）は採らない。
- **ルーティング = react-router-dom を導入**。`/` = ダッシュボード（既存・無改変）、`/input` = 入力画面。Plan 4 §13.1 で「複数画面が生まれた時点で導入する」と予告したポイントに到達した。次プランのシナリオ管理・ログイン画面も同じ仕組みに乗る。
- **フォーム状態管理 = Zustand ドラフト store 自作**。react-hook-form/zod は導入しない（既存 `persistence/validate.ts` と検証ロジックが二重管理になるため）。ドラフトは `Inputs` 丸ごとを保持し、プレビューはそれをそのまま engine に食わせる。
- **検証の二層構え**: フィールド単位の軽量チェック（数値パース・必須・範囲）はフォーム層で行い、保存時は既存の `toDoc`→`fromDoc`（migrate→validate）を**最終防壁**として通す。`DocValidationError` はエラー表示して保存を中断する。
- **fail-closed の継承（§12.3.1 C1）**: `householdStore` が `error` のとき（load 失敗・未来版 doc）は入力画面も編集・保存不可とし、書き戻しをしない。
- **永続化 = `InMemoryHouseholdRepository` のまま**（リロードで編集が消える制約は Firebase 実配線プランまで許容。ユーザー確認済み）。

### 14.2 ファイル構成

```
lifeplan/
  src/
    App.tsx                               (修正: RouterProvider / Layout(Header+Outlet) + ルート定義)
    store/
      draftStore.ts                       (新規, Zustand: draft/dirty/fieldErrors/beginEdit/update/save/discard)
      selectors.ts                        (修正: ドラフト Inputs から直接プレビュー派生を計算できる関数を追加抽出。
                                           既存 selectDashboardData のシグネチャは不変)
    components/
      input/
        InputPage.tsx (+ .module.css)     (新規: セクションアコーディオン + プレビューペイン + 保存バー)
        PreviewPane.tsx                   (新規: AssetChart 再利用 + 主要KPI数枚)
        SaveBar.tsx                       (新規: 保存/破棄/dirty 表示/保存エラー表示)
        sections/
          MembersSection.tsx              (①: primary / 配偶者あり・なしトグル / 子の追加・削除)
          AssetsSection.tsx               (②: bankAccounts / investments の追加・削除)
          HousingSection.tsx              (③: 賃貸|持ち家で表示項目切替)
          LifestyleSection.tsx            (④: electricType / internetMonthly)
          AppliancesSection.tsx           (⑤: appliances + homeMaintenance の追加・削除)
          AssumptionsSection.tsx          (⑥: 利回り・endAge・年間投資額・年金・coastFireTargetAmount・oneTimeInvestments)
        fields/
          TextField.tsx / NumberField.tsx / MoneyField.tsx / SelectField.tsx
                                          (新規: 共通フィールド部品。数値の文字列保持+パース戦略をここに集約)
      layout/
        Header.tsx                        (修正: 「入力」ナビリンク追加)
  tests/
    e2e/
      dashboard.spec.ts                   (修正: 入力画面スモークを追加 or input.spec.ts を新設)
```

### 14.3 データフロー

0. `householdStore.load()` は**ルート Layout で一度だけ**呼ぶ（ルート遷移で再実行しない）。load 時に使用した repository インスタンスは `householdStore` の state に保持し、多重購読は unsubscribe 保持により冪等化する（StrictMode の二重 effect・再 mount での購読重複と二重 bootstrap を防ぐ）。
1. `/input` マウント時、`draftStore.beginEdit(scenarioId, inputs)` が active シナリオの `inputs` をディープコピーしてドラフト化する（`householdStore` が `ready` でなければ編集 UI を出さない）。**編集対象 scenarioId をドラフト state に固定**する（次のシナリオ管理プランで activeScenarioId が編集中に切り替わっても保存先が誤爆しないため）。
2. 各セクションコンポーネントは `update(fn: (prev: Inputs) => Inputs)` で不変更新する。配列（子・口座・家電・住宅メンテ・oneTimeInvestments）は追加/削除 UI を持ち、子の `id` は `crypto.randomUUID()` で採番する。
3. プレビューはドラフト `Inputs` を engine セレクタ（中央/楽観/悲観 `simulate` + KPI）に渡して約 200ms の debounce で再計算し、PC では右側・スマホでは下部に表示する（§8.2）。ダッシュボードと同条件にするため `doc.actuals` も同じく適用する。KPI は最低限「終了年齢時点の総資産」「推奨毎月積立額」を表示する。
4. 「保存」の手順: **save 時点の `householdStore.doc` を土台**に、`beginEdit` で固定した scenarioId のシナリオの `inputs` のみドラフトで差し替えた `HouseholdDoc` を組む（actuals・baseline・他シナリオはドラフトの影響を受けない）。`toDoc(content, { updatedAt: new Date().toISOString() })` で打刻し、`fromDoc` を通してから `repository.save(HOUSEHOLD_ID, doc)`。repository は `householdStore` が保持する**同一インスタンス**を使う（テスト時の注入シームを共有）。`subscribe` 経由で `householdStore` に反映され、ダッシュボードも更新される。保存成功で `dirty` を落とす。将来 Firestore アダプタ導入時は serverTimestamp が `updatedAt` を上書きする（§12.3.2 H3 の土台）。
5. 「破棄」は現 doc から再コピー。`dirty` のままの画面遷移は router blocker（+`beforeunload`）で確認ダイアログを出す。
6. **dirty 中に subscribe で doc が更新されてもドラフトはリベースしない**（保存時に対象シナリオの inputs のみ差し替えるため衝突面はそこに限定される。InMemory では自分の save 以外で発火しないので実害なし）。updatedAt ベースの競合検出（CAS）は Firestore 実配線プランのスコープ（§12.3.2）。非 dirty で `/input` 滞在中に doc が更新された場合はドラフトを `beginEdit` し直して追随する。

### 14.4 フォーム UX・不正中間値の遮断

- **数値フィールドは入力欄ローカルに文字列で保持**し、パース成功時のみドラフトへ反映する。パース不能・範囲外はフィールドエラーを表示し、ドラフトは最後の正常値を維持する。これにより `NaN`/空欄が engine・doc に流れない。
- **フィールド範囲（フォーム層で強制）**: `persistence/validate.ts` は意味的範囲（endAge・birthYear 等）を検証しない（actuals 範囲等の構造検査のみ）ため、範囲はフォーム層の責務とする。最低限——
  - `endAge` > baseYear 時点の primary 年齢（さもないと `simulate` が空系列を返しセレクタが throw する）
  - `workUntilAge` ≤ `endAge`、`pensionStartAge` ≤ `endAge`
  - `birthYear` は 1900〜baseYear、`birthMonth` は 1〜12。**例外: 子の `birthYear` は 1900〜baseYear+30**（将来の出生計画をシナリオに含められることが教育費シミュレーションの本質的ユースケースのため。engine は将来出生年の子を自然に扱える）
  - 金額・残高・価格は有限かつ ≥ 0。利回り・インフレ率は有限（負は許容）
  - `oneTimeInvestments`・家電/メンテの year 系はシミュレーション範囲（baseYear〜終了年）のヒントを添える（範囲外は engine が黙って無視するため）
- **プレビューの保険**: 上記でも防げない組み合わせ不正に備え、PreviewPane は error boundary（またはセレクタ呼び出しの try/catch）で「この設定ではシミュレーションできません」表示に落とし、入力画面全体を巻き込んでクラッシュしない。
- **`baseYear` は編集不可の固定表示**。クロスフィールド不変条件（`scenario.inputs.baseYear === doc.baseYear`, §12.4 H2）があるため、入力フォームからは変更させない。
- **`DocValidationError` は SaveBar に `message` をそのまま汎用表示する**（フィールドへの逆マッピング UI は作らない。baseYear 固定・フィールドガードにより最終防壁が発火する経路はほぼ残らないため YAGNI）。
- **配偶者**は「あり/なし」トグル。「なし」→「あり」はプレースホルダ値で `Member` を生成、「あり」→「なし」は `spouse: null`（入力値は破棄される旨を確認ダイアログで明示）。
- セクションは**アコーディオン**（§8.2 の「タブ or アコーディオン」から選択）。モバイルでは全幅、PC ではフォーム列+プレビュー列の2カラム。
- **フィールドの正は `src/types.ts` の `Inputs`**。§5 との乖離（`housing.buildYear` が §5 にあるが `Housing` 型に無い、`lifestyle.internet` は実装では `internetMonthly` 等）は `types.ts` に従い、無いフィールドの入力欄は作らない。

### 14.5 テスト戦略（§13.5 踏襲）

- `draftStore` 単体: beginEdit のディープコピー独立性 / update と dirty / save が validate 防壁を通ること（不正ドラフトで `DocValidationError` → save されない）/ discard の復元。
- フィールド部品: 文字列→数値パース・エラー表示・正常値コミットの境界（RTL）。
- 各セクション: 代表フィールドの編集がドラフトに反映されること、配列の追加/削除（RTL）。
- 統合（`App.integration.test.tsx` 系）: `/input` で編集→プレビュー反映→保存→`/` のダッシュボードに反映、破棄で元に戻る。保存が actuals・baseline・他シナリオを巻き戻さないこと（§14.3 step 4 の土台 doc 契約）。
- 統合（C1 継承）: `householdStore` を `error` 状態にして `/input` に遷移→編集 UI 非表示・保存不能を検証。
- 統合: dirty 状態での画面遷移で router blocker が発火する。プレビューの error boundary が不正な組み合わせでフォールバック表示になる。
- **背骨**: `src/engine/`・`src/persistence/` は無改変（純追加のみ）。既存 97 テストとゴールデン回帰は不変。`selectors.ts` は既存エクスポートのシグネチャ不変で関数追加のみ。
- e2e スモーク: 入力画面へ遷移→1フィールド編集→プレビュー変化→保存→ダッシュボード反映、を追加。CI 構成（unit/integration/e2e ジョブ）は既存のまま。
- 実装完了後は Playwright MCP（接続時）で入力画面のゴールデンパス・エッジケース（不正値入力・破棄・アコーディオン開閉・モバイル幅）をファジー確認する（§13.1 の方針を継続）。

### 14.6 明示的に対象外（次プラン以降）

- actuals（実績値）の入力UI・リベース（baseline 再凍結）操作
- シナリオ管理画面（複製・削除・切替 UI）・シナリオ比較トグル（§8.3, §7③）
- ログイン画面（§8.4）・Firebase Auth/Firestore 実配線・Hosting デプロイ（§12.3 の②③）
- localStorage 等の代替永続化（Firebase 実配線プランで一括対応）

## 15. シナリオ管理画面設計（Plan 6 の仕様の源泉）

> このセクションは Plan 6（シナリオ管理）の仕様の源泉。画面仕様の骨子は §8.3、データモデルは §5・§12 を踏襲し、本節は**スコープ・アーキテクチャ・データフロー・保存/検証・テスト戦略**の決定を定める。Plan 2〜5 と同じく独立 spec は作らず本ドキュメントの節を源泉にする運用。

### 15.1 方針（ブレストでの決定）

- **旧「Plan 6」は分割した**。本節のシナリオ管理（外部依存ゼロ・純フロント）を Plan 6 とし、ログイン画面（§8.4）＋ Firebase 実配線（Auth・firestoreRepository・セキュリティルール・Hosting・IaC, §12.3 ②③）は Plan 7 として後続させる（Firebase プロジェクト作成・UID 取得等のユーザー側環境準備が必要なため）。
- **スコープ = シナリオの一覧・複製・名前変更・削除・アクティブ切替のみ**。シナリオ比較（複数シナリオのグラフ重ね描き）と「比較に含めるチェック」（§8.3）は**含めない**——比較ビューが無いうちはチェックだけ置いても意味がないため、比較機能一式を将来プランに送る（YAGNI）。新規作成 UI も置かず、§8.3 どおり**複製のみ**で新シナリオを作る。
- **ロジックの置き場所 = 純関数モジュール + 薄い保存アクション**（ブレストで案1を採択）。構造操作（複製/削除/rename/切替）を `src/persistence/scenarioOps.ts` の純関数として TDD で実装し、保存は draftStore.save と同一パターン（`toDoc`→`fromDoc` 最終防壁→`repository.save`）を共通化した薄いアクション層に限定する。フォーム編集（ドラフト+明示保存, §14）と対照的に、構造操作には「編集途中」の概念が無いため**即時保存・ドラフト無し**とする。
- **編集は URL で対象指定**: `/input/:scenarioId` を追加し任意シナリオを編集可能にする。アクティブ切替と編集を独立させ、「編集したらダッシュボードの表示対象まで変わった」事故を防ぐ。`draftStore` は元々 beginEdit で scenarioId を固定する設計（§14.3 step 1）なので変更不要。`/input`（パラメータ無し）は従来どおりアクティブシナリオ編集にフォールバックする。
- **永続化 = `InMemoryHouseholdRepository` のまま**（§14.1 と同じ制約を継続。Firebase 実配線は Plan 7）。

### 15.2 ファイル構成

```
lifeplan/
  src/
    App.tsx                               (修正: /scenarios ルート追加、/input/:scenarioId 追加)
    persistence/
      scenarioOps.ts                      (新規, 純TS: duplicateScenario / deleteScenario /
                                           renameScenario / setActiveScenario)
    store/
      scenarioActions.ts                  (新規: 保存パターン共通化の薄いアクション層)
      selectors.ts                        (修正: selectScenarioSummary 追加。既存エクスポートのシグネチャ不変)
    components/
      scenarios/
        ScenariosPage.tsx (+ .module.css) (新規: カード一覧)
        ScenarioCard.tsx                  (新規: 1シナリオ=1カード。インライン rename・2段階削除確認)
      input/
        InputPage.tsx                     (修正: useParams で scenarioId 取得。未知 id はエラー表示)
      layout/
        Header.tsx                        (修正: 「シナリオ」ナビリンク追加)
  tests/
    e2e/                                  (e2e 1本追加: 複製→編集→保存→切替→ダッシュボード反映)
```

### 15.3 scenarioOps の契約（純関数・doc → HouseholdContent）

各関数は `HouseholdDoc` を受け取り、封筒（schemaVersion/updatedAt）を除いた `HouseholdContent` を返す。ガード違反は throw（UI はボタン無効化で先に防ぎ、throw は最終防壁）。

- `duplicateScenario(doc, sourceId, newId)` — `structuredClone` で深いコピー（元と参照非共有）。`newId` は呼び出し側から注入する（`toDoc` の `updatedAt` 注入と同じ流儀で純粋性を保つ。UI 側は `crypto.randomUUID()`）。名前は「◯◯のコピー」、同名が既にあれば「◯◯のコピー2」「◯◯のコピー3」…と採番。`activeScenarioId` は不変。
- `deleteScenario(doc, id)` — **最後の1本は削除不可（throw。validate の `scenarios` 非空制約とも整合）**。アクティブを削除したら `activeScenarioId` は残りの先頭へ自動切替。非アクティブ削除では `activeScenarioId` 不変。
- `renameScenario(doc, id, name)` — trim して空文字なら reject。名前の一意性は強制しない（validate も id のみ一意を要求）。
- `setActiveScenario(doc, id)` — 存在しない id は reject。
- 全関数共通: 未知の `sourceId`/`id` は throw。出力は `fromDoc(toDoc(...))` を必ず通る形であること。

### 15.4 データフロー・エラー処理

**書き込みフロー（全操作共通・scenarioActions.ts）**

1. `useHouseholdStore.getState()` から `doc`/`status`/`repository` を取得（`status !== 'ready'` なら `{ ok: false }`）
2. scenarioOps 純関数を適用（throw は catch してエラーメッセージ化）
3. `toDoc(content, { updatedAt: new Date().toISOString() })` → `fromDoc(next)` 最終防壁（C1 fail-closed 継承）→ `repository.save(HOUSEHOLD_ID, next)`
4. `subscribe` 経由で `householdStore.doc` が更新され全画面再描画。失敗時は doc 不変（ロールバック不要）

各アクションは `Promise<{ ok: boolean; error?: string }>` を返す。グローバルなエラー state は持たず、ページの local state で `role="alert"` 表示（draftStore と違い「編集途中」が無いため store 不要）。

**編集中ドラフトとの相互作用**

- 編集中のシナリオが削除された場合 → 既存の draftStore.save ガード（scenarioId 消失で saveError・repository 未書込・dirty 維持）がそのまま効く。**新規の防御コードは不要**。
- アクティブ切替は draftStore に影響しない（beginEdit で scenarioId 固定済み、§14.3 の既存契約）。
- `/input/:scenarioId` の id が doc に無い場合はフォームを出さず「シナリオが見つかりません」＋ `/scenarios` へのリンクを表示。

### 15.5 画面仕様（/scenarios）

- **カード一覧**（1カード=1シナリオ）: 名前＋アクティブバッジ、要約2数値（終了年齢時点の総資産・推奨積立額/月）、操作=「アクティブにする／編集／複製／名前変更／削除」。
- 要約は新セレクタ `selectScenarioSummary(inputs, actuals)` で算出（既存 `simulateAll` + `computeKpiSummary` を再利用）。actuals は世帯レベルなので全シナリオに共通適用（ダッシュボードと同条件）。
- **名前変更**: カード内インライン編集（input＋確定/キャンセル）。
- **削除**: カード内2段階確認（「削除しますか？[削除][キャンセル]」）。`window.confirm` は使わない（テスト容易性）。シナリオ1本のみのとき削除ボタン無効化。
- **複製**: 一覧に新カードが増えるだけ（自動遷移しない）。

### 15.6 テスト戦略（§13.5/§14.5 踏襲・TDD）

実装は superpowers:test-driven-development に従い**テストファースト**で進める（特に scenarioOps は red→green→refactor を厳守）。

- `scenarioOps` 単体（純TS）: 複製=新id・deep clone（参照非共有）・「のコピー」採番（衝突時2,3…）／削除=最後の1本 throw・アクティブ削除で先頭へ切替・非アクティブ削除で activeScenarioId 不変／rename=trim・空文字 reject／setActive=未知 id reject／全 op 出力が `fromDoc(toDoc(...))` を通過。
- `scenarioActions` 結合: InMemoryRepository 相手に save 成功で subscribe 発火・doc 反映／`status!=='ready'` で `{ok:false}`／op throw・fromDoc reject 時に repository 未書込。
- `ScenariosPage`（RTL）: カード描画（名前・要約・アクティブバッジ）／インライン rename フロー／2段階削除確認／1本のみで削除無効／複製でカード増加。
- `InputPage`（RTL 追加分）: `/input/:scenarioId` で非アクティブシナリオが編集対象になる／未知 id でエラー表示＋フォーム非表示。
- e2e（Playwright 1本追加）: 複製→編集して保存→アクティブ切替→ダッシュボード反映。
- **背骨**: `src/engine/`・`src/persistence/` の既存ファイルは無改変（`scenarioOps.ts` は純追加）。`selectors.ts` は既存エクスポートのシグネチャ不変で関数追加のみ。既存 170 テストとゴールデン回帰は不変。全ゲート = unit/integration + typecheck + lint + build + e2e。
- 実装完了後は Playwright MCP で目視確認（カード操作のゴールデンパス・エッジケース・モバイル幅。スクリーンショットはビューポート撮影で行う——fullPage は Recharts が空白に写るため）。

### 15.7 明示的に対象外（後続プラン）

- シナリオ比較（グラフ重ね描き・比較チェック, §8.3 の一部・§7③）
- ログイン画面（§8.4）・Firebase Auth/Firestore 実配線・セキュリティルール・Hosting デプロイ・IaC（§12.3 ②③）→ **Plan 7**
- actuals（実績値）入力 UI・リベース操作（§11）

## 16. 実績値入力・リベース画面設計（Plan 9 の仕様の源泉）

> このセクションは Plan 9（actuals 入力 UI）の仕様の源泉。データモデル・エンジン変更・予実比較の計算式は §11 で確定済み（Plan 2 で実装済み）。永続化層（`actuals`/`baseline` の読み書き・validate 制約）も Plan 3 で実装済み。`selectors.ts` の `DashboardData.variance` もすでに配線済み。本節は**残っている UI 層のみ**（画面配置・操作・データフロー・テスト戦略）を定める。

### 16.1 方針（ブレストでの決定）

- **画面配置 = 新規ページ `/actuals`**。実績は世帯共通（シナリオに属さない）ため、シナリオ編集フォーム（`/input`）に混ぜず `/scenarios` と同じ独立ページパターンにする。Header に「実績」ナビを追加。
- **baseline 操作 = 明示的な2操作**。「当初プランとして記録する」（未設定時のみ活性）と「再ベースライン」（設定済みのとき、2段階確認つき）を分ける。§11.2 の「真に不変・明示操作でのみ更新」という設計意図に従う。
- **予実比較の表示 = ダッシュボードに新規セクション追加**。既存の `AssetChart`（中央/楽観/悲観の3バンド）は無改変のまま残し、その下に予実比較専用のチャート＋差分テーブルを追加する（`data.variance === null` のときは非表示）。
- **保存 = 即時保存・ドラフト無し**。シナリオ構造操作（§15.1 案1）と同じ理由: 実績の1行追加/編集/削除に「編集途中」の概念は無い。
- **ロジックの置き場所 = 純関数モジュール + 薄い保存アクション**。§15 と同じ方針で `src/persistence/actualsOps.ts`（純TS）＋ `src/store/actualsActions.ts`（薄いアクション層）に分離する。
- **保存パターンの共通化**: `scenarioActions.ts` の `applyScenarioOp`（`toDoc`→`fromDoc`最終防壁→`repository.save`）は実績操作にもそのまま必要な処理のため、共有ヘルパー `src/store/applyHouseholdOp.ts` に切り出し、`scenarioActions.ts`・`actualsActions.ts` の両方から使う（既存の重複を増やさない）。

### 16.2 ファイル構成

```
lifeplan/
  src/
    App.tsx                               (修正: /actuals ルート追加)
    persistence/
      actualsOps.ts                       (新規, 純TS: setActual / deleteActual /
                                           captureBaseline / recaptureBaseline)
    store/
      applyHouseholdOp.ts                 (新規: toDoc→fromDoc→repository.save の共通ヘルパー。
                                           scenarioActions.ts をこれを使うようリファクタ)
      actualsActions.ts                   (新規: 薄いアクション層)
    components/
      actuals/
        ActualsPage.tsx (+ .module.css)   (新規: 実績年一覧＋baseline操作)
        ActualRow.tsx                     (新規: 1年=1行。MoneyField/TextField 再利用)
      dashboard/
        VarianceSection.tsx (+ .module.css) (新規: 予実比較チャート＋差分テーブル)
        Dashboard.tsx                      (修正: VarianceSection 追加)
        AnnualTable.tsx                    (修正: isActual 行に印を付ける)
      layout/
        Header.tsx                        (修正: 「実績」ナビリンク追加)
  tests/
    e2e/                                  (e2e 1本追加: 実績記録→baseline記録→ズレのある年を記録
                                           →ダッシュボードで予実差分確認)
```

### 16.3 actualsOps の契約（純関数・doc → HouseholdContent）

各関数は `HouseholdDoc` を受け取り、封筒（schemaVersion/updatedAt）を除いた `HouseholdContent` を返す。ガード違反は throw（UI はボタン無効化で先に防ぎ、throw は最終防壁）。validate 側の制約（年昇順・`[baseYear, maxYear]` 範囲・`baseline.series[0].year === baseYear`）は変更しない。

- `setActual(doc, actual: Actual)` — 同じ `year` が既にあれば上書き、無ければ追加。追加後は `year` 昇順に整列してから返す（validate の「年昇順」制約に自前で適合する。呼び出し側の入力順に依存しない）。
- `deleteActual(doc, year)` — 指定年が無ければ throw。
- `captureBaseline(doc, opts: { capturedAt: string })` — **`doc.baseline` が既に設定されていれば throw**（「再ベースラインを使ってください」）。アクティブシナリオの `inputs` で `engine/baseline.ts` の `captureBaseline(inputs, master, { capturedAt })` を呼び、結果をそのまま `doc.baseline` にセットする。
- `recaptureBaseline(doc, opts: { capturedAt: string })` — **`doc.baseline` が未設定なら throw**（「まだ記録されていません」）。処理内容は `captureBaseline` と同じ（アクティブシナリオの現在の inputs で凍結し直す）。
- 全関数共通: 出力は `fromDoc(toDoc(...))` を必ず通る形であること。

### 16.4 データフロー・エラー処理

**書き込みフロー（`applyHouseholdOp` 共通化後）**

1. `useHouseholdStore.getState()` から `doc`/`status`/`repository` を取得（`status !== 'ready'` なら `{ ok: false }`）
2. 渡された `(doc) => HouseholdContent` 純関数を適用（throw は catch してエラーメッセージ化）
3. `toDoc(content, { updatedAt: new Date().toISOString() })` → `fromDoc(next)` 最終防壁（C1 fail-closed 継承）→ `repository.save(HOUSEHOLD_ID, next)`
4. `subscribe` 経由で `householdStore.doc` が更新され全画面再描画。失敗時は doc 不変（ロールバック不要）

`scenarioActions.ts` の5つのアクションは全て `applyHouseholdOp` 呼び出しにリファクタする（挙動は不変、実装の重複だけ除去）。`actualsActions.ts` は `setActualAction` / `deleteActualAction` / `captureBaselineAction` / `recaptureBaselineAction` を同じ形で公開する。

### 16.5 画面仕様（/actuals）

- **実績一覧**: 年ごとに1行（`ActualRow`）。現金残高・投資残高は `MoneyField`（既存の入力部品を再利用）、メモは任意の `TextField`。行の保存は各フィールドの `onCommit` で即時発火（フォームの「保存」ボタンは無い）。
- **追加**: 「年を追加」操作で `<select>` から `baseYear` 以降の未記録年を選ぶ（記録済みの年は選択肢から除外）。全年が記録済みなら追加ボタンは非活性。
- **削除**: 行内に「削除」ボタン。2段階確認は不要（1件の年次残高の削除は影響が小さく、§15.5 のシナリオ削除ほど重い操作ではない）。
- **baseline セクション**（ページ上部、一覧より前）:
  - 未設定: 「まだ記録されていません」＋「当初プランとして記録する」ボタン（アクティブシナリオの現在の内容で凍結する旨を一言添える）。
  - 設定済み: 記録日時（`capturedAt`）を表示＋「再ベースライン」ボタン。押下で2段階確認（「現在の入力内容で当初プランを上書きします。よろしいですか？[上書きする][キャンセル]」）。`window.confirm` は使わない（§15.5 と同じくテスト容易性のため）。

### 16.6 ダッシュボード側の変更

- **`VarianceSection`**: `data.variance`（`VariancePoint[]`）が `null` でないときのみ描画。
  - チャート: §11.4 の3系列（当初プラン=`baseline.series` そのまま点線、実績=`actuals` のある年のみ実線、現行予測=未来区間のみ）。実装は既存 `AssetChart`/`BreakdownTabs` と同じ Recharts の `ComposedChart` パターンを踏襲し、新規コンポーネントとして分離する（既存チャートの props 拡張はしない＝影響範囲を限定）。
  - テーブル: `computeVariance` の出力をそのまま年・当初プラン・実績・差分・差分% の列で表示。
- **`AnnualTable`**: `central[i].isActual` が true の行に軽い視覚的な印（バッジまたは行の背景色）を付ける。列の追加・既存列の変更はしない（YAGNI。`investmentReturn`/`investmentContribution` は現状どの表にも出していないため、実績年の null 対応も不要）。

### 16.7 テスト戦略（§15.6 踏襲・TDD）

実装は superpowers:test-driven-development に従い**テストファースト**で進める（特に `actualsOps` は red→green→refactor を厳守）。

- `actualsOps` 単体（純TS）: `setActual` の新規追加・上書き・年昇順整列／`deleteActual` の未知年 throw／`captureBaseline` の baseline 既存時 throw・`capturedAt` 打刻・アクティブシナリオの inputs から凍結／`recaptureBaseline` の baseline 未設定時 throw・上書き／全 op 出力が `fromDoc(toDoc(...))` を通過。
- `applyHouseholdOp` 単体: 既存 `scenarioActions` の結合テストがこのリファクタで壊れないことを確認（振る舞い不変のリグレッション確認）。
- `actualsActions` 結合: InMemoryRepository 相手に save 成功で subscribe 発火・doc 反映／`status!=='ready'` で `{ok:false}`／op throw・fromDoc reject 時に repository 未書込。
- `ActualsPage`（RTL）: 一覧描画／年追加（選択肢が未記録年のみ）／行削除／baseline 未設定→記録／baseline 設定済み→再ベースライン2段階確認。
- `VarianceSection`（RTL）: `variance === null` で非表示／`variance` ありでチャート・テーブル描画。
- `AnnualTable`（RTL 追加分）: `isActual` 行の印。
- e2e（Playwright 1本追加）: `/actuals` で2年分記録→baseline記録→3年目をズレた値で記録→ダッシュボードで `VarianceSection` の差分が表示される。
- **背骨**: `src/engine/` は無改変（Plan 2 で完成済み）。`src/persistence/` の既存ファイル（`doc.ts`・`validate.ts`・`migrate.ts`・`repository.ts`）は無改変、`actualsOps.ts` は純追加。`selectors.ts` も無改変（`variance` は既に配線済み）。既存224テスト（+emulator 12件）とゴールデン回帰は不変。全ゲート = unit/integration + typecheck + lint + build + e2e。
- 実装完了後は Playwright MCP で目視確認（実績記録・baseline記録・再ベースライン確認ダイアログのゴールデンパス。スクリーンショットはビューポート撮影で行う——fullPage は Recharts が空白に写るため、§次のタスク の教訓を踏襲）。

### 16.8 明示的に対象外（後続プラン）

- シナリオ比較（§15.7 で送った項目、引き続き未着手）
- actuals の一括インポート（CSV等）・過去年の一括修正 UI（現状は1年ずつの手入力のみ）
- `baseline` の複数保持・履歴（「再ベースライン」は常に1つを上書き。過去の当初プランを遡って見る機能は無い）

### 16.9 baseYear より前の実績（参考記録、Plan 9 後の小規模追加）

- `actuals[].year` の下限チェック（`< doc.baseYear` で reject）を撤廃した。上限（`baseYear + 100`）と昇順制約のみ残す。
- 理由: `simulate()` のループは `for (let year = inputs.baseYear; year <= endYear; year++)` であり、`baseYear` より前の年の `actuals` エントリは**リベース計算に一切影響しない**（`actualByYear.get(year)` が呼ばれる year の範囲に含まれないため）。よって baseYear 以前の実績は「保存はできるが計算には使われない、純粋な参考記録」として安全に許容できる。
- `VarianceSection` の予実比較にも自動的に現れない（`baseline.series` は `baseYear` から始まるため、`computeVariance` は `baseline` に対応する年が無い actual を自動的にスキップする）。`AnnualTable` にも現れない（`central` 行は `baseYear` からしか無い）。表示されるのは `/actuals` の一覧のみ。
- `ActualsPage` の年ピッカーは `baseYear - 10` 〜 終了年の範囲に緩和した（`PRE_BASE_YEAR_REFERENCE_RANGE = 10`）。10年より前の参考記録が必要になった場合は定数を調整する。

## 17. 保育料（対象自治体）の追加（小規模タスクの仕様の源泉）

> エンジンの `expensesForYear` に新規カテゴリ「保育料」を追加する。新規プラン化はせず、小規模タスクとして直接 TDD で実装する（永続化・UI 画面の変更は無い）。

### 17.1 背景・データソース

- 元スプレッドシート（ゴールデンマスター）には保育料の行が無く、これまでエンジンでも未計上だった。ユーザーの実感として金額が大きいため計上する。
- データソース: 対象自治体「利用者負担（保育料）徴収基準表」（対象自治体ホームページ公開PDF）。
  - **3〜5歳児クラス（学齢index 3〜5 = 年少・年中・年長）は幼児教育・保育無償化により全国一律無償（0円）**。
  - **0〜2歳児クラス（学齢index 0〜2）のみ有料**。世帯の市区町村民税所得割課税額に応じ14階層。
  - 利用者が申告した実額は、自治体の徴収基準表の該当階層・保育標準時間の額と一致することを確認した。

### 17.2 方針（ブレストでの決定）

- **階層は固定**。既存の教育費マスタが特定の所得帯に固定しているのと同じ簡易化方針を踏襲する。手取り年収から所得割課税額を逆算する近似計算や、階層を入力フォームで選択させる機能は導入しない（収入が変化しても階層は自動追従しない）。
- **多子軽減を実装する**。現在の子は1人だが、CSV に「仮」の第2子想定シナリオがあり、今後のシナリオ比較で「第2子を作った場合」を試す可能性が高い。公式ルール（一番上=全額、上から2番目=半額、上から3番目以降=無料）どおりに実装する。
- **ダッシュボードに「保育料」単独の表示は追加しない**。既存の食費・日用品等も個別カテゴリ表示は無く、単年度支出の合計にのみ反映される設計を踏襲する（YAGNI）。

### 17.3 データモデル・マスタ

新規マスタ `src/masterData/nursery.ts`（純定数、教育費マスタと同じ層）:

```ts
// 対象自治体 利用者負担（保育料）徴収基準表。世帯の所得階層に応じた額。
// 3〜5歳児クラスは幼児教育・保育無償化により無償（呼び出し側で学齢index 0〜2のみ適用する）。
export const NURSERY_FEE_STANDARD_MONTHLY = ... // 保育標準時間・該当階層の額

// 未就学（学齢index 0〜5）の兄弟姉妹における出生順位(0-based, 年長い順)に応じた軽減率。
// 0〜2歳児クラスの子にのみ適用（3〜5歳児クラスは無償化で常に0円）。
export function nurseryDiscountRate(rankAmongPreschoolSiblings: number): number {
  if (rankAmongPreschoolSiblings === 0) return 1
  if (rankAmongPreschoolSiblings === 1) return 0.5
  return 0
}
```

`src/types.ts` の `ExpenseBreakdown` に `保育料: number` を追加する。`totalExpenseOf`（`Object.values` の汎用合計）は変更不要。

### 17.4 エンジン変更（`expenses.ts`）

`expensesForYear` 内に追加するロジック:

1. その年に学齢index 0〜5（未就学）の子を、生年月日昇順（年長い順）に並べて出生順位を付ける。**無償化対象の3〜5歳児も順位カウントに含める**（公式ルールが「未就学の兄弟姉妹」全体を対象にしているため）。
2. 順位ごとに `nurseryDiscountRate(rank)` を適用するが、実際に課金対象となるのは学齢index 0〜2の子のみ。
3. `保育料 = Σ NURSERY_FEE_STANDARD_MONTHLY × 12 × 割引率`（学齢index 0〜2の子のみ加算）。

### 17.5 テスト戦略（TDD）

`tests/expenses.test.ts` に追加:

- 1〜2歳（学齢index 1）の子1人 → 保育料 = 月額 × 12
- 年中（学齢index 4）の子1人 → 保育料 = 0（無償化）
- 0〜2歳の子2人が同時在籍 → 第1子フル額、第2子半額
- 3〜5歳の兄 + 0〜2歳の弟 → 兄は0円のまま、弟は出生順位2番目として半額適用

**背骨**: ゴールデン回帰テスト（`tests/golden.integration.test.ts`）は `investmentBalance` のみを検証しており、投資残高は支出とは独立した固定拠出額（`annualInvestmentContribution`）から積み上がるため、支出カテゴリの追加による影響を受けない（安全）。`ExpenseBreakdown` リテラルを直接書いているテストfixture（`AnnualTable.test.tsx`・`BreakdownTabs.test.tsx` の `makeRow`）には `保育料: 0` を機械的に追加する。全ゲート = unit/integration + typecheck + lint + build。

### 17.6 明示的に対象外

- 対象自治体以外の自治体・階層の動的判定（他自治体に引っ越した場合は再ブレストが必要）
- 保育短時間（保育標準時間のみ対応）
- ひとり親世帯等の軽減（対象外の世帯構成）
- 入力フォームでの保育料関連フィールド追加（階層・割引の手動上書きは無し）

## 18. ダッシュボード表示期間セレクター（小規模タスクの仕様の源泉）

> `AssetChart`・`BreakdownTabs`・`AnnualTable` が常に全期間（`baseYear`〜`assumptions.endAge`）を表示しているのを、プリセットボタンで絞り込めるようにする。新規プラン化はせず、小規模タスクとして直接 TDD で実装する（エンジン・永続化層の変更は無い）。

### 18.1 背景・スコープ

- `KpiCards`（生涯サマリー: 終了年齢時点の総資産・資産枯渇年など）は対象外で変更しない。期間フィルタの対象は `AssetChart`（資産推移グラフ）・`BreakdownTabs`（現金/投資・単年度収支の内訳グラフ）・`AnnualTable`（年次一覧表）の3つ。
- デフォルト表示は「世帯主（`members.primary`）が65歳になるまで」。もう1つのプリセットは「全期間」。

### 18.2 UI

- 新規コンポーネント `PeriodSelector`（`src/components/dashboard/`配下）。ボタン2つ:「65歳まで」（デフォルト・選択中）/「全期間」。`BreakdownTabs` のタブ切替（`role="tab"`・選択中強調）と同じ見た目パターンを踏襲する。
- 配置場所: `Dashboard.tsx` 内、`KpiCards` の直後・`AssetChart` の直前。1箇所の選択が下の3コンポーネントすべてに効く。

### 18.3 状態管理

- `Dashboard.tsx` にローカル `useState<DashboardPeriod>('to65')` を追加する。Firestore・localStorageには保存しない。ページ遷移（他ルートへ移動して`/`に戻る）やリロードのたびにデフォルト（65歳まで）に戻る。

### 18.4 フィルタリングロジック

`src/store/selectors.ts` に純関数を追加する:

```ts
export type DashboardPeriod = 'to65' | 'full'

export function selectPeriodFilteredData(
  data: DashboardData,
  period: DashboardPeriod
): { chartSeries: ChartPoint[]; central: YearRow[]; eventMarkers: EventMarker[]; lifeStageEvents: LifeStageEvent[] }
```

- `period === 'full'` の場合はフィルタなしで `data.chartSeries`/`data.central`/`data.eventMarkers`/`data.lifeStageEvents` をそのまま返す。
- `period === 'to65'` の場合、年齢再計算はせず既存の `YearRow.agePrimary`（`ageAt`で早生まれ補正済み）を使う。`data.central` を後ろから走査して `agePrimary <= 65` を満たす最後の行の `year` をカットオフ年とし、`chartSeries`/`central`/`eventMarkers`/`lifeStageEvents` を `year <= cutoff` でフィルタする。
- **エッジケース**: `baseYear` 時点で世帯主が既に65歳を超えている場合（該当行が1件も無い）は全期間にフォールバックする（空グラフを避ける）。

### 18.5 影響コンポーネント

- `Dashboard.tsx`: `selectPeriodFilteredData` の結果を `AssetChart`（`series`/`eventMarkers`）・`BreakdownTabs`（`rows`）・`AnnualTable`（`series`/`central`/`events`）に渡すよう配線変更。`KpiCards` は `data.kpi` のまま変更しない。
- `AssetChart`/`BreakdownTabs`/`AnnualTable` 自体のprops型・内部ロジックは変更なし（渡すデータを絞るだけ）。

### 18.6 テスト戦略（TDD）

- `selectPeriodFilteredData` の単体テスト: 65歳までのフィルタ・全期間・`baseYear`時点で65歳超のフォールバック。
- `Dashboard.test.tsx`: デフォルトが「65歳まで」になるため、既存の `table.querySelectorAll('tbody tr')` が `data.central.length` と一致するアサーションを更新する。`PeriodSelector` のクリックで表示行数が変わることを検証するテストを追加する。
- Playwrightスモークe2eに「65歳まで⇄全期間」切替の目視確認を1本追加する（既存3本と同じパターン）。

**背骨**: `src/engine/`・`src/persistence/`は無改変。全ゲート = unit/integration + typecheck + lint + build + e2e。

### 18.7 明示的に対象外

- 「退職まで」「年金開始まで」など他のプリセット（`workUntilAge`/`pensionStartAge`連動）
- 開始年/終了年を自由指定するカスタム範囲選択
- 選択期間のFirestore・localStorageへの永続化
- `KpiCards` の指標を選択期間に連動させること（生涯サマリーのまま固定）

## 19. ダッシュボード残高表示の「年始」基準統一

> 実装済み（コード内コメントに §19 として参照あり）。本設計書には未記載だったため、記録として節番号のみ確保する。詳細は `src/store/selectors.ts` の `toYearStartRows` および `lifeplan/src/components/dashboard/Dashboard.tsx` の年始時点注記を参照。

> 節番号メモ（2026-07-10）: `§20` は別途ユーザーが作業中の未完成コード（baseYear以前の参考実績をチャート先頭に過去の実測点として表示する機能）がコード内コメントで既に自称している。衝突を避けるため、本セクション以降の新規追加は `§21` から採番する。

## 21. 表示期間プリセットに「10年」「20年」を追加（小規模タスクの仕様の源泉）

> §18 で実装した表示期間セレクター（65歳まで/全期間）に、「10年」「20年」の2プリセットを追加する。新規プラン化はせず、小規模タスクとして直接 TDD で実装する（エンジン・永続化層の変更は無い）。§18.7 の対象外リストは「退職まで/年金開始まで等の年齢連動プリセット」「自由指定のカスタム範囲」を除外していたが、年数指定の固定プリセットはこれに該当しないため矛盾しない。

### 21.1 背景・スコープ

- §18.1 のスコープ（`KpiCards`・`VarianceSection` は対象外、`AssetChart`/`BreakdownTabs`/`AnnualTable` のみフィルタ）を継承する。
- 「10年」「20年」は `baseYear`（シミュレーション開始年＝今年）を起点に、`baseYear`〜`baseYear+9`（10行）／`baseYear`〜`baseYear+19`（20行）を表示する。

### 21.2 UI

- `PeriodSelector` にボタンを2つ追加し、並び順は「10年」→「20年」→「65歳まで」→「全期間」とする。デフォルト選択は現状どおり「65歳まで」のまま変更しない。

### 21.3 フィルタリングロジック

`src/store/selectors.ts` の `DashboardPeriod` 型と `selectPeriodFilteredData` を拡張する:

```ts
export type DashboardPeriod = 'to65' | 'full' | 'y10' | 'y20'
```

- `'y10'`/`'y20'` は `data.central[0].year`（＝`baseYear`）を起点に、カットオフ年 = `baseYear + N - 1`（N=10 または 20）を計算し、`chartSeries`/`central`/`centralYearStart`/`eventMarkers`/`lifeStageEvents` を `year <= cutoff` でフィルタする。
- 先頭行（`baseYear`）は必ず自分自身のカットオフ条件を満たすため、`'to65'` にある「該当行が1件も無い場合のフォールバック」は `'y10'`/`'y20'` には不要（`central` が空になることは `simulate()` の契約上ありえない）。
- **リファクタリング**: `selectPeriodFilteredData` 内で `full` 分岐と `to65` のフォールバック分岐が同一のパススルー処理を重複していた（Plan 期間セレクター最終レビューの Minor 指摘）ため、共通ヘルパー `passthrough(data)` と `filterByCutoffYear(data, cutoffYear)` に抽出し、`to65`/`y10`/`y20` の3ケースで `filterByCutoffYear` を共用する。挙動は変更しない（振る舞いのテストは既存のものが全てそのまま通る）。

### 21.4 影響コンポーネント

- `src/components/dashboard/PeriodSelector.tsx`: `OPTIONS` 配列に2エントリ追加。
- `src/store/selectors.ts`: `DashboardPeriod` 型・`selectPeriodFilteredData` の拡張のみ。`Dashboard.tsx` 側の配線（§18.5）は変更不要。

### 21.5 テスト戦略（TDD）

- `selectPeriodFilteredData` の単体テスト: `y10`/`y20` のカットオフ計算（`centralYearStart` も正しくフィルタされることを含む）。
- `PeriodSelector` のテスト: 新規2ボタンの表示・`aria-selected`・`onChange` 呼び出し。
- `Dashboard.test.tsx`: `y10`/`y20` それぞれの表示行数アサーションを追加。
- Playwrightスモークe2eに4プリセット全ての切り替え確認を追加（既存の65歳まで/全期間の切替テストを拡張）。

**背骨**: `src/engine/`・`src/persistence/`は無改変。全ゲート = unit/integration + typecheck + lint + build + e2e。

### 21.6 明示的に対象外

- 「10年」「20年」以外の年数プリセット（30年等）
- 開始年/終了年を自由指定するカスタム範囲選択（§18.7から継続）

## 22. コーストFIRE達成率ロジックの変更（小規模タスクの仕様の源泉）

> §10「未確定事項」の「コーストFIRE金額をスプレッドシート式に寄せるか、標準4%ルール式のままにするか」を、標準的なコーストFIRE定義（固定目標年齢・固定目標額・固定運用利回り）で確定する。新規プラン化はせず、小規模タスクとして直接TDDで実装する（`coastFireNumber`は資産推移シミュレーション(`totalAssets`/`investmentBalance`)や`requiredMonthlyInvestment`にフィードバックしない純粋な派生出力のため、エンジンの資産計算・ゴールデン回帰には影響しない）。

### 22.1 背景・旧ロジックの問題

旧ロジック（`src/engine/simulate.ts`）:
```
requiredNestEgg = coastFireTargetAmount ?? 退職後年間生活費×25   // 4%ルール逆算
coastFireNumber(year) = requiredNestEgg / (1+r)^(pensionStartAge時点の年 - year)  // rはシナリオ利回り(楽観/悲観で変動)
達成率 = investmentBalance / coastFireNumber(currentRow)
```
目標額が生活費依存で分かりにくく、割引率がシナリオの楽観/悲観バンドに連動して変動するため「コーストFIRE指標」としての安定した基準にならない、という問題があった。

### 22.2 新ロジック

```
target        = coastFireTargetAmount ?? 40_000_000   // 目標額。デフォルト4000万円、上書き可
targetAge     = coastFireTargetAge ?? 65                // 目標年齢。デフォルト65歳、上書き可
rCoast        = coastFireReturnRate ?? 4                // 想定利回り(%)。デフォルト年4%、上書き可
                                                          // シナリオのinvestmentReturnRate(楽観/悲観で変動)とは独立した固定値
yearsToTarget = max(0, (primary.birthYear + targetAge) - year)
coastFireNumber(year) = target / (1 + rCoast/100)^yearsToTarget

達成率 = investmentBalance / coastFireNumber(currentRow)   // 分子は投資残高のみ(現金は含まない)。ここは変更なし
```

- `retireExpense × 25` フォールバック、`pensionStartAge` 依存、シナリオ利回り依存(`r`)は廃止する。
- `coastFireNumber`は central/optimistic/pessimistic のいずれのシナリオ実行でも同じ`rCoast`で計算する（シナリオ利回りに連動しない）。

### 22.3 データモデル

`Assumptions`（`src/types.ts`）に2フィールドを追加する。いずれもoptionalとし、既存の`coastFireTargetAmount?: number`と同じ「未指定ならデフォルト値」パターンに揃える:

```ts
coastFireTargetAge?: number     // 未指定なら65歳
coastFireReturnRate?: number    // % 未指定なら4
```

**永続化への影響**: 3フィールドとも optional のため `schemaVersion` の変更・`migrate.ts`へのmigration追加は不要。`doc.ts`/`validate.ts`は`Assumptions`の個別フィールドを検証していないため無改変。既存Firestore文書（本番稼働中）にフィールドが無くても`??`フォールバックでそのまま安全に動作する。

### 22.4 入力画面

`src/components/input/sections/AssumptionsSection.tsx`の既存「コーストFIRE目標額を上書きする」チェックボックス＋`MoneyField`と同じUIパターンで、以下2つを追加する:

- 「コーストFIRE目標年齢を上書きする」チェックボックス＋`NumberField`（デフォルト非表示時は65歳想定である旨が分かるようラベルに補足するか検討。最低限チェックボックスのラベルとデフォルト値のプレースホルダで表現する）
- 「コーストFIRE想定利回りを上書きする」チェックボックス＋`NumberField`（%、`min=-100 max=100 step=0.1`など他の利回り系フィールドに揃える）

### 22.5 影響ファイル

- `src/types.ts`: `Assumptions`に2フィールド追加、`coastFireTargetAmount`のコメント更新
- `src/engine/simulate.ts`: `coastFireNumber`計算式を22.2の新ロジックに変更
- `src/components/input/sections/AssumptionsSection.tsx`: 22.4のUI追加
- 既存テストの期待値更新: `tests/coastFire.test.ts`, `AssumptionsSection.test.tsx`, `KpiCards.test.tsx`, `VarianceSection.test.tsx`, `BreakdownTabs.test.tsx`, `AnnualTable.test.tsx`（`coastFireNumber`関連のフィクスチャ・アサーションを新式に合わせる）

### 22.6 テスト戦略（TDD）

- `simulate()`の単体テスト（`tests/coastFire.test.ts`）: `coastFireTargetAmount`/`coastFireTargetAge`/`coastFireReturnRate`それぞれ未指定時のデフォルト（4000万/65歳/4%）、指定時の上書き、`yearsToTarget`が0になる（targetAge到達後）ケースを追加・更新
- シナリオ利回り(`investmentReturnRate`等)を変えても`coastFireNumber`が変化しないことを回帰として明示的にテストする（旧ロジックとの決定的な違いのため）
- `AssumptionsSection`の新規2フィールドのUIテスト（表示・変更コミット）
- 既存の`KpiCards`/`VarianceSection`/`BreakdownTabs`/`AnnualTable`テストの`coastFireNumber`関連フィクスチャを新式の期待値に更新

**背骨**: `totalAssets`/`investmentBalance`/`requiredMonthlyInvestment`は無改変（`coastFireNumber`はこれらに影響しない純粋な派生値のため）。ゴールデン回帰（`tests/fixtures/golden.json`）は不変のはず。全ゲート = unit/integration + typecheck + lint + build。

### 22.7 明示的に対象外

- `coastFireTargetAmount`/`coastFireTargetAge`/`coastFireReturnRate`を必須フィールド化しての`schemaVersion`引き上げ・migration追加
- コーストFIRE指標の算出基準（分子を投資残高のみとする既存仕様）の変更
- KPIカード上の説明文・ツールチップ追加（表示ラベル「コーストFIRE達成率」は変更しない）

## 23. 現在の総資産・コーストFIRE達成率・推奨毎月積立額を「baseYear-1(今年の年始)の実績」起点にする（小規模タスクの仕様の源泉）

> 新規プラン化はせず、小規模タスクとして直接TDDで実装する。

### 23.1 問題

`現在の総資産`（KPIカード）・`コーストFIRE達成率`・`推奨される毎月の積立額`はいずれも、シミュレーションの起点残高を`inputs.assets`（入力画面→資産セクションの手入力残高）からのみ計算しており、`actuals`配列（実績値）に`year === baseYear - 1`（今年の年始 = 去年の年末）のレコードがあっても一切参照しない。

`実績`画面（`ActualsPage.tsx`/`ActualRow.tsx`）はbaseYear-1の行を「{baseYear}年始」というラベルで表示し、`入力画面→資産`と同じ時点を指す体裁になっているが、実際にはこの実績値は計算に反映されず、`入力画面→資産`側を手動で書き換えない限り無視される。UI上にこの制約の説明は無く、ユーザーが実績を記録しても反映されないという実質的なギャップになっている。

### 23.2 新ロジック

起点残高の解決を1箇所のヘルパーに集約する（`src/engine/simulate.ts`に追加）:

```ts
function resolveStartingBalances(
  inputs: Inputs, actuals: Actual[] | undefined,
): { cashBalance: number; investmentBalance: number; isActual: boolean } {
  const priorYearActual = actuals?.find(a => a.year === inputs.baseYear - 1)
  if (priorYearActual) {
    return { cashBalance: priorYearActual.cashBalance, investmentBalance: priorYearActual.investmentBalance, isActual: true }
  }
  const cashBalance = inputs.assets.bankAccounts.reduce((s, x) => s + x.balance, 0)
  const investmentBalance = inputs.assets.investments.reduce((s, x) => s + x.balance, 0)
  return { cashBalance, investmentBalance, isActual: false }
}
```

適用箇所:

1. **`simulate()`**: `startCash`/`startInvest`の直書き計算をこのヘルパー呼び出しに置き換える。以降の投資成長・キャッシュフロー計算は全てここが起点になるため、`totalAssets`系列（資産推移グラフ・終了年齢時点の総資産）・`coastFireNumber`（→達成率・目安金額）が自動的に実績起点になる。
2. **`toYearStartRows()`（`src/store/selectors.ts`）**: 引数に`actuals: Actual[] | undefined`を追加し、`initialBalance`（＝`現在の総資産`の直接の元）を同じヘルパーで計算する。`initialBalance.isActual`もヘルパーの返り値をそのまま使う。
3. **`requiredMonthlyInvestment()`（`src/engine/goalSeek.ts`）**: `opts`に`actuals?: Actual[]`を追加し、内部の`simulate(tuned, master, { actuals: opts?.actuals })`に渡す。
4. **`computeKpiSummary()`（`src/store/selectors.ts`）**: 引数に`actuals: Actual[] | undefined`を追加し、`requiredMonthlyInvestment`呼び出しに渡す。

呼び出し元（`selectDashboardData`/`selectPreviewData`/`selectScenarioSummary`）は全て既に`actuals`をスコープ内に持っているため、`toYearStartRows`/`computeKpiSummary`への引数追加のみで済む。

### 23.3 `linkBaseYearToHistory`の扱い

現状の`linkBaseYearToHistory`は「historicalRows(baseYear-2年以前の参考実績)が存在する場合、centralYearStart[0]を強制的に`isActual: true`にしてグラフの色を実績側に繋げる」というハックで、baseYear-1自体に実績があるかどうかは見ていなかった。

新ロジックでは`initialBalance.isActual`が`resolveStartingBalances`の結果（＝baseYear-1の実績が実在するか）を正しく反映するため、`linkBaseYearToHistory`は不要になり削除する。

**副作用（意図的な仕様変更）**: 実績がbaseYear-2年以前にしか無く、baseYear-1自体には無い場合、これまでは`linkBaseYearToHistory`によりbaseYear年始の点が強制的に「実績」色になっていたが、新ロジックでは（baseYear-1の実績が無い以上）素直に「予測」色になる。より正直な表示になる意図的な変更。

### 23.4 `buildHistoricalRows`との整合性

`buildHistoricalRows`の`actuals.filter(a => a.year < inputs.baseYear - 1)`（baseYear-1を除外するフィルタ）は変更しない。baseYear-1の実績は「起点残高」として`resolveStartingBalances`に消費され、`buildHistoricalRows`が作る過去の参考ドット列とは重複しないという整合性が保たれる。

### 23.5 ゴールデン回帰への影響

`tests/fixtures/golden.json`を使う回帰テストは`actuals`を渡さないため、`resolveStartingBalances`は常に`inputs.assets`側のフォールバックを通り、既定パスは完全に不変。

### 23.6 テスト戦略（TDD）

- `simulate()`: `actuals`に`year: baseYear - 1`のレコードがある場合、`startCash`/`startInvest`がその実績値になること。無い場合は従来通り`inputs.assets`合計になること（回帰）。
- `toYearStartRows()`: 同様に`actuals`を渡した場合/渡さない場合で`centralYearStart[0]`の`totalAssets`・`isActual`が正しく切り替わること。
- `computeKpiSummary()`: `currentTotalAssets`・`coastFireRatio`・`coastFireNumber`がbaseYear-1実績を反映すること。
- `requiredMonthlyInvestment()`: `actuals`オプションを渡した場合に、実績起点でゴールシークすること。
- `selectDashboardData`: baseYear-1実績がある場合とない場合でチャートの`isActual`色分けが正しく切り替わること（既存の色分けテストの拡張）。

**背骨**: `tests/golden.integration.test.ts`は無改変で0%不変のまま通ること。全ゲート = unit/integration + typecheck + lint + build。

### 23.7 明示的に対象外

- `実績`画面のUIに「baseYear-1の実績が起点残高として使われる」旨の説明文追加（将来必要なら別タスク）
- `入力画面→資産`セクションを実績値に自動同期する機能（書き戻し）。`inputs.assets`はbaseYear-1実績が無いときのフォールバックとして残す
- baseYear-1以外の年（baseYear以降）の実績反映ロジックの変更（既存の`simulate()`内`actualByYear`によるリベースは変更しない）
