# 実績値としての収支（収入・支出）入力 — 設計書

- 起票日: 2026-07-27
- 背景: 実績値入力（`/actuals`）では資産残高（現金・投資残高）のみ記録できたが、「その年の単年度収支（収入・支出）が
  シミュレーション値なのか実績値なのか」がダッシュボード上で分からなかった。ユーザーから「収支の実績値も任意で
  入力できるようにしてほしい」「ダッシュボードで実績かシミュレーションか分かるようにしてほしい」という要望を受けて起票。

## スコープ

- 実績収入・実績支出（年間ベース、合計2項目）を`Actual`レコードに任意項目として追加する。
- ダッシュボードの年次一覧表（`AnnualTable`）で、単年度収入・単年度支出・単年度収支のそれぞれについて、
  実績値由来かシミュレーション値由来かを視覚的に区別する。

### スコープ外（Non-Goals）

- カテゴリ別支出内訳（`ExpenseBreakdown`）の実績記録・表示（今回は収入・支出の合計2項目のみ）。
- 実績収支を資産残高のシミュレーション計算（`simulate()`の現金・投資残高推移）へ反映すること。表示専用（比較用）。
- 資産残高実績とは独立した「収支実績だけを資産残高なしで記録する」データモデル（今回は同一`Actual`レコードへの
  任意項目として結合する。資産残高フィールドは引き続き必須のまま）。

## 1. データモデル

`Actual`型（`src/types.ts`）に任意フィールドを2つ追加する。

```ts
export interface Actual {
  year: number
  cashBalance: number
  investmentBalance: number
  note?: string
  actualIncome?: number   // 実績収入(年間・任意)
  actualExpense?: number  // 実績支出(年間・任意)
}
```

- 資産残高（`cashBalance`/`investmentBalance`）は既存どおり必須のまま。実績収支はこの同一レコードへの任意項目として追加する。
- `src/persistence/validate.ts`に、値がある場合のみ有限数値チェックを追加する（`note`と同様、未設定なら検証をスキップ）。
- 資産残高の実績オーバーライドロジック（`simulate()`の年末残高上書き・自動リベース）は一切変更しない。
  → ゴールデンマスター回帰・既存の資産推移計算は無影響。

## 2. 入力UI（`ActualsPage` / `ActualRow`）

- 既存の`NumberField`/`MoneyField`は空欄を許容しない（常に数値必須）ため、空欄＝未入力を表せる新規コンポーネント
  `OptionalMoneyField`を`src/components/input/fields/`に追加する。空欄でコミットすると`undefined`、数値を入れると
  その数値をコミットする。
- `ActualRow`に「実績収入」「実績支出」の2つの`OptionalMoneyField`を追加する（現金残高・投資残高・メモの並びに
  続けて配置）。空欄に戻したときは`note`と同じ削除パターン（キー自体を落とす。`withNote`と同様のヘルパー）で
  Firestoreに`undefined`を書き込まない。
- ラベル横に「※シミュレーションには反映されません（表示比較用）」という注記を添え、表示専用であることを明示する。
- 新規に「年を追加」した直後は、既存の`cashBalance: 0, investmentBalance: 0`同様、実績収支は未設定（キー無し）
  から開始する。

## 3. エンジン側の受け渡し（表示専用・計算に影響なし）

`YearRow`（`src/types.ts`）に受け渡し用の2フィールドを追加する。

```ts
export interface YearRow {
  // ...既存フィールドは無変更（income/totalExpense/annualCashFlowはシミュレーション値のまま）
  actualIncome: number | null   // その年の実績収入(未記録ならnull)
  actualExpense: number | null  // その年の実績支出(未記録ならnull)
}
```

- `src/engine/simulate.ts`：年ごとに既に解決している`actualByYear.get(year)`から`actualIncome`/`actualExpense`を
  そのまま`YearRow`に詰める。資産残高の上書きロジック（`if (actual) { invest = ...; cash = ...; isActual = true }`）
  とは完全に独立させ、`income`/`totalExpense`/`annualCashFlow`の計算式は無変更のまま。
- `src/store/selectors.ts`の`buildHistoricalRows`（baseYearより前の参考実績行）にも同様に`actualIncome`/
  `actualExpense`を詰める。
- `expenses: ExpenseBreakdown`（カテゴリ別内訳）は今回のスコープ外＝無変更。

この設計により、ゴールデンマスター回帰・既存の資産推移計算への影響はゼロになる。

## 4. ダッシュボード表示（`AnnualTable`）

「単年度収入」「単年度支出」「単年度収支」の3列それぞれに、実績値がある場合はそれを優先表示し、既存の資産残高と
同じ「実績」バッジ（`styles.actualBadge`）を付ける。

| 列 | 表示ルール |
|---|---|
| 単年度収入 | `actualIncome`があればその値＋実績バッジ／無ければシミュレーション値（バッジ無し） |
| 単年度支出 | `actualExpense`があればその値＋実績バッジ／無ければシミュレーション値（バッジ無し） |
| 単年度収支 | 収入・支出**両方**実績がある年だけ「実績収入－実績支出」＋実績バッジ／**片方だけ**実績の場合は未入力側を シミュレーション値で補完した差分を表示（バッジ無し＝混在値と分かるように）／**両方とも未入力**なら従来どおり シミュレーション値 |

補足（参考実績期間＝baseYearより前の年、`isHistoricalReference: true`）:

- この期間はシミュレーション自体が走っていないため、収入・支出のシミュレーション値が存在しない（現状は`-`表示）。
- 実績収入・実績支出がその年に記録されていれば、該当列にその値と実績バッジを表示する。
- 単年度収支は、参考実績期間については収入・支出が**両方揃っている年のみ**計算して表示し、片方だけの場合は
  `-`のままにする（存在しないシミュレーション値と実績を混ぜて計算しないため）。

## 5. テスト方針

- `src/engine/simulate.test.ts` / `src/store/selectors.test.ts`：実績収支の有無による`YearRow`の`actualIncome`/
  `actualExpense`受け渡し、資産推移計算（`cashBalance`/`investmentBalance`/`totalAssets`）が実績収支の有無に
  よらず不変であることの回帰テストを追加する。
- `src/persistence/validate.test.ts`：数値以外・省略時の挙動テストを追加する。
- `src/components/actuals/ActualRow.test.tsx`：新フィールドの入力・空欄コミット・削除挙動テストを追加する。
- `src/components/dashboard/AnnualTable.test.tsx`：3列それぞれの実績/シミュレーション/混在パターンの表示テスト
  （バッジ有無、参考実績期間の`-`フォールバック含む）を追加する。
- 既存のゴールデンマスター回帰（誤差0.00%）が崩れないことを確認する。
- e2e（Playwright）は既存のactuals系スモークテストの粒度を見て、実績収支入力→ダッシュボード反映の1パスを追加する
  かどうかを実装時に判断する。
